/* ──────────────────────────────────────────────────────────
   LINGOLIVE — backend bridge
   Routes auth/profile/progress between Supabase (when
   configured) and the local zustand store. Every call is
   safe to make in demo mode.
   ────────────────────────────────────────────────────────── */
import { isSupaConfigured, authService, userService, progressService, badgeService, supabase, applyPendingProfile } from "./supabase";
import { BADGES, DAILY_MISSIONS } from "../data/mock";
import { localDateKey } from "./date";
import { useApp } from "../store/store";
import type { AITutorUser } from "./groq";

let sessionUserId: string | null = null;
let sessionHeartbeat: ReturnType<typeof setInterval> | null = null;
let authBootstrapPromise: Promise<void> | null = null;
export const getSessionUserId = () => sessionUserId;
export const backendReady = () => isSupaConfigured();

function startOnlineHeartbeat() {
  if (sessionHeartbeat) return;
  sessionHeartbeat = setInterval(() => {
    if (sessionUserId) void userService.setOnlineStatus(sessionUserId, true);
  }, 120_000);
}

function stopOnlineHeartbeat() {
  if (sessionHeartbeat) clearInterval(sessionHeartbeat);
  sessionHeartbeat = null;
}

async function hydrateSignedInSession(userId: string) {
  if (sessionUserId !== userId) return;
  await applyPendingProfile(userId);
  await hydrateFromProfile(userId);
  if (sessionUserId !== userId) return;
  void userService.setOnlineStatus(userId, true);
  void syncStreak();
  void hydrateMissions(userId);
  void hydrateBadges(userId);
}

/* ─────────── session bootstrap ─────────── */
export async function initBackendAuth(pushToast: (t: { title: string; desc?: string; icon?: string; tone?: "primary" | "green" | "gold" | "red" }) => void) {
  if (!isSupaConfigured()) return;
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = (async () => {
    try {
      // Subscribe before reading the session so OAuth/recovery redirects aren't missed.
      authService.onAuthStateChange((event, session) => {
        const user = (session as { user?: { id?: string } } | null)?.user;
        if (event === "SIGNED_OUT") {
          sessionUserId = null;
          stopOnlineHeartbeat();
          useApp.setState({ authStage: "login", tab: "home", activeLesson: null, lessonLoading: false, lessonError: null, activeRoom: null, page: null, missions: DAILY_MISSIONS.map((mission) => ({ ...mission })), missionDate: localDateKey() });
          return;
        }
        if (!user?.id) return;
        sessionUserId = user.id;
        startOnlineHeartbeat();
        if (event === "PASSWORD_RECOVERY") {
          useApp.getState().setAuthStage("reset");
          return;
        }
        if (event === "SIGNED_IN") {
          useApp.setState({ authStage: "app", tab: "home" });
          // Supabase advises against awaiting Supabase calls inside this callback.
          setTimeout(() => { void hydrateSignedInSession(user.id!); }, 0);
        }
      });

      const session = await authService.getSession();
      if (!session?.user) return;
      sessionUserId = session.user.id;
      startOnlineHeartbeat();
      await applyPendingProfile(session.user.id);
      await hydrateFromProfile(session.user.id);
      void userService.setOnlineStatus(session.user.id, true);
      useApp.getState().setAuthStage("app");
      void syncStreak();
      void hydrateMissions(session.user.id);
      void hydrateBadges(session.user.id);
      pushToast({ title: "Welcome back!", desc: "Session restored from the cloud", icon: "sparkles", tone: "green" });
    } catch (e) {
      authBootstrapPromise = null;
      console.warn("Backend session restore skipped:", e);
    }
  })();

  return authBootstrapPromise;
}

/** Pull the Supabase profile into the local user model */
async function hydrateFromProfile(userId: string) {
  try {
    const profile = await userService.getProfile(userId);
    const [stats, lessonProgress] = await Promise.all([
      progressService.getTodayStats(userId).catch(() => null),
      progressService.getLessonProgress(userId).catch(() => null),
    ]);
    const displayName = profile.display_name || useApp.getState().user.displayName;
    const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.map((part: string) => part[0]).slice(0, 2).join("").toUpperCase();
    const completed = lessonProgress
      ? Object.fromEntries(lessonProgress.filter((row) => row.status === "COMPLETED").map((row) => [row.lesson_id, { stars: row.stars ?? 0, score: row.score ?? 0 }]))
      : null;
    useApp.setState((state) => ({
      user: {
        ...state.user,
        displayName,
        firstName: nameParts[0] || state.user.firstName,
        initials: initials || state.user.initials,
        username: profile.username || state.user.username,
        avatarUrl: profile.avatar_url || null,
        email: profile.email || state.user.email,
        bio: profile.bio ?? state.user.bio,
        country: profile.country || state.user.country,
        nativeLanguage: profile.native_language || state.user.nativeLanguage,
        targetLanguage: profile.target_language || state.user.targetLanguage,
        dailyGoalMinutes: profile.daily_goal_minutes ?? state.user.dailyGoalMinutes,
        flag: profile.country_flag || state.user.flag,
        level: profile.current_level || state.user.level,
        league: profile.league || state.user.league,
        leagueRank: profile.league_rank ?? state.user.leagueRank,
        isVerified: profile.is_verified ?? state.user.isVerified,
        tier: profile.subscription_tier || state.user.tier,
        interests: profile.interests || state.user.interests,
        stats: {
          ...state.user.stats,
          wordsLearned: stats?.words_learned ?? 0,
          lessonsCompleted: stats?.lessons_completed ?? 0,
          totalXP: stats?.total_xp ?? 0,
          speakingHours: stats ? (Number(stats.speaking_minutes) || 0) / 60 : 0,
          partnersMet: stats?.partners_met ?? 0,
          totalCalls: stats?.total_calls ?? 0,
          roomMinutes: stats?.room_minutes ?? 0,
        },
      },
      ...(completed ? { completed } : {}),
      streak: profile.streak ?? 0,
      xp: profile.xp ?? 0,
      xpToNext: profile.xp_to_next ?? 1000,
      levelNum: profile.current_level_num ?? 1,
      todayXP: stats?.today_xp ?? 0,
    }));
  } catch (e) {
    console.warn("Profile hydrate failed (demo profile kept):", e);
  }
}

/* ─────────── auth passthrough (used by AuthScreens) ─────────── */
export async function backendSignIn(email: string, password: string) {
  const data = await authService.signIn(email, password);
  if (data.user) {
    sessionUserId = data.user.id;
    startOnlineHeartbeat();
    await applyPendingProfile(data.user.id);
    await hydrateFromProfile(data.user.id);
    void userService.setOnlineStatus(data.user.id, true);
  }
}

export async function backendOAuth(provider: "google" | "apple") {
  if (!isSupaConfigured()) throw new Error("Connect Supabase before using social sign-in.");
  return authService.signInWithOAuth(provider, `${window.location.origin}/`);
}

export async function backendResetPassword(email: string) {
  if (!isSupaConfigured()) throw new Error("Password reset requires a configured Supabase project.");
  await authService.resetPassword(email, `${window.location.origin}/?flow=recovery`);
}

export async function backendUpdatePassword(password: string) {
  if (!isSupaConfigured()) throw new Error("Password update requires a configured Supabase project.");
  await authService.updatePassword(password);
}

export async function backendContinueSession() {
  const session = await authService.getSession();
  if (!session?.user) throw new Error("This recovery link has expired. Request a new one and try again.");
  sessionUserId = session.user.id;
  startOnlineHeartbeat();
  await applyPendingProfile(session.user.id);
  await hydrateFromProfile(session.user.id);
  void userService.setOnlineStatus(session.user.id, true);
  void syncStreak();
  void hydrateMissions(session.user.id);
  void hydrateBadges(session.user.id);
  useApp.setState({ authStage: "app", tab: "home" });
}

export async function backendSignUp(params: {
  email: string; password: string; displayName: string;
  nativeLanguage: string; targetLanguage: string; level: string;
  dailyGoalMinutes: number; country: string; countryFlag: string; interests: string[];
}) {
  const data = await authService.signUp(params);
  if (data.session?.user) {
    const userId = data.session.user.id;
    sessionUserId = userId;
    startOnlineHeartbeat();
    await applyPendingProfile(userId);
    await hydrateFromProfile(userId);
    void userService.setOnlineStatus(userId, true);
  }
  return data;
}

export async function backendSignOut() {
  if (!isSupaConfigured()) return;
  const userId = sessionUserId;
  sessionUserId = null;
  stopOnlineHeartbeat();
  if (userId) void userService.setOnlineStatus(userId, false);
  await authService.signOut();
}

/* ─────────── gamification sync (fire-and-forget) ─────────── */
/** Ders DIŞI XP → DB (ders XP'sini saveLessonProgress zaten yazar; çift sayım olmasın). */
export function syncXP(amount: number, source = "ACTIVITY") {
  if (!isSupaConfigured() || !sessionUserId || amount <= 0) return;
  const uid = sessionUserId;
  void (async () => {
    try {
      await progressService.getTodayStats(uid);
      await progressService.addXP(uid, amount); // users.xp + level-up + LEVEL_UP bildirim
      await supabase.from("xp_events").insert({ user_id: uid, amount, source });
      const { data: st } = await supabase.from("user_stats").select("today_xp, total_xp").eq("user_id", uid).single();
      if (st) {
        await supabase.from("user_stats")
          .update({ today_xp: ((st as any).today_xp || 0) + amount, total_xp: ((st as any).total_xp || 0) + amount })
          .eq("user_id", uid);
      }
    } catch (e) { console.warn("XP sync failed:", e); }
  })();
}

/** Persist completed direct-call count and speaking minutes to user_stats. */
export function syncCallActivity(speakingMinutes: number) {
  if (!isSupaConfigured() || !sessionUserId) return;
  const uid = sessionUserId;
  void progressService.recordCallActivity(uid, speakingMinutes).then((totalCalls) => {
    if (totalCalls >= 10) useApp.getState().earnBadge("b_call10");
  }).catch((e) => console.warn("Direct-call statistics sync failed:", e));
}

/** Today's local mission progress → daily_missions.missions jsonb. */
export function syncMission(missionId: string, current: number, done: boolean) {
  if (!isSupaConfigured() || !sessionUserId) return;
  const uid = sessionUserId;
  void (async () => {
    try {
      const date = localDateKey();
      const { data, error } = await supabase.from("daily_missions").select("missions")
        .eq("user_id", uid).eq("mission_date", date).maybeSingle();
      if (error) throw error;
      const base = DAILY_MISSIONS.map((mission) => ({ id: mission.id, current: 0, done: false }));
      const missions: { id: string; current: number; done: boolean }[] = Array.isArray((data as any)?.missions)
        ? (data as any).missions
        : base;
      const definition = DAILY_MISSIONS.find((mission) => mission.id === missionId);
      if (!definition) return;
      const index = missions.findIndex((mission) => mission?.id === missionId);
      const old = index >= 0 ? missions[index] : { id: missionId, current: 0, done: false };
      const entry = { id: missionId, current: Math.min(definition.target, Math.max(Number(old.current) || 0, current)), done: !!old.done || done };
      if (index >= 0) missions[index] = entry; else missions.push(entry);
      const allCompleted = DAILY_MISSIONS.every((mission) => missions.some((row) => row.id === mission.id && row.done));
      const write = data
        ? await supabase.from("daily_missions").update({ missions, all_completed: allCompleted }).eq("user_id", uid).eq("mission_date", date)
        : await supabase.from("daily_missions").insert({ user_id: uid, mission_date: date, missions, all_completed: allCompleted });
      if (write.error) throw write.error;
    } catch (e) { console.warn("Mission sync failed:", e); }
  })();
}

/** Rozet → DB + BADGE_EARNED bildirimi (awardBadge ikisini de yapar). */
export function syncBadge(badgeId: string) {
  if (!isSupaConfigured() || !sessionUserId) return;
  const def = BADGES.find((b) => b.id === badgeId);
  badgeService.awardBadge(sessionUserId, badgeId, def?.name ?? badgeId)
    .catch((e) => console.warn("Badge sync failed:", e));
}

/** Seri → DB (bugün zaten sayıldıysa servis erken döner); sonucu store'a yazar. */
export async function syncStreak() {
  if (!isSupaConfigured() || !sessionUserId) return;
  try {
    const v = await progressService.updateStreak(sessionUserId);
    if (typeof v === "number") {
      useApp.setState({ streak: v });
      const streakBadgeId = ({ 7: "b_streak7", 30: "b_streak30", 100: "b_streak100", 365: "b_streak365" } as Record<number, string>)[v];
      if (streakBadgeId) useApp.getState().earnBadge(streakBadgeId);
    }
  } catch (e) { console.warn("Streak sync failed:", e); }
}

/** Load today's server progress over clean mission definitions (never prior-session state). */
async function hydrateMissions(userId: string) {
  try {
    const date = localDateKey();
    const { data, error } = await supabase.from("daily_missions").select("missions")
      .eq("user_id", userId).eq("mission_date", date).maybeSingle();
    if (error) throw error;
    const rows: any[] = Array.isArray((data as any)?.missions) ? (data as any).missions : [];
    const missions = DAILY_MISSIONS.map((mission) => {
      const saved = rows.find((row) => row?.id === mission.id);
      const current = Math.min(mission.target, Math.max(0, Number(saved?.current) || 0));
      return { ...mission, current, done: !!saved?.done || current >= mission.target };
    });
    useApp.setState({ missions, missionDate: date });
  } catch (e) {
    console.warn("Daily mission hydration failed:", e);
    useApp.setState({ missions: DAILY_MISSIONS.map((mission) => ({ ...mission })), missionDate: localDateKey() });
  }
}

/** Rozetler DB'den → store. Gerçek hesap = gerçek rozetler (seed vitrin içindi). */
async function hydrateBadges(userId: string) {
  try {
    const rows = await badgeService.getUserBadges(userId);
    const map: Record<string, string> = {
      "7_day_streak": "b_streak7", "30_day_streak": "b_streak30",
      "100_day_streak": "b_streak100", "365_day_streak": "b_streak365",
    };
    useApp.setState({ earnedBadges: (rows as { badge_id: string }[]).map((r) => map[r.badge_id] ?? r.badge_id) });
  } catch { /* seed rozetler kalır */ }
}

/* ─────────── progress sync (fire-and-forget) ─────────── */
export function syncLessonComplete(params: {
  lessonId: string; score: number; stars: number; xpEarned: number;
  timeSpentSeconds: number; newWords: string[];
}) {
  if (!isSupaConfigured() || !sessionUserId) return;
  progressService.saveLessonProgress({ userId: sessionUserId, ...params }).catch((e) =>
    console.warn("Lesson sync failed (will retry next launch)", e)
  );
}

export function syncProfilePatch(patch: Record<string, unknown>) {
  if (!isSupaConfigured() || !sessionUserId) return;
  userService.updateProfile(sessionUserId!, patch).catch(() => undefined);
}

/* ─────────── AI tutor context from the live store ─────────── */
export function buildTutorUser(): AITutorUser {
  const s = useApp.getState();
  const weak = [...s.user.skills].sort((a, b) => a.value - b.value).slice(0, 2).map((x) => `${x.label} (${x.value}%)`);
  const strong = [...s.user.skills].sort((a, b) => b.value - a.value).slice(0, 2).map((x) => `${x.label} (${x.value}%)`);
  const pending = s.missions.filter((m) => !m.done).map((m) => `${m.text} (${m.current}/${m.target})`);
  const lessonMission = s.missions.find((m) => m.id === "m_lesson");
  const reviewMission = s.missions.find((m) => m.id === "m_words");
  const speakingMission = s.missions.find((m) => m.id === "m_call");
  return {
    name: s.user.firstName,
    level: s.user.level,
    nativeLanguage: s.user.nativeLanguage,
    targetLanguage: s.user.targetLanguage,
    streak: s.streak,
    xp: s.xp,
    todayLessons: lessonMission?.current ?? 0,
    lessonGoal: lessonMission?.target ?? 0,
    todayCardsReviewed: reviewMission?.current ?? 0,
    dailyReviewGoal: reviewMission?.target ?? 0,
    todaySpeakingMinutes: speakingMission?.current ?? 0,
    dailySpeakingGoalMinutes: speakingMission?.target ?? 0,
    todayXP: s.todayXP,
    totalWords: s.user.stats.wordsLearned,
    totalLessons: s.user.stats.lessonsCompleted,
    totalSpeakingHours: s.user.stats.speakingHours,
    partnersMet: s.user.stats.partnersMet,
    dailyGoalMinutes: s.user.dailyGoalMinutes,
    weakSkills: weak,
    strongSkills: strong,
    interests: s.user.interests,
    subscriptionTier: s.user.tier,
    pendingMissions: pending,
  };
}

/** Persist AI chat turns when a session exists (fire-and-forget) */
export function saveAITurn(role: "user" | "assistant", content: string) {
  if (!isSupaConfigured() || !sessionUserId) return;
  import("./supabase").then(({ aiChatService }) =>
    aiChatService.saveMessage(sessionUserId!, role, content).catch(() => undefined)
  );
}
