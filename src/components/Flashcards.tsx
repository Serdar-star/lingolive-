import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Volume2, RotateCcw, Check, Frown, Meh, Smile } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { getSessionUserId } from "../lib/backend";
import { loadStudyDeck, saveStudyReview, type StudyCard } from "../lib/flashcards";
import { getLocalPreferences, speechLocaleWithAccent, speechRateValue } from "../lib/preferences";
import { langByName } from "../store/language";

const SPEECH_LOCALE: Record<string, string> = {
  en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", zh: "zh-CN", ja: "ja-JP",
  ko: "ko-KR", pt: "pt-BR", ru: "ru-RU", ar: "ar-SA", it: "it-IT", hi: "hi-IN",
  tr: "tr-TR", nl: "nl-NL", sv: "sv-SE",
};

export default function Flashcards() {
  const { setFlashcards, addXP, progressMission, user, flashcardsCategory } = useApp();
  const userId = getSessionUserId();
  const targetCode = langByName(user.targetLanguage).code;
  const [deck, setDeck] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [nextReviewAt, setNextReviewAt] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [marks, setMarks] = useState<Record<number, 1 | 2 | 3>>({});

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(null); setEmptyReason(null); setNextReviewAt(null);
    void loadStudyDeck({ userId, level: user.level, language: targetCode, category: flashcardsCategory }).then((result) => {
      if (!active) return;
      setDeck(result.cards); setDemo(result.demo); setEmptyReason(result.emptyReason ?? null); setNextReviewAt(result.nextReviewAt ?? null);
      setI(0); setMarks({}); setFlipped(false);
    }).catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Vocabulary could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, user.level, targetCode, flashcardsCategory, refreshKey]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const done = deck.length > 0 && i >= deck.length;
  const mastered = Object.values(marks).filter((value) => value >= 2).length;
  const card = deck[Math.min(i, Math.max(0, deck.length - 1))];

  const mark = async (grade: 1 | 2 | 3) => {
    if (!card || saving) return;
    setSaving(true); setLoadError(null);
    try {
      if (userId && !demo) {
        await saveStudyReview(userId, card, grade);
        progressMission("m_words");
      }
      setMarks((current) => ({ ...current, [i]: grade }));
      if (userId && !demo && !flashcardsCategory && grade >= 2) addXP(1, { sync: true, source: "VOCAB_REVIEW" });
      setDir(grade === 1 ? -1 : 1);
      setFlipped(false);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
      setI((current) => current + 1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "This review was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const finish = () => setFlashcards(false);
  const speak = () => {
    if (!card || typeof window === "undefined" || !window.speechSynthesis) {
      setLoadError("Speech playback is not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const preferences = getLocalPreferences();
    const utterance = new SpeechSynthesisUtterance(card.en);
    utterance.lang = speechLocaleWithAccent(SPEECH_LOCALE[targetCode] ?? targetCode, preferences.speechAccent);
    utterance.rate = speechRateValue(preferences.speechRate);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[150] flex flex-col"
      style={{ background: "linear-gradient(160deg,#141033 0%,#261f66 55%,#0d3f4b 130%)" }}
      initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 dotgrid opacity-15" />
      {/* header */}
      <div className="relative z-10 mx-auto w-full max-w-lg px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0 text-white/60">
            <p className="truncate font-display text-sm font-extrabold text-white">
              {flashcardsCategory ? `${flashcardsCategory.replace(/[-_]/g, " ")} practice` : "Daily Review"}
            </p>
            <p className="text-[11px] font-semibold">
              {loading ? "Loading vocabulary…" : deck.length ? `${Math.min(i + 1, deck.length)} of ${deck.length} cards${demo ? " · sample" : " · saved review"}` : "No cards due"}
            </p>
          </div>
          <button onClick={() => setFlashcards(false)} className="grid size-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan to-white"
            animate={{ width: `${deck.length ? (Math.min(i, deck.length) / deck.length) * 100 : 0}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* body */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-12">
        {loading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center">
            <div className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-cyan" />
            <p className="mt-4 text-sm font-semibold text-white/70">Loading your vocabulary…</p>
          </motion.div>
        ) : loadError && deck.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center text-center">
            <h2 className="font-display text-2xl font-extrabold text-white">Vocabulary unavailable</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{loadError}</p>
            <div className="mt-7 flex w-full gap-3">
              <button onClick={finish} className="flex-1 rounded-2xl border border-white/20 py-3 font-bold text-white/75 hover:bg-white/10">Close</button>
              <button onClick={() => setRefreshKey((key) => key + 1)} className="flex-1 rounded-2xl bg-cyan py-3 font-bold text-[#10283b] hover:brightness-110">Try again</button>
            </div>
          </motion.div>
        ) : deck.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center text-center">
            <div className="grid size-20 place-items-center rounded-full border border-cyan/30 bg-cyan/10 text-3xl text-cyan">✓</div>
            <h2 className="mt-6 font-display text-2xl font-extrabold text-white">
              {flashcardsCategory ? "No words in this topic yet" : "You’re all caught up!"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{emptyReason ?? "There are no vocabulary cards to review right now."}</p>
            {nextReviewAt && <p className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-cyan">Next review: {new Date(nextReviewAt).toLocaleString()}</p>}
            <button onClick={finish} className="mt-7 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-strong py-3.5 font-display text-sm font-extrabold text-white shadow-glow">Done</button>
          </motion.div>
        ) : !done && card ? (
          <>
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={i}
                initial={{ opacity: 0, x: dir >= 0 ? 120 : -120, rotate: dir >= 0 ? 4 : -4 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={{ opacity: 0, x: dir >= 0 ? -120 : 120, rotate: dir >= 0 ? -4 : 4 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-sm"
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={flipped ? "Vocabulary card answer" : "Reveal vocabulary card answer"}
                  onClick={() => setFlipped((value) => !value)}
                  onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFlipped((value) => !value); } }}
                  className="block w-full cursor-pointer rounded-[28px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan [perspective:1200px]"
                >
                  <motion.div
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="relative h-[300px] w-full [transform-style:preserve-3d]"
                  >
                    {/* front */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[28px] border border-white/15 bg-white/[0.08] p-6 backdrop-blur-xl [backface-visibility:hidden]">
                      <span className="absolute left-5 top-5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60">{user.targetLanguage}</span>
                      <p className="font-mono text-4xl font-bold tracking-tight text-white">{card.en}</p>
                      <p className="absolute bottom-6 flex items-center gap-1.5 text-[11px] font-semibold text-white/40">
                        <RotateCcw className="size-3.5" /> Tap to reveal
                      </p>
                    </div>
                    {/* back */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[28px] border border-cyan/30 bg-gradient-to-b from-[#0e4b4e] to-[#123a5e] p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <p className="font-mono text-[15px] font-semibold text-white/40">{user.targetLanguage}: {card.en}</p>
                      <p className="mt-1 font-display text-[26px] font-extrabold text-cyan">{card.tr}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/45">{user.nativeLanguage}</p>
                      <p className="mt-1.5 text-sm italic text-white/50">{card.pronunciation}</p>
                      {card.example && <p className="mt-4 max-w-[240px] text-center text-[13px] italic leading-relaxed text-white/75">"{card.example}"</p>}
                      <button
                        onClick={(e) => { e.stopPropagation(); speak(); }}
                        className="absolute bottom-5 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
                      >
                        <Volume2 className="size-4" /> Listen
                      </button>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* SRS buttons */}
            <div className={cn("mt-8 grid w-full max-w-sm grid-cols-3 gap-2.5 transition-opacity", flipped ? "opacity-100" : "pointer-events-none opacity-35")}>
              {[
                { g: 1 as const, label: "Hard", icon: Frown, cls: "border-red/50 text-red hover:bg-red/15" },
                { g: 2 as const, label: "Good", icon: Meh, cls: "border-primary/60 text-[#a89cf2] hover:bg-primary/20" },
                { g: 3 as const, label: "Easy", icon: Smile, cls: "border-green/50 text-green hover:bg-green/15" },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={() => void mark(b.g)}
                  disabled={saving}
                  className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 bg-white/[0.05] py-3.5 font-display text-[13px] font-extrabold backdrop-blur transition disabled:cursor-wait disabled:opacity-50", b.cls)}
                >
                  <b.icon className="size-5" /> {b.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-semibold text-white/35">
              {saving ? "Saving your review…" : demo ? "Sample cards are not saved to an account" : "Rate how well you knew it — SRS schedules the next review"}
            </p>
            {loadError && <p role="alert" className="mt-2 max-w-sm text-center text-xs font-semibold text-red-200">{loadError}</p>}
          </>
        ) : (
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex w-full max-w-sm flex-col items-center text-center">
            <motion.button
              onClick={() => confetti({ particleCount: 160, spread: 100, origin: { y: 0.5 }, colors: ["#6C5CE7", "#00D2D3", "#F8B500"] })}
              className="grid size-24 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-green to-[#1db866] text-white shadow-glow"
              initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1] }} transition={{ duration: 0.7, times: [0, 0.65, 1] }}
            >
              <Check className="size-11" strokeWidth={3} />
            </motion.button>
            <h2 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-white">Review complete!</h2>
            <p className="mt-2 text-sm text-white/55">{deck.length} {demo ? "sample cards" : "cards reviewed"}</p>
            <div className="mt-6 grid w-full grid-cols-3 gap-2.5">
              {[
                { v: mastered, l: "Known well", c: "text-green" },
                { v: Object.values(marks).filter((value) => value === 1).length, l: "Repeat", c: "text-gold" },
                { v: deck.length, l: "Reviewed", c: "text-cyan" },
              ].map((stat) => (
                <div key={stat.l} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                  <p className={cn("font-mono text-xl font-bold", stat.c)}>{stat.v}</p>
                  <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white/40">{stat.l}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-white/45">
              {demo ? "Demo reviews are not saved and do not earn XP." : flashcardsCategory ? "Your topic review was saved; XP is awarded for due daily reviews." : "Your ratings are saved and the next review is scheduled automatically."}
            </p>
            <button onClick={finish} className="mt-7 w-full cursor-pointer rounded-2xl bg-gradient-to-br from-primary to-primary-strong py-3.5 font-display text-sm font-extrabold text-white shadow-glow transition hover:brightness-110">
              Done
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
