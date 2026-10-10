import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Play, Video, AudioLines, Zap, Sparkles, ArrowRight, BookOpen, Mic,
  Flame, Target, ChevronRight, Check,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp, lessonIndexer } from "../store/store";
import {
  type Mission, type VoiceRoom,
} from "../data/mock";
import {
  Card, Ring, Button, Avatar, XPChip, StreakFire, SectionHeader, Num, I, LiveChip, Flag,
} from "../components/ui";
import { PageTitle } from "../components/layout";
import { roomService, supabase } from "../lib/supabase";
import { backendReady, getSessionUserId } from "../lib/backend";
import { mapDbVoiceRoom, type DbVoiceRoomRow } from "../lib/roomMapping";
import { getWeeklyActivity } from "../lib/activity";

const fade = (i: number) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-30px" },
  transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

/* ─────────── CONTINUE LEARNING ─────────── */
function ContinueCard() {
  const { completed, openLesson, setTab } = useApp();
  const current = lessonIndexer(completed).find((l) => l.status === "current");
  if (!current) return null;
  const { unit, lesson } = current;
  const doneInUnit = unit.lessons.filter((l) => completed[l.id]).length;
  return (
    <Card hover className="relative overflow-hidden p-0">
      <div className="absolute inset-0 hero-gradient opacity-[0.97]" />
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-20 -left-10 size-52 rounded-full bg-cyan/25 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex-1 text-white">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
            <BookOpen className="size-3.5" /> Continue learning
          </p>
          <h3 className="mt-2 font-display text-[22px] font-extrabold leading-tight tracking-tight">{lesson.title}</h3>
          <p className="mt-0.5 text-[13px] font-medium text-white/75">
            {unit.title} · {unit.level} · {doneInUnit}/{unit.lessons.length} lessons done · ~{lesson.mins} min
          </p>
          <div className="mt-3 h-1.5 max-w-[280px] overflow-hidden rounded-full bg-white/25">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }} whileInView={{ width: `${(doneInUnit / unit.lessons.length) * 100}%` }}
              viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <motion.button
          onClick={() => openLesson(lesson)}
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
          className="group flex cursor-pointer items-center gap-3 self-start rounded-2xl bg-white px-5 py-3.5 font-display text-[15px] font-extrabold text-primary shadow-lift sm:self-center"
        >
          <Play className="size-5 fill-primary" /> Start Lesson
        </motion.button>
        <button onClick={() => setTab("learn")} className="absolute bottom-3 right-5 hidden cursor-pointer text-[11px] font-bold text-white/60 hover:text-white sm:block">
          View path
        </button>
      </div>
    </Card>
  );
}

/* ─────────── DAILY RING ─────────── */
function DailyRing() {
  const { todayXP, missions } = useApp();
  const done = missions.filter((m) => m.done).length;
  const pct = (done / missions.length) * 100;
  const reviewMission = missions.find((mission) => mission.id === "m_words");
  const speakingMission = missions.find((mission) => mission.id === "m_call");
  return (
    <Card className="flex items-center gap-5 p-5">
      <Ring value={pct} size={118} stroke={11}>
        <div className="text-center">
          <p className="font-mono text-[26px] font-bold leading-none text-fg">{Math.round(pct)}<span className="text-sm text-fg-ter">%</span></p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fg-ter">complete</p>
        </div>
      </Ring>
      <div className="flex-1">
        <p className="font-display text-[15px] font-extrabold text-fg">Mission progress</p>
        <p className="text-xs text-fg-sec">{done} of {missions.length} missions complete</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "XP today", v: todayXP, icon: Zap, c: "text-gold" },
            { label: "Review goal", v: reviewMission?.current ?? 0, suffix: `/${reviewMission?.target ?? 0}`, icon: BookOpen, c: "text-primary" },
            { label: "Speaking goal", v: speakingMission?.current ?? 0, suffix: `/${speakingMission?.target ?? 0}m`, icon: Mic, c: "text-cyan" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-bg-sec px-2.5 py-2">
              <s.icon className={cn("size-3.5", s.c)} fill="currentColor" strokeWidth={1.4} />
              <p className="mt-1 font-mono text-sm font-bold text-fg leading-none"><Num value={s.v} suffix={s.suffix ?? ""} /></p>
              <p className="mt-0.5 text-[9.5px] font-semibold text-fg-ter">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ─────────── QUICK ACTIONS ─────────── */
function QuickActions() {
  const { setTab, setFlashcards } = useApp();
  const items = [
    { label: "Quick Match", sub: "Video partner", icon: Video, g: "from-[#6C5CE7] to-[#4c3ed8]", go: () => setTab("live") },
    { label: "Voice Rooms", sub: "Explore live rooms", icon: AudioLines, g: "from-[#00CEC9] to-[#0090a8]", go: () => setTab("live") },
    { label: "Flashcards", sub: "Review vocabulary", icon: Zap, g: "from-[#F8B500] to-[#ff7a1a]", go: () => setFlashcards(true) },
    { label: "AI Tutor", sub: "Practice anytime", icon: Sparkles, g: "from-[#E84393] to-[#9b2fbf]", go: () => useApp.getState().setAIOpen(true) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it, i) => (
        <motion.button
          key={it.label}
          {...fade(i)}
          onClick={it.go}
          whileHover={{ y: -4 }} whileTap={{ scale: 0.95 }}
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-left text-white shadow-lift",
            it.g
          )}
        >
          <div className="absolute -right-6 -top-6 size-20 rounded-full bg-white/15 blur-md transition-transform duration-300 group-hover:scale-150" />
          <div className="relative">
            <it.icon className="size-6" strokeWidth={2.2} />
            <p className="mt-2.5 font-display text-[15px] font-extrabold leading-tight">{it.label}</p>
            <p className="text-[11px] font-medium text-white/75">{it.sub}</p>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

/* ─────────── MISSIONS ─────────── */
function MissionRow({ m, i }: { m: Mission; i: number }) {
  const pct = (m.current / m.target) * 100;
  return (
    <motion.div {...fade(i)} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl",
        m.done ? "bg-green/15 text-green" : "bg-primary-faint text-primary"
      )}>
        <I k={m.icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-display text-[13.5px] font-bold", m.done ? "text-fg-sec line-through decoration-fg-ter" : "text-fg")}>{m.text}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-sec">
            <motion.div
              className={cn("h-full rounded-full", m.done ? "bg-green" : "bg-gradient-to-r from-primary to-cyan")}
              initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="font-mono text-[10px] font-bold text-fg-ter">{m.current}/{m.target}</span>
        </div>
      </div>
      {m.done ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green text-white">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-bg-sec px-2.5 py-1.5 text-[10px] font-bold text-fg-ter" title="Progress is recorded from real learning activity">
          {m.xp} XP reward
        </span>
      )}
    </motion.div>
  );
}

/* ─────────── LIVE LEADERBOARD ─────────── */
function LeaderboardCard() {
  const { setTab, user } = useApp();
  const uid = getSessionUserId();
  const [rows, setRows] = useState<{ id: string; name: string; avatarUrl: string | null; flag: string; level: string; xp: number; online: boolean; color: string }[]>([]);
  const [loading, setLoading] = useState(backendReady());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendReady()) { setLoading(false); return; }
    let alive = true;
    const load = async () => {
      try {
        const { data: scores, error: scoreError } = await supabase.from("user_stats")
          .select("user_id, total_xp").order("total_xp", { ascending: false }).limit(3);
        if (scoreError) throw scoreError;
        const ids = (scores ?? []).map((row) => row.user_id);
        if (!ids.length) { if (alive) { setRows([]); setError(null); } return; }
        const { data: profiles, error: profileError } = await supabase.from("users")
          .select("id, display_name, avatar_url, country_flag, current_level, is_online").in("id", ids);
        if (profileError) throw profileError;
        const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
        const palette = ["#6C5CE7", "#00CEC9", "#E84393"];
        const next = (scores ?? []).flatMap((score, index) => {
          const profile = byId.get(score.user_id);
          if (!profile) return [];
          return [{
            id: score.user_id,
            name: profile.display_name || "Learner",
            avatarUrl: profile.avatar_url ?? null,
            flag: profile.country_flag || "un",
            level: profile.current_level || "A1",
            xp: Number(score.total_xp) || 0,
            online: !!profile.is_online,
            color: palette[index % palette.length],
          }];
        });
        if (alive) { setRows(next); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Leaderboard could not be loaded.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  return (
    <Card className="p-5">
      <SectionHeader title="All-time leaderboard" />
      <p className="-mt-2 mb-3 text-[11px] font-semibold text-fg-ter">Ranked by total XP in signed-in accounts</p>
      {loading && <p className="py-6 text-center text-xs font-semibold text-fg-ter">Loading live ranking…</p>}
      {!loading && error && <p role="alert" className="rounded-xl bg-red/10 p-3 text-xs leading-relaxed text-red">Leaderboard unavailable: {error}</p>}
      {!loading && !error && !backendReady() && <p className="rounded-xl bg-bg-sec p-3 text-xs leading-relaxed text-fg-sec">Sign in with a connected Supabase project to see real learner rankings. Sample rankings are not shown.</p>}
      {!loading && !error && backendReady() && rows.length === 0 && <p className="rounded-xl bg-bg-sec p-3 text-xs leading-relaxed text-fg-sec">No learner scores have been recorded yet.</p>}
      {!loading && !error && rows.map((row, index) => (
        <div key={row.id} className={cn("flex items-center gap-3 rounded-2xl px-2 py-2.5", row.id === uid && "bg-primary-faint/70")}>
          <span className="w-5 text-center font-mono text-xs font-extrabold text-fg-ter">{index + 1}</span>
          <Avatar initials={row.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} color={row.color} size={34} src={row.avatarUrl} online={row.online} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-display text-[12.5px] font-extrabold", row.id === uid ? "text-primary" : "text-fg")}>{row.name}{row.id === uid ? " (You)" : ""}</p>
            <p className="text-[10px] font-semibold text-fg-ter">{row.level} · {row.online ? "Online" : "Offline"}</p>
          </div>
          <Flag code={row.flag} size={15} />
          <XPChip xp={row.xp} />
        </div>
      ))}
      {uid ? (
        <>
          <div className="my-3 h-px bg-border" />
          <div className="flex items-center gap-3 rounded-2xl bg-bg-sec/70 px-3 py-2.5">
            <Avatar initials={user.initials} color={user.color} size={32} src={user.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[12.5px] font-extrabold text-fg">Your profile</p>
              <p className="text-[10px] font-semibold text-fg-ter">{user.level} · {user.stats.totalXP.toLocaleString()} total XP</p>
            </div>
            <Flag code={user.flag} size={15} />
          </div>
          <Button variant="soft" size="sm" className="mt-3.5 w-full" onClick={() => setTab("profile")}>
            View your profile <ArrowRight className="size-3.5" />
          </Button>
        </>
      ) : <p className="mt-3 text-center text-xs font-semibold text-fg-ter">Sign in to save and track your own XP ranking.</p>}
    </Card>
  );
}

/* ─────────── ROOM PREVIEW STRIP ─────────── */
function RoomsStrip() {
  const { setTab, openRoom, joinedRooms, pushToast } = useApp();
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [loading, setLoading] = useState(backendReady());
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!backendReady()) { setLoading(false); return; }
    let alive = true;
    const load = async () => {
      try {
        const rows = await roomService.getRooms({ type: "VOICE" });
        if (alive) { setRooms((rows as DbVoiceRoomRow[]).map(mapDbVoiceRoom)); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load live rooms.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const channel = getSessionUserId() ? roomService.subscribeToRooms(() => { void load(); }) : null;
    const timer = window.setInterval(() => { void load(); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); if (channel) void supabase.removeChannel(channel); };
  }, []);

  const join = async (room: VoiceRoom) => {
    const uid = getSessionUserId();
    if (!uid || !room.backendId) {
      pushToast({ title: "Sign in required", desc: "Sign in to join a live voice room.", icon: "rooms", tone: "red" });
      setTab("live");
      return;
    }
    setJoiningId(room.id);
    try {
      await roomService.joinRoom(room.backendId, uid, room.backendHostId === uid ? "HOST" : "SPEAKER");
      openRoom(room);
    } catch (e) {
      pushToast({ title: "Could not join room", desc: e instanceof Error ? e.message : "Please try again.", icon: "rooms", tone: "red" });
    } finally { setJoiningId(null); }
  };

  return (
    <div>
      <SectionHeader title="Live voice rooms" action="Explore Live" onAction={() => setTab("live")} />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0">
        {rooms.slice(0, 4).map((r, i) => (
          <motion.div
            key={r.id}
            {...fade(i)}
            className="w-[230px] shrink-0 cursor-pointer rounded-3xl border border-border bg-card p-4 shadow-card transition hover:-translate-y-1 hover:shadow-lift"
            onClick={() => setTab("live")}
          >
            <div className="flex items-center justify-between">
              <LiveChip />
              <span className="text-[10.5px] font-bold text-fg-ter">{r.duration}</span>
            </div>
            <p className="mt-2.5 font-display text-[14.5px] font-extrabold leading-snug text-fg">{r.name}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-fg-ter">{r.topic} · {r.level}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {r.speakers.slice(0, 4).map((s) => (
                  <Avatar key={s.initials + s.name} initials={s.initials} color={s.color} size={26} src={s.avatarUrl} ring />
                ))}
                <span className="z-10 grid size-[26px] place-items-center rounded-full bg-bg-sec ring-2 ring-card font-mono text-[9px] font-bold text-fg-sec">
                  +{Math.max(0, r.speakerCount - r.speakers.length)}
                </span>
              </div>
              <button
                disabled={joiningId === r.id}
                onClick={(e) => { e.stopPropagation(); void join(r); }}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 font-display text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-60",
                  joinedRooms.includes(r.id) ? "bg-green/15 text-green" : "bg-primary text-white hover:brightness-110"
                )}
              >
                {joiningId === r.id ? "Joining…" : joinedRooms.includes(r.id) ? "Re-enter" : "Join"}
              </button>
            </div>
          </motion.div>
        ))}
        {loading && <div className="grid min-h-[130px] w-[230px] shrink-0 place-items-center rounded-3xl border border-border bg-card px-4 text-center text-xs font-semibold text-fg-ter">Checking for live rooms…</div>}
        {!loading && !rooms.length && (
          <button onClick={() => setTab("live")} className="grid min-h-[130px] w-[250px] shrink-0 place-items-center rounded-3xl border border-dashed border-border bg-card px-5 text-center transition hover:border-primary">
            <span><span className="block font-display text-sm font-extrabold text-fg">{error ? "Live rooms unavailable" : "No active rooms yet"}</span><span className="mt-1 block text-xs font-semibold text-fg-ter">{error || "Open Live to start the first voice room."}</span></span>
          </button>
        )}
        <motion.button
          {...fade(4)}
          onClick={() => setTab("live")}
          className="grid w-[110px] shrink-0 cursor-pointer place-items-center rounded-3xl border-2 border-dashed border-border text-fg-ter transition hover:border-primary hover:text-primary"
        >
          <span className="flex flex-col items-center gap-1 text-[11px] font-bold">
            <ChevronRight className="size-5" /> View all
          </span>
        </motion.button>
      </div>
    </div>
  );
}

/* ─────────── REAL WEEKLY ACTIVITY ─────────── */
function WeeklyActivity() {
  const uid = getSessionUserId();
  const [data, setData] = useState<Awaited<ReturnType<typeof getWeeklyActivity>>>([]);
  const [loading, setLoading] = useState(backendReady() && !!uid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !backendReady()) { setLoading(false); return; }
    let alive = true;
    const load = async () => {
      try {
        const rows = await getWeeklyActivity(uid);
        if (alive) { setData(rows); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Activity could not be loaded.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [uid]);

  const max = Math.max(1, ...data.map((day) => day.xp));
  const total = data.reduce((sum, day) => sum + day.xp, 0);
  const liveAccount = backendReady() && Boolean(uid);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-fg">This week</h2>
          <p className="text-[11px] font-semibold text-fg-ter">Persisted XP activity · local days</p>
        </div>
        {liveAccount && <span className="font-mono text-xs font-bold text-gold">{total.toLocaleString()} XP</span>}
      </div>
      {!backendReady() && <p className="rounded-xl bg-bg-sec p-3 text-xs text-fg-sec">Weekly activity appears after connecting and signing in to Supabase. Sample history is not shown.</p>}
      {backendReady() && !uid && <p className="rounded-xl bg-bg-sec p-3 text-xs text-fg-sec">Sign in to view your saved activity.</p>}
      {loading && <p className="py-5 text-center text-xs font-semibold text-fg-ter">Loading saved activity…</p>}
      {!loading && error && <p role="alert" className="rounded-xl bg-red/10 p-3 text-xs text-red">Activity unavailable: {error}</p>}
      {!loading && !error && uid && backendReady() && (
        data.some((day) => day.xp > 0) ? (
          <div className="flex h-36 items-end justify-between gap-2 pt-2">
            {data.map((day) => (
              <div key={day.dateKey} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="font-mono text-[9px] font-bold text-fg-ter">{day.xp || ""}</span>
                <div className="flex h-24 w-full items-end justify-center">
                  <motion.span
                    title={`${day.label}: ${day.xp} XP${day.lessons ? `, ${day.lessons} lesson${day.lessons === 1 ? "" : "s"}` : ""}`}
                    initial={{ height: 0 }} whileInView={{ height: day.xp ? Math.max(5, (day.xp / max) * 88) : 3 }}
                    viewport={{ once: true }} transition={{ duration: 0.55 }}
                    className={cn("w-5 rounded-t-lg sm:w-7", day.xp ? "bg-gradient-to-t from-primary-strong to-cyan" : "bg-bg-sec")}
                  />
                </div>
                <span className="text-[10px] font-semibold text-fg-ter">{day.label}</span>
              </div>
            ))}
          </div>
        ) : <p className="rounded-xl bg-bg-sec p-3 text-xs text-fg-sec">No XP events are recorded for these days yet. Complete a lesson or saved review to start the chart.</p>
      )}
    </Card>
  );
}

/* ─────────── HOME VIEW ─────────── */
export default function HomeView() {
  const { missions, streak, user } = useApp();
  const liveAccount = backendReady() && Boolean(getSessionUserId());
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex flex-col gap-6">
      {!liveAccount && <Card className="border-gold/25 bg-gold/5 p-3 text-xs leading-relaxed text-fg-sec">Guest mode: progress stays in this session and is not saved to an account until you sign in to a connected Supabase project.</Card>}
      <PageTitle
        title={
          <span>
            {greet}, <span className="text-gradient">{user.firstName}</span>
          </span>
        }
        sub={`Let's keep your ${streak}-day streak alive today`}
        right={
          <div className="hidden items-center gap-2 lg:flex">
            <span className="flex items-center gap-1.5 rounded-full bg-orange/10 px-3.5 py-2"><StreakFire count={streak} size="sm" /></span>
            <XPChip xp={user.stats.totalXP} className="px-3.5 py-2 text-sm" />
          </div>
        }
      />

      <motion.div {...fade(0)}><ContinueCard /></motion.div>

      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div {...fade(1)} className="lg:col-span-3"><QuickActions /></motion.div>
        <motion.div {...fade(2)} className="lg:col-span-2"><DailyRing /></motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <motion.section {...fade(3)}>
            <SectionHeader title="Daily missions" />
            <div className="flex flex-col gap-2.5">
              {missions.map((m, i) => <MissionRow key={m.id} m={m} i={i} />)}
            </div>
          </motion.section>

          <motion.section {...fade(4)}><WeeklyActivity /></motion.section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <motion.div {...fade(3)}><LeaderboardCard /></motion.div>
        </div>
      </div>

      <motion.section {...fade(5)}><RoomsStrip /></motion.section>

      {/* Streak saver banner */}
      <motion.div {...fade(6)}>
        <Card className="relative overflow-hidden border-orange/25 bg-gradient-to-r from-orange/10 via-card to-card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="relative grid size-12 place-items-center rounded-2xl bg-orange/15">
              <Flame className="size-6 text-orange anim-flicker" fill="#FFA502" strokeWidth={1.5} />
              <span className="absolute inset-0 rounded-2xl bg-orange/20 anim-ping-slow" />
            </span>
            <div className="flex-1">
              <p className="font-display text-[15px] font-extrabold text-fg">You're on fire — {streak} days strong</p>
              <p className="text-xs text-fg-sec">Complete a real learning activity today to maintain your streak</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => document.querySelector("section")?.scrollIntoView({ behavior: "smooth" })}>
              <Target className="size-4" /> Finish missions
            </Button>
          </div>
        </Card>
      </motion.div>

      <div className="hidden"><Flag code="gb" /></div>
    </div>
  );
}
