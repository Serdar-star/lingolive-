import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Sparkles, Send, Mic, Lightbulb, Eraser, Volume2, ChevronUp,
  BarChart3, BookOpen, MessagesSquare, Loader2,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp, lessonIndexer, type AIMessage, type AIAction } from "../store/store";
import { respond, gradeQuiz, suggestPills, welcomeFor } from "../ai/engine";
import { groqService, isGroqConfigured } from "../lib/groq";
import { hasAudibleEnergy } from "../lib/audioSignal";
import { buildTutorUser, saveAITurn } from "../lib/backend";
import { getSpeechLocale } from "../lib/speech";
import { getLocalPreferences, speechLocaleWithAccent, speechRateValue } from "../lib/preferences";
import { useLanguageStore } from "../store/language";
import { I, ProgressBar } from "./ui";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─────────── RICH TEXT (bold / quotes / bullets) ─────────── */
function RichText({ text, light }: { text: string; light?: boolean }) {
  const lines = text.split("\n");
  return (
    <div className={cn("space-y-1.5 text-[14px] leading-relaxed", light ? "text-white" : "text-fg")}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const parts = trimmed.split(/(\*\*[^*]+\*\*|"[^"]+")/g).map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={j} className={cn("font-extrabold", light ? "text-white" : "text-fg")}>{p.slice(2, -2)}</strong>;
          if (p.startsWith('"') && p.endsWith('"') && p.length > 1)
            return <span key={j} className={cn("font-bold", light ? "text-cyan" : "text-primary")}>{p}</span>;
          return <span key={j} className={light ? "text-white/90" : "text-fg"}>{p}</span>;
        });
        if (trimmed.startsWith("•"))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", light ? "bg-white/60" : "bg-primary")} />
              <p>{parts.slice(1).length ? parts.map((p, j) => <span key={j}>{p}</span>) : parts}</p>
            </div>
          );
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

/* ─────────── AI AVATAR ─────────── */
function AIAvatar({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full text-white"
      style={{
        width: size, height: size,
        background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)",
      }}
    >
      <Sparkles style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.2} />
      <span className="absolute -bottom-0.5 -right-0.5 size-[26%] min-w-2.5 rounded-full border-2 border-card bg-green" />
    </span>
  );
}

/* ─────────── QUIZ CARD ─────────── */
function QuizCard({ msg, onAnswer }: { msg: AIMessage; onAnswer: (m: AIMessage, i: number) => void }) {
  const q = msg.quiz!;
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <p className="font-display text-[13.5px] font-extrabold text-fg">{q.question}</p>
      {q.options.map((o, i) => {
        const answered = q.answered !== null;
        const isPick = q.answered === i;
        const isRight = i === q.answer;
        return (
          <motion.button
            key={o}
            whileTap={{ scale: 0.97 }}
            disabled={answered}
            onClick={() => onAnswer(msg, i)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-[13px] font-bold transition",
              !answered && "border-border bg-card text-fg hover:border-primary/60 hover:bg-primary-faint",
              answered && isRight && "border-green bg-green/12 text-green",
              answered && isPick && !isRight && "border-red bg-red/12 text-red",
              answered && !isPick && !isRight && "border-border bg-card text-fg-ter opacity-60"
            )}
          >
            <span className={cn(
              "grid size-5 shrink-0 place-items-center rounded-md border text-[10px]",
              answered && isRight ? "border-green bg-green text-white" : answered && isPick ? "border-red bg-red text-white" : "border-border text-fg-ter"
            )}>
              {answered && isRight ? "✓" : answered && isPick ? "✗" : i + 1}
            </span>
            {o}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ─────────── WORD CARDS ─────────── */
function WordCards({ words }: { words: NonNullable<AIMessage["words"]> }) {
  const { pushToast } = useApp();
  const targetCode = useLanguageStore((s) => s.target);
  const speak = (word: string) => {
    if (!("speechSynthesis" in window)) {
      pushToast({ title: "Audio unavailable", desc: "This browser does not support speech playback.", icon: "mic", tone: "red" });
      return;
    }
    window.speechSynthesis.cancel();
    const prefs = getLocalPreferences();
    const locale = speechLocaleWithAccent(getSpeechLocale(targetCode), prefs.speechAccent);
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = locale;
    utterance.rate = speechRateValue(prefs.speechRate);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((candidate) => candidate.lang.toLowerCase() === locale.toLowerCase())
      ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith(locale.split("-")[0].toLowerCase()))
      ?? null;
    utterance.onerror = () => pushToast({ title: "Audio unavailable", desc: "The device could not play this word.", icon: "mic", tone: "red" });
    window.speechSynthesis.speak(utterance);
  };
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {words.map((w) => (
        <div key={w.word} className="rounded-2xl border border-primary/25 bg-primary-faint p-3.5">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-extrabold text-fg">{w.word}</p>
            <button
              type="button"
              aria-label={`Play ${w.word}`}
              onClick={() => speak(w.word)}
              className="grid size-8 cursor-pointer place-items-center rounded-full bg-primary/15 text-primary transition hover:bg-primary/25"
            >
              <Volume2 className="size-4" />
            </button>
          </div>
          <p className="font-mono text-[11.5px] text-fg-ter">{w.pro}</p>
          <p className="mt-1 text-[13px] font-bold text-cyan">= {w.tr}</p>
          <p className="mt-1 text-[12px] italic text-fg-sec">"{w.ex}"</p>
        </div>
      ))}
    </div>
  );
}

/* ─────────── PROGRESS CARD ─────────── */
function ProgressCard({ items }: { items: NonNullable<AIMessage["progress"]> }) {
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2">
      {items.map((p) => (
        <div key={p.label} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-fg-ter">
            <I k={p.icon} className="size-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">{p.label}</span>
          </div>
          <p className="mt-1 font-mono text-sm font-bold text-fg">{p.value}</p>
          {p.bar !== undefined && <ProgressBar value={p.bar} h={4} className="mt-1.5" />}
        </div>
      ))}
    </div>
  );
}

/* ─────────── ACTION BUTTONS ─────────── */
function ActionRow({ actions }: { actions: AIAction[] }) {
  const { setTab, setAIOpen, setFlashcards, openLesson, completed } = useApp();
  const run = (a: AIAction) => {
    switch (a.go) {
      case "live": setAIOpen(false); setTab("live"); break;
      case "learn": setAIOpen(false); setTab("learn"); break;
      case "flashcards": setFlashcards(true); break;
      case "lesson": {
        const current = lessonIndexer(completed).find((l) => l.status === "current");
        if (current) { setAIOpen(false); openLesson(current.lesson); }
        break;
      }
      case "room": setAIOpen(false); setTab("live"); break;
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => run(a)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-strong px-3.5 py-2 font-display text-[11.5px] font-bold text-white shadow-lift transition hover:brightness-110"
        >
          <I k={a.icon} className="size-3.5" /> {a.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────── WELCOME CHIPS ─────────── */
const QUICK_CHIPS = [
  { icon: "zap", label: "My progress today" },
  { icon: "cap", label: "What should I study?" },
  { icon: "mic", label: "Practice English" },
  { icon: "pencil", label: "Explain grammar" },
  { icon: "pen", label: "Check my writing" },
  { icon: "note", label: "Teach me words" },
  { icon: "target", label: "Quiz me" },
  { icon: "flame", label: "Motivate me" },
];

/* ─────────── MAIN AI CHAT ─────────── */
export function AIChat() {
  const {
    setAIOpen, aiMessages, aiAdd, aiUpdate, aiClear, aiPractice, setAIPractice,
    user, xp, levelNum, xpToNext, streak, todayXP, missions, completed, aiPrompt, setAIPrompt,
  } = useApp();

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [pillsOpen, setPillsOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pointerHeldRef = useRef(false);
  const recordingRef = useRef(false);
  const recordLimitRef = useRef<number | undefined>(undefined);
  const recordingStartedRef = useRef(0);

  const hasUserMsg = aiMessages.some((m) => m.role === "user");

  const ctx = useMemo(() => ({
    user, xp, levelNum, xpToNext, streak, todayXP, missions,
    nextLessonTitle: lessonIndexer(completed).find((l) => l.status === "current")?.lesson.title ?? "Weather & Seasons",
    completedCount: Object.keys(completed).length,
    practice: aiPractice,
  }), [user, xp, levelNum, xpToNext, streak, todayXP, missions, completed, aiPractice]);

  // seed welcome
  useEffect(() => {
    if (aiMessages.length === 0) aiAdd(welcomeFor(ctx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // body lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => () => {
    window.clearTimeout(holdRef.current);
    if (recordLimitRef.current !== undefined) window.clearTimeout(recordLimitRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state === "recording") recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [aiMessages, typing]);

  const streamOut = async (out: Omit<AIMessage, "id" | "time">) => {
    const id = uid();
    aiAdd({ ...out, id, time: now(), text: "" });
    setStreamingId(id);
    const full = out.text;
    const step = full.length > 400 ? 5 : 3;
    for (let i = 0; i < full.length; i += step) {
      aiUpdate(id, { text: full.slice(0, i + step) });
      await sleep(13);
    }
    aiUpdate(id, { text: full });
    setStreamingId(null);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing || streamingId) return;
    setInput("");
    aiAdd({ id: uid(), role: "user", text, time: now() });
    saveAITurn("user", text);

    /* ── Groq streaming path (when key is configured) ── */
    if (isGroqConfigured()) {
      const local = respondCtx(text); // keeps practice state + interactive attachments in sync
      const attachments = local[0];
      setTyping(true);
      await sleep(350);
      const id = uid();
      setTyping(false);
      setStreamingId(id);
      aiAdd({ id, role: "assistant", text: "", time: now() });
      try {
        const history = useApp.getState().aiMessages
          .filter((m) => m.text && !m.quiz && m.id !== "ai_welcome")
          .slice(-18)
          .map((m) => ({ role: m.role, content: m.text }));
        const full = await groqService.chatStream(
          text, history.slice(0, -1), buildTutorUser(),
          (acc) => aiUpdate(id, { text: acc })
        );
        // graft interactive elements onto the stream when intent matches
        aiUpdate(id, {
          ...(attachments?.quiz ? { quiz: attachments.quiz } : {}),
          ...(attachments?.words ? { words: attachments.words } : {}),
          ...(attachments?.progress ? { progress: attachments.progress } : {}),
          ...(attachments?.actions ? { actions: attachments.actions } : {}),
        });
        saveAITurn("assistant", full);
        setStreamingId(null);
        return;
      } catch (e) {
        console.warn("Groq stream failed, falling back to offline engine", e);
        useApp.getState().pushToast({ title: "Tutor switched to offline mode", desc: "Check your Groq key or connection — answers may be shorter", icon: "sparkles", tone: "red" });
        // fall through to the offline engine below
        setStreamingId(null);
        useApp.setState((s) => ({ aiMessages: s.aiMessages.filter((m) => m.id !== id) }));
        setAIPractice(respond(text, ctx).practice);
        setTyping(false);
        for (const m of local) await streamOut(m);
        return;
      }
    }

    /* ── Offline engine path (demo mode) ── */
    setTyping(true);
    await sleep(650);
    const result = respondCtx(text);
    setTyping(false);
    for (const m of result) await streamOut(m);
  };

  const respondCtx = (text: string) => {
    const r = respond(text, ctx);
    setAIPractice(r.practice);
    return r.msgs;
  };

  // pending prompt from FAB long-press
  useEffect(() => {
    if (aiPrompt) {
      setAIPrompt(null);
      void send(aiPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPrompt]);

  const answerQuiz = async (m: AIMessage, i: number) => {
    const q = m.quiz!;
    aiUpdate(m.id, { quiz: { ...q, answered: i } });
    aiAdd({ id: uid(), role: "user", text: q.options[i], time: now() });
    setTyping(true);
    await sleep(520);
    setTyping(false);
    await streamOut(gradeQuiz(q, i));
  };

  const pills = suggestPills(ctx);

  const stopAIRecording = () => {
    if (recordLimitRef.current !== undefined) window.clearTimeout(recordLimitRef.current);
    recordLimitRef.current = undefined;
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const beginAIRecording = async () => {
    if (!pointerHeldRef.current || recordingBusy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      useApp.getState().pushToast({ title: "Recording not supported", desc: "Use a recent browser with microphone access to speak to Lingo.", icon: "mic", tone: "red" });
      return;
    }
    setRecordingBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      if (!pointerHeldRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setRecordingBusy(false);
        return;
      }
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartedRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recordingRef.current = false;
        setRecording(false);
        setRecordingBusy(false);
        useApp.getState().pushToast({ title: "Recording failed", desc: "The browser could not capture microphone audio.", icon: "mic", tone: "red" });
      };
      recorder.onstop = async () => {
        setRecordingBusy(true);
        if (recordLimitRef.current !== undefined) window.clearTimeout(recordLimitRef.current);
        recordLimitRef.current = undefined;
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recordingRef.current = false;
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || audioChunksRef.current[0]?.type || "audio/webm" });
        audioChunksRef.current = [];
        if (blob.size < 300) {
          setRecordingBusy(false);
          useApp.getState().pushToast({ title: "No speech captured", desc: "Hold the microphone a little longer and try again.", icon: "mic", tone: "primary" });
          return;
        }
        if (!isGroqConfigured()) {
          setRecordingBusy(false);
          useApp.getState().pushToast({ title: "Whisper is not configured", desc: "Add the server-side Groq key to enable speech transcription.", icon: "mic", tone: "red" });
          return;
        }
        try {
          const energy = await hasAudibleEnergy(blob);
          if (energy !== true) {
            useApp.getState().pushToast({
              title: energy === false ? "No speech detected" : "Audio could not be verified",
              desc: energy === false
                ? "That recording was silent; try speaking closer to the microphone."
                : "This browser couldn't verify the audio, so it wasn't sent to Whisper. Try a current browser.",
              icon: "mic", tone: energy === false ? "primary" : "red",
            });
            return;
          }
          const contentType = recorder.mimeType || "audio/webm";
          const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
          const transcription = (await groqService.transcribeAudio(blob, `speech.${extension}`)).trim();
          if (!transcription) {
            useApp.getState().pushToast({ title: "No words detected", desc: "Try speaking clearly and a little closer to the microphone.", icon: "mic", tone: "primary" });
          } else {
            setInput(transcription.slice(0, 500));
            useApp.getState().pushToast({ title: "Speech transcribed", desc: "Whisper added your words to the tutor input. Review, then send.", icon: "mic", tone: "green" });
          }
        } catch (error) {
          console.warn("AI microphone transcription failed", error);
          useApp.getState().pushToast({ title: "Transcription failed", desc: error instanceof Error ? error.message : "Check the network and try again.", icon: "mic", tone: "red" });
        } finally {
          setRecordingBusy(false);
        }
      };
      recorder.start(200);
      recordingRef.current = true;
      setRecording(true);
      setRecordingBusy(false);
      recordLimitRef.current = window.setTimeout(() => {
        pointerHeldRef.current = false;
        stopAIRecording();
        useApp.getState().pushToast({ title: "Recording limit reached", desc: "Speech clips can be up to 60 seconds.", icon: "mic", tone: "primary" });
      }, 60_000);
    } catch (error) {
      setRecordingBusy(false);
      const message = error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access in your browser, then press and hold again."
        : "Could not open the microphone. Check browser permissions and try again.";
      useApp.getState().pushToast({ title: "Microphone unavailable", desc: message, icon: "mic", tone: "red" });
    }
  };

  const startHold = () => {
    if (recordingBusy || recordingRef.current) return;
    pointerHeldRef.current = true;
    holdRef.current = window.setTimeout(() => { void beginAIRecording(); }, 260);
  };

  const endHold = () => {
    pointerHeldRef.current = false;
    window.clearTimeout(holdRef.current);
    if (recordingRef.current) stopAIRecording();
    else if (!recordingBusy) useApp.getState().pushToast({ title: "Press and hold to speak", desc: "Keep the mic pressed while you talk; release to transcribe.", icon: "mic", tone: "primary" });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[148] flex flex-col bg-bg"
      initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-1/4 size-96 rounded-full bg-primary/10 blur-[110px]" />
        <div className="absolute bottom-10 right-8 size-72 rounded-full bg-cyan/10 blur-[110px]" />
      </div>

      {/* header */}
      <header className="glass relative z-10 border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-3 px-4">
          <button onClick={() => setAIOpen(false)} className="grid size-10 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-bg-sec hover:text-fg">
            <X className="size-5" />
          </button>
          <AIAvatar size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-extrabold text-fg">Lingo AI Tutor</p>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-green">
              <span className="size-1.5 rounded-full bg-green anim-pulse-dot" />
              Online · knows your journey
            </p>
          </div>
          {aiPractice && (
            <span className="hidden rounded-full bg-cyan-soft px-3 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-cyan sm:block">
              Practice mode
            </span>
          )}
          <button
            onClick={() => aiClear()}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-sec px-3 py-2 text-[11.5px] font-bold text-fg-sec transition hover:text-red"
            title="Clear chat"
          >
            <Eraser className="size-4" /> Clear
          </button>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 pb-8">
          {aiMessages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn("flex gap-2.5", m.role === "user" && "justify-end")}
            >
              {m.role === "assistant" && <AIAvatar size={30} />}
              <div className={cn("max-w-[86%] sm:max-w-[78%]", m.role === "user" && "flex flex-col items-end")}>
                <div
                  className={cn(
                    "rounded-3xl px-4 py-3.5",
                    m.role === "assistant"
                      ? "rounded-tl-lg border border-primary/20 bg-primary-faint"
                      : "rounded-br-lg bg-gradient-to-br from-primary to-primary-strong shadow-lift"
                  )}
                >
                  <RichText text={m.text} light={m.role === "user"} />
                  {streamingId === m.id && <span className="ml-0.5 inline-block h-4 w-[7px] animate-pulse rounded-sm bg-primary align-middle" />}
                  {m.quiz && <QuizCard msg={m} onAnswer={answerQuiz} />}
                  {m.words && <WordCards words={m.words} />}
                  {m.progress && <ProgressCard items={m.progress} />}
                  {m.actions && <ActionRow actions={m.actions} />}
                </div>
                <p className={cn("mt-1 px-1 text-[10px] font-semibold text-fg-ter", m.role === "user" && "text-right")}>
                  {m.role === "assistant" ? "Lingo" : "You"} · {m.time}
                </p>
              </div>
            </motion.div>
          ))}

          {/* welcome quick chips */}
          {!hasUserMsg && !typing && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="ml-10 flex flex-wrap gap-2">
              {QUICK_CHIPS.map((c, i) => (
                <motion.button
                  key={c.label}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * 0.05 }}
                  onClick={() => void send(c.label)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/35 bg-card px-3.5 py-2 text-[12px] font-bold text-fg shadow-card transition hover:border-primary hover:text-primary"
                >
                  <I k={c.icon} className="size-3.5 text-primary" /> {c.label}
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* typing indicator */}
          {typing && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5">
              <AIAvatar size={30} />
              <div className="flex min-w-[68px] items-center gap-1.5 rounded-3xl rounded-tl-lg border border-primary/20 bg-primary-faint px-4 py-3.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 rounded-full bg-primary anim-pulse-dot" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* suggestion pills */}
      <AnimatePresence>
        {pillsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="relative z-10 overflow-hidden border-t border-border/60 bg-card/70 backdrop-blur"
          >
            <div className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar">
              {pills.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 py-2 text-[11.5px] font-bold text-fg-sec transition hover:border-primary/60 hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* input */}
      <div className="relative z-10 border-t border-border/60 bg-card/80 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 pt-3">
          <button
            onClick={() => setPillsOpen(!pillsOpen)}
            className={cn("grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl transition", pillsOpen ? "bg-gold/20 text-gold" : "bg-bg-sec text-fg-sec hover:text-gold")}
            title="Suggestions"
          >
            {pillsOpen ? <ChevronUp className="size-5" /> : <Lightbulb className="size-5" />}
          </button>
          <div className={cn(
            "flex min-h-11 flex-1 items-center rounded-2xl border-2 transition-all",
            input ? "border-primary/60 bg-card" : "border-border bg-bg-sec/60",
            "focus-within:border-primary/60 focus-within:bg-card focus-within:shadow-[0_0_0_4px_var(--primary-faint)]"
          )}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              rows={1}
              placeholder={aiPractice ? "Reply in English — Lingo will correct you…" : "Ask Lingo anything…"}
              className="max-h-28 w-full resize-none bg-transparent px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-ter"
            />
          </div>
          {input.trim() ? (
            <motion.button
              initial={{ scale: 0.6 }} animate={{ scale: 1 }}
              onClick={() => void send(input)}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-lift transition hover:brightness-110"
            >
              <Send className="size-4.5 -translate-x-px translate-y-px" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onPointerDown={(event) => { event.preventDefault(); startHold(); }}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onPointerLeave={endHold}
              onContextMenu={(event) => event.preventDefault()}
              disabled={recordingBusy && !recording}
              aria-label={recording ? "Release to transcribe speech" : recordingBusy ? "Preparing microphone or transcribing" : "Press and hold to speak"}
              title={recording ? "Release to transcribe" : recordingBusy ? "Processing speech…" : "Press and hold to speak"}
              animate={recording ? { scale: [1, 1.12, 1] } : {}}
              transition={{ repeat: recording ? Infinity : 0, duration: 0.9 }}
              className={cn(
                "relative grid size-11 shrink-0 touch-none cursor-pointer place-items-center rounded-2xl text-white transition disabled:cursor-wait disabled:opacity-70",
                recording ? "bg-red shadow-[0_0_30px_rgba(255,107,107,0.6)]" : "bg-gradient-to-br from-cyan to-[#009fa0] shadow-glow-cyan"
              )}
            >
              {recording && <span className="absolute inset-0 rounded-2xl bg-red/50 anim-ping-slow" />}
              {recordingBusy && !recording ? <Loader2 className="relative size-5 animate-spin" /> : <Mic className="relative size-5" />}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────── FLOATING AI BUTTON ─────────── */
export function AIFab() {
  const { aiOpen, aiBadge, setAIOpen, setAIPrompt, openPage, openLesson, completed } = useApp();
  const [menu, setMenu] = useState(false);
  const holdRef = useRef<number>(0);

  if (aiOpen) return null;

  const down = () => { holdRef.current = window.setTimeout(() => setMenu(true), 480); };
  const up = () => {
    window.clearTimeout(holdRef.current);
    if (!menu) setAIOpen(true);
  };

  const actions = [
    { icon: BarChart3, label: "My stats", go: () => openPage("stats") },
    { icon: BookOpen, label: "Next lesson", go: () => {
      const cur = lessonIndexer(completed).find((l) => l.status === "current");
      if (cur) openLesson(cur.lesson);
    } },
    { icon: MessagesSquare, label: "Practice English", go: () => { setAIPrompt("Practice English"); setAIOpen(true); } },
  ];

  return (
    <>
      <AnimatePresence>
        {menu && (
          <>
            <motion.div className="fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="fixed bottom-[156px] right-4 z-[61] flex w-48 flex-col gap-1 rounded-3xl border border-border bg-card p-2 shadow-lift lg:bottom-24 lg:right-8"
            >
              <p className="px-3 pb-1 pt-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-fg-ter">Quick actions</p>
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => { setMenu(false); a.go(); }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left font-display text-[13px] font-bold text-fg transition hover:bg-primary-faint hover:text-primary"
                >
                  <a.icon className="size-4 text-primary" /> {a.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={() => window.clearTimeout(holdRef.current)}
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.3 }}
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
        className="fixed bottom-24 right-4 z-[49] grid size-14 cursor-pointer place-items-center rounded-full text-white shadow-glow lg:bottom-8 lg:right-8"
        style={{ background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
        title="Ask Lingo AI"
      >
        <span className="absolute inset-0 rounded-full bg-primary/40 anim-ping-slow" />
        <Sparkles className="relative size-6" strokeWidth={2.2} />
        {aiBadge && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-red ring-2 ring-bg">
            <span className="size-1.5 rounded-full bg-white anim-pulse-dot" />
          </span>
        )}
      </motion.button>
    </>
  );
}
