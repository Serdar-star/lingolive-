import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CallSessionRow, CallSessionStatus } from "./callTypes";

export type CallSignalEvent = Exclude<CallSessionStatus, "ringing">;
export type CallSignal = { callId: string; fromUserId: string; reason?: string };
type SignalHandler = (event: CallSignalEvent, signal: CallSignal) => void;

function awaitSubscribed(channel: RealtimeChannel, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("Supabase Realtime bağlantısı zaman aşımına uğradı.")); }
    }, timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(`Supabase Realtime kanalı açılamadı (${status}).`));
      }
    });
  });
}

export async function subscribeToCallInbox(userId: string, onInvite: (invite: CallSessionRow) => void): Promise<RealtimeChannel> {
  const channel = supabase
    .channel(`direct-call-inbox-${userId}`, { config: { private: true } })
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "call_sessions",
      filter: `recipient_user_id=eq.${userId}`,
    }, ({ new: row }) => onInvite(row as unknown as CallSessionRow));
  try {
    await awaitSubscribed(channel);
    return channel;
  } catch (error) {
    await supabase.removeChannel(channel);
    throw error;
  }
}

export async function subscribeToCallSession(callId: string, selfUserId: string, onSignal: SignalHandler): Promise<RealtimeChannel> {
  const channel = supabase.channel(`direct-call-session-${callId}`, { config: { private: true } })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "call_sessions", filter: `id=eq.${callId}`,
    }, ({ new: value }) => {
      const row = value as unknown as CallSessionRow;
      if (!row?.id || row.id !== callId || row.updated_by === selfUserId || row.status === "ringing") return;
      const event = row.status as CallSignalEvent;
      const validEvents: CallSignalEvent[] = ["accepted", "declined", "busy", "cancelled", "missed", "ended"];
      if (!validEvents.includes(event)) return;
      onSignal(event, { callId, fromUserId: row.updated_by });
    });
  try {
    await awaitSubscribed(channel);
    return channel;
  } catch (error) {
    await supabase.removeChannel(channel);
    throw error;
  }
}

export async function createCallSession(input: {
  callId: string;
  roomId: string;
  conversationId: string;
  callerUserId: string;
  recipientUserId: string;
  mode: "VOICE" | "VIDEO";
}): Promise<void> {
  const { error } = await supabase.from("call_sessions").insert({
    id: input.callId,
    room_id: input.roomId,
    conversation_id: input.conversationId,
    caller_user_id: input.callerUserId,
    recipient_user_id: input.recipientUserId,
    updated_by: input.callerUserId,
    mode: input.mode,
    status: "ringing",
  });
  if (error) throw new Error(`Arama kaydı açılamadı: ${error.message}`);
}

export async function updateCallSessionStatus(callId: string, status: CallSessionStatus): Promise<void> {
  const { data, error } = await supabase.from("call_sessions")
    .update({ status })
    .eq("id", callId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Arama durumu güncellenemedi: ${error.message}`);
  if (!data) throw new Error("Arama artık etkin değil; yeniden ara.");
}

export async function loadIncomingCallSessions(userId: string): Promise<CallSessionRow[]> {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await supabase.from("call_sessions")
    .select("id, room_id, conversation_id, caller_user_id, recipient_user_id, mode, status, created_at, updated_by")
    .eq("recipient_user_id", userId)
    .eq("status", "ringing")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw new Error(`Gelen aramalar yüklenemedi: ${error.message}`);
  return (data ?? []) as unknown as CallSessionRow[];
}

export async function verifyConversationPair(conversationId: string, userA: string, userB: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .in("user_id", [userA, userB]);
  if (error) throw new Error(`Sohbet üyeliği doğrulanamadı: ${error.message}`);
  const memberIds = new Set((data ?? []).map((row) => row.user_id));
  return memberIds.has(userA) && memberIds.has(userB);
}
