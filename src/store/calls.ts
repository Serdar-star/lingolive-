import { create } from "zustand";
import { backendReady, getSessionUserId, syncCallActivity } from "../lib/backend";
import { isZegoConfigured } from "../lib/zegoConfig";
import {
  createCallSession,
  loadIncomingCallSessions,
  subscribeToCallInbox,
  subscribeToCallSession,
  updateCallSessionStatus,
  verifyConversationPair,
  type CallSignalEvent,
} from "../lib/callSignaling";
import { supabase } from "../lib/supabase";
import { useApp } from "./store";
import type {
  ActiveDirectCall,
  CallCaptionLine,
  CallMode,
  CallPeer,
  CallSessionRow,
  CompletedCall,
  DirectCallInvite,
} from "../lib/callTypes";
import type { RealtimeChannel } from "@supabase/supabase-js";

type StartCallArgs = { conversationId: string; peer: CallPeer; mode: CallMode };

type CallsState = {
  inboxReady: boolean;
  incoming: DirectCallInvite | null;
  outgoing: ActiveDirectCall | null;
  active: ActiveDirectCall | null;
  completed: CompletedCall | null;
  captions: CallCaptionLine[];
  error: string | null;
  connectInbox: (userId: string) => Promise<() => void>;
  startDirectCall: (args: StartCallArgs) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  cancelActive: () => Promise<void>;
  completeActive: (seconds: number, lines: CallCaptionLine[]) => Promise<void>;
  addCaption: (line: CallCaptionLine) => void;
  clearCompleted: () => void;
  clearError: () => void;
  reset: () => void;
};

let inboxChannel: RealtimeChannel | null = null;
let inboxUserId: string | null = null;
let inboxPollTimer: number | undefined;
let inboxPollRefs = 0;
let inboxPollInFlight = false;
let sessionChannel: RealtimeChannel | null = null;
let answerTimeout: number | undefined;
const processingInviteIds = new Set<string>();

const orderedUnique = (current: CallCaptionLine[], next: CallCaptionLine) => {
  if (!next?.id || current.some((line) => line.id === next.id)) return current;
  return [...current, next].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
};

function makeIds() {
  let callId: string;
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === "function") callId = webCrypto.randomUUID();
  else if (webCrypto) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    callId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } else {
    callId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16);
      return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
    });
  }
  const roomId = `dm_${callId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return { callId, roomId };
}

async function closeSessionAfterSend(channel: RealtimeChannel | null) {
  if (!channel) return;
  window.setTimeout(() => { void supabase.removeChannel(channel); }, 1_500);
}

async function handleSignal(event: CallSignalEvent, signal: { callId: string; fromUserId: string; reason?: string }) {
  const state = useCallsStore.getState();
  const callId = state.outgoing?.callId ?? state.active?.callId ?? state.incoming?.callId;
  const expectedPeerId = state.outgoing?.peer.id ?? state.active?.peer.id ?? state.incoming?.fromUserId;
  if (!callId || signal.callId !== callId || !expectedPeerId || signal.fromUserId !== expectedPeerId) return;

  if (event === "accepted" && state.outgoing?.callId === callId) {
    const { outgoing } = state;
    if (!outgoing) return;
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    useCallsStore.setState({
      outgoing: null,
      active: { ...outgoing, role: "CALLER", startedAt: Date.now() },
      captions: [], error: null,
    });
    return;
  }

  if (event === "declined" || event === "busy" || event === "cancelled" || event === "missed") {
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({
      incoming: null, outgoing: null, active: null, captions: [],
      error: event === "busy" ? "Karşı taraf başka bir görüşmede." : event === "declined" ? "Karşı taraf aramayı reddetti." : event === "missed" ? "Karşı taraf yanıt gelmediği için aramayı kapattı." : null,
    });
    await closeSessionAfterSend(channel);
    return;
  }

  if (event === "ended" && state.incoming?.callId === callId) {
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({ incoming: null, captions: [] });
    await closeSessionAfterSend(channel);
    return;
  }

  if (event === "ended" && state.outgoing?.callId === callId) {
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({ outgoing: null, active: null, error: "Karşı taraf aramayı sonlandırdı." });
    await closeSessionAfterSend(channel);
    return;
  }

  if (event === "ended" && state.active?.callId === callId) {
    useCallsStore.setState({ active: { ...state.active, forceEnd: true } });
  }
}

async function resolveOutgoingTimeout(callId: string, userId: string) {
  const outgoing = useCallsStore.getState().outgoing;
  if (!outgoing || outgoing.callId !== callId) return;
  const { data: latest, error } = await supabase.from("call_sessions")
    .select("id, status, updated_by")
    .eq("id", callId)
    .maybeSingle();
  if (error) {
    useCallsStore.setState({ error: "Arama sonucu henüz doğrulanamadı; bağlantı kurulunca tekrar kontrol ediyorum." });
    answerTimeout = window.setTimeout(() => {
      answerTimeout = undefined;
      void resolveOutgoingTimeout(callId, userId).catch(() => undefined);
    }, 10_000);
    return;
  }
  if (!latest) {
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({ outgoing: null, error: "Arama oturumu bulunamadı. Yeniden ara." });
    await closeSessionAfterSend(channel);
    return;
  }
  if (latest.status === "accepted") {
    useCallsStore.setState({
      outgoing: null,
      active: { ...outgoing, role: "CALLER", startedAt: Date.now() },
      error: null,
    });
    return;
  }
  if (latest.status === "ringing") {
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({ outgoing: null, error: "Yanıt gelmedi. Karşı taraf uygulamada çevrimiçi değil veya aramayı kaçırdı." });
    try { await updateCallSessionStatus(callId, "missed"); } catch { /* timeout is already local */ }
    await closeSessionAfterSend(channel);
    return;
  }
  if (latest.updated_by === userId) {
    const channel = sessionChannel;
    sessionChannel = null;
    useCallsStore.setState({ outgoing: null, captions: [] });
    await closeSessionAfterSend(channel);
    return;
  }
  await handleSignal(latest.status as CallSignalEvent, { callId, fromUserId: latest.updated_by });
}

async function sendBusyReply(callId: string) {
  try { await updateCallSessionStatus(callId, "busy"); }
  catch { /* caller will see the no-answer timeout if realtime is unavailable */ }
}

/** REST polling keeps call signaling usable when private Realtime authorization is unavailable. */
async function pollCallInbox(userId: string) {
  if (inboxUserId !== userId || inboxPollInFlight) return;
  inboxPollInFlight = true;
  try {
    const pending = await loadIncomingCallSessions(userId);
    if (inboxUserId !== userId) return;
    pending.forEach((session) => { void receiveInvite(session, userId); });

    const state = useCallsStore.getState();
    const tracked = state.outgoing ?? state.incoming ?? state.active;
    if (!tracked?.callId) return;
    const { data: row, error } = await supabase.from("call_sessions")
      .select("id, status, updated_by")
      .eq("id", tracked.callId)
      .maybeSingle();
    if (error || !row || inboxUserId !== userId || row.status === "ringing" || row.updated_by === userId) return;
    const validEvents: CallSignalEvent[] = ["accepted", "declined", "busy", "cancelled", "missed", "ended"];
    if (validEvents.includes(row.status as CallSignalEvent)) {
      await handleSignal(row.status as CallSignalEvent, { callId: row.id, fromUserId: row.updated_by });
    }
  } catch (error) {
    console.warn("Call signaling poll failed:", error instanceof Error ? error.message : error);
  } finally {
    inboxPollInFlight = false;
  }
}

async function receiveInvite(session: CallSessionRow, userId: string) {
  if (!session || typeof session.id !== "string" || typeof session.room_id !== "string" ||
      typeof session.conversation_id !== "string" || session.recipient_user_id !== userId ||
      !session.caller_user_id || session.caller_user_id === userId || !["VOICE", "VIDEO"].includes(session.mode) ||
      session.status !== "ringing" || Date.now() - Date.parse(session.created_at) > 60_000 || processingInviteIds.has(session.id)) return;
  if (useCallsStore.getState().incoming?.callId === session.id) return;
  if (processingInviteIds.size > 0) {
    void sendBusyReply(session.id);
    return;
  }
  processingInviteIds.add(session.id);
  const invite: DirectCallInvite = {
    callId: session.id,
    roomId: session.room_id,
    conversationId: session.conversation_id,
    fromUserId: session.caller_user_id,
    toUserId: session.recipient_user_id,
    fromName: "LingoLive partner",
    mode: session.mode,
    sentAt: session.created_at,
  };

  try {
    const current = useCallsStore.getState();
    if (current.active || current.outgoing || current.incoming) {
      await sendBusyReply(invite.callId);
      return;
    }

    const isMemberPair = await verifyConversationPair(invite.conversationId, invite.fromUserId, userId);
    if (!isMemberPair) return;
    const { data: profile, error } = await supabase.from("users")
      .select("id, display_name, avatar_url, country_flag, current_level, native_language")
      .eq("id", invite.fromUserId).single();
    if (error || !profile) return;
    const updatedInvite: DirectCallInvite = {
      ...invite,
      fromName: profile.display_name || "LingoLive partner",
      fromAvatarUrl: profile.avatar_url ?? null,
      fromFlag: profile.country_flag || null,
      fromLevel: profile.current_level || null,
      fromNativeLanguage: profile.native_language || null,
    };
    const latestState = useCallsStore.getState();
    if ((latestState.incoming && latestState.incoming.callId !== invite.callId) || latestState.active || latestState.outgoing) {
      await sendBusyReply(invite.callId);
      return;
    }
    sessionChannel = null;
    useCallsStore.setState({ incoming: updatedInvite, captions: [], error: null });
    // Do not wait up to the Realtime timeout before presenting the incoming-call UI.
    void subscribeToCallSession(invite.callId, userId, (event, signal) => { void handleSignal(event, signal); })
      .then((channel) => {
        const state = useCallsStore.getState();
        if (state.incoming?.callId === invite.callId || state.active?.callId === invite.callId || state.outgoing?.callId === invite.callId) {
          sessionChannel = channel;
        } else void supabase.removeChannel(channel);
      })
      .catch((error) => console.warn("Incoming-call Realtime unavailable; polling the call session:", error instanceof Error ? error.message : error));
    const { data: latest, error: latestError } = await supabase.from("call_sessions")
      .select("id, status, updated_by")
      .eq("id", invite.callId)
      .maybeSingle();
    if (latestError || !latest) {
      if (useCallsStore.getState().incoming?.callId === invite.callId) useCallsStore.setState({ incoming: null });
      if (useCallsStore.getState().active?.callId !== invite.callId) {
        const failedChannel = sessionChannel;
        sessionChannel = null;
        if (failedChannel) await supabase.removeChannel(failedChannel);
      }
      return;
    }
    if (latest.status !== "ringing") {
      if (latest.updated_by === userId) useCallsStore.setState({ incoming: null, captions: [] });
      else void handleSignal(latest.status as CallSignalEvent, { callId: invite.callId, fromUserId: latest.updated_by });
    }
  } catch (error) {
    useCallsStore.setState({ error: error instanceof Error ? error.message : "Gelen arama alınamadı." });
  } finally {
    processingInviteIds.delete(session.id);
  }
}

export const useCallsStore = create<CallsState>((set, get) => ({
  inboxReady: false,
  incoming: null,
  outgoing: null,
  active: null,
  completed: null,
  captions: [],
  error: null,

  connectInbox: async (userId) => {
    if (inboxUserId === userId && inboxPollTimer !== undefined) {
      inboxPollRefs += 1;
      set({ inboxReady: true });
      const timer = inboxPollTimer;
      return () => {
        if (inboxPollTimer !== timer || inboxUserId !== userId) return;
        inboxPollRefs = Math.max(0, inboxPollRefs - 1);
        if (inboxPollRefs > 0) return;
        window.clearInterval(timer);
        inboxPollTimer = undefined;
        inboxUserId = null;
        const channel = inboxChannel;
        inboxChannel = null;
        set({ inboxReady: false });
        if (channel) void supabase.removeChannel(channel);
      };
    }

    if (inboxPollTimer !== undefined) window.clearInterval(inboxPollTimer);
    if (inboxChannel) void supabase.removeChannel(inboxChannel);
    inboxChannel = null;
    inboxPollInFlight = false;
    inboxUserId = userId;
    inboxPollRefs = 1;
    set({ inboxReady: true, error: null });
    const poll = () => { void pollCallInbox(userId); };
    poll();
    const timer = window.setInterval(poll, 2_500);
    inboxPollTimer = timer;

    // Realtime accelerates delivery when authorized; database polling is the reliable fallback.
    void subscribeToCallInbox(userId, (invite) => { void receiveInvite(invite, userId); })
      .then((channel) => {
        if (inboxUserId !== userId || inboxPollTimer !== timer) void supabase.removeChannel(channel);
        else inboxChannel = channel;
      })
      .catch((error) => console.warn("Call inbox Realtime unavailable; polling stays active:", error instanceof Error ? error.message : error));

    return () => {
      if (inboxPollTimer !== timer || inboxUserId !== userId) return;
      inboxPollRefs = Math.max(0, inboxPollRefs - 1);
      if (inboxPollRefs > 0) return;
      window.clearInterval(timer);
      inboxPollTimer = undefined;
      inboxUserId = null;
      const channel = inboxChannel;
      inboxChannel = null;
      set({ inboxReady: false });
      if (channel) void supabase.removeChannel(channel);
    };
  },

  startDirectCall: async ({ conversationId, peer, mode }) => {
    const userId = getSessionUserId();
    if (!backendReady() || !userId) throw new Error("Gerçek arama için Supabase hesabına giriş yapmalısın.");
    if (!isZegoConfigured()) throw new Error("ZEGO App ID bu uygulama yapısında tanımlı değil.");
    if (!peer.id) throw new Error("Bu örnek sohbet gerçek bir kullanıcıya bağlı değil. Gerçek sohbetten ara.");
    if (get().active || get().outgoing || get().incoming) throw new Error("Önce devam eden aramayı bitir.");

    const validPair = await verifyConversationPair(conversationId, userId, peer.id);
    if (!validPair) throw new Error("Bu kişiyle gerçek sohbet üyeliği doğrulanamadı. Sohbet güncellemesini uygula ve yeniden yükle.");

    const { callId, roomId } = makeIds();
    const peerSafe = { ...peer, id: peer.id };
    const outgoing: ActiveDirectCall = {
      callId, roomId, conversationId, selfUserId: userId, peer: peerSafe,
      mode, source: "DIRECT", role: "CALLER", startedAt: 0,
    };
    sessionChannel = null;
    set({ outgoing, active: null, captions: [], error: null });
    // Realtime is opportunistic; don't make the caller wait through its 12-second timeout.
    void subscribeToCallSession(callId, userId, (event, signal) => { void handleSignal(event, signal); })
      .then((channel) => {
        const state = get();
        if (state.outgoing?.callId === callId || state.active?.callId === callId || state.incoming?.callId === callId) {
          sessionChannel = channel;
        } else void supabase.removeChannel(channel);
      })
      .catch((error) => console.warn("Call-session Realtime unavailable; using REST polling:", error instanceof Error ? error.message : error));
    try {
      await createCallSession({
        callId, roomId, conversationId, callerUserId: userId,
        recipientUserId: peer.id, mode,
      });
    } catch (error) {
      set({ outgoing: null, error: error instanceof Error ? error.message : "Arama daveti gönderilemedi." });
      const failedChannel = sessionChannel;
      sessionChannel = null;
      if (failedChannel) await supabase.removeChannel(failedChannel);
      throw error;
    }

    answerTimeout = window.setTimeout(() => {
      answerTimeout = undefined;
      void resolveOutgoingTimeout(callId, userId).catch((error) => {
        console.warn("Could not resolve outgoing call timeout:", error);
        set({ error: "Arama durumu kontrol edilemedi. Bağlantını kontrol edip iptal et veya tekrar bekle." });
      });
    }, 45_000);
  },

  acceptIncoming: async () => {
    const invite = get().incoming;
    const userId = getSessionUserId();
    if (!invite || !userId) return;
    const peer: CallPeer = {
      id: invite.fromUserId,
      name: invite.fromName,
      avatarUrl: invite.fromAvatarUrl,
      flag: invite.fromFlag,
      level: invite.fromLevel,
      nativeLanguage: invite.fromNativeLanguage,
    };
    const active: ActiveDirectCall = {
      callId: invite.callId, roomId: invite.roomId, conversationId: invite.conversationId,
      selfUserId: userId, peer, mode: invite.mode, source: "DIRECT", role: "CALLEE", startedAt: Date.now(),
    };
    await updateCallSessionStatus(invite.callId, "accepted");
    set({ incoming: null, active, outgoing: null, captions: [], error: null });
  },

  declineIncoming: async () => {
    const invite = get().incoming;
    const userId = getSessionUserId();
    const channel = sessionChannel;
    if (invite && userId) await updateCallSessionStatus(invite.callId, "declined");
    sessionChannel = null;
    set({ incoming: null, captions: [] });
    await closeSessionAfterSend(channel);
  },

  cancelOutgoing: async () => {
    const outgoing = get().outgoing;
    const userId = getSessionUserId();
    const channel = sessionChannel;
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    if (outgoing && userId) await updateCallSessionStatus(outgoing.callId, "cancelled");
    sessionChannel = null;
    set({ outgoing: null, captions: [] });
    await closeSessionAfterSend(channel);
  },

  cancelActive: async () => {
    const active = get().active;
    const userId = getSessionUserId();
    const channel = sessionChannel;
    if (active && userId) {
      try { await updateCallSessionStatus(active.callId, "ended"); } catch { /* still close locally */ }
    }
    sessionChannel = null;
    set({ active: null, incoming: null, captions: [] });
    await closeSessionAfterSend(channel);
  },

  completeActive: async (seconds, lines) => {
    const active = get().active;
    if (!active) return;
    const userId = getSessionUserId();
    const channel = sessionChannel;
    if (userId && !active.forceEnd) {
      try { await updateCallSessionStatus(active.callId, "ended"); } catch { /* local end still wins */ }
    }
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    const ownText = lines
      .filter((line) => line.userId === active.selfUserId)
      .map((line) => line.text.trim())
      .filter(Boolean)
      .join("\n");
    const speakingMinutes = Math.floor(Math.max(0, seconds) / 60);
    if (userId && seconds > 0) {
      syncCallActivity(speakingMinutes);
      useApp.getState().earnBadge("b_call1");
      if (speakingMinutes > 0) {
        useApp.getState().addXP(speakingMinutes * 6, { speaking: speakingMinutes, sync: true, source: "CALL" });
        useApp.getState().progressMission("m_call", speakingMinutes);
      } else {
        useApp.setState((state) => ({ user: { ...state.user, stats: { ...state.user.stats, totalCalls: state.user.stats.totalCalls + 1 } } }));
      }
    }
    sessionChannel = null;
    set({
      active: null,
      completed: { callId: active.callId, peer: active.peer, mode: active.mode, source: active.source, seconds: Math.max(0, seconds), transcript: ownText },
      captions: [],
    });
    await closeSessionAfterSend(channel);
  },

  addCaption: (line) => set((state) => ({ captions: orderedUnique(state.captions, line) })),
  clearCompleted: () => set({ completed: null }),
  clearError: () => set({ error: null }),

  reset: () => {
    if (answerTimeout !== undefined) window.clearTimeout(answerTimeout);
    answerTimeout = undefined;
    if (inboxPollTimer !== undefined) window.clearInterval(inboxPollTimer);
    inboxPollTimer = undefined;
    inboxPollRefs = 0;
    inboxPollInFlight = false;
    const inbox = inboxChannel;
    const session = sessionChannel;
    inboxChannel = null;
    inboxUserId = null;
    sessionChannel = null;
    if (inbox) void supabase.removeChannel(inbox);
    if (session) void supabase.removeChannel(session);
    set({ inboxReady: false, incoming: null, outgoing: null, active: null, completed: null, captions: [], error: null });
  },
}));
