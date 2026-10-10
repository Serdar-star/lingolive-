import { create } from "zustand";
import {
  CURRENT_USER, DAILY_MISSIONS, UNITS,
  type CurrentUser, type Lesson, type Mission, type Unit, type VoiceRoom,
} from "../data/mock";
import { localDateKey } from "../lib/date";
import { getLocalPreferences, saveLocalPreferences } from "../lib/preferences";

export type Tab = "home" | "learn" | "live" | "chat" | "profile";
export type AuthStage = "splash" | "onboarding" | "login" | "register" | "reset" | "app";
export type SubPage = "stats" | "achievements" | "subscription" | "settings" | "notifications" | "edit-profile";

/* ─────────── AI CHAT TYPES ─────────── */
export interface AIQuiz { question: string; options: string[]; answer: number; explanation: string; answered: number | null }
export interface AIAction { label: string; icon: string; go: "live" | "learn" | "flashcards" | "lesson" | "room" }
export interface AIWordCard { word: string; pro: string; tr: string; ex: string }
export interface AIProgressItem { icon: string; label: string; value: string; bar?: number }
export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  quiz?: AIQuiz;
  words?: AIWordCard[];
  progress?: AIProgressItem[];
  actions?: AIAction[];
}

export interface OnboardingData {
  native: string;
  target: string;
  goals: string[];
  level: string;
  dailyMin: number;
}

export interface Toast {
  id: number;
  title: string;
  desc?: string;
  icon?: string; // icon key
  tone?: "primary" | "green" | "gold" | "red";
}
export interface XPEvent { id: number; amount: number }

let toastSeq = 1;
let xpSeq = 1;
const freshMissions = () => DAILY_MISSIONS.map((mission) => ({ ...mission }));

/* Derived lesson status: completed → current → locked along the path */
export type LessonStatus = "completed" | "current" | "locked";
export function lessonIndexer(completed: Record<string, { stars: number; score: number }>) {
  const flat: { unit: Unit; lesson: Lesson; index: number }[] = [];
  UNITS.forEach((u) => u.lessons.forEach((l) => flat.push({ unit: u, lesson: l, index: flat.length })));
  const firstIncomplete = flat.findIndex((f) => !completed[f.lesson.id]);
  return flat.map((f, i) => ({
    ...f,
    status: (completed[f.lesson.id]
      ? "completed"
      : i === firstIncomplete
        ? "current"
        : "locked") as LessonStatus,
    result: completed[f.lesson.id],
  }));
}

interface AppStore {
  /* theme */
  dark: boolean;
  toggleTheme: () => void;

  /* auth flow */
  authStage: AuthStage;
  setAuthStage: (s: AuthStage) => void;
  onboarding: OnboardingData | null;
  completeOnboarding: (d: OnboardingData) => void;
  signOut: () => void;

  /* navigation */
  tab: Tab;
  setTab: (t: Tab) => void;
  page: SubPage | null;
  openPage: (p: SubPage) => void;
  closePage: () => void;
  flashcardsOpen: boolean;
  flashcardsCategory: string | null;
  setFlashcards: (v: boolean, category?: string) => void;

  /* AI tutor */
  aiOpen: boolean;
  setAIOpen: (v: boolean) => void;
  aiBadge: boolean;
  aiMessages: AIMessage[];
  aiAdd: (m: AIMessage) => void;
  aiUpdate: (id: string, patch: Partial<AIMessage>) => void;
  aiClear: () => void;
  aiPractice: boolean;
  setAIPractice: (v: boolean) => void;
  aiPrompt: string | null;
  setAIPrompt: (v: string | null) => void;

  /* user & gamification */
  user: CurrentUser;
  xp: number;
  xpToNext: number;
  levelNum: number;
  streak: number;
  todayXP: number;
  updateProfile: (patch: Partial<CurrentUser>) => void;
  addXP: (n: number, opts?: { words?: number; speaking?: number; lessons?: number; sync?: boolean; source?: string }) => void;

  /* missions */
  missions: Mission[];
  missionDate: string;
  refreshDailyMissions: () => void;
  progressMission: (id: string, by?: number) => void;

  /* toasts + fx */
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  xpEvents: XPEvent[];
  levelUpFx: boolean;
  setLevelUpFx: (v: boolean) => void;

  /* badges */
  earnedBadges: string[];
  newBadgeId: string | null;
  earnBadge: (id: string) => void;
  clearNewBadge: () => void;

  /* lessons */
  completed: Record<string, { stars: number; score: number }>;
  coursePairKey: string | null;
  courseStatus: "idle" | "loading" | "ready" | "error";
  courseError: string | null;
  activeLesson: Lesson | null;
  lessonLoading: boolean;
  lessonError: string | null;
  openLesson: (l: Lesson) => void;
  closeLesson: () => void;
  completeLesson: (lesson: Lesson, score: number, xpEarned: number) => void;

  /* live */
  joinedRooms: string[];
  joinRoom: (id: string, name: string) => void;
  activeRoom: VoiceRoom | null;
  openRoom: (r: VoiceRoom) => void;
  closeRoom: () => void;
}

export const useApp = create<AppStore>((set, get) => ({
  dark: getLocalPreferences().darkMode,
  toggleTheme: () => {
    const dark = !get().dark;
    saveLocalPreferences({ ...getLocalPreferences(), darkMode: dark });
    set({ dark });
  },

  authStage: "splash",
  setAuthStage: (authStage) => set({ authStage }),
  onboarding: null,
  completeOnboarding: (d) => set({ onboarding: d, authStage: "register" }),
  signOut: () => {
    import("../lib/backend").then((m) => m.backendSignOut()).catch(() => undefined);
    set({ authStage: "login", tab: "home", activeLesson: null, lessonLoading: false, lessonError: null, missions: freshMissions(), missionDate: localDateKey() });
  },

  tab: "home",
  setTab: (tab) => set({ tab }),
  page: null,
  openPage: (page) => set({ page }),
  closePage: () => set({ page: null }),
  flashcardsOpen: false,
  flashcardsCategory: null,
  setFlashcards: (flashcardsOpen, flashcardsCategory) => set({
    flashcardsOpen,
    flashcardsCategory: flashcardsOpen ? (flashcardsCategory ?? null) : null,
  }),

  aiOpen: false,
  setAIOpen: (v) => set((s) => ({ aiOpen: v, aiBadge: v ? false : s.aiBadge })),
  aiBadge: true,
  aiMessages: [],
  aiAdd: (m) => set((s) => ({ aiMessages: [...s.aiMessages.slice(-49), m] })),
  aiUpdate: (id, patch) =>
    set((s) => ({ aiMessages: s.aiMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  aiClear: () => set({ aiMessages: [], aiPractice: false }),
  aiPractice: false,
  setAIPractice: (aiPractice) => set({ aiPractice }),
  aiPrompt: null,
  setAIPrompt: (aiPrompt) => set({ aiPrompt }),

  user: CURRENT_USER,
  xp: 0,
  xpToNext: 1000,
  levelNum: 1,
  streak: 0,
  todayXP: 0,

  updateProfile: (patch) => {
    set((s) => ({ user: { ...s.user, ...patch } }));
    import("../lib/backend")
      .then((m) =>
        m.syncProfilePatch({
          ...(patch.displayName ? { display_name: patch.displayName } : {}),
          ...(patch.username ? { username: patch.username } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
          ...(patch.country ? { country: patch.country } : {}),
          ...(patch.interests ? { interests: patch.interests } : {}),
          ...(patch.dailyGoalMinutes !== undefined ? { daily_goal_minutes: patch.dailyGoalMinutes } : {}),
        })
      )
      .catch(() => undefined);
  },

  addXP: (n, opts) => {
    set((s) => {
      let xp = s.xp + n;
      let levelNum = s.levelNum;
      let xpToNext = s.xpToNext;
      let leveled = false;
      while (xp >= xpToNext) {
        xp -= xpToNext;
        levelNum += 1;
        xpToNext = Math.floor(xpToNext * 1.15);
        leveled = true;
      }
      if (leveled) setTimeout(() => get().setLevelUpFx(true), 900);
      return {
        xp, levelNum, xpToNext,
        todayXP: s.todayXP + n,
        xpEvents: [...s.xpEvents, { id: xpSeq++, amount: n }],
        user: {
          ...s.user,
          stats: {
            ...s.user.stats,
            totalXP: s.user.stats.totalXP + n,
            wordsLearned: s.user.stats.wordsLearned + (opts?.words ?? 0),
            lessonsCompleted: s.user.stats.lessonsCompleted + (opts?.lessons ?? 0),
            speakingHours: Math.round((s.user.stats.speakingHours * 60 + (opts?.speaking ?? 0)) / 60 * 100) / 100,
            totalCalls: s.user.stats.totalCalls + (opts?.speaking ? 1 : 0),
          },
        },
      };
    });
    if (opts?.sync && n > 0) {
      import("../lib/backend").then((m) => m.syncXP(n, opts.source ?? "ACTIVITY")).catch(() => undefined);
    }
  },

  missions: freshMissions(),
  missionDate: localDateKey(),
  refreshDailyMissions: () => {
    const today = localDateKey();
    if (get().missionDate !== today) set({ missions: freshMissions(), missionDate: today });
  },
  progressMission: (id, by = 1) => {
    get().refreshDailyMissions();
    const increment = Number.isFinite(by) ? Math.max(0, by) : 0;
    if (!increment) return;
    const m0 = get().missions.find((x) => x.id === id);
    if (!m0 || m0.done) return;
    const current = Math.min(m0.target, m0.current + increment);
    const done = current >= m0.target;
    set((s) => ({ missions: s.missions.map((x) => (x.id === id ? { ...x, current, done } : x)) }));
    if (done) setTimeout(() => get().addXP(m0.xp, { sync: true, source: "MISSION" }), 500);
    import("../lib/backend").then((m) => m.syncMission(id, current, done)).catch(() => undefined);
  },

  toasts: [],
  pushToast: (t) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  xpEvents: [],
  levelUpFx: false,
  setLevelUpFx: (v) => set({ levelUpFx: v }),

  earnedBadges: [],
  newBadgeId: null,
  earnBadge: (id) => {
    if (get().earnedBadges.includes(id)) return;
    set((s) => ({ earnedBadges: [...s.earnedBadges, id], newBadgeId: id }));
    import("../lib/backend").then((m) => m.syncBadge(id)).catch(() => undefined);
  },
  clearNewBadge: () => set({ newBadgeId: null }),

  completed: {},
  coursePairKey: null,
  courseStatus: "idle",
  courseError: null,
  activeLesson: null,
  lessonLoading: false,
  lessonError: null,
  openLesson: (l) => {
    const needsLiveExercises = l.exercises.length === 0 || l.exercises[0].id.endsWith("_g1");
    if (!needsLiveExercises) {
      set({ activeLesson: l, lessonLoading: false, lessonError: null });
      return;
    }
    // Never present the generic bundled pool as if it were lesson-specific.
    set({ activeLesson: { ...l, exercises: [] }, lessonLoading: true, lessonError: null });
    void import("../lib/contentGenerator").then(async ({ contentGenerator }) => {
      try {
        const { langByName } = await import("./language");
        const learner = get().user;
        const rows = await contentGenerator.getExercises({
          lessonId: l.id, lessonTitle: l.title,
          langCode: langByName(learner.targetLanguage).code,
          nativeLangCode: langByName(learner.nativeLanguage).code,
          level: learner.level, count: 7,
        });
        if (!rows.length) throw new Error("Lesson-specific exercises are not available. Connect the content database and AI service, or add exercises for this lesson.");
        const { mapExercise } = await import("../lib/content");
        const exercises = rows.map((row) => mapExercise(row as never));
        const current = get().activeLesson;
        if (current?.id === l.id) set({ activeLesson: { ...current, exercises }, lessonLoading: false, lessonError: null });
      } catch (caught) {
        const current = get().activeLesson;
        if (current?.id !== l.id) return;
        set({ lessonLoading: false, lessonError: caught instanceof Error ? caught.message : "Lesson exercises could not be loaded." });
      }
    });
  },
  closeLesson: () => set({ activeLesson: null, lessonLoading: false, lessonError: null }),
  completeLesson: (lesson, score, xpEarned) => {
    const stars = score >= 90 ? 3 : score >= 70 ? 2 : 1;
    set((s) => ({
      completed: { ...s.completed, [lesson.id]: { stars, score } },
      activeLesson: null,
      lessonLoading: false,
      lessonError: null,
    }));
    import("../lib/backend")
      .then((m) =>
        m.syncLessonComplete({
          lessonId: lesson.id, score, stars, xpEarned,
          timeSpentSeconds: lesson.mins * 60,
          newWords: Array.from({ length: lesson.newWords }, (_, i) => `${lesson.id}_w${i + 1}`),
        })
      )
      .catch(() => undefined);
    get().addXP(xpEarned, { words: lesson.newWords, lessons: 1 }); // XP DB sync'i saveLessonProgress içinde (çift sayım olmasın)
    if (get().user.stats.lessonsCompleted >= 50) get().earnBadge("b_lesson50");
    get().progressMission("m_lesson");
    get().earnBadge("b_lesson1");
    import("../lib/backend").then((m) => m.syncStreak()).catch(() => undefined);
    get().pushToast({
      title: `+${xpEarned} XP earned`,
      desc: lesson.kind === "lesson" ? `${lesson.title} complete` : `${lesson.title} cleared`,
      icon: "zap", tone: "gold",
    });
  },

  joinedRooms: [],
  joinRoom: (id, name) => {
    const first = !get().joinedRooms.includes(id);
    if (first) {
      get().progressMission("m_room");
      get().pushToast({ title: "Joined voice room", desc: name, icon: "rooms", tone: "green" });
    }
  },
  activeRoom: null,
  openRoom: (r) => {
    const first = !get().joinedRooms.includes(r.id);
    set((s) => ({ activeRoom: r, joinedRooms: first ? [...s.joinedRooms, r.id] : s.joinedRooms }));
    if (first) {
      get().progressMission("m_room");
      get().pushToast({ title: "Joined voice room", desc: r.name, icon: "rooms", tone: "green" });
    }
  },
  closeRoom: () => set({ activeRoom: null }),
}));
