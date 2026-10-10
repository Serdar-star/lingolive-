/* ──────────────────────────────────────────────────────────
   LINGOLIVE — Supabase client + service layer (web build)
   Works the moment VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
   are present in .env. Without keys everything degrades to
   demo mode (callers check isSupaConfigured()).
   ────────────────────────────────────────────────────────── */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localDateKey, localDateOffset } from "./date";
import { DAILY_MISSIONS } from "../data/mock";

const env = (k: string): string =>
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k] ??
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k.replace("VITE_", "EXPO_PUBLIC_")] ??
    "") as string;

const SUPABASE_URL = env("VITE_SUPABASE_URL").trim();
const SUPABASE_ANON_KEY = env("VITE_SUPABASE_ANON_KEY").trim();

export const isSupaConfigured = () =>
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;

if (!isSupaConfigured()) {
  console.warn(
    "⚠️ Supabase keys missing — running in DEMO mode.\n" +
      "Add them to .env to enable the real backend:\n" +
      "  VITE_SUPABASE_URL=...\n  VITE_SUPABASE_ANON_KEY=..."
  );
}

/** null when not configured — all services check isSupaConfigured() first */
export const supabase: SupabaseClient = isSupaConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : (null as unknown as SupabaseClient);

/* ─────────── AUTH SERVICE ─────────── */
const PENDING_PROFILE_KEY = "lingolive_pending_profile:";
const pendingProfileKey = (userId: string) => `${PENDING_PROFILE_KEY}${userId}`;

/** Applies only this account's stashed profile patch after email confirmation. */
export async function applyPendingProfile(userId: string): Promise<void> {
  try {
    const key = pendingProfileKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const patch = JSON.parse(raw) as Record<string, unknown>;
    const { data, error } = await supabase.from("users").update(patch).eq("id", userId).select("id").maybeSingle();
    if (!error && data?.id === userId) localStorage.removeItem(key);
  } catch { /* keep the patch for the next authenticated retry */ }
}
export const authService = {
  async signUp(params: {
    email: string; password: string; displayName: string;
    nativeLanguage: string; targetLanguage: string; level: string;
    dailyGoalMinutes: number; country: string; countryFlag: string; interests: string[];
  }) {
    const { data, error } = await supabase.auth.signUp({
      email: params.email, password: params.password,
      options: { data: { display_name: params.displayName } },
    });
    if (error) throw new Error(error.message);
    if (data.user) {
      const username = "@" + params.displayName.toLowerCase().replace(/\s+/g, "") + Math.random().toString(36).slice(2, 6);
      const patch = {
        display_name: params.displayName, username,
        native_language: params.nativeLanguage, target_language: params.targetLanguage,
        current_level: params.level, daily_goal_minutes: params.dailyGoalMinutes,
        country: params.country, country_flag: params.countryFlag, interests: params.interests,
      };
      if (data.session) {
        const { data: profile, error: profileError } = await supabase.from("users")
          .update(patch).eq("id", data.user.id).select("id").maybeSingle();
        if (profileError || profile?.id !== data.user.id) {
          if (profileError) console.error("Profile update error:", profileError);
          try { localStorage.setItem(pendingProfileKey(data.user.id), JSON.stringify(patch)); } catch { /* ignore */ }
        }
      } else {
        /* Email confirmation ON: no session yet → RLS would reject the update.
           Keep this patch under its user ID so another account can never receive it. */
        try { localStorage.setItem(pendingProfileKey(data.user.id), JSON.stringify(patch)); } catch { /* ignore */ }
      }
    }
    return data;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  },

  async signInWithOAuth(provider: "google" | "apple", redirectTo: string) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async resetPassword(email: string, redirectTo: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
  },

  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

/* ─────────── USER SERVICE ─────────── */
export const userService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from("users").select("*, user_stats(*), user_streaks(*)").eq("id", userId).single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateProfile(userId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("users").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", userId).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Profile update was not applied. Check that your account is signed in and the profile row exists.");
  },

  async uploadAvatar(userId: string, blob: Blob): Promise<string> {
    const mimeType = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    const ext = (mimeType.split("/")[1] || "jpeg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
    const fileName = `${userId}/avatars/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("media").upload(fileName, blob, { contentType: mimeType, upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
    return data.publicUrl;
  },

  async setOnlineStatus(userId: string, isOnline: boolean) {
    try {
      await supabase.from("users")
        .update({ is_online: isOnline, last_seen: new Date().toISOString() }).eq("id", userId);
    } catch { /* not critical */ }
  },

  async getLeaderboard(limit = 10) {
    const { data, error } = await supabase
      .from("user_stats")
      .select(`total_xp, users!inner(id, display_name, country_flag, current_level, avatar_url, league, streak)`)
      .order("total_xp", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async searchUsers(query: string, currentUserId: string) {
    const { data, error } = await supabase
      .from("users")
      .select("id, display_name, username, avatar_url, country_flag, current_level, is_online")
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .neq("id", currentUserId).limit(20);
    if (error) throw new Error(error.message);
    return data || [];
  },
};

/* ─────────── PROGRESS SERVICE ─────────── */
export const progressService = {
  async getTodayStats(userId: string) {
    const { data, error } = await supabase
      .from("user_stats")
      .select(`today_lessons, today_words, today_speaking, today_xp, words_learned, total_xp,
        lessons_completed, speaking_minutes, total_calls, room_minutes, partners_met, last_reset_date,
        listening_score, speaking_score, reading_score, writing_score, grammar_score, vocabulary_score`)
      .eq("user_id", userId).single();
    if (error) throw new Error(error.message);
    const today = localDateKey();
    if (data && data.last_reset_date !== today) {
      await supabase.from("user_stats").update({
        today_lessons: 0, today_words: 0, today_speaking: 0, today_xp: 0, last_reset_date: today,
      }).eq("user_id", userId);
      Object.assign(data, { today_lessons: 0, today_words: 0, today_speaking: 0, today_xp: 0 });
    }
    return data;
  },

  async saveLessonProgress(params: {
    userId: string; lessonId: string; score: number; stars: number;
    xpEarned: number; timeSpentSeconds: number; newWords: string[];
  }) {
    await this.getTodayStats(params.userId);
    await supabase.from("lesson_progress").upsert({
      user_id: params.userId, lesson_id: params.lessonId, status: "COMPLETED",
      score: params.score, stars: params.stars, xp_earned: params.xpEarned,
      time_spent_seconds: params.timeSpentSeconds, completed_at: new Date().toISOString(),
    });
    const { data: s } = await supabase.from("user_stats")
      .select("today_lessons, today_xp, total_xp, lessons_completed").eq("user_id", params.userId).single();
    if (s) {
      await supabase.from("user_stats").update({
        today_lessons: (s.today_lessons || 0) + 1,
        today_xp: (s.today_xp || 0) + params.xpEarned,
        total_xp: (s.total_xp || 0) + params.xpEarned,
        lessons_completed: (s.lessons_completed || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("user_id", params.userId);
    }
    await supabase.from("xp_events").insert({
      user_id: params.userId, amount: params.xpEarned, source: "LESSON", source_id: params.lessonId,
    });
    const levelUpResult = await this.addXP(params.userId, params.xpEarned);
    await this.updateStreak(params.userId);
    // Daily mission progress is persisted by the store's syncMission flow.
    return { levelUpResult };
  },

  async addXP(userId: string, amount: number) {
    const { data: user } = await supabase.from("users")
      .select("xp, xp_to_next, current_level_num, current_level").eq("id", userId).single();
    if (!user) return null;
    const newXP = user.xp + amount;
    const leveledUp = newXP >= user.xp_to_next;
    const newLevelNum = leveledUp ? user.current_level_num + 1 : user.current_level_num;
    await supabase.from("users").update({
      xp: leveledUp ? newXP - user.xp_to_next : newXP,
      xp_to_next: leveledUp ? Math.floor(user.xp_to_next * 1.15) : user.xp_to_next,
      current_level_num: newLevelNum, current_level: getLevelFromNumber(newLevelNum),
    }).eq("id", userId);
    if (leveledUp) {
      await supabase.from("notifications").insert({
        user_id: userId, type: "LEVEL_UP", title: "Level Up!",
        body: `Congratulations! You reached Level ${newLevelNum}`,
        data: { new_level: newLevelNum },
      });
    }
    return { leveledUp, newLevelNum };
  },

  async updateStreak(userId: string) {
    const { data: streak } = await supabase.from("user_streaks").select("*").eq("user_id", userId).single();
    if (!streak) return;
    const today = localDateKey();
    const yesterday = localDateOffset(new Date(), -1);
    if (streak.last_activity_date === today) return streak.current_streak;
    const newStreak = streak.last_activity_date === yesterday ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(newStreak, streak.longest_streak);
    const { error: streakError } = await supabase.from("user_streaks").update({
      current_streak: newStreak, longest_streak: newLongest, last_activity_date: today,
    }).eq("user_id", userId);
    if (streakError) throw new Error(streakError.message);
    const { error: profileError } = await supabase.from("users").update({ streak: newStreak, longest_streak: newLongest }).eq("id", userId);
    if (profileError) throw new Error(profileError.message);
    const streakBadge = ({
      7: ["b_streak7", "7-Day Streak"],
      30: ["b_streak30", "30-Day Streak"],
      100: ["b_streak100", "100-Day Streak"],
      365: ["b_streak365", "365-Day Streak"],
    } as Record<number, [string, string]>)[newStreak];
    if (streakBadge) await badgeService.awardBadge(userId, streakBadge[0], streakBadge[1]);
    return newStreak;
  },

  async recordCallActivity(userId: string, speakingMinutes: number) {
    const minutes = Math.max(0, Math.floor(speakingMinutes));
    await this.getTodayStats(userId); // reset local-day counters before adding today's speaking
    const { data, error } = await supabase.from("user_stats")
      .select("today_speaking, speaking_minutes, total_calls").eq("user_id", userId).single();
    if (error) throw new Error(error.message);
    const totalCalls = (data.total_calls || 0) + 1;
    const { error: updateError } = await supabase.from("user_stats").update({
      today_speaking: (data.today_speaking || 0) + minutes,
      speaking_minutes: (data.speaking_minutes || 0) + minutes,
      total_calls: totalCalls,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    return totalCalls;
  },

  async recordRoomActivity(userId: string, roomMinutes: number) {
    const minutes = Math.max(0, Math.floor(roomMinutes));
    if (!minutes) return;
    const { data, error } = await supabase.from("user_stats")
      .select("room_minutes").eq("user_id", userId).single();
    if (error) throw new Error(error.message);
    const { error: updateError } = await supabase.from("user_stats").update({
      room_minutes: (data.room_minutes || 0) + minutes,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
  },

  async getLessonProgress(userId: string) {
    const { data, error } = await supabase
      .from("lesson_progress").select("lesson_id, status, score, stars, completed_at").eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async learnWords(userId: string, words: { id: string; word: string; translation: string }[]) {
    if (!words.length) return;
    const { data: inserted, error: vocabularyError } = await supabase.from("user_vocabulary").upsert(
      words.map((word) => ({ user_id: userId, word_id: word.id, word: word.word, translation: word.translation, status: "LEARNING" })),
      { onConflict: "user_id,word_id", ignoreDuplicates: true },
    ).select("word_id");
    if (vocabularyError) throw new Error(vocabularyError.message);
    const newWords = inserted?.length ?? 0;
    if (!newWords) return;
    await this.getTodayStats(userId);
    const { data: stats, error: statsError } = await supabase.from("user_stats")
      .select("today_words, words_learned").eq("user_id", userId).single();
    if (statsError) throw new Error(statsError.message);
    const { error: updateError } = await supabase.from("user_stats").update({
      today_words: (stats.today_words || 0) + newWords,
      words_learned: (stats.words_learned || 0) + newWords,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
  },

  async getDailyMissions(userId: string) {
    const today = localDateKey();
    const { data, error } = await supabase.from("daily_missions")
      .select("missions, all_completed").eq("user_id", userId).eq("mission_date", today).maybeSingle();
    if (error) throw new Error(error.message);
    const saved: { id?: string; current?: number; done?: boolean }[] = Array.isArray(data?.missions) ? data.missions : [];
    const missions = DAILY_MISSIONS.map((mission) => {
      const progress = saved.find((row) => row.id === mission.id);
      const current = Math.min(mission.target, Math.max(0, Number(progress?.current) || 0));
      return { ...mission, current, done: !!progress?.done || current >= mission.target };
    });
    if (!data) {
      const result = await supabase.from("daily_missions").insert({
        user_id: userId, mission_date: today,
        missions: missions.map(({ id, current, done }) => ({ id, current, done })),
        all_completed: missions.every((mission) => mission.done),
      });
      if (result.error && result.error.code !== "23505") throw new Error(result.error.message);
    }
    return missions;
  },

};

/* ─────────── BADGE SERVICE ─────────── */
export const badgeService = {
  async getUserBadges(userId: string) {
    const { data, error } = await supabase.from("user_badges").select("badge_id, badge_name, earned_at").eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async awardBadge(userId: string, badgeId: string, badgeName: string) {
    const { data, error } = await supabase.from("user_badges")
      .upsert({ user_id: userId, badge_id: badgeId, badge_name: badgeName }, { onConflict: "user_id,badge_id", ignoreDuplicates: true })
      .select("badge_id");
    if (error) throw new Error(error.message);
    if (data?.length) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: userId, type: "BADGE_EARNED", title: "Badge Unlocked!",
        body: `You earned the "${badgeName}" badge!`, data: { badge_id: badgeId },
      });
      if (notificationError) console.warn("Badge notification could not be created:", notificationError.message);
    }
  },
};

/* ─────────── CHAT SERVICE ─────────── */
export const chatService = {
  async getConversations(userId: string) {
    const { data, error } = await supabase.from("conversation_participants")
      .select(`conversation_id, last_read_at, conversations!inner(id, type, last_message_text, last_message_at)`)
      .eq("user_id", userId)
      .order("conversations.last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getMessages(conversationId: string, limit = 50) {
    const { data, error } = await supabase.from("messages")
      .select(`id, type, content, media_url, audio_duration, is_read, created_at, sender_id,
        users!sender_id(display_name, avatar_url, country_flag)`)
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).reverse();
  },

  async sendMessage(params: {
    conversationId: string; senderId: string; content: string;
    type?: string; mediaUrl?: string; audioDuration?: number;
  }) {
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: params.conversationId, sender_id: params.senderId,
      content: params.content, type: params.type || "TEXT",
      media_url: params.mediaUrl, audio_duration: params.audioDuration,
    }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from("conversations").update({
      last_message_text: params.type === "VOICE" ? "Voice message" : params.content,
      last_message_at: new Date().toISOString(),
    }).eq("id", params.conversationId);
    return data;
  },

  subscribeToMessages(conversationId: string, callback: (payload: unknown) => void) {
    return supabase.channel(`messages_${conversationId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, callback)
      .subscribe();
  },

  async markAsRead(conversationId: string, userId: string) {
    await supabase.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId).eq("user_id", userId);
  },
};

/* ─────────── ROOM SERVICE ─────────── */
export const roomService = {
  /** Public active-room feed. Participant totals come from active memberships, not stale counters. */
  async getRooms(filters?: { type?: string; level?: string; topic?: string }) {
    let q = supabase.from("rooms")
      .select(`id, name, topic, type, level, language1, language2, host_id, max_speakers,
        speaker_count, listener_count, status, created_at,
        host:users!host_id(id, display_name, avatar_url, country_flag, current_level, is_verified)`)
      .eq("status", "ACTIVE").order("created_at", { ascending: false });
    if (filters?.type) q = q.eq("type", filters.type);
    if (filters?.level) q = q.eq("level", filters.level);
    if (filters?.topic) q = q.eq("topic", filters.topic);
    const { data, error } = await q.limit(50);
    if (error) throw new Error(error.message);
    const rooms = data || [];
    if (!rooms.length) return rooms;

    const { data: members, error: membersError } = await supabase.from("room_members")
      .select("room_id, role").in("room_id", rooms.map((r: any) => r.id)).is("left_at", null);
    if (membersError) {
      console.warn("Room member counts unavailable; using cached totals:", membersError.message);
      return rooms;
    }
    const counts = new Map<string, { speakers: number; listeners: number }>();
    for (const m of members || []) {
      const value = counts.get(m.room_id) || { speakers: 0, listeners: 0 };
      if (m.role === "LISTENER") value.listeners += 1;
      else value.speakers += 1;
      counts.set(m.room_id, value);
    }
    return rooms.map((room: any) => {
      const value = counts.get(room.id) || { speakers: 0, listeners: 0 };
      return { ...room, speaker_count: value.speakers, listener_count: value.listeners };
    }).filter((room: any) => room.speaker_count + room.listener_count > 0);
  },

  async createRoom(params: {
    name: string; topic: string; type: string; level?: string;
    language1?: string; language2?: string; hostId: string;
    maxSpeakers?: number; rules?: string; isScheduled?: boolean; scheduledAt?: string;
  }) {
    const { data, error } = await supabase.from("rooms").insert({
      name: params.name.trim(), topic: params.topic, type: params.type, level: params.level,
      language1: params.language1, language2: params.language2, host_id: params.hostId,
      max_speakers: params.maxSpeakers || 10, rules: params.rules,
      speaker_count: 1, listener_count: 0, status: "ACTIVE",
      is_scheduled: false, scheduled_at: null,
    }).select().single();
    if (error) throw new Error(error.message);
    const joinedAt = new Date().toISOString();
    const { error: memberError } = await supabase.from("room_members").upsert({
      room_id: data.id, user_id: params.hostId, role: "HOST", is_muted: true,
      hand_raised: false, joined_at: joinedAt, left_at: null,
    }, { onConflict: "room_id,user_id" });
    if (memberError) {
      await supabase.from("rooms").update({ status: "ENDED" }).eq("id", data.id).eq("host_id", params.hostId);
      throw new Error(`Room created, but host membership failed: ${memberError.message}`);
    }
    // Emit a rooms UPDATE after membership insertion so other clients refresh promptly.
    const { error: announceError } = await supabase.from("rooms").update({ speaker_count: 1, listener_count: 0 })
      .eq("id", data.id).eq("host_id", params.hostId);
    if (announceError) console.warn("Room announcement update skipped:", announceError.message);
    return data;
  },

  /** Idempotent re-entry; capacity check uses current active memberships. */
  async joinRoom(roomId: string, userId: string, role: "HOST" | "SPEAKER" | "LISTENER" = "SPEAKER") {
    const { data: room, error: roomError } = await supabase.from("rooms")
      .select("status, max_speakers").eq("id", roomId).maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room || room.status !== "ACTIVE") throw new Error("This room has ended.");

    const { data: existing, error: memberError } = await supabase.from("room_members")
      .select("role, left_at").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (existing && !existing.left_at) return;

    const { count, error: countError } = await supabase.from("room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId).is("left_at", null);
    if (countError) throw new Error(countError.message);
    const capacity = Number(room.max_speakers) || 15;
    if ((count || 0) >= capacity) throw new Error("This room is full.");

    const membership = {
      room_id: roomId, user_id: userId, role, is_muted: true,
      hand_raised: false, joined_at: new Date().toISOString(), left_at: null,
    };
    const result = existing
      ? await supabase.from("room_members").update(membership).eq("room_id", roomId).eq("user_id", userId)
      : await supabase.from("room_members").insert(membership);
    if (result.error) throw new Error(result.error.message);
  },

  async leaveRoom(roomId: string, userId: string) {
    const { data: member, error: readError } = await supabase.from("room_members")
      .select("role, joined_at, left_at").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!member || member.left_at) return;
    const leftAt = new Date();
    const { data: closed, error } = await supabase.from("room_members").update({
      left_at: leftAt.toISOString(), is_muted: true, hand_raised: false,
    }).eq("room_id", roomId).eq("user_id", userId).is("left_at", null).select("room_id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!closed) return;
    const joinedAt = Date.parse(member.joined_at);
    const minutes = Number.isFinite(joinedAt) ? Math.floor(Math.max(0, leftAt.getTime() - joinedAt) / 60_000) : 0;
    if (minutes > 0) {
      try { await progressService.recordRoomActivity(userId, minutes); }
      catch (e) { console.warn("Room time statistics sync failed:", e); }
    }
    if (member.role === "HOST") {
      const { error: endError } = await supabase.from("rooms").update({ status: "ENDED" })
        .eq("id", roomId).eq("host_id", userId);
      if (endError) throw new Error(endError.message);
    }
  },

  subscribeToRooms(callback: (payload: unknown) => void) {
    const channelId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return supabase.channel(`rooms_channel_${channelId}`, { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, callback)
      .subscribe();
  },
};

/* ─────────── MATCHING SERVICE ─────────── */
export const matchingService = {
  async joinQueue(params: {
    userId: string; targetLanguage: string; nativeLanguage: string;
    level: string; duration: number; topic?: string;
  }) {
    const { error } = await supabase.from("matching_queue").upsert({ ...params, created_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  },
  async leaveQueue(userId: string) {
    await supabase.from("matching_queue").delete().eq("user_id", userId);
  },
  async findMatch(userId: string, params: { targetLanguage: string; nativeLanguage: string; level: string }) {
    const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const idx = levels.indexOf(params.level);
    const compatible = levels.filter((_, i) => Math.abs(i - idx) <= 1);
    const { data, error } = await supabase.from("matching_queue")
      .select("*, users!user_id(display_name, avatar_url, country_flag, current_level, interests)")
      .neq("user_id", userId)
      .or(`native_language.eq.${params.targetLanguage},target_language.eq.${params.nativeLanguage}`)
      .in("level", compatible).order("created_at", { ascending: true }).limit(1);
    if (error) throw new Error(error.message);
    return data && data.length > 0 ? data[0] : null;
  },
};

/* ─────────── AI CHAT HISTORY SERVICE ─────────── */
export const aiChatService = {
  async getHistory(userId: string, limit = 30) {
    const { data, error } = await supabase.from("ai_chat_history")
      .select("id, role, content, created_at").eq("user_id", userId)
      .order("created_at", { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async saveMessage(userId: string, role: string, content: string) {
    await supabase.from("ai_chat_history").insert({ user_id: userId, role, content });
  },
  async clearHistory(userId: string) {
    await supabase.from("ai_chat_history").delete().eq("user_id", userId);
  },
};

/* ─────────── NOTIFICATION SERVICE ─────────── */
export const notificationService = {
  async getNotifications(userId: string) {
    const { data, error } = await supabase.from("notifications")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async markAllAsRead(userId: string) {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    if (error) throw new Error(error.message);
  },
  async markAsRead(notificationId: string, userId: string) {
    const { error } = await supabase.from("notifications").update({ is_read: true })
      .eq("id", notificationId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
  subscribeToNotifications(userId: string, callback: (payload: unknown) => void) {
    return supabase.channel(`notifications_${userId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, callback)
      .subscribe();
  },
};

/* ─────────── helpers ─────────── */
export function getLevelFromNumber(n: number): string {
  if (n <= 5) return "A1"; if (n <= 10) return "A2"; if (n <= 20) return "B1";
  if (n <= 35) return "B2"; if (n <= 55) return "C1"; return "C2";
}
