import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Flame, Zap, Clock, Star, Check, BarChart3 } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp, lessonIndexer } from "../store/store";
import { UNITS } from "../data/mock";
import { Card, Ring, SectionHeader } from "../components/ui";
import { PageShell } from "../components/layout";
import { getSessionUserId, backendReady } from "../lib/backend";
import { getWeeklyActivity } from "../lib/activity";

function AccountSummary({ live }: { live: boolean }) {
  const { user } = useApp();
  const cards = [
    { label: "Total XP", value: user.stats.totalXP.toLocaleString(), icon: Zap, tone: "text-gold", bg: "bg-gold/12" },
    { label: "Lessons completed", value: user.stats.lessonsCompleted.toLocaleString(), icon: GraduationCap, tone: "text-primary", bg: "bg-primary-faint" },
    { label: "Words learned", value: user.stats.wordsLearned.toLocaleString(), icon: BookOpen, tone: "text-cyan", bg: "bg-cyan/12" },
    { label: "Speaking time", value: `${user.stats.speakingHours.toFixed(1)} h`, icon: Clock, tone: "text-green", bg: "bg-green/12" },
  ];
  if (!live) {
    return <Card className="p-5"><SectionHeader title="Account statistics" /><p className="text-sm leading-relaxed text-fg-sec">Sign in to a connected Supabase account to view saved statistics. Demo/sample totals are intentionally not presented as your activity.</p></Card>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((item, index) => (
        <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
          <Card className="flex min-h-[124px] flex-col justify-between p-4">
            <span className={cn("grid size-9 place-items-center rounded-xl", item.bg, item.tone)}><item.icon className="size-4.5" /></span>
            <div><p className="font-mono text-2xl font-extrabold text-fg">{item.value}</p><p className="mt-1 text-[11px] font-semibold text-fg-sec">{item.label}</p></div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function StreakAndLevel({ live }: { live: boolean }) {
  const { user, streak, xp, xpToNext, todayXP } = useApp();
  const progress = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <Card className="flex items-center gap-4 p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-orange/12 text-orange"><Flame className="size-7" fill="currentColor" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-3xl font-extrabold leading-none text-fg">{live ? streak : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-fg-sec">Current day streak</p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-ter">{live ? `${todayXP.toLocaleString()} XP recorded today · daily goal ${user.dailyGoalMinutes} min` : "Sign in to view your saved streak."}</p>
        </div>
      </Card>
      <Card className="flex items-center gap-4 p-5">
        <Ring value={live ? progress : 0} size={76} stroke={8} from="#F8B500" to="#FFA502">
          <span className="font-mono text-sm font-extrabold text-fg">{live ? `${Math.round(progress)}%` : "—"}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-extrabold text-fg">Level {live ? user.level : "—"}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-sec">{live ? `${xp.toLocaleString()} / ${xpToNext.toLocaleString()} XP to next level` : "Level progress is available after sign-in."}</p>
        </div>
      </Card>
    </div>
  );
}

function WeeklyActivity({ live, uid }: { live: boolean; uid: string | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getWeeklyActivity>>>([]);
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!live || !uid) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(null);
    void getWeeklyActivity(uid).then((rows) => { if (active) setData(rows); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Activity could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [live, uid, reloadKey]);
  const max = Math.max(1, ...data.map((day) => day.xp));
  const total = data.reduce((sum, day) => sum + day.xp, 0);
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><SectionHeader title="Weekly activity" className="mb-0" /><p className="text-[11px] font-semibold text-fg-ter">XP events saved to your account · local days</p></div>
        {live && <span className="font-mono text-xs font-bold text-gold">{total.toLocaleString()} XP</span>}
      </div>
      {!live && <p className="rounded-xl bg-bg-sec p-3 text-xs text-fg-sec">Sign in to view persisted activity; sample charts are hidden.</p>}
      {loading && <p className="py-5 text-center text-xs font-semibold text-fg-ter">Loading activity…</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red/10 p-3 text-xs text-red"><span>Activity unavailable: {error}</span><button onClick={() => setReloadKey((value) => value + 1)} className="shrink-0 rounded-lg bg-red/10 px-3 py-2 font-bold">Retry</button></div>}
      {live && !loading && !error && data.some((day) => day.xp > 0) && (
        <div className="flex h-40 items-end justify-between gap-2 pt-2">
          {data.map((day) => (
            <div key={day.dateKey} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="font-mono text-[9px] font-bold text-fg-ter">{day.xp || ""}</span>
              <div className="flex h-28 w-full items-end justify-center"><motion.span
                title={`${day.label}: ${day.xp} XP${day.lessons ? `, ${day.lessons} lessons` : ""}`}
                initial={{ height: 0 }} animate={{ height: day.xp ? Math.max(5, (day.xp / max) * 100) : 3 }}
                transition={{ duration: 0.55 }} className={cn("w-5 rounded-t-lg sm:w-7", day.xp ? "bg-gradient-to-t from-primary-strong to-cyan" : "bg-bg-sec")}
              /></div>
              <span className="text-[10px] font-semibold text-fg-ter">{day.label}</span>
            </div>
          ))}
        </div>
      )}
      {live && !loading && !error && !data.some((day) => day.xp > 0) && <p className="rounded-xl bg-bg-sec p-3 text-xs text-fg-sec">No XP activity was recorded in the last seven days.</p>}
    </Card>
  );
}

function LessonHistory({ live }: { live: boolean }) {
  const { completed, openLesson } = useApp();
  const done = lessonIndexer(completed).filter((lesson) => lesson.status === "completed").slice(-10).reverse();
  const allLessons = UNITS.flatMap((unit) => unit.lessons);
  return (
    <Card className="p-5">
      <SectionHeader title="Lesson history" />
      {!live && <p className="text-sm text-fg-sec">Sign in to view saved lesson history.</p>}
      {live && !done.length && <p className="text-sm text-fg-sec">No completed lessons are saved yet. Your results will appear here after a lesson is finished.</p>}
      {live && done.length > 0 && <div className="flex flex-col divide-y divide-border/70">
        {done.map(({ lesson, result }) => {
          const fullLesson = allLessons.find((item) => item.id === lesson.id);
          return <button key={lesson.id} onClick={() => { if (fullLesson) openLesson(fullLesson); }} className="group flex cursor-pointer items-center gap-3 py-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-green/12 text-green"><Check className="size-4.5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-display text-[13px] font-bold text-fg group-hover:text-primary">{lesson.title}</span><span className="text-[11px] font-semibold text-fg-ter">Saved result · {result?.score ?? 0}%</span></span>
            <span className="flex gap-0.5">{[0, 1, 2].map((index) => <Star key={index} className={cn("size-3.5", index < (result?.stars ?? 0) ? "text-gold" : "text-border")} fill="currentColor" strokeWidth={0} />)}</span>
            <span className="font-mono text-xs font-bold text-fg-sec">{result?.score ?? 0}%</span>
          </button>;
        })}
      </div>}
    </Card>
  );
}

function AssessmentNotice() {
  return <Card className="p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-faint text-primary"><BarChart3 className="size-5" /></span><div><SectionHeader title="Skill assessments" className="mb-1" /><p className="text-sm leading-relaxed text-fg-sec">No scored skill assessment is saved to your account yet. Lesson and exam-practice answers are not presented as official CEFR or AI-verified scores.</p></div></div></Card>;
}

export default function StatsPage() {
  const uid = getSessionUserId();
  const live = backendReady() && !!uid;
  return (
    <PageShell title="Statistics" sub={live ? "Saved account activity" : "Live statistics appear after sign-in"}>
      <div className="flex flex-col gap-5">
        <AccountSummary live={live} />
        <StreakAndLevel live={live} />
        <WeeklyActivity live={live} uid={uid} />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <LessonHistory live={live} />
          <AssessmentNotice />
        </div>
      </div>
    </PageShell>
  );
}
