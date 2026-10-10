import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Star, Check, Play, ChevronRight, Zap, Search, Layers, ArrowLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp, lessonIndexer, type LessonStatus } from "../store/store";
import { UNITS, type Lesson, type Unit, type CEFR } from "../data/mock";
import { Card, ProgressBar, I, Pill, Flag, Button, LevelBadge, EmptyState } from "../components/ui";
import { PageTitle } from "../components/layout";
import { contentGenerator } from "../lib/contentGenerator";
import { getCoursePairKey, hydrateCourse } from "../lib/content";
import { grammarService, isTursoConfigured, vocabularyService, type TGrammarTopic } from "../lib/turso";
import { langByName } from "../store/language";

/* ═══════════ TAB BAR ═══════════ */
const TABS = [
  { id: "path", label: "My Path" },
  { id: "grammar", label: "Grammar" },
  { id: "vocab", label: "Vocabulary" },
  { id: "exam", label: "Exam Prep" },
  { id: "business", label: "Business" },
] as const;
type LearnTab = typeof TABS[number]["id"];

function TabBar({ tab, setTab }: { tab: LearnTab; setTab: (t: LearnTab) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={cn(
            "relative shrink-0 cursor-pointer rounded-full px-4 py-2.5 font-display text-[13px] font-bold transition-colors",
            tab === t.id ? "text-white" : "text-fg-sec hover:text-fg"
          )}
        >
          {tab === t.id && (
            <motion.span
              layoutId="learn-tab"
              className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-primary-strong shadow-lift"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />
          )}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ═══════════ TAB 1: MY PATH ═══════════ */
function CourseHeader() {
  const { completed, user } = useApp();
  const allLessons = UNITS.flatMap((unit) => unit.lessons);
  const total = allLessons.length;
  const completedIds = new Set(allLessons.map((lesson) => lesson.id));
  const done = Object.keys(completed).filter((id) => completedIds.has(id)).length;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-10 -top-14 size-44 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-full bg-bg-sec px-3 py-1.5">
          <Flag code={langByName(user.nativeLanguage).flag} size={16} />
          <ChevronRight className="size-3 text-fg-ter" />
          <Flag code={langByName(user.targetLanguage).flag} size={16} />
        </div>
        <div className="flex-1">
          <p className="font-display text-[15px] font-extrabold text-fg">{user.nativeLanguage} → {user.targetLanguage} course</p>
          <p className="text-xs text-fg-sec">Your current level: {user.level}</p>
        </div>
        <div className="w-full sm:w-56">
          <div className="mb-1.5 flex justify-between text-[11px] font-bold">
            <span className="text-fg-sec">Course progress</span>
            <span className="font-mono text-primary">{done}/{total} lessons</span>
          </div>
          <ProgressBar value={(done / total) * 100} h={8} />
        </div>
      </div>
    </Card>
  );
}

function LessonNode({ lesson, status, stars, offset, onOpen }: {
  lesson: Lesson; status: LessonStatus; stars: number; offset: number; onOpen: (l: Lesson) => void;
}) {
  const { pushToast } = useApp();
  const isSpecial = lesson.kind !== "lesson";
  const size = isSpecial ? 64 : 58;
  const locked = status === "locked";
  const handle = () => {
    if (locked) return pushToast({ title: "Locked", desc: "Finish the lessons above to unlock this node", icon: "gem", tone: "red" });
    onOpen(lesson);
  };
  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
      {status === "current" && (
        <motion.span
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="absolute -top-7 z-10 animate-bounce rounded-full bg-fg px-2.5 py-0.5 font-display text-[10px] font-extrabold tracking-wider text-bg"
        >
          START
        </motion.span>
      )}
      {isSpecial && !locked && (
        <span className={cn(
          "absolute -top-6 z-10 rounded-full px-2 py-0.5 font-display text-[9px] font-extrabold tracking-wider text-white",
          lesson.kind === "boss" ? "bg-red" : "bg-blue"
        )}>
          {lesson.kind === "boss" ? "BOSS" : "CHECKPOINT"}
        </span>
      )}
      <motion.button
        onClick={handle}
        whileHover={{ scale: locked ? 1 : 1.07 }}
        whileTap={{ scale: locked ? 1 : 0.92 }}
        className={cn("relative grid cursor-pointer place-items-center rounded-full transition", locked && "cursor-not-allowed")}
        style={{ width: size, height: size }}
        title={lesson.title}
      >
        {status === "current" && (
          <>
            <span className="absolute inset-0 rounded-full bg-primary/40 anim-ping-slow" />
            <span className="absolute -inset-1.5 rounded-full border-2 border-dashed border-primary/50 anim-spin-slow" />
          </>
        )}
        <span
          className={cn(
            "grid h-full w-full place-items-center rounded-full transition",
            lesson.kind === "checkpoint" && "rotate-45 !rounded-[22px]",
            status === "completed" && lesson.kind === "lesson" && "bg-gradient-to-br from-green to-[#1db866] shadow-[0_6px_0_0_rgba(29,184,102,0.4)] text-white",
            status === "completed" && lesson.kind === "checkpoint" && "bg-gradient-to-br from-blue to-[#4a8fe0] shadow-[0_6px_0_0_rgba(74,143,224,0.4)] text-white",
            status === "current" && (lesson.kind === "boss"
              ? "bg-gradient-to-br from-red to-[#d33] shadow-[0_6px_0_0_rgba(211,51,51,0.4)] text-white"
              : "bg-gradient-to-br from-primary to-primary-strong shadow-[0_6px_0_0_rgba(85,65,217,0.4)] text-white"),
            locked && "bg-bg-sec text-fg-ter shadow-[0_6px_0_0_var(--border)]"
          )}
        >
          <span className={cn(lesson.kind === "checkpoint" && "-rotate-45")}>
            {status === "completed" ? <Check className="size-6" strokeWidth={3.2} />
              : locked ? <Lock className="size-5" strokeWidth={2.4} />
              : <I k={lesson.icon} className={isSpecial ? "size-7" : "size-6"} />}
          </span>
        </span>
      </motion.button>
      <div className="mt-1.5 flex h-3 gap-0.5">
        {status === "completed" && [0, 1, 2].map((i) => (
          <Star key={i} className={cn("size-3", i < stars ? "text-gold" : "text-border")} fill="currentColor" strokeWidth={0} />
        ))}
      </div>
      <p className={cn(
        "max-w-[92px] text-center font-display text-[10.5px] font-bold leading-tight",
        locked ? "text-fg-ter" : status === "current" ? "text-primary" : "text-fg-sec"
      )}>
        {lesson.title}
      </p>
    </div>
  );
}

function UnitBlock({ unit, onOpen }: { unit: Unit; onOpen: (l: Lesson) => void }) {
  const { completed } = useApp();
  const indexed = lessonIndexer(completed).filter((x) => x.unit.id === unit.id);
  const doneCount = indexed.filter((x) => x.status === "completed").length;
  const allDone = doneCount === unit.lessons.length;
  const off = [0, 52, 74, 30, -30, -74, -52, 0];
  return (
    <div className="relative">
      <div className={cn(
        "sticky top-[76px] z-20 mb-6 flex items-center gap-3 rounded-3xl border p-4 shadow-card backdrop-blur-xl lg:top-4",
        allDone ? "border-green/30 bg-green/[0.07]" : "border-border bg-card/85"
      )}>
        <span className={cn(
          "grid size-11 shrink-0 place-items-center rounded-2xl text-white",
          allDone ? "bg-gradient-to-br from-green to-[#1db866]" : "bg-gradient-to-br from-primary to-primary-strong"
        )}>
          <I k={unit.icon} className="size-5.5" />
        </span>
        <div className="flex-1">
          <p className="font-display text-[15px] font-extrabold text-fg">
            {unit.title} <Pill className="ml-1">{unit.level}</Pill>
          </p>
          <p className="text-xs text-fg-sec">{unit.desc}</p>
        </div>
        <span className="font-mono text-xs font-bold text-fg-ter">{doneCount}/{unit.lessons.length}</span>
      </div>
      <div className="relative flex flex-col items-center gap-7 pb-4 pt-2">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="var(--border)" strokeWidth="4" strokeDasharray="1 14" strokeLinecap="round" />
        </svg>
        {indexed.map((x, i) => (
          <LessonNode key={x.lesson.id} lesson={x.lesson} status={x.status} stars={x.result?.stars ?? 0} offset={off[i % off.length]} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function PathTab() {
  const { openLesson, completed, user, coursePairKey, courseStatus, courseError } = useApp();
  const targetCode = langByName(user.targetLanguage).code;
  const nativeCode = langByName(user.nativeLanguage).code;
  const expectedPairKey = getCoursePairKey(targetCode, nativeCode);
  const pairIsReady = coursePairKey === expectedPairKey && courseStatus === "ready";
  const retry = () => { void hydrateCourse(targetCode, nativeCode); };

  if (coursePairKey !== expectedPairKey || courseStatus === "idle" || courseStatus === "loading") {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <div>
          <p className="font-display text-base font-extrabold text-fg">Building your learning path</p>
          <p className="mt-1 text-sm text-fg-sec">Matching {user.targetLanguage} words to {user.nativeLanguage}.</p>
        </div>
      </Card>
    );
  }
  if (courseStatus === "error" || !pairIsReady) {
    return (
      <Card className="p-6">
        <p className="font-display text-base font-extrabold text-fg">This learning path could not be loaded</p>
        <p role="alert" className="mt-2 text-sm leading-relaxed text-fg-sec">{courseError || "The selected language pair is not ready yet."}</p>
        <Button className="mt-4" onClick={retry}>Retry course load</Button>
      </Card>
    );
  }

  const current = lessonIndexer(completed).find((l) => l.status === "current");
  return (
    <div className="flex flex-col gap-6">
      <CourseHeader />
      {!isTursoConfigured() && <Card className="border-gold/30 bg-gold/5 p-4"><p className="text-xs leading-relaxed text-fg-sec"><span className="font-bold text-fg">Bundled course preview.</span> Turso is disabled, so this English–Turkish path uses local sample content.</p></Card>}
      {current ? <div className="flex items-center gap-2 rounded-2xl bg-primary-faint px-4 py-2.5">
        <Zap className="size-4 text-primary" fill="currentColor" strokeWidth={1} />
        <p className="text-[12.5px] font-semibold text-fg-sec">
          Next up: <span className="font-bold text-fg">{current.lesson.title}</span> — earn {current.lesson.xp} XP
        </p>
      </div> : <Card className="p-4"><p className="text-sm font-semibold text-fg-sec">You have completed every available lesson in this course.</p></Card>}
      <div className="mx-auto w-full max-w-md">
        {UNITS.map((u) => <UnitBlock key={u.id} unit={u} onOpen={openLesson} />)}
      </div>
    </div>
  );
}

/* ═══════════ TAB 2: GRAMMAR ═══════════ */
function GrammarTab() {
  const { user } = useApp();
  const targetCode = langByName(user.targetLanguage).code;
  const nativeCode = langByName(user.nativeLanguage).code;
  const [topics, setTopics] = useState<TGrammarTopic[]>([]);
  const [selected, setSelected] = useState<TGrammarTopic | null>(null);
  const [lesson, setLesson] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setTopics([]); setSelected(null); setLesson(null);
    void grammarService.getTopics(targetCode).then((rows) => {
      if (active) setTopics(rows);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Grammar topics could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetCode, reloadKey]);

  const openTopic = async (topic: TGrammarTopic) => {
    setSelected(topic); setLesson(null); setError(null); setLoadingLesson(true);
    try {
      const content = await contentGenerator.getGrammarTopic({
        topicId: topic.id, topicTitle: topic.title, langCode: targetCode,
        nativeLangCode: nativeCode, level: user.level,
      });
      if (!content) throw new Error("No saved or generated lesson is available. Check the Turso and AI service configuration.");
      setLesson(content);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Grammar lesson could not be opened.");
    } finally { setLoadingLesson(false); }
  };

  const lessonText = (key: string, fallback = "") => {
    const value = lesson?.[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  if (selected) return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onClick={() => { setSelected(null); setLesson(null); setError(null); }}><ArrowLeft className="size-4" /> All grammar topics</Button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">{selected.level} · {selected.category}</p><h2 className="mt-1 font-display text-xl font-extrabold text-fg">{lessonText("title", selected.title)}</h2><p className="mt-1 text-sm leading-relaxed text-fg-sec">{lessonText("description", selected.description)}</p></div>
          {loadingLesson && <Loader2 className="size-5 animate-spin text-primary" aria-label="Loading grammar lesson" />}
        </div>
        {error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red/10 p-3"><p className="min-w-0 flex-1 text-sm leading-relaxed text-red">{error}</p><Button size="sm" variant="outline" onClick={() => void openTopic(selected)}>Retry</Button></div>}
        {lesson && <div className="mt-5 flex flex-col gap-4">
          {[["Explanation", "content"], ["Examples", "examples"], ["Common mistakes", "common_mistakes"], ["Compare with your language", "native_comparison"]].map(([title, key]) => {
            const text = lessonText(key);
            return text ? <section key={key} className="rounded-2xl bg-bg-sec/70 p-4"><h3 className="font-display text-sm font-extrabold text-fg">{title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-sec">{text}</p></section> : null;
          })}
        </div>}
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/20 bg-primary-faint/40 p-4"><p className="text-[13px] leading-relaxed text-fg-sec"><span className="font-display font-extrabold text-fg">Grammar lessons</span> · Topics and lesson content load from the configured grammar database; no mastery percentages are fabricated.</p></Card>
      {loading && <Card className="flex items-center gap-3 p-5"><Loader2 className="size-4 animate-spin text-primary" /><span className="text-sm font-semibold text-fg-sec">Loading grammar topics…</span></Card>}
      {error && <Card className="flex flex-wrap items-center justify-between gap-3 border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">Grammar topics unavailable: {error}</p><Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button></Card>}
      {!loading && !error && topics.length === 0 && <Card className="p-5"><p className="font-display text-sm font-extrabold text-fg">No grammar lessons available</p><p className="mt-1 text-sm leading-relaxed text-fg-sec">The grammar content service is not enabled or no topics have been seeded for {user.targetLanguage} yet.</p></Card>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {topics.map((topic, index) => <motion.button key={topic.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} onClick={() => void openTopic(topic)} className="flex cursor-pointer items-start gap-3 rounded-3xl border border-border bg-card p-4 text-left shadow-card transition hover:border-primary/40 hover:shadow-lift">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-faint text-primary"><I k="book" className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="font-display text-sm font-extrabold text-fg">{topic.title}</span><span className="rounded-full bg-bg-sec px-2 py-1 text-[10px] font-bold text-fg-ter">{topic.level}</span></span><span className="mt-1 block text-xs leading-relaxed text-fg-sec">{topic.description}</span><span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary">Open lesson <ChevronRight className="size-3.5" /></span></span>
        </motion.button>)}
      </div>
    </div>
  );
}

/* ═══════════ TAB 3: VOCABULARY ═══════════ */
function VocabTab() {
  const { setFlashcards, user } = useApp();
  const targetCode = langByName(user.targetLanguage).code;
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<{ category: string; total_words: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setCategories([]);
    void vocabularyService.getCategoriesWithCount(targetCode).then((rows) => {
      if (active) setCategories(rows);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Vocabulary categories could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, targetCode]);

  const colorSets = ["from-[#FF6B6B] to-[#FFA502]", "from-[#74B9FF] to-[#6C5CE7]", "from-[#00CEC9] to-[#0984E3]", "from-[#6C5CE7] to-[#A29BFE]", "from-[#2ED573] to-[#00CEC9]", "from-[#E84393] to-[#FF6B6B]"];
  const iconForCategory = (name: string) => {
    const key = name.toLowerCase();
    if (key.includes("food")) return "food";
    if (key.includes("travel")) return "plane";
    if (key.includes("business")) return "brief";
    if (key.includes("home")) return "home";
    if (key.includes("emotion")) return "heart";
    if (key.includes("health")) return "stetho";
    if (key.includes("technology")) return "code";
    if (key.includes("greeting")) return "handshake";
    return "book";
  };
  const nameForCategory = (name: string) => name.split(/[ _-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  const filtered = categories.filter((row) => nameForCategory(row.category).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1">
          <p className="font-display text-[15px] font-extrabold text-fg">Vocabulary review</p>
          <p className="text-xs text-fg-sec">Review due words or choose a topic from the live word bank.</p>
        </div>
        <Button variant="secondary" onClick={() => setFlashcards(true)}>
          <Layers className="size-4" /> Review due words
        </Button>
      </Card>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-ter" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search vocabulary topics…"
          className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm font-semibold outline-none transition placeholder:text-fg-ter focus:border-primary/60"
        />
      </div>
      {loading && <div className="flex justify-center py-8"><span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}
      {error && <Card className="flex items-center justify-between gap-3 border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">Vocabulary unavailable: {error}</p><Button size="sm" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button></Card>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="note" title={categories.length ? "No categories found" : "No vocabulary categories yet"} sub={categories.length ? "Try a different search term." : "The vocabulary service has no categories available right now."} />}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((category, index) => {
            const displayName = nameForCategory(category.category);
            const colors = colorSets[index % colorSets.length];
            return (
              <motion.button key={category.category} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}
                onClick={() => setFlashcards(true, category.category)}
                className="cursor-pointer rounded-3xl border border-border bg-card p-4 text-left shadow-card transition hover:shadow-lift">
                <span className={cn("grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white", colors)}>
                  <I k={iconForCategory(category.category)} className="size-5" />
                </span>
                <p className="mt-2.5 font-display text-[13.5px] font-extrabold text-fg">{displayName}</p>
                <p className="text-[11px] font-semibold text-fg-ter">{category.total_words} words · tap to study</p>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════ TAB 4: EXAM PREP ═══════════ */
type ExamSection = { id: string; label: string };
type ExamDef = { id: string; name: string; gradient: string; sections: ExamSection[] };
type ExamQuestion = { id: string; question: string; options: string[]; correctAnswer: string; explanation: string };
type ExamPracticeSet = { examName: string; sectionName: string; questions: ExamQuestion[] };

const EXAMS: ExamDef[] = [
  { id: "IELTS", name: "IELTS", gradient: "from-[#74B9FF] to-[#0984E3]", sections: [{ id: "reading", label: "Reading" }, { id: "grammar", label: "Grammar" }, { id: "vocabulary", label: "Vocabulary" }] },
  { id: "TOEFL", name: "TOEFL", gradient: "from-[#00CEC9] to-[#007A7A]", sections: [{ id: "grammar", label: "Grammar" }, { id: "vocabulary", label: "Vocabulary" }, { id: "reading", label: "Reading" }] },
  { id: "YDS", name: "YDS", gradient: "from-[#FFA502] to-[#B87800]", sections: [{ id: "grammar", label: "Grammar" }, { id: "vocabulary", label: "Vocabulary" }, { id: "reading", label: "Reading" }] },
  { id: "CAMBRIDGE B2", name: "Cambridge B2", gradient: "from-[#6C5CE7] to-[#3D2DB8]", sections: [{ id: "reading", label: "Reading" }, { id: "grammar", label: "Grammar" }, { id: "vocabulary", label: "Vocabulary" }] },
];

function normalizeExamQuestion(raw: Record<string, unknown>, index: number): ExamQuestion | null {
  const question = String(raw.question ?? "").trim();
  const options = Array.isArray(raw.options) ? raw.options.map((option) => String(option ?? "").trim()).filter(Boolean) : [];
  const answer = String(raw.correct_answer ?? "").trim();
  if (!question || options.length < 2 || !answer) return null;
  // Do not present an orphaned seed prompt that refers to a missing reading passage.
  if (/read the passage/i.test(question) && !question.includes("\n")) return null;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/^[a-d][.)]\s*/i, "").replace(/\s+/g, " ").trim();
  const answerLabel = answer.match(/^([a-d])(?:[.)])?$/i)?.[1]?.toLocaleUpperCase();
  const correctAnswer = answerLabel
    ? options.find((option) => option.match(/^([a-d])(?:[.)])/i)?.[1]?.toLocaleUpperCase() === answerLabel)
    : options.find((option) => normalize(option) === normalize(answer));
  if (!correctAnswer) return null;
  return {
    id: String(raw.id ?? `q_${index}`), question, options, correctAnswer,
    explanation: String(raw.explanation ?? "").trim(),
  };
}

function ExamPractice({ practice, onExit }: { practice: ExamPracticeSet; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<string | null>>(() => Array(practice.questions.length).fill(null));
  const completed = index >= practice.questions.length;
  const score = answers.reduce((total, answer, i) => total + (answer === practice.questions[i]?.correctAnswer ? 1 : 0), 0);

  if (completed) {
    return (
      <Card className="flex flex-col items-center gap-4 p-7 text-center">
        <CheckCircle2 className="size-12 text-green" />
        <div>
          <p className="font-display text-xl font-extrabold text-fg">Practice complete</p>
          <p className="mt-1 text-sm text-fg-sec">{practice.examName} · {practice.sectionName}</p>
        </div>
        <p className="font-mono text-3xl font-extrabold text-primary">{score}/{practice.questions.length}</p>
        <p className="max-w-sm text-xs leading-relaxed text-fg-ter">This is a score for this question set only, not an official exam prediction.</p>
        <Button variant="secondary" onClick={onExit}><ArrowLeft className="size-4" /> Back to exam practice</Button>
      </Card>
    );
  }

  const question = practice.questions[index];
  const selected = answers[index];
  const isCorrect = selected === question.correctAnswer;
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onExit} className="flex w-fit cursor-pointer items-center gap-1.5 text-xs font-bold text-fg-sec hover:text-primary"><ArrowLeft className="size-4" /> All practice sets</button>
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-extrabold text-fg">{practice.examName} · {practice.sectionName}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-fg-ter">Question {index + 1} of {practice.questions.length}</p>
          </div>
          <span className="rounded-full bg-primary-faint px-3 py-1.5 font-mono text-xs font-bold text-primary">{score} correct</span>
        </div>
        <ProgressBar value={((index + (selected ? 1 : 0)) / practice.questions.length) * 100} h={7} className="mt-4" />
        <p className="mt-5 whitespace-pre-wrap font-display text-[15px] font-bold leading-relaxed text-fg">{question.question}</p>
        <div className="mt-4 flex flex-col gap-2">
          {question.options.map((option) => {
            const chosen = selected === option;
            const answer = option === question.correctAnswer;
            return (
              <button key={option} disabled={!!selected} onClick={() => setAnswers((current) => current.map((item, i) => i === index ? option : item))}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-left text-sm font-semibold transition disabled:cursor-default",
                  !selected && "border-border hover:border-primary/50 hover:bg-primary-faint/40",
                  selected && answer && "border-green/40 bg-green/10 text-fg",
                  selected && chosen && !answer && "border-red/40 bg-red/10 text-fg",
                  selected && !chosen && !answer && "border-border/60 text-fg-ter opacity-70",
                )}>
                {selected && answer ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green" />
                  : selected && chosen ? <XCircle className="mt-0.5 size-4 shrink-0 text-red" />
                  : <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-current text-[9px]"> </span>}
                <span>{option}</span>
              </button>
            );
          })}
        </div>
        {selected && (
          <div className={cn("mt-4 rounded-2xl p-3.5", isCorrect ? "bg-green/10" : "bg-gold/10")}>
            <p className={cn("text-xs font-extrabold", isCorrect ? "text-green" : "text-gold")}>{isCorrect ? "Correct" : "Not quite"}</p>
            {question.explanation && <p className="mt-1 text-xs leading-relaxed text-fg-sec">{question.explanation}</p>}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button disabled={!selected} onClick={() => setIndex((current) => current + 1)}>
            {index === practice.questions.length - 1 ? "See score" : "Next question"}<ChevronRight className="size-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExamTab() {
  const [practice, setPractice] = useState<ExamPracticeSet | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startPractice = async (exam: ExamDef, section: ExamSection) => {
    const key = `${exam.id}:${section.id}`;
    setLoadingKey(key);
    setError(null);
    try {
      const rows = await contentGenerator.getExamQuestions({
        examType: exam.id, section: section.id, langCode: "en", nativeLangCode: "tr", count: 8,
      });
      const questions = rows.map((row, index) => normalizeExamQuestion(row, index)).filter((row): row is ExamQuestion => !!row);
      if (!questions.length) throw new Error("No usable questions are available for this set yet. Retry after the question bank or AI service is available.");
      setPractice({ examName: exam.name, sectionName: section.label, questions });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The practice set could not be loaded.");
    } finally {
      setLoadingKey(null);
    }
  };

  if (practice) return <ExamPractice practice={practice} onExit={() => setPractice(null)} />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-gold/30 bg-gold/[0.06] p-4">
        <p className="text-[13px] leading-relaxed text-fg-sec"><span className="font-display font-extrabold text-fg">Real question practice</span> · Sets load from the question bank and may be AI-generated when available. Results describe only this set; they are not official exam scores.</p>
      </Card>
      {EXAMS.map((exam, i) => (
        <motion.div key={exam.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lift", exam.gradient)}>
          <div className="absolute -right-8 -top-10 size-36 rounded-full bg-white/10 blur-xl" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-extrabold tracking-tight">{exam.name}</p>
                <p className="mt-1 text-xs font-semibold text-white/75">Multiple-choice practice · 8 questions per set</p>
              </div>
              {loadingKey?.startsWith(`${exam.id}:`) && <Loader2 className="size-5 animate-spin" aria-label="Loading practice questions" />}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {exam.sections.map((section) => {
                const key = `${exam.id}:${section.id}`;
                return (
                  <button key={key} disabled={loadingKey !== null} onClick={() => void startPractice(exam, section)}
                    className="rounded-full bg-white/95 px-3.5 py-2 font-display text-[11.5px] font-extrabold text-fg transition hover:bg-white disabled:cursor-wait disabled:opacity-60">
                    {loadingKey === key ? "Loading…" : section.label}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      ))}
      {error && <Card className="border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">Practice set unavailable: {error}</p></Card>}
    </div>
  );
}

/* ═══════════ TAB 5: BUSINESS ═══════════ */
function BusinessTab() {
  const { user, setFlashcards } = useApp();
  const targetCode = langByName(user.targetLanguage).code;
  const [categories, setCategories] = useState<{ category: string; total_words: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const colors = ["from-[#6C5CE7] to-[#4c3ed8]", "from-[#74B9FF] to-[#0984E3]",  "from-[#00CEC9] to-[#0090a8]", "from-[#F8B500] to-[#e07b00]"];
  const iconFor = (category: string) => /technology|software|it/i.test(category) ? "code" : /medical|health/i.test(category) ? "stetho" : /travel|touris|hospital/i.test(category) ? "plane" : /finance|bank/i.test(category) ? "trending" : "brief";
  const industryCategories = categories.filter(({ category }) => /business|technology|software|finance|bank|medical|health|touris|hospital|travel|workplace|office|marketing|sales|legal/i.test(category));

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setCategories([]);
    void vocabularyService.getCategoriesWithCount(targetCode).then((rows) => {
      if (active) setCategories(rows);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Industry vocabulary could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetCode, reloadKey]);

  const displayName = (category: string) => category.split(/[ _-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4"><p className="text-[13px] leading-relaxed text-fg-sec"><span className="font-display font-extrabold text-fg">Professional vocabulary</span> · Categories and word counts are loaded from the vocabulary service. Study opens the saved-word review flow.</p></Card>
      {loading && <Card className="flex items-center gap-3 p-5"><Loader2 className="size-4 animate-spin text-primary" /><span className="text-sm font-semibold text-fg-sec">Loading industry categories…</span></Card>}
      {error && <Card className="flex flex-wrap items-center justify-between gap-3 border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">Industry vocabulary unavailable: {error}</p><Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button></Card>}
      {!loading && !error && industryCategories.length === 0 && <Card className="p-5"><p className="font-display text-sm font-extrabold text-fg">No professional categories available</p><p className="mt-1 text-sm leading-relaxed text-fg-sec">No industry-specific categories are currently present for {user.targetLanguage}. Browse the Vocabulary tab for available topics. Custom track generation is not currently available.</p></Card>}
      <div className="flex flex-col gap-3">
        {industryCategories.map((category, index) => <motion.button key={category.category} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} whileHover={{ x: 4 }} onClick={() => setFlashcards(true, category.category)} className="flex cursor-pointer items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-card transition hover:border-primary/40 hover:shadow-lift">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white", colors[index % colors.length])}><I k={iconFor(category.category)} className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-[15px] font-extrabold text-fg">{displayName(category.category)}</span><span className="block text-xs text-fg-sec">{category.total_words} words in the word bank</span></span>
          <span className="shrink-0 rounded-full bg-primary-faint px-3.5 py-2 font-display text-xs font-bold text-primary">Study <ChevronRight className="ml-1 inline size-3.5" /></span>
        </motion.button>)}
      </div>
    </div>
  );
}

/* ═══════════ LEARN VIEW ═══════════ */
export default function LearnView() {
  const [tab, setTab] = useState<LearnTab>("path");
  const { openLesson, completed, user } = useApp();
  const current = lessonIndexer(completed).find((l) => l.status === "current");
  const supportedPair = langByName(user.targetLanguage).code === "en" && langByName(user.nativeLanguage).code === "tr";
  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Learn"
        sub="Follow your path, master every node"
        right={
          <div className="flex items-center gap-2">
            <LevelBadge level={user.level as CEFR} className="px-3 py-2 text-xs" />
            {current && tab === "path" && supportedPair && (
              <Button size="sm" onClick={() => openLesson(current.lesson)}>
                <Play className="size-4 fill-white" /> Resume
              </Button>
            )}
          </div>
        }
      />
      <TabBar tab={tab} setTab={setTab} />
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {tab === "path" && <PathTab />}
          {tab === "grammar" && <GrammarTab />}
          {tab === "vocab" && <VocabTab />}
          {tab === "exam" && <ExamTab />}
          {tab === "business" && <BusinessTab />}
        </motion.div>
      </AnimatePresence>

      {/* floating review FAB */}
      {tab === "vocab" && (
        <motion.button
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.3 }}
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
          onClick={() => useApp.getState().setFlashcards(true)}
          className="fixed bottom-24 right-4 z-40 flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-br from-cyan to-[#009fa0] px-5 py-3.5 font-display text-sm font-extrabold text-white shadow-glow-cyan lg:bottom-8 lg:right-8"
        >
          <Layers className="size-4.5" /> Review
        </motion.button>
      )}
    </div>
  );
}
