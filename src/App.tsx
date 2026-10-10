import { lazy, Suspense, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Zap, ArrowRight, Sparkles } from "lucide-react";
import { useApp } from "./store/store";
import { BADGES, RARITY_STYLES } from "./data/mock";
import { initBackendAuth } from "./lib/backend";
import { hydrateCourse } from "./lib/content";
import { langByName, useLanguageStore } from "./store/language";
import { cn } from "./utils/cn";
import { applyVisualPreferences } from "./lib/preferences";
import { Sidebar, MobileHeader, BottomTabs, BackgroundFX, Splash, ViewShell } from "./components/layout";
import { ToastLayer, XPFloaters, I, Button } from "./components/ui";
import HomeView from "./views/Home";
import LearnView from "./views/Learn";
import LiveView from "./views/Live";
import ChatView from "./views/Chat";
import ProfileView from "./views/Profile";
import LessonFlow from "./lesson/LessonFlow";
import Onboarding from "./auth/Onboarding";
import AuthScreen from "./auth/AuthScreens";
const ZegoRoomSession = lazy(() => import("./components/ZegoVoiceRoom"));
import CallLayer from "./components/CallLayer";
import Flashcards from "./components/Flashcards";
import { AIChat, AIFab } from "./components/ai";
import StatsPage from "./pages/Stats";
import AchievementsPage from "./pages/Achievements";
import SubscriptionPage from "./pages/Subscription";
import SettingsPage from "./pages/Settings";
import EditProfilePage from "./pages/EditProfile";
import NotificationsPage from "./pages/Notifications";

function PageRenderer() {
  const { page } = useApp();
  if (!page) return null;
  switch (page) {
    case "stats": return <StatsPage />;
    case "achievements": return <AchievementsPage />;
    case "subscription": return <SubscriptionPage />;
    case "settings": return <SettingsPage />;
    case "edit-profile": return <EditProfilePage />;
    case "notifications": return <NotificationsPage />;
  }
}

/* ─────────── LEVEL UP OVERLAY ─────────── */
function LevelUpOverlay() {
  const { levelUpFx, setLevelUpFx, levelNum } = useApp();
  useEffect(() => {
    if (!levelUpFx) return;
    confetti({ particleCount: 220, spread: 120, origin: { y: 0.5 }, colors: ["#6C5CE7", "#00D2D3", "#F8B500", "#fff"] });
  }, [levelUpFx]);
  return (
    <AnimatePresence>
      {levelUpFx && (
        <motion.div className="fixed inset-0 z-[170] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#0b0b16]/90 backdrop-blur-md" />
          <motion.div
            initial={{ scale: 0.6, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="relative flex w-full max-w-sm flex-col items-center rounded-[32px] border border-white/10 bg-gradient-to-b from-[#241f5e] to-[#14142a] p-8 text-center shadow-glow"
          >
            <Sparkles className="absolute left-8 top-8 size-5 text-gold/70 anim-floaty" />
            <Sparkles className="absolute bottom-24 right-8 size-4 text-cyan/70 anim-floaty" style={{ animationDelay: "0.7s" }} />
            <motion.div
              initial={{ rotate: -12, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 14 }}
              className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-gold to-orange shadow-[0_0_60px_rgba(248,181,0,0.5)]"
            >
              <Zap className="size-11 text-white" fill="currentColor" strokeWidth={1} />
            </motion.div>
            <p className="mt-5 font-display text-[11px] font-extrabold uppercase tracking-[0.3em] text-gold">Level up</p>
            <h2 className="mt-1 font-display text-5xl font-extrabold tracking-tight text-white">Level {levelNum}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              You're now a <span className="font-bold text-white">Master Conversationalist</span>. New boss battles and C1 rooms unlocked.
            </p>
            <Button className="mt-6 w-full" size="lg" onClick={() => setLevelUpFx(false)}>
              Keep going <ArrowRight className="size-5" />
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────── BADGE UNLOCK OVERLAY ─────────── */
function BadgeOverlay() {
  const { newBadgeId, clearNewBadge } = useApp();
  const badge = BADGES.find((b) => b.id === newBadgeId);
  useEffect(() => {
    if (badge) confetti({ particleCount: 90, spread: 80, origin: { y: 0.45 }, colors: ["#F8B500", "#FFD700", "#6C5CE7", "#fff"] });
  }, [badge]);
  const r = badge ? RARITY_STYLES[badge.rarity] : RARITY_STYLES.Common;
  return (
    <AnimatePresence>
      {badge && (
        <motion.div className="fixed inset-0 z-[170] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#0b0b16]/85 backdrop-blur-md" onClick={clearNewBadge} />
          <motion.div
            initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="relative w-full max-w-xs rounded-[32px] border border-border bg-card p-8 text-center shadow-lift"
          >
            <motion.div
              initial={{ rotate: -10, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 13 }}
              className={cn("mx-auto grid size-24 place-items-center rounded-[28px] ring-4", r.bg, r.ring)}
            >
              <I k={badge.icon} className={cn("size-11", r.text)} />
            </motion.div>
            <p className={cn("mt-5 font-display text-[10px] font-extrabold uppercase tracking-[0.3em]", r.text)}>
              {badge.rarity} badge unlocked
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-fg">{badge.name}</h2>
            <p className="mt-1.5 text-sm text-fg-sec">{badge.desc}</p>
            <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 font-mono text-sm font-bold text-gold">
              <Zap className="size-4" fill="currentColor" strokeWidth={1} /> +{badge.xp} XP bonus
            </p>
            <Button className="mt-6 w-full" size="lg" onClick={clearNewBadge}>Awesome</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────── APP SHELL (logged in) ─────────── */
function AppShell() {
  const { tab, activeLesson, activeRoom, page, flashcardsOpen, aiOpen } = useApp();
  const views = { home: HomeView, learn: LearnView, live: LiveView, chat: ChatView, profile: ProfileView };
  const ActiveView = views[tab];
  return (
    <div className="min-h-dvh bg-bg font-body text-fg transition-colors duration-300">
      <BackgroundFX />
      <Sidebar />
      <MobileHeader />
      <div className="lg:pl-[264px]">
        <AnimatePresence mode="wait">
          <ViewShell k={tab}>
            <ActiveView />
          </ViewShell>
        </AnimatePresence>
      </div>
      <BottomTabs />
      <CallLayer />

      <AnimatePresence>
        {activeLesson && <LessonFlow key={activeLesson.id} lesson={activeLesson} />}
      </AnimatePresence>
      <AnimatePresence>
        {activeRoom && (activeRoom.backendRoom
          ? <Suspense fallback={<div className="fixed inset-0 z-[140] grid place-items-center bg-[#0b0b16] text-sm font-bold text-white/70">Loading room…</div>}><ZegoRoomSession key={activeRoom.id} room={activeRoom} /></Suspense>
          : <div className="fixed inset-0 z-[155] grid place-items-center bg-[#0b0b16] p-6 text-center text-white">
              <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] p-6">
                <h2 className="font-display text-lg font-extrabold">This sample room is not live</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">A room must be connected to Supabase and ZEGO before audio or video can start.</p>
                <Button className="mt-5" onClick={() => useApp.getState().closeRoom()}>Back to the app</Button>
              </div>
            </div>)}
      </AnimatePresence>
      <AnimatePresence>{page && <PageRenderer key={page} />}</AnimatePresence>
      <AnimatePresence>{flashcardsOpen && <Flashcards />}</AnimatePresence>
      <AnimatePresence>{aiOpen && <AIChat />}</AnimatePresence>
      <AIFab />
      <LevelUpOverlay />
      <BadgeOverlay />
    </div>
  );
}

/* ─────────── ROOT ─────────── */
export default function App() {
  const { dark, authStage, setAuthStage, toasts, dismissToast, xpEvents, pushToast, user } = useApp();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => { applyVisualPreferences(); }, []);

  // Reset daily mission progress on the learner's local calendar-day boundary.
  useEffect(() => {
    const timer = window.setInterval(() => useApp.getState().refreshDailyMissions(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Restore the signed-in profile; its language pair drives the course below.
  useEffect(() => {
    void initBackendAuth(pushToast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep lesson speech/listening locales and the Turso course on the same pair.
  useEffect(() => {
    if (authStage !== "app") return;
    const target = langByName(user.targetLanguage).code;
    const native = langByName(user.nativeLanguage).code;
    const languageState = useLanguageStore.getState();
    if (languageState.target !== target || languageState.native !== native) {
      languageState.setPair(target, native);
    }
    void hydrateCourse(target, native);
  }, [authStage, user.targetLanguage, user.nativeLanguage]);

  // splash → onboarding after 2.8s
  useEffect(() => {
    if (authStage !== "splash") return;
    const t = setTimeout(() => setAuthStage("onboarding"), 2800);
    return () => clearTimeout(t);
  }, [authStage, setAuthStage]);

  // trim old xp events
  useEffect(() => {
    if (!xpEvents.length) return;
    const t = setTimeout(() => {
      useApp.setState((s) => ({ xpEvents: s.xpEvents.slice(1) }));
    }, 1500);
    return () => clearTimeout(t);
  }, [xpEvents]);

  const stageKey =
    authStage === "app" ? "app" :
    authStage === "splash" ? "splash" :
    authStage === "onboarding" ? "onb" :
    authStage === "reset" ? "reset" : "auth";

  return (
    <div className="min-h-dvh bg-bg font-body text-fg">
      <AnimatePresence mode="wait">
        <motion.div
          key={stageKey}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {authStage === "splash" && <Splash />}
          {authStage === "onboarding" && <Onboarding />}
          {authStage === "login" && <AuthScreen mode="login" />}
          {authStage === "register" && <AuthScreen mode="register" />}
          {authStage === "reset" && <AuthScreen mode="reset" />}
          {authStage === "app" && <AppShell />}
        </motion.div>
      </AnimatePresence>

      <ToastLayer toasts={toasts} dismiss={dismissToast} />
      <XPFloaters events={xpEvents} />
    </div>
  );
}
