export type CallMode = "VOICE" | "VIDEO";
export type CallSource = "DIRECT" | "QUICK_MATCH";
export type CallSessionStatus = "ringing" | "accepted" | "declined" | "busy" | "cancelled" | "missed" | "ended";

export type CallSessionRow = {
  id: string;
  room_id: string;
  conversation_id: string;
  caller_user_id: string;
  recipient_user_id: string;
  mode: CallMode;
  status: CallSessionStatus;
  created_at: string;
  updated_by: string;
};

export type CallPeer = {
  id: string;
  name: string;
  initials?: string;
  avatarUrl?: string | null;
  flag?: string | null;
  level?: string | null;
  nativeLanguage?: string | null;
};

export type CallCaptionLine = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  /** Milliseconds from the start of this participant's call recording. */
  offsetMs: number;
  createdAt: string;
};

export type DirectCallInvite = {
  callId: string;
  roomId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  fromAvatarUrl?: string | null;
  fromFlag?: string | null;
  fromLevel?: string | null;
  fromNativeLanguage?: string | null;
  mode: CallMode;
  sentAt: string;
};

export type ActiveDirectCall = {
  callId: string;
  roomId: string;
  conversationId: string;
  selfUserId: string;
  peer: CallPeer;
  mode: CallMode;
  source: CallSource;
  role: "CALLER" | "CALLEE";
  startedAt: number;
  forceEnd?: boolean;
};

export type CompletedCall = {
  callId: string;
  peer: CallPeer;
  mode: CallMode;
  source: CallSource;
  seconds: number;
  transcript: string;
};
