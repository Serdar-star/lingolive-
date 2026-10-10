import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Search, X, Check, ArrowRight, Plane, Briefcase, GraduationCap,
  MessagesSquare, ClipboardList, Clapperboard, Sprout, Leaf, TreePine, Mountain,
  Star, Crown, Turtle, Footprints, Rabbit, Rocket, Languages, Globe, Sparkles,
  Mic,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { Flag, I } from "../components/ui";
import { BackgroundFX } from "../components/layout";

/* ─────────── DATA ─────────── */
const LANGS = [
  { code: "gb", name: "English", native: "English" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "sa", name: "Arabic", native: "العربية" },
  { code: "cn", name: "Chinese", native: "中文" },
  { code: "jp", name: "Japanese", native: "日本語" },
  { code: "kr", name: "Korean", native: "한국어" },
  { code: "br", name: "Portuguese", native: "Português" },
  { code: "in", name: "Hindi", native: "हिन्दी" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "se", name: "Swedish", native: "Svenska" },
];

const GREETINGS = [
  { c: "tr", t: "Merhaba" }, { c: "gb", t: "Hello" }, { c: "es", t: "Hola" },
  { c: "fr", t: "Bonjour" }, { c: "de", t: "Hallo" }, { c: "it", t: "Ciao" },
  { c: "br", t: "Olá" }, { c: "ru", t: "Привет" }, { c: "jp", t: "こんにちは" },
  { c: "kr", t: "안녕하세요" }, { c: "cn", t: "你好" }, { c: "sa", t: "مرحبا" },
  { c: "in", t: "नमस्ते" }, { c: "nl", t: "Hallo" }, { c: "se", t: "Hej" },
];

const GOALS = [
  { id: "travel", name: "Travel", desc: "Order food, ask directions, explore freely", icon: Plane, bg: "bg-green/12 text-green" },
  { id: "career", name: "Career", desc: "Interviews, meetings and office talk", icon: Briefcase, bg: "bg-blue/12 text-blue" },
  { id: "education", name: "Education", desc: "Study abroad and academic English", icon: GraduationCap, bg: "bg-orange/12 text-orange" },
  { id: "conversation", name: "Conversation", desc: "Chat confidently with anyone", icon: MessagesSquare, bg: "bg-primary/12 text-primary" },
  { id: "exam", name: "Exam Prep", desc: "IELTS, TOEFL, YDS and Cambridge", icon: ClipboardList, bg: "bg-red/12 text-red" },
  { id: "culture", name: "Culture", desc: "Movies, music, memes and more", icon: Clapperboard, bg: "bg-cyan/12 text-cyan" },
];

const LEVELS = [
  { id: "A1", name: "Beginner", desc: "Just starting out", icon: Sprout, color: "#2ED573" },
  { id: "A2", name: "Elementary", desc: "Basic phrases", icon: Leaf, color: "#7BED9F" },
  { id: "B1", name: "Intermediate", desc: "Everyday topics", icon: TreePine, color: "#74B9FF" },
  { id: "B2", name: "Upper-Int.", desc: "Complex ideas", icon: Mountain, color: "#6C5CE7" },
  { id: "C1", name: "Advanced", desc: "Fluent & flexible", icon: Star, color: "#E84393" },
  { id: "C2", name: "Mastery", desc: "Near-native", icon: Crown, color: "#F8B500" },
];

const DAILY = [
  { id: 5, name: "5 min/day", label: "Casual", desc: "A gentle habit", icon: Turtle, color: "#2ED573" },
  { id: 15, name: "15 min/day", label: "Regular", desc: "Steady progress", icon: Footprints, color: "#74B9FF", rec: true },
  { id: 30, name: "30 min/day", label: "Serious", desc: "Fast improvement", icon: Rabbit, color: "#FFA502" },
  { id: 60, name: "60 min/day", label: "Intense", desc: "Maximum speed", icon: Rocket, color: "#FF6B6B" },
];

const STEP_NAMES = ["Welcome", "Your language", "Target language", "Your goals", "Your level", "Daily time", "All set"];

const stepAnim = {
  initial: { opacity: 0, x: 60 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
};

/* ─────────── tiny bits ─────────── */
/* Orbiting flags around the brand orb.
   Positioning lives on the OUTER span (left/top), the float animation on the
   INNER one — otherwise the keyframe transform overrides the placement. */
function OrbitVisual({ size = 264, orb = 100 }: { size?: number; orb?: number }) {
  const flags = [
    { c: "gb", x: 4, y: 8, d: 0 }, { c: "jp", x: 78, y: 2, d: 0.6 },
    { c: "es", x: 92, y: 52, d: 1.2 }, { c: "kr", x: 70, y: 88, d: 1.8 },
    { c: "fr", x: 18, y: 90, d: 2.4 }, { c: "tr", x: -2, y: 46, d: 3.0 },
  ];
  const flagSize = Math.round(size * 0.115);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-[4%] rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(108,92,231,0.30), transparent 65%)" }}
      />
      <div className="anim-spin-slow absolute inset-[5%] rounded-full border border-dashed border-white/20" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="anim-ring-pulse hero-gradient relative grid place-items-center rounded-full" style={{ width: orb, height: orb }}>
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.5), transparent 56%)" }}
          />
          <Languages className="relative text-white" style={{ width: orb * 0.42, height: orb * 0.42 }} strokeWidth={1.7} />
        </div>
      </div>
      {flags.map((f) => (
        <span key={f.c} className="absolute" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
          <span
            className="anim-floaty block rounded-full border border-white/20 bg-white/10 p-1.5 shadow-lift backdrop-blur-md"
            style={{ animationDelay: `${f.d}s` }}
          >
            <Flag code={f.c} size={flagSize} />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─────────── STEP 0 — WELCOME HERO (clean, centered, scan-proof) ─────────── */
function WelcomeHero({ onNext, onLogin }: { onNext: () => void; onLogin: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4 }}
      className="hero-root"
    >
      {/* aurora background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="aurora-blob" style={{ left: -160, top: -160, width: 560, height: 560, background: "rgba(108,92,231,0.40)" }} />
        <div className="aurora-blob" style={{ right: -170, top: "22%", width: 520, height: 520, background: "rgba(0,210,211,0.24)", animationDelay: "-6s" }} />
        <div className="aurora-blob" style={{ left: "32%", bottom: -220, width: 520, height: 520, background: "rgba(232,67,147,0.18)", animationDelay: "-11s" }} />
        <div className="hero-dots" />
      </div>

      {/* top bar */}
      <header className="hero-head">
        <div className="flex items-center gap-2.5">
          <span className="hero-gradient grid size-9 place-items-center rounded-xl shadow-glow">
            <Languages className="size-5 text-white" strokeWidth={2.2} />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            Lingo<span className="text-mint">Live</span>
          </span>
        </div>
        <button onClick={onLogin} className="hero-login">Log in</button>
      </header>

      {/* hero body — single clean column */}
      <div className="hero-wrap">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.05 }}
        >
          <OrbitVisual />
        </motion.div>

        <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="hero-badge mt-7">
          <Globe className="size-4 text-mint" />
          Learn across 15 supported languages
        </motion.span>

        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.6 }} className="hero-title">
          Welcome to
          <br />
          <span className="grad">LingoLive</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38, duration: 0.6 }} className="hero-sub">
          Build a language-learning habit with vocabulary practice, interactive lessons,
          and conversation tools in one place.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }} className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            { icon: Globe, t: "15 languages" },
            { icon: Mic, t: "Live voice rooms" },
            { icon: Sparkles, t: "AI tutor" },
          ].map((p) => (
            <span key={p.t} className="hero-pill">
              <p.icon className="size-3.5 text-purple" /> {p.t}
            </span>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58, duration: 0.5 }} className="hero-cta-row">
          <motion.button onClick={onNext} whileTap={{ scale: 0.97 }} className="hero-cta group">
            <span className="anim-shine absolute inset-y-0 left-0 w-1/3 bg-white/25 blur-md" aria-hidden />
            <span className="relative z-10 flex items-center gap-2">
              Get Started
              <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.6} />
            </span>
          </motion.button>
          <button onClick={onLogin} className="hero-ghost">I already have an account</button>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.72 }} className="hero-proof">
          <span className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <Globe className="size-4 text-mint" /> 15 supported languages
          </span>
          <span className="hidden h-4 w-px bg-white/15 sm:block" aria-hidden />
          <span className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <MessagesSquare className="size-4 text-cyan" /> Practice at your own pace
          </span>
        </motion.div>
      </div>

      {/* greeting marquee */}
      <div className="hero-marquee">
        <div className="mask-fade-x overflow-hidden">
          <div className="anim-marquee flex w-max gap-2.5 pr-2.5">
            {[...GREETINGS, ...GREETINGS].map((g, i) => (
              <span key={`${g.c}-${i}`} className="greet-chip">
                <Flag code={g.c} size={16} /> {g.t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────── shared bits (steps 1-6) ─────────── */
function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="whitespace-pre-line font-display text-[27px] font-extrabold leading-tight tracking-tight text-fg sm:text-3xl"
      >
        {title}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mt-2 text-sm text-fg-sec">
        {sub}
      </motion.p>
    </div>
  );
}

function RadioRing({ on }: { on: boolean }) {
  return (
    <span className={cn(
      "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-200",
      on ? "border-transparent bg-gradient-to-br from-primary to-primary-strong shadow-lift" : "border-border"
    )}>
      {on && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
    </span>
  );
}

function LangPicker({
  selected, onPick, featured,
}: { selected: string | null; onPick: (name: string) => void; featured?: boolean }) {
  const [q, setQ] = useState("");
  const list = LANGS.filter((l) => (l.name + l.native).toLowerCase().includes(q.toLowerCase()));
  const featuredLang = list[0];
  const rest = list.slice(featured ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-ter" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search languages…"
          className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-10 text-sm font-semibold text-fg outline-none transition placeholder:text-fg-ter focus:border-primary/60 shadow-card"
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-fg-ter hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </div>

      {featured && featuredLang && (
        <>
          <p className="mt-1 font-display text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-ter">Browse supported languages</p>
          <PickCard lang={featuredLang} big on={selected === featuredLang.name} onPick={onPick} popular />
          <div className="my-1 grid grid-cols-2 gap-2.5">
            {rest.slice(0, 2).map((l) => <PickCard key={l.code} lang={l} on={selected === l.name} onPick={onPick} />)}
          </div>
          <p className="font-display text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-ter">Other languages</p>
        </>
      )}

      <div className="grid max-h-[38dvh] grid-cols-2 gap-2.5 overflow-y-auto pb-2 pr-0.5 lg:max-h-[32dvh]">
        {(featured ? rest.slice(2) : list).map((l, i) => (
          <motion.div key={l.code} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <PickCard lang={l} on={selected === l.name} onPick={onPick} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PickCard({ lang, on, onPick, big, popular }: {
  lang: { code: string; name: string; native: string }; on: boolean; onPick: (n: string) => void; big?: boolean; popular?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onPick(lang.name)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition-all duration-150 shadow-card",
        big ? "h-20" : "h-16",
        on ? "border-primary bg-primary-faint" : "border-transparent hover:border-primary/40"
      )}
    >
      <Flag code={lang.code} size={big ? 34 : 28} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14.5px] font-extrabold text-fg">{lang.name}</p>
        <p className="truncate text-[11px] font-medium text-fg-ter">{lang.native}</p>
      </div>
      {popular ? (
        <span className="rounded-full bg-gold/15 px-2.5 py-1 font-display text-[10px] font-extrabold text-gold">POPULAR</span>
      ) : null}
      <RadioRing on={on} />
    </motion.button>
  );
}

/* ─────────── ONBOARDING ─────────── */
export default function Onboarding() {
  const { completeOnboarding, setAuthStage, pushToast } = useApp();
  const [step, setStep] = useState(0);
  const [native, setNative] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [level, setLevel] = useState<string | null>(null);
  const [dailyMin, setDailyMin] = useState(15);

  const canNext =
    step === 0 ? true :
    step === 1 ? !!native :
    step === 2 ? !!target && target !== native :
    step === 3 ? goals.length > 0 :
    step === 4 ? !!level : true;

  const next = () => {
    if (step === 6) {
      completeOnboarding({ native: native ?? "Turkish", target: target ?? "English", goals, level: level ?? "B1", dailyMin });
    } else setStep(step + 1);
  };
  const toggleGoal = (id: string) => {
    setGoals((g) => {
      if (g.includes(id)) return g.filter((x) => x !== id);
      if (g.length >= 3) {
        pushToast({ title: "Pick up to 3 goals", desc: "Deselect one to change your goals", icon: "target", tone: "red" });
        return g;
      }
      return [...g, id];
    });
  };

  const targetFlag = LANGS.find((l) => l.name === target)?.code ?? "gb";

  /* ── step 0: full-screen hero ── */
  if (step === 0) {
    return <WelcomeHero onNext={next} onLogin={() => setAuthStage("login")} />;
  }

  /* ── steps 1-6 ── */
  return (
    <motion.div
      className="relative flex min-h-dvh flex-col bg-bg"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <BackgroundFX />

      {/* progress header */}
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3.5 px-5 py-3.5">
          <button
            onClick={() => setStep(step - 1)}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-card text-fg-sec shadow-card transition hover:text-fg"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-300",
                    i < step ? "bg-gradient-to-r from-primary to-cyan" : i === step ? "bg-primary/60" : "bg-border"
                  )}
                />
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-fg-ter">
                {STEP_NAMES[step]}
              </span>
              <span className="font-mono text-[11px] font-bold text-fg-ter">Step {step + 1} of 7</span>
            </div>
          </div>
          {step < 5 ? (
            <button
              onClick={() => setAuthStage("register")}
              className="shrink-0 cursor-pointer px-1 font-display text-[13px] font-bold text-fg-ter transition hover:text-fg"
            >
              Skip
            </button>
          ) : <span className="w-7" />}
        </div>
      </header>

      {/* steps */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-5 pb-44 pt-7">
          <AnimatePresence mode="wait">
            {/* NATIVE LANGUAGE */}
            {step === 1 && (
              <motion.div key="s1" {...stepAnim}>
                <StepTitle title={"What's your native\nlanguage?"} sub="We'll personalize your experience" />
                <LangPicker selected={native} onPick={setNative} />
              </motion.div>
            )}

            {/* TARGET LANGUAGE */}
            {step === 2 && (
              <motion.div key="s2" {...stepAnim}>
                <StepTitle title={"What do you want\nto learn?"} sub="Choose the language you want to master" />
                <LangPicker selected={target} onPick={setTarget} featured />
                {target && native && target === native && (
                  <p role="status" className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-center text-xs font-semibold text-gold">
                    Choose a target language different from your native language to build a learning path.
                  </p>
                )}
              </motion.div>
            )}

            {/* GOALS */}
            {step === 3 && (
              <motion.div key="s3" {...stepAnim}>
                <StepTitle title="What's your goal?" sub={`Select up to 3 goals · ${goals.length}/3 chosen`} />
                <div className="flex flex-col gap-2.5">
                  {GOALS.map((g, i) => {
                    const on = goals.includes(g.id);
                    return (
                      <motion.button
                        key={g.id}
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleGoal(g.id)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3.5 rounded-2xl border-l-4 bg-card p-4 text-left shadow-card transition",
                          on ? "border-l-primary bg-primary-faint" : "border-l-transparent hover:bg-card-sec"
                        )}
                      >
                        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", g.bg)}>
                          <g.icon className="size-5.5" strokeWidth={2.2} />
                        </span>
                        <span className="flex-1">
                          <span className="block font-display text-[14.5px] font-extrabold text-fg">{g.name}</span>
                          <span className="block text-xs text-fg-sec">{g.desc}</span>
                        </span>
                        <RadioRing on={on} />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* LEVEL */}
            {step === 4 && (
              <motion.div key="s4" {...stepAnim}>
                <StepTitle title={"What's your current\nlevel?"} sub="Be honest — we'll build your perfect path" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {LEVELS.map((lv, i) => {
                    const on = level === lv.id;
                    return (
                      <motion.button
                        key={lv.id}
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setLevel(lv.id)}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-1 rounded-3xl border-2 bg-card p-4 text-center shadow-card transition",
                          on ? "border-primary bg-primary-faint" : "border-transparent hover:border-primary/40"
                        )}
                      >
                        <span className="grid size-11 place-items-center rounded-2xl" style={{ background: `${lv.color}20`, color: lv.color }}>
                          <lv.icon className="size-6" strokeWidth={2.2} />
                        </span>
                        <span className="font-display text-lg font-extrabold" style={{ color: on ? lv.color : "var(--fg)" }}>{lv.id}</span>
                        <span className="-mt-1.5 text-[11px] font-bold text-fg-sec">{lv.name}</span>
                        <span className="text-[10px] leading-tight text-fg-ter">{lv.desc}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setLevel("A1")}
                  className="mx-auto mt-5 block cursor-pointer font-display text-[13px] font-bold text-primary hover:underline"
                >
                  Not sure? Start at Beginner
                </button>
              </motion.div>
            )}

            {/* DAILY GOAL */}
            {step === 5 && (
              <motion.div key="s5" {...stepAnim}>
                <StepTitle title={"How much time\nper day?"} sub="Consistency beats intensity — even 5 min helps!" />
                <div className="flex flex-col gap-2.5">
                  {DAILY.map((d, i) => {
                    const on = dailyMin === d.id;
                    return (
                      <motion.button
                        key={d.id}
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setDailyMin(d.id)}
                        className={cn(
                          "relative flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left shadow-card transition",
                          on ? "border-primary bg-primary-faint" : "border-transparent hover:border-primary/40"
                        )}
                      >
                        {d.rec && (
                          <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-gold to-orange px-2.5 py-0.5 font-display text-[10px] font-extrabold text-white shadow-lift">
                            RECOMMENDED
                          </span>
                        )}
                        <span className="grid size-12 place-items-center rounded-2xl" style={{ background: `${d.color}1f`, color: d.color }}>
                          <d.icon className="size-6" strokeWidth={2.2} />
                        </span>
                        <span className="flex-1">
                          <span className="block font-display text-[15px] font-extrabold text-fg">{d.name}</span>
                          <span className="block text-xs text-fg-sec">{d.label} · {d.desc}</span>
                        </span>
                        <RadioRing on={on} />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ALL SET */}
            {step === 6 && (
              <motion.div key="s6" {...stepAnim} className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 13 }}
                  className="relative mt-4 grid size-24 place-items-center rounded-[28px] bg-gradient-to-br from-primary to-cyan text-white shadow-glow"
                >
                  <Rocket className="size-11 anim-floaty" strokeWidth={2} />
                  <Sparkles className="absolute -right-2 -top-2 size-6 text-gold anim-flicker" />
                </motion.div>
                <h2 className="mt-5 font-display text-[32px] font-extrabold tracking-tight text-gradient">You're all set!</h2>
                <p className="mt-1.5 text-[15px] text-fg-sec">Your personalized learning path is ready</p>

                <div className="mt-6 w-full rounded-3xl border border-border bg-card/80 p-5 text-left shadow-card backdrop-blur">
                  <p className="font-display text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">Your learning journey</p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {[
                      { icon: "cloud", t: "Weather & Seasons", d: "~10 min · +30 XP" },
                      { icon: "home", t: "At Home", d: "~10 min · +30 XP" },
                      { icon: "crown", t: "Boss Battle", d: "~20 min · +500 XP" },
                    ].map((l) => (
                      <div key={l.t} className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-cyan text-white">
                          <I k={l.icon} className="size-4" />
                        </span>
                        <span className="flex-1 font-display text-[13.5px] font-bold text-fg">{l.t}</span>
                        <span className="text-[11px] font-semibold text-fg-ter">{l.d}</span>
                      </div>
                    ))}
                    <p className="pt-1 text-center text-[11.5px] font-semibold text-fg-ter">Explore more lessons as you progress</p>
                  </div>
                </div>

                <div className="mt-4 flex w-full gap-2">
                  <span className="flex-1 rounded-2xl bg-card px-3 py-2.5 text-xs font-bold text-fg-sec shadow-card">{dailyMin} min/day</span>
                  <span className="flex-1 rounded-2xl bg-card px-3 py-2.5 text-xs font-bold text-fg-sec shadow-card">{level ?? "B1"} Level</span>
                  <span className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-card px-3 py-2.5 text-xs font-bold text-fg-sec shadow-card">
                    <Flag code={targetFlag} size={16} /> {target ?? "English"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/85 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-lg px-5">
          <motion.button
            onClick={next}
            disabled={!canNext}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl font-display text-base font-extrabold text-white transition",
              canNext
                ? step === 6
                  ? "shadow-glow bg-[length:160%_160%] animate-[gradient_2.4s_ease-in-out_infinite] bg-gradient-to-r from-primary via-[#8b7dff] to-cyan"
                  : "bg-gradient-to-br from-primary to-primary-strong shadow-lift hover:brightness-110"
                : "cursor-not-allowed bg-bg-sec text-fg-ter"
            )}
          >
            {step === 6 ? "Start Learning Now" : "Continue"}
            <ArrowRight className="size-5" strokeWidth={2.6} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
