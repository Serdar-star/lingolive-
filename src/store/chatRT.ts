/* ──────────────────────────────────────────────────────────
   LINGOLIVE — realtime chat store (Supabase Realtime)
   Activates only when backend keys + an auth session exist;
   otherwise every getter stays empty and the UI falls back
   to the built-in demo data unchanged.
   ────────────────────────────────────────────────────────── */
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getSessionUserId } from "../lib/backend";
import type { Conversation, Message, Person, CEFR } from "../data/mock";

export interface RTMoment {
  id: string;
  user: { name: string; initials: string; color: string; avatarUrl?: string | null; flag: string; level: CEFR };
  text: string;
  time: string;
  likes: number;
  comments: number;
  corrections: number;
  liked: boolean;
  mine?: boolean;
  userId: string;
  img?: string | boolean;
}

export interface RTMomentComment {
  id: string;
  momentId: string;
  userId: string;
  userName: string;
  userInitials: string;
  userColor: string;
  avatarUrl?: string | null;
  content: string;
  time: string;
}

export interface RTCorrection {
  id: string;
  giverId: string;
  receiverId: string | null;
  momentId: string | null;
  original: string;
  corrected: string;
  explanation: string;
  isThanked: boolean;
  otherUserName: string;
  otherUserInitials: string;
  otherUserColor: string;
  otherAvatarUrl?: string | null;
  time: string;
}

const PALETTE = ["#E84393", "#6C5CE7", "#00CEC9", "#2ED573", "#FFA502", "#74B9FF", "#FF6B6B"];
const colorFor = (id: string) => PALETTE[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
const initialsFor = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface DbMsg {
  id: string; conversation_id: string; sender_id: string; type: string;
  content: string | null; media_url: string | null; audio_duration: number | null;
  correction: { original?: string; corrected?: string; explanation?: string } | null;
  is_read: boolean; created_at: string;
  users?: { display_name: string; avatar_url: string | null; country_flag: string } | null;
}

function mapMsg(m: DbMsg, myId: string): Message {
  if (m.type === "CORRECTION") {
    return {
      id: m.id, type: "correction", time: relTime(m.created_at),
      original: m.correction?.original ?? "",
      corrected: m.correction?.corrected ?? "",
      explanation: m.correction?.explanation ?? "",
    };
  }
  if (m.type === "VOICE") {
    return {
      id: m.id, type: "voice", time: relTime(m.created_at),
      duration: m.audio_duration ? `${Math.floor(m.audio_duration / 60)}:${String(m.audio_duration % 60).padStart(2, "0")}` : "0:00",
      ...(m.content && m.content !== "Voice message" ? { text: m.content } : {}),
      ...(m.media_url && /^https?:\/\//i.test(m.media_url) ? { audioUrl: m.media_url } : {}),
    };
  }
  return {
    id: m.id, type: m.sender_id === myId ? "sent" : "received",
    text: m.content ?? "", time: localTime(m.created_at), read: m.is_read,
  };
}

interface RTState {
  ready: boolean;
  conversationsLoading: boolean;
  conversationsError: string | null;
  convs: Conversation[];
  msgs: Record<string, Message[]>;
  typing: Record<string, boolean>;
  sending: boolean;
  momentsFeed: RTMoment[] | null;
  momentsLoading: boolean;
  momentsError: string | null;
  loadMoments: () => Promise<void>;
  toggleMomentLike: (momentId: string) => Promise<boolean>;
  createMoment: (text: string, file?: File | null) => Promise<RTMoment | null>;
  loadMomentComments: (momentId: string) => Promise<RTMomentComment[]>;
  createMomentComment: (momentId: string, content: string) => Promise<RTMomentComment | null>;
  loadMomentCorrections: (momentId: string) => Promise<RTCorrection[]>;
  createMomentCorrection: (input: { momentId: string; receiverId: string; original: string; corrected: string; explanation: string }) => Promise<boolean>;
  loadMyCorrections: () => Promise<{ received: RTCorrection[]; given: RTCorrection[] }>;
  thankCorrection: (correctionId: string) => Promise<boolean>;
  loadConversations: () => Promise<void>;
  updateConversationPin: (conversationId: string, value: boolean) => Promise<void>;
  openConv: (conversationId: string) => Promise<void>;
  closeConv: (conversationId: string) => void;
  sendText: (conversationId: string, text: string) => Promise<boolean>;
  sendVoice: (conversationId: string, audio: Blob, durationSeconds: number, transcript?: string) => Promise<boolean>;
  broadcastTyping: (conversationId: string, typing: boolean) => void;
  cleanup: () => void;
  channels: Record<string, RealtimeChannel>;
}

export const useChatRT = create<RTState>()((set, get) => ({
  ready: false,
  conversationsLoading: false,
  conversationsError: null,
  convs: [],
  msgs: {},
  typing: {},
  sending: false,
  channels: {},
  momentsFeed: null,
  momentsLoading: false,
  momentsError: null,

  loadMoments: async () => {
    const userId = getSessionUserId();
    set({ momentsLoading: true, momentsError: null });
    try {
      const { data, error } = await supabase
        .from("moments")
        .select("id, user_id, content, image_url, likes_count, comments_count, corrections_count, created_at, users!user_id(id, display_name, avatar_url, country_flag, current_level, is_verified)")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      const likesResult = userId
        ? await supabase.from("moment_likes").select("moment_id").eq("user_id", userId)
        : { data: [] as { moment_id: string }[], error: null };
      if (likesResult.error) throw likesResult.error;
      const liked = new Set((likesResult.data ?? []).map((l) => l.moment_id));
      const feed: RTMoment[] = (data ?? []).map((m) => {
        const u = (Array.isArray(m.users) ? m.users[0] : m.users) as { id: string; display_name: string; avatar_url: string | null; country_flag: string; current_level: string } | null;
        return {
          id: m.id,
          userId: m.user_id,
          user: {
            name: u?.display_name ?? "Learner",
            initials: initialsFor(u?.display_name ?? "L"),
            color: colorFor(m.user_id),
            avatarUrl: u?.avatar_url ?? null,
            flag: u?.country_flag || "gb",
            level: (u?.current_level as CEFR) || "B1",
          },
          text: m.content,
          time: relTime(m.created_at),
          likes: m.likes_count ?? 0,
          comments: m.comments_count ?? 0,
          corrections: m.corrections_count ?? 0,
          liked: liked.has(m.id),
          mine: m.user_id === userId,
          img: m.image_url || false,
        };
      });
      set({ momentsFeed: feed, momentsError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load the community feed.";
      console.warn("Moments feed unavailable:", message);
      set({ momentsFeed: [], momentsError: message });
    } finally {
      set({ momentsLoading: false });
    }
  },

  toggleMomentLike: async (momentId) => {
    const userId = getSessionUserId();
    const moment = get().momentsFeed?.find((item) => item.id === momentId);
    if (!userId || !moment) return false;
    const shouldLike = !moment.liked;
    const query = shouldLike
      ? supabase.from("moment_likes").insert({ moment_id: momentId, user_id: userId })
      : supabase.from("moment_likes").delete().eq("moment_id", momentId).eq("user_id", userId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    set((state) => ({
      momentsFeed: state.momentsFeed?.map((item) => item.id === momentId
        ? { ...item, liked: shouldLike, likes: Math.max(0, item.likes + (shouldLike ? 1 : -1)) }
        : item) ?? null,
    }));
    return true;
  },

  createMoment: async (text, file) => {
    const userId = getSessionUserId();
    if (!userId) return null;
    const content = text.trim();
    if (!content) throw new Error("Write something before posting.");
    if (content.length > 5000) throw new Error("Moment text must be 5,000 characters or fewer.");
    if (file && (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) {
      throw new Error("Choose an image smaller than 8 MB.");
    }
    let uploadedPath: string | null = null;
    try {
      let imageUrl: string | null = null;
      if (file) {
        const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
        uploadedPath = `${userId}/moments/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("media").upload(uploadedPath, file, {
          contentType: file.type, cacheControl: "3600", upsert: false,
        });
        if (up.error) throw up.error;
        imageUrl = supabase.storage.from("media").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error } = await supabase
        .from("moments")
        .insert({ user_id: userId, content, image_url: imageUrl })
        .select("id, created_at").single();
      if (error) throw error;
      const mine: RTMoment = {
        id: data.id, userId,
        user: { name: "You", initials: "ME", color: "#6C5CE7", flag: "tr", level: "B1" as CEFR },
        text: content, time: "now", likes: 0, comments: 0, corrections: 0, liked: false, mine: true, img: imageUrl ?? false,
      };
      set((s) => ({ momentsFeed: [mine, ...(s.momentsFeed ?? []).filter((item) => item.id !== mine.id)], momentsError: null }));
      return mine;
    } catch (e) {
      if (uploadedPath) await supabase.storage.from("media").remove([uploadedPath]).catch(() => undefined);
      console.warn("Moment post to cloud failed", e);
      throw e;
    }
  },

  loadMomentComments: async (momentId) => {
    const { data, error } = await supabase
      .from("moment_comments")
      .select("id, moment_id, user_id, content, created_at, users!user_id(id, display_name, avatar_url)")
      .eq("moment_id", momentId).order("created_at", { ascending: true }).limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const user = (Array.isArray(row.users) ? row.users[0] : row.users) as { id: string; display_name: string; avatar_url: string | null } | null;
      return {
        id: row.id, momentId: row.moment_id, userId: row.user_id,
        userName: user?.display_name ?? "Learner",
        userInitials: initialsFor(user?.display_name ?? "Learner"),
        userColor: colorFor(row.user_id), avatarUrl: user?.avatar_url ?? null,
        content: row.content, time: relTime(row.created_at),
      };
    });
  },

  createMomentComment: async (momentId, content) => {
    const userId = getSessionUserId();
    if (!userId) return null;
    const text = content.trim();
    if (!text) throw new Error("Write a comment first.");
    if (text.length > 1000) throw new Error("Comments must be 1,000 characters or fewer.");
    const { data, error } = await supabase.from("moment_comments")
      .insert({ moment_id: momentId, user_id: userId, content: text })
      .select("id, moment_id, user_id, content, created_at, users!user_id(display_name, avatar_url)").single();
    if (error) throw error;
    const author = (Array.isArray(data.users) ? data.users[0] : data.users) as { display_name?: string; avatar_url?: string | null } | null;
    const comment: RTMomentComment = {
      id: data.id, momentId: data.moment_id, userId: data.user_id,
      userName: author?.display_name ?? "You",
      userInitials: initialsFor(author?.display_name ?? "You"), userColor: colorFor(userId),
      avatarUrl: author?.avatar_url ?? null,
      content: data.content, time: relTime(data.created_at),
    };
    set((state) => ({
      momentsFeed: state.momentsFeed?.map((item) => item.id === momentId ? { ...item, comments: item.comments + 1 } : item) ?? null,
    }));
    return comment;
  },

  loadMomentCorrections: async (momentId) => {
    const userId = getSessionUserId();
    if (!userId) return [];
    const { data, error } = await supabase.from("corrections")
      .select("id, giver_id, receiver_id, moment_id, original_text, corrected_text, explanation, is_thanked, created_at, giver:users!corrections_giver_id_fkey(display_name, avatar_url)")
      .eq("moment_id", momentId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const giver = (Array.isArray(row.giver) ? row.giver[0] : row.giver) as { display_name: string; avatar_url: string | null } | null;
      const otherName = row.giver_id === userId ? "You" : (giver?.display_name ?? "Learner");
      return {
        id: row.id, giverId: row.giver_id, receiverId: row.receiver_id, momentId: row.moment_id,
        original: row.original_text, corrected: row.corrected_text, explanation: row.explanation ?? "",
        isThanked: !!row.is_thanked, otherUserName: otherName,
        otherUserInitials: initialsFor(otherName), otherUserColor: colorFor(row.giver_id),
        otherAvatarUrl: giver?.avatar_url ?? null, time: relTime(row.created_at),
      };
    });
  },

  createMomentCorrection: async ({ momentId, receiverId, original, corrected, explanation }) => {
    const userId = getSessionUserId();
    if (!userId) return false;
    const originalText = original.trim();
    const correctedText = corrected.trim();
    if (!originalText || !correctedText) throw new Error("Add both the original and corrected text.");
    if (originalText.length > 2000 || correctedText.length > 2000 || explanation.trim().length > 1000) {
      throw new Error("Correction text is too long.");
    }
    if (userId === receiverId) throw new Error("You can't correct your own Moment.");
    const { error } = await supabase.from("corrections").insert({
      giver_id: userId, receiver_id: receiverId, moment_id: momentId,
      original_text: originalText, corrected_text: correctedText,
      explanation: explanation.trim() || null,
    });
    if (error) throw error;
    set((state) => ({
      momentsFeed: state.momentsFeed?.map((item) => item.id === momentId ? { ...item, corrections: item.corrections + 1 } : item) ?? null,
    }));
    return true;
  },

  loadMyCorrections: async () => {
    const userId = getSessionUserId();
    if (!userId) return { received: [], given: [] };
    const fields = "id, giver_id, receiver_id, moment_id, original_text, corrected_text, explanation, is_thanked, created_at";
    const [receivedResult, givenResult] = await Promise.all([
      supabase.from("corrections").select(`${fields}, giver:users!corrections_giver_id_fkey(display_name, avatar_url)`)
        .eq("receiver_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("corrections").select(`${fields}, receiver:users!corrections_receiver_id_fkey(display_name, avatar_url)`)
        .eq("giver_id", userId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (receivedResult.error) throw receivedResult.error;
    if (givenResult.error) throw givenResult.error;
    const mapRows = (rows: any[], kind: "received" | "given"): RTCorrection[] => rows.map((row) => {
      const person = kind === "received" ? row.giver : row.receiver;
      const relation = (Array.isArray(person) ? person[0] : person) as { display_name: string; avatar_url: string | null } | null;
      const otherName = relation?.display_name ?? "Learner";
      const otherId = kind === "received" ? row.giver_id : row.receiver_id;
      return {
        id: row.id, giverId: row.giver_id, receiverId: row.receiver_id, momentId: row.moment_id,
        original: row.original_text, corrected: row.corrected_text, explanation: row.explanation ?? "",
        isThanked: !!row.is_thanked, otherUserName: otherName,
        otherUserInitials: initialsFor(otherName), otherUserColor: colorFor(otherId ?? userId),
        otherAvatarUrl: relation?.avatar_url ?? null, time: relTime(row.created_at),
      };
    });
    return { received: mapRows(receivedResult.data ?? [], "received"), given: mapRows(givenResult.data ?? [], "given") };
  },

  thankCorrection: async (correctionId) => {
    const userId = getSessionUserId();
    if (!userId) return false;
    const { data, error } = await supabase.from("corrections").update({ is_thanked: true })
      .eq("id", correctionId).eq("receiver_id", userId).select("id").maybeSingle();
    if (error) throw error;
    return !!data;
  },

  loadConversations: async () => {
    const userId = getSessionUserId();
    if (!userId) {
      set({ ready: false, convs: [], conversationsLoading: false, conversationsError: null });
      return;
    }
    set({ conversationsLoading: true, conversationsError: null });
    try {
      const { data: parts, error: partsError } = await supabase
        .from("conversation_participants").select("conversation_id, last_read_at, is_pinned").eq("user_id", userId);
      if (partsError) throw partsError;
      if (!parts?.length) { set({ ready: true, convs: [], conversationsError: null }); return; }
      const ids = parts.map((p) => p.conversation_id);
      const lastReadByConversation = new Map(parts.map((part) => [part.conversation_id, part.last_read_at]));
      const pinnedByConversation = new Map(parts.map((part) => [part.conversation_id, !!part.is_pinned]));
      const { data: convs, error: convsError } = await supabase
        .from("conversations").select("id, type, last_message_text, last_message_at")
        .in("id", ids).order("last_message_at", { ascending: false });
      if (convsError) throw convsError;

      const mapped: Conversation[] = [];
      for (const c of convs ?? []) {
        const { data: others, error: othersError } = await supabase
          .from("conversation_participants").select("user_id")
          .eq("conversation_id", c.id).neq("user_id", userId).limit(1);
        if (othersError) throw othersError;
        const partnerId = others?.[0]?.user_id;
        let partner: (Person & { id?: string; nativeLanguage?: string; online: boolean; verified: boolean }) | null = null;
        if (partnerId) {
          const { data: p, error: profileError } = await supabase
            .from("users").select("id, display_name, avatar_url, country_flag, current_level, native_language, is_online, is_verified")
            .eq("id", partnerId).maybeSingle();
          if (profileError) throw profileError;
          if (p) partner = {
            id: p.id,
            name: p.display_name, initials: initialsFor(p.display_name), avatarUrl: p.avatar_url ?? null,
            color: colorFor(p.id), flag: p.country_flag || "gb",
            level: (p.current_level as Person["level"]) || "B1",
            nativeLanguage: p.native_language || undefined,
            online: !!p.is_online, verified: !!p.is_verified,
          };
        }
        const lastReadAt = lastReadByConversation.get(c.id) ?? "1970-01-01T00:00:00.000Z";
        const { count, error: countError } = await supabase.from("messages").select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id).gt("created_at", lastReadAt).neq("sender_id", userId);
        if (countError) throw countError;
        const isPinned = pinnedByConversation.get(c.id) ?? false;
        mapped.push({
          id: c.id,
          user: partner ?? { name: "Conversation", initials: "C", color: "#A29BFE", flag: "gb", level: "B1", online: false, verified: false },
          lastMessage: c.last_message_text ?? "",
          time: relTime(c.last_message_at),
          unread: count ?? 0,
          messages: [],
          isPinned,
        });
      }
      mapped.sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned));
      set({ ready: true, convs: mapped, conversationsError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load conversations.";
      console.warn("Realtime conversations unavailable:", message);
      set({ ready: false, conversationsError: message });
    } finally {
      set({ conversationsLoading: false });
    }
  },

  updateConversationPin: async (conversationId, value) => {
    const userId = getSessionUserId();
    if (!userId) throw new Error("Sign in to pin a conversation.");
    const { data, error } = await supabase.from("conversation_participants")
      .update({ is_pinned: value })
      .eq("conversation_id", conversationId).eq("user_id", userId)
      .select("conversation_id").maybeSingle();
    if (error) throw new Error(`Pin setting could not be saved: ${error.message}`);
    if (!data) throw new Error("This conversation is not linked to your account.");
    set((state) => {
      const convs = state.convs.map((conv) => conv.id === conversationId ? { ...conv, isPinned: value } : conv);
      convs.sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned));
      return { convs };
    });
  },

  openConv: async (conversationId) => {
    const userId = getSessionUserId();
    if (!userId) return;
    // load history
    const { data, error: historyError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, type, content, media_url, audio_duration, correction, is_read, created_at, users!sender_id(display_name, avatar_url, country_flag)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(100);
    if (historyError) throw historyError;
    const rows = (data ?? []) as unknown as DbMsg[];
    const { data: otherParticipants, error: participantError } = await supabase.from("conversation_participants")
      .select("last_read_at").eq("conversation_id", conversationId).neq("user_id", userId).limit(1);
    if (participantError) throw participantError;
    const partnerReadAt = otherParticipants?.[0]?.last_read_at ? Date.parse(otherParticipants[0].last_read_at) : 0;
    const voicePaths = [...new Set(rows.filter((row) => row.type === "VOICE" && row.media_url && !/^https?:\/\//i.test(row.media_url)).map((row) => row.media_url!))];
    const signedUrls = new Map<string, string>();
    if (voicePaths.length) {
      const signedResult = await supabase.storage.from("voice").createSignedUrls(voicePaths, 3600);
      if (!signedResult.error) {
        for (const item of signedResult.data ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
      } else console.warn("Some private voice notes could not be signed:", signedResult.error.message);
    }
    const history = rows.map((row) => {
      const message = mapMsg(row, userId);
      const readReceipt = row.sender_id === userId && partnerReadAt > 0 && Date.parse(row.created_at) <= partnerReadAt;
      const withReadReceipt = row.sender_id === userId && message.type === "sent"
        ? { ...message, read: readReceipt }
        : message;
      const audioUrl = row.media_url ? signedUrls.get(row.media_url) : undefined;
      return audioUrl ? { ...withReadReceipt, audioUrl } : withReadReceipt;
    });
    set((s) => ({ msgs: { ...s.msgs, [conversationId]: history } }));

    // Read state belongs to the participant row, avoiding broad message UPDATE permissions.
    const { error: readError } = await supabase.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId).eq("user_id", userId);
    if (readError) throw readError;
    set((s) => ({ convs: s.convs.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)) }));

    // realtime subscription (skip if already open)
    if (get().channels[conversationId]) return;
    const channel = supabase
      .channel(`rt_conv_${conversationId}`, { config: { private: true } })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const row = payload.new as DbMsg;
        if (row.sender_id === userId) return;
        void (async () => {
          let message = mapMsg(row, userId);
          if (row.type === "VOICE" && row.media_url && !/^https?:\/\//i.test(row.media_url)) {
            const { data, error } = await supabase.storage.from("voice").createSignedUrl(row.media_url, 3600);
            if (!error && data?.signedUrl) message = { ...message, audioUrl: data.signedUrl };
          }
          set((s) => ({
            msgs: { ...s.msgs, [conversationId]: [...(s.msgs[conversationId] ?? []), message] },
            convs: s.convs.map((c) =>
              c.id === conversationId ? { ...c, lastMessage: row.content ?? "", time: "now" } : c
            ),
            typing: { ...s.typing, [conversationId]: false },
          }));
        })();
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        const p = payload.payload as { userId: string; isTyping: boolean };
        if (p.userId === userId) return;
        set((s) => ({ typing: { ...s.typing, [conversationId]: p.isTyping } }));
        if (p.isTyping) {
          setTimeout(() => set((s) => ({ typing: { ...s.typing, [conversationId]: false } })), 4000);
        }
      })
      .subscribe();
    set((s) => ({ channels: { ...s.channels, [conversationId]: channel } }));
  },

  closeConv: (conversationId) => {
    const ch = get().channels[conversationId];
    if (ch) {
      supabase.removeChannel(ch);
      set((s) => {
        const channels = { ...s.channels };
        delete channels[conversationId];
        return { channels };
      });
    }
  },

  sendText: async (conversationId, text) => {
    const userId = getSessionUserId();
    if (!userId || !text.trim()) return false;
    set({ sending: true });
    try {
      const { data, error } = await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: userId, type: "TEXT", content: text.trim(),
      }).select("id, conversation_id, sender_id, type, content, media_url, audio_duration, correction, is_read, created_at").single();
      if (error) throw error;
      const now = data.created_at || new Date().toISOString();
      await supabase.from("conversations").update({ last_message_text: text.trim(), last_message_at: now }).eq("id", conversationId);
      const message = mapMsg(data as DbMsg, userId);
      set((s) => ({
        sending: false,
        msgs: {
          ...s.msgs,
          [conversationId]: [
            ...(s.msgs[conversationId] ?? []).filter((item) => item.id !== message.id),
            message,
          ],
        },
        convs: s.convs.map((c) => (c.id === conversationId ? { ...c, lastMessage: text.trim(), time: "now" } : c)),
      }));
      return true;
    } catch (e) {
      console.warn("Realtime send failed", e);
      set({ sending: false });
      return false;
    }
  },

  sendVoice: async (conversationId, audio, durationSeconds, transcript = "") => {
    const userId = getSessionUserId();
    if (!userId || !audio.size) return false;
    set({ sending: true });
    const mimeType = audio.type || "audio/webm";
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
    const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const path = `${conversationId}/${userId}/voice/${nonce}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from("voice").upload(path, audio, {
        contentType: mimeType, cacheControl: "3600", upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: privateFile, error: signingError } = await supabase.storage.from("voice").createSignedUrl(path, 3600);
      if (signingError || !privateFile?.signedUrl) throw new Error(signingError?.message ?? "Could not create a secure audio link.");
      const now = new Date().toISOString();
      const duration = Math.min(60, Math.max(1, Math.round(durationSeconds)));
      const content = transcript.trim().slice(0, 5000) || "Voice message";
      const { data, error } = await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: userId, type: "VOICE",
        content, media_url: path, audio_duration: duration,
      }).select("id, conversation_id, sender_id, type, content, media_url, audio_duration, correction, is_read, created_at").single();
      if (error) throw new Error(error.message);

      const message = { ...mapMsg(data as DbMsg, userId), audioUrl: privateFile.signedUrl };
      await supabase.from("conversations").update({
        last_message_text: "Voice message", last_message_at: now,
      }).eq("id", conversationId);
      set((s) => ({
        sending: false,
        msgs: { ...s.msgs, [conversationId]: [...(s.msgs[conversationId] ?? []), message] },
        convs: s.convs.map((c) => c.id === conversationId ? { ...c, lastMessage: "Voice message", time: "now" } : c),
      }));
      return true;
    } catch (e) {
      await supabase.storage.from("voice").remove([path]).catch(() => undefined);
      set({ sending: false });
      console.warn("Voice message send failed", e);
      throw e;
    }
  },

  broadcastTyping: (conversationId, typing) => {
    const userId = getSessionUserId();
    const ch = get().channels[conversationId];
    if (!userId || !ch) return;
    ch.send({ type: "broadcast", event: "typing", payload: { userId, isTyping: typing } }).catch(() => undefined);
  },

  cleanup: () => {
    Object.values(get().channels).forEach((ch) => supabase.removeChannel(ch));
    set({ channels: {}, msgs: {}, typing: {} });
  },
}));

export const selectUnreadTotal = (s: RTState) => s.convs.reduce((n, c) => n + c.unread, 0);
