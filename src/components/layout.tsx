import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Home, BookOpen, Video, MessageSquare, UserRound, Sun, Moon, Zap, ChevronsRight,
  MessagesSquare, Flame, Bell, ChevronLeft,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp, type Tab } from "../store/store";
import { useChatRT, selectUnreadTotal } from "../store/chatRT";
import { Avatar, StreakFire, Ring } from "./ui";
import { getSessionUserId, backendReady } from "../lib/backend";
import { supabase, notificationService } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* ─────────── BRAND MARK ─────────── */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="grid place-items-center rounded-2xl text-white shadow-lift"
        style={{ width: size, height: size, background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
      >
        <MessagesSquare style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.4} />
      </div>
      <span className="font-display text-xl font-extrabold tracking-tight text-fg">
        Lingo<span className="text-gradient">Live</span>
      </span>
    </div>
  );
}

/* ─────────── SPLASH — particles, glow logo, tagline ─────────── */
const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  left: `${8 + ((i * 61) % 84)}%`, top: `${6 + ((i * 37) % 80)}%`,
  size: 6 + ((i * 7) % 9), delay: (i * 0.31) % 1.5, dur: 2 + ((i * 0.53) % 2), op: 0.2 + ((i * 0.07) % 0.2),
}));

export function Splash() {
  return (
    <motion.div
      className="fixed inset-0 z-[200] grid place-items-center overflow-hidden"
      style={{ background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
      exit={{ opacity: 0, scale: 1.06 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white anim-floaty"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, opacity: p.op, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        />
      ))}
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: [0, 1.12, 1] }}
          transition={{ duration: 0.8, times: [0, 0.6, 1], ease: "easeOut" }}
          className="grid size-20 place-items-center rounded-[24px] bg-white/20 ring-2 ring-white/30 backdrop-blur"
          style={{ boxShadow: "0 0 44px rgba(255,255,255,0.35)" }}
        >
          <MessagesSquare className="size-10 text-white" strokeWidth={2.2} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-6 font-display text-4xl font-extrabold tracking-[0.02em] text-white"
        >
          LingoLive
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.5 }}
          className="mt-2 text-[15px] font-medium text-white/80"
        >
          Learn by Living the Language
        </motion.p>
      </div>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}
        className="absolute bottom-24"
      >
        <motion.span
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="block size-8 rounded-full border-[2.5px] border-white/25 border-t-white"
        />
      </motion.div>
    </motion.div>
  );
}

/* ─────────── NOTIFICATIONS BELL → opens notifications page ─────────── */
export function NotificationsBell({ className }: { className?: string }) {
  const { openPage } = useApp();
  const uid = getSessionUserId();
  const live = backendReady() && !!uid;
  // Giriş yoksa vitrin noktası; giriş varsa GERÇEK okunmamış sayısı (DB + realtime)
  const [unread, setUnread] = useState(live ? 0 : 1);

  useEffect(() => {
    if (!live || !uid) return;
    let alive = true;
    let ch: RealtimeChannel | null = null;
    void (async () => {
      try {
        const rows = (await notificationService.getNotifications(uid)) as { is_read: boolean }[];
        if (alive) setUnread(rows.filter((r) => !r.is_read).length);
      } catch { /* demo noktası kalır */ }
      try {
        ch = notificationService.subscribeToNotifications(uid, () => { if (alive) setUnread((u) => u + 1); });
      } catch { /* realtime opsiyonel */ }
    })();
    return () => { alive = false; if (ch) void supabase.removeChannel(ch); };
  }, [live, uid]);

  return (
    <button
      onClick={() => openPage("notifications")}
      className={cn("relative grid size-10 cursor-pointer place-items-center rounded-xl bg-primary-faint text-primary transition hover:bg-primary-soft", className)}
      title="Notifications"
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <motion.span
          animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}
          className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-red px-1 text-[9px] font-extrabold text-white ring-2 ring-card"
        >
          {unread > 9 ? "9+" : unread}
        </motion.span>
      )}
    </button>
  );
}

/* ─────────── SUB-PAGE SHELL — routed overlay screens ─────────── */
export function PageShell({
  title, sub, right, children, onBack,
}: {
  title: React.ReactNode; sub?: string; right?: React.ReactNode; children: React.ReactNode; onBack?: () => void;
}) {
  const { closePage } = useApp();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <motion.div
      className="fixed inset-0 z-[145] flex flex-col bg-bg"
      initial={{ opacity: 0, x: 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 70 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <BackgroundFX />
      <header className="glass relative z-10 border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-2 px-4">
          <button
            onClick={onBack ?? closePage}
            className="grid size-10 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-bg-sec hover:text-fg"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-fg">{title}</h1>
            {sub && <p className="truncate text-[11px] font-semibold text-fg-ter">{sub}</p>}
          </div>
          {right}
        </div>
      </header>
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 pb-16 sm:px-6">{children}</div>
      </div>
    </motion.div>
  );
}

/* ─────────── AMBIENT BACKGROUND ─────────── */
export function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-40 left-[8%] h-[480px] w-[480px] rounded-full bg-primary/10 blur-[130px]" />
      <div className="absolute top-[35%] -right-40 h-[420px] w-[420px] rounded-full bg-cyan/10 blur-[130px]" />
      <div className="absolute bottom-[-180px] left-[30%] h-[400px] w-[400px] rounded-full bg-pink/[0.06] blur-[130px]" />
      <div className="absolute inset-0 dotgrid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]" />
    </div>
  );
}

const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "live", label: "Live", icon: Video },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "profile", label: "Profile", icon: UserRound },
];

/* ─────────── DESKTOP SIDEBAR ─────────── */
export function Sidebar() {
  const { tab, setTab, streak, xp, xpToNext, levelNum, user, dark, toggleTheme, missions } = useApp();
  const done = missions.filter((m) => m.done).length;
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-border bg-card/70 backdrop-blur-xl lg:flex">
      <div className="flex items-center justify-between px-6 pt-7 pb-5">
        <Logo />
        <NotificationsBell />
      </div>

      <nav className="flex flex-col gap-1 px-4">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "group relative flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 font-display text-[15px] font-bold transition-colors",
                active ? "text-white" : "text-fg-sec hover:bg-primary-faint hover:text-primary"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary to-primary-strong shadow-lift"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 size-5" strokeWidth={2.4} />
              <span className="relative z-10">{label}</span>
              {id === "live" && (
                <span className={cn("relative z-10 ml-auto flex size-2", active ? "" : "")}>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-red" />
                </span>
              )}
              {id === "chat" && !active && (
                <span className="relative z-10 ml-auto grid size-5 place-items-center rounded-full bg-red font-mono text-[10px] font-bold text-white">3</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 px-4 pb-6">
        {/* streak + missions card */}
        <div className="rounded-3xl border border-border bg-bg-sec/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="size-5 text-orange anim-flicker" fill="#FFA502" strokeWidth={1.5} />
              <div>
                <p className="font-display text-sm font-bold text-fg leading-none">{streak}-day streak</p>
                <p className="mt-1 text-[11px] text-fg-ter">Personal best: 23</p>
              </div>
            </div>
            <Ring value={(done / missions.length) * 100} size={44} stroke={5}>
              <span className="font-mono text-[10px] font-bold text-fg">{done}/{missions.length}</span>
            </Ring>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold to-orange"
              animate={{ width: `${(xp / xpToNext) * 100}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-fg-sec">
            <Zap className="size-3 text-gold" fill="currentColor" strokeWidth={1} />
            Level {levelNum} · {xp.toLocaleString()}/{xpToNext.toLocaleString()} XP
          </p>
        </div>

        {/* user row */}
        <div className="flex items-center gap-3 rounded-2xl border border-border p-2.5">
          <Avatar initials={user.initials} color={user.color} size={38} src={user.avatarUrl} online />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-fg">{user.displayName}</p>
            <p className="truncate text-[11px] text-fg-ter">{user.username}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="grid size-9 cursor-pointer place-items-center rounded-xl bg-primary-faint text-primary transition hover:brightness-95"
            title="Toggle theme"
          >
            {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ─────────── MOBILE HEADER ─────────── */
export function MobileHeader() {
  const { streak, todayXP, user, setTab } = useApp();
  return (
    <header className="glass fixed inset-x-0 top-0 z-40 border-b border-border/60 lg:hidden">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo size={34} />
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <span className="flex items-center gap-1.5 rounded-full bg-orange/10 px-3 py-1.5">
            <StreakFire count={streak} size="sm" />
          </span>
          <span className="flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1.5 font-mono text-sm font-bold text-gold">
            <Zap className="size-4" fill="currentColor" strokeWidth={1} />{todayXP}
          </span>
          <button onClick={() => setTab("profile")} className="cursor-pointer">
            <Avatar initials={user.initials} color={user.color} size={34} src={user.avatarUrl} online />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────── MOBILE BOTTOM TABS — floating Live center ─────────── */
export function BottomTabs() {
  const { tab, setTab } = useApp();
  const unread = useChatRT((s) => (s.ready ? selectUnreadTotal(s) : 3));
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border/60 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex h-[68px] max-w-md items-stretch justify-between px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          if (id === "live") {
            return (
              <div key={id} className="relative flex w-[76px] flex-col items-center justify-end pb-1">
                <motion.button
                  onClick={() => setTab("live")}
                  whileTap={{ scale: 0.9 }}
                  className="absolute -top-7 grid size-[58px] cursor-pointer place-items-center rounded-full text-white shadow-glow"
                  style={{ background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
                >
                  <span className="absolute inset-0 rounded-full bg-primary/40 anim-ping-slow" />
                  <Video className="relative size-6" strokeWidth={2.3} />
                </motion.button>
                <span className={cn("font-display text-[10px] font-bold", active ? "text-primary" : "text-fg-ter")}>Live</span>
              </div>
            );
          }
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1"
            >
              <motion.span whileTap={{ scale: 1.25 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="relative">
                <Icon className={cn("size-[22px]", active ? "text-primary" : "text-fg-ter")} strokeWidth={active ? 2.6 : 2} />
                {id === "chat" && unread > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid min-w-[15px] place-items-center rounded-full bg-red px-0.5 font-mono text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
                )}
              </motion.span>
              <span className={cn("font-display text-[10px]", active ? "font-bold text-primary" : "font-semibold text-fg-ter")}>{label}</span>
              {active && (
                <motion.span layoutId="tab-dot" className="absolute bottom-0.5 size-1 rounded-full bg-gradient-to-r from-primary to-cyan" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ─────────── VIEW TRANSITION WRAPPER ─────────── */
export function ViewShell({ children, k }: { children: React.ReactNode; k: string }) {
  return (
    <motion.main
      key={k}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-20 pb-28 sm:px-6 lg:max-w-5xl lg:pt-10 lg:pb-16"
    >
      {children}
    </motion.main>
  );
}

/* ─────────── PAGE TITLE (desktop) ─────────── */
export function PageTitle({ title, sub, right }: { title: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="font-display text-[26px] font-extrabold tracking-tight text-fg sm:text-3xl"
        >
          {title}
        </motion.h1>
        {sub && <p className="mt-1 text-sm text-fg-sec">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function SeeAll({ label = "See all" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 font-display text-[13px] font-bold text-primary">
      {label} <ChevronsRight className="size-3.5" />
    </span>
  );
}
