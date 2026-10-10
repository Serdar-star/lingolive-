import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  X, Check, Heart, Volume2, Mic, Zap, Star, Clock, BookOpen, Target, ArrowRight, RotateCcw, Trash2,
  Play, Repeat, Turtle, Rabbit, ChevronDown,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import type { Exercise, Lesson } from "../data/mock";
import { groqService } from "../lib/groq";
import { hasAudibleEnergy } from "../lib/audioSignal";
import { getSpeechLocale } from "../lib/speech";
import { getLocalPreferences, speechLocaleWithAccent, speechRateValue } from "../lib/preferences";
import { useLanguageStore } from "../store/language";
import { I } from "../components/ui";

/* ─────────── shared bits ─────────── */
const norm = (s: string) => s.toLowerCase().replace(/[.,!?'"’]/g, "").replace(/\s+/g, " ").trim();

function Question({ q, hint }: { q: string; hint?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-xl font-extrabold leading-snug tracking-tight text-white sm:text-2xl">{q}</h2>
      {hint && <p className="mt-1.5 text-sm text-white/50">{hint}</p>}
    </div>
  );
}

function Chip({
  children, onClick, tone = "idle", className, disabled,
}: {
  children: React.ReactNode; onClick?: () => void; tone?: "idle" | "selected" | "correct" | "wrong" | "used"; className?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      disabled={disabled || tone === "used"}
      className={cn(
        "cursor-pointer rounded-2xl border px-4 py-2.5 font-display text-[15px] font-bold transition-all duration-150",
        tone === "idle" && "border-white/15 bg-white/[0.06] text-white hover:border-primary/60 hover:bg-primary/20",
        tone === "selected" && "border-primary bg-primary/30 text-white shadow-lift",
        tone === "correct" && "border-green bg-green/25 text-green",
        tone === "wrong" && "border-red bg-red/25 text-red",
        tone === "used" && "cursor-default border-transparent bg-transparent text-transparent",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

/* ─────────── EXERCISE RENDERERS ─────────── */
interface ExProps {
  ex: Exercise;
  checked: null | boolean; // null = not checked
  onAnswer: (answerable: boolean) => void;
  register: (fn: () => boolean) => void; // returns isCorrect
}

function MCEx({ ex, checked, onAnswer, register }: ExProps) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { register(() => sel === ex.correct); }); // eslint-disable-line
  return (
    <div>
      <Question q={ex.question} hint={ex.explanation && checked === false ? undefined : undefined} />
      <div className="flex flex-col gap-2.5">
        {ex.options!.map((o) => {
          let tone: "idle" | "selected" | "correct" | "wrong" = "idle";
          if (checked !== null) {
            if (o === ex.correct) tone = "correct";
            else if (o === sel) tone = "wrong";
          } else if (o === sel) tone = "selected";
          return (
            <button
              key={o}
              disabled={checked !== null}
              onClick={() => { setSel(o); onAnswer(true); }}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 text-left font-display text-[15px] font-bold transition-all duration-150",
                tone === "idle" && "border-white/12 bg-white/[0.05] text-white hover:border-primary/70 hover:bg-primary/15 hover:translate-x-1",
                tone === "selected" && "border-primary bg-primary/25 text-white shadow-lift",
                tone === "correct" && "border-green bg-green/20 text-green",
                tone === "wrong" && "border-red bg-red/20 text-red"
              )}
            >
              <span className={cn(
                "grid size-6 shrink-0 place-items-center rounded-lg border text-[11px]",
                tone === "correct" ? "border-green bg-green text-white" : tone === "wrong" ? "border-red bg-red text-white" : "border-white/25 text-white/60"
              )}>
                {tone === "correct" ? <Check className="size-4" strokeWidth={3.5} /> : tone === "wrong" ? <X className="size-4" strokeWidth={3.5} /> : ex.options!.indexOf(o) + 1}
              </span>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FillEx({ ex, checked, onAnswer, register }: ExProps) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { register(() => sel === ex.correct); }); // eslint-disable-line
  return (
    <div>
      <Question q={ex.question} />
      <div className="mb-7 rounded-2xl border border-white/12 bg-white/[0.05] p-5 text-center">
        <p className="font-display text-lg font-bold leading-relaxed text-white">
          {ex.blanks![0]}
          <span className={cn(
            "mx-1 inline-block min-w-20 rounded-lg border-b-2 px-2 pb-0.5 align-baseline",
            checked === null
              ? sel ? "border-primary bg-primary/25 text-white" : "border-dashed border-white/40 text-white/30"
              : sel === ex.correct ? "border-green bg-green/20 text-green" : "border-red bg-red/20 text-red"
          )}>
            {sel ?? "_____"}
          </span>
          {ex.blanks![1]}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        {ex.words!.map((w) => (
          <Chip key={w} disabled={checked !== null} tone={w === sel ? "selected" : "idle"} onClick={() => { setSel(w); onAnswer(true); }}>
            {w}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function ArrangeEx({ ex, checked, onAnswer, register }: ExProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const words = ex.words!;
  useEffect(() => {
    register(() => picked.map((i) => words[i]).join(" ") === ex.correctArr!.join(" "));
  }); // eslint-disable-line
  const toggle = (i: number) => {
    if (checked !== null) return;
    setPicked((p) => {
      const next = p.includes(i) ? p.filter((x) => x !== i) : [...p, i];
      onAnswer(next.length > 0);
      return next;
    });
  };
  const isCorrectOrder = checked !== null && picked.map((i) => words[i]).join(" ") === ex.correctArr!.join(" ");
  return (
    <div>
      <Question q={ex.question} />
      <div className={cn(
        "mb-8 flex min-h-[92px] flex-wrap content-start items-start gap-2 rounded-2xl border-2 border-dashed p-4 transition-colors",
        checked === null ? "border-white/25 bg-white/[0.04]" : isCorrectOrder ? "border-green/60 bg-green/10" : "border-red/60 bg-red/10"
      )}>
        {picked.length === 0 && <p className="self-center text-sm text-white/35">Tap the words below to build the sentence…</p>}
        <AnimatePresence>
          {picked.map((i) => (
            <motion.span key={i} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
              <Chip tone={checked === null ? "selected" : isCorrectOrder ? "correct" : "wrong"} onClick={() => toggle(i)}>
                {words[i]}
              </Chip>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        {words.map((w, i) => (
          <Chip key={i} tone={picked.includes(i) ? "used" : "idle"} onClick={() => toggle(i)}>
            {w}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MatchEx({ ex, checked, onAnswer, register }: ExProps) {
  const pairs = ex.pairs!;
  const [selA, setSelA] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const rightCol = useMemo(() => [...pairs].sort(() => 0.5 - Math.random()), [pairs]); // eslint-disable-line
  useEffect(() => { register(() => mistakes === 0); }); // eslint-disable-line
  useEffect(() => { onAnswer(done.size === pairs.length); if (done.size === pairs.length) onAnswer(true); }, [done, pairs.length, onAnswer]);

  const pickB = (b: string) => {
    if (!selA || done.has(b)) return;
    const partner = pairs.find((p) => p.a === selA);
    if (partner?.b === b) {
      setDone((d) => new Set([...d, selA, b]));
      setSelA(null);
    } else {
      setMistakes((m) => m + 1);
      setWrong(b);
      setTimeout(() => { setWrong(null); setSelA(null); }, 500);
    }
  };
  return (
    <div>
      <Question q={ex.question} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {pairs.map((p) => (
          <Chip
            key={p.a}
            tone={done.has(p.a) ? "correct" : selA === p.a ? "selected" : "idle"}
            onClick={() => !done.has(p.a) && setSelA(selA === p.a ? null : p.a)}
            disabled={checked !== null}
            className="w-full justify-center"
          >
            {p.a}
          </Chip>
        ))}
      </div>
      <div className="my-4 flex items-center gap-3 text-white/30">
        <span className="h-px flex-1 bg-white/15" /><span className="text-[10px] font-bold uppercase tracking-widest">match with</span><span className="h-px flex-1 bg-white/15" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {rightCol.map((p) => (
          <motion.div key={p.b} className={cn(wrong === p.b && "anim-shake")}>
            <Chip
              tone={done.has(p.b) ? "correct" : wrong === p.b ? "wrong" : "idle"}
              onClick={() => pickB(p.b)}
              disabled={checked !== null}
              className="w-full justify-center"
            >
              {p.b}
            </Chip>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs font-semibold text-white/40">{done.size / 2 | 0}/{pairs.length} pairs matched</p>
    </div>
  );
}

function speechTokens(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Word-level transcription similarity, not an acoustic pronunciation score. */
function speechMatchPercent(expected: string, recognized: string) {
  const left = speechTokens(expected);
  const right = speechTokens(recognized);
  if (!left.length || !right.length) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return Math.max(0, Math.round(100 * (1 - previous[right.length] / Math.max(left.length, right.length))));
}

function SpeakEx({ ex, onAnswer, register }: ExProps) {
  const [phase, setPhase] = useState<"idle" | "rec" | "analyzing" | "done">("idle");
  const [score, setScore] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const targetCode = useLanguageStore((s) => s.target);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sentence = ex.sentence || "";
  const speechLocale = getSpeechLocale(targetCode);

  useEffect(() => { register(() => phase === "done" && score >= 75); }); // eslint-disable-line
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const playExample = () => {
    if (!("speechSynthesis" in window) || !sentence) {
      setError("Audio playback is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const preferences = getLocalPreferences();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = speechLocaleWithAccent(speechLocale, preferences.speechAccent);
    utterance.rate = speechRateValue(preferences.speechRate);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setError("The example audio could not be played on this device."); };
    setError("");
    window.speechSynthesis.speak(utterance);
  };

  const stopRecording = () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Microphone recording is not supported here. Try a current browser over HTTPS.");
      return;
    }
    setError("");
    setTranscript("");
    setScore(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mountedRef.current) { setPhase("idle"); setError("Microphone recording failed. Check the browser permission and try again."); }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (!blob.size) { setPhase("idle"); setError("No audio was captured. Please try again."); return; }
        setPhase("analyzing");
        void (async () => {
          const hasEnergy = await hasAudibleEnergy(blob);
          if (!mountedRef.current) return;
          if (hasEnergy !== true) {
            setPhase("idle");
            setError(hasEnergy === false
              ? "This recording was silent. Speak clearly into the microphone and try again."
              : "This browser couldn't verify the recording. Use a current browser and try again.");
            return;
          }
          const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
          const recognized = await groqService.transcribeAudio(blob, `practice.${extension}`);
          if (!mountedRef.current) return;
          const text = recognized.trim();
          if (!text) { setPhase("idle"); setError("No speech was recognized. Try speaking a little louder and retry."); return; }
          setTranscript(text);
          setScore(speechMatchPercent(sentence, text));
          setPhase("done");
          onAnswer(true);
        })().catch((reason: unknown) => {
          if (!mountedRef.current) return;
          setPhase("idle");
          setError(reason instanceof Error ? reason.message : "Speech transcription failed. Please retry.");
        });
      };
      recorder.start(250);
      setPhase("rec");
      stopTimerRef.current = window.setTimeout(stopRecording, 20_000);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPhase("idle");
      setError(reason instanceof Error ? reason.message : "Microphone permission was not granted.");
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <Question q={ex.question} />
      <div className="mb-8 max-w-md rounded-3xl border border-white/12 bg-white/[0.05] p-6">
        <p className="font-display text-lg font-bold leading-relaxed text-white">"{sentence}"</p>
        <button type="button" onClick={playExample} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-cyan/15 px-3 py-1.5 text-xs font-bold text-cyan transition hover:bg-cyan/25">
          <Volume2 className="size-4" /> {speaking ? "Speaking…" : "Listen"}
        </button>
      </div>

      {phase === "done" ? (
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex max-w-md flex-col items-center">
          <div className="grid size-28 place-items-center rounded-full border-4 border-cyan bg-cyan/15">
            <div>
              <p className="font-mono text-3xl font-bold text-cyan">{score}%</p>
              <p className="text-center text-[9px] font-bold uppercase tracking-widest text-cyan/70">text match</p>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-white/75">Heard: “{transcript}”</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">This compares the transcript with the prompt; it does not score accent or pronunciation.</p>
        </motion.div>
      ) : (
        <>
          <motion.button
            type="button"
            aria-label={phase === "rec" ? "Stop recording" : "Start speaking practice"}
            disabled={phase === "analyzing"}
            onClick={() => phase === "rec" ? stopRecording() : void startRecording()}
            animate={phase === "rec" ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: phase === "rec" ? Infinity : 0, duration: 1 }}
            className={cn(
              "relative grid size-28 cursor-pointer place-items-center rounded-full text-white transition disabled:cursor-wait disabled:opacity-70",
              phase === "rec" ? "bg-red shadow-[0_0_50px_rgba(255,107,107,0.5)]" : "bg-gradient-to-br from-primary to-cyan shadow-glow"
            )}
          >
            {phase === "rec" && <span className="absolute inset-0 rounded-full bg-red/50 anim-ping-slow" />}
            {phase === "analyzing" ? (
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="size-8 rounded-full border-[3px] border-white/30 border-t-white" />
            ) : (
              <Mic className="size-10 relative" />
            )}
          </motion.button>
          {phase === "rec" && (
            <div className="mt-5 flex h-8 items-center gap-1">
              {Array.from({ length: 21 }, (_, i) => (
                <span key={i} className="w-1 rounded-full bg-cyan anim-wavebar" style={{ height: 28, animationDuration: `${0.4 + (i % 5) * 0.13}s` }} />
              ))}
            </div>
          )}
          <p className="mt-4 text-sm font-semibold text-white/55">
            {phase === "idle" ? "Tap to record; tap again to stop" : phase === "rec" ? "Recording… tap to transcribe" : "Transcribing your speech…"}
          </p>
        </>
      )}
      {error && <p role="alert" className="mt-4 max-w-md rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-xs font-semibold text-red">{error}</p>}
    </div>
  );
}

/* ─────────── LISTENING ─────────── */
function ListenEx({ ex, checked, onAnswer, register }: ExProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [speed, setSpeed] = useState(() => speechRateValue(getLocalPreferences().speechRate));
  const [audioError, setAudioError] = useState("");
  const targetCode = useLanguageStore((s) => s.target);
  const speechLocale = getSpeechLocale(targetCode);
  const sentence = ex.sentence || "";
  useEffect(() => { register(() => sel === ex.correct); }); // eslint-disable-line
  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const play = () => {
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    if (!("speechSynthesis" in window) || !sentence) {
      setAudioError("Audio playback is unavailable here. Use a current browser with speech audio to complete this listening exercise.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = speechLocaleWithAccent(speechLocale, getLocalPreferences().speechAccent);
    utterance.rate = speed;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => { setPlaying(false); setPlayed(true); };
    utterance.onerror = () => {
      setPlaying(false);
      setAudioError("The device couldn't play the example audio. Retry or use a browser/device with speech audio; answers stay locked until playback succeeds.");
    };
    setAudioError("");
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col items-center">
        <span className="mb-5 rounded-lg bg-orange/15 px-3.5 py-1.5 font-display text-[11px] font-extrabold uppercase tracking-widest text-orange">Listening</span>
        <div className="relative grid place-items-center">
          {playing && [0, 1, 2].map((r) => (
            <motion.span
              key={r}
              className="absolute size-24 rounded-full border-2 border-orange/50"
              animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 / speed, delay: r * 0.45, ease: "easeOut" }}
            />
          ))}
          <motion.button
            type="button"
            onClick={play}
            whileTap={{ scale: 0.92 }}
            className="grid size-24 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-orange to-[#e08600] text-white shadow-[0_10px_36px_-6px_rgba(255,165,2,0.6)]"
          >
            {playing ? (
              <span className="flex h-7 items-center gap-[3px]">
                {[0.5, 0.8, 0.6, 1, 0.7].map((d, i) => (
                  <span key={i} className="w-1 rounded-full bg-white anim-wavebar" style={{ height: 24, animationDuration: `${d / speed}s` }} />
                ))}
              </span>
            ) : <Play className="size-9 fill-white" />}
          </motion.button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {[{ v: 0.5, icon: Turtle }, { v: 1, icon: null }, { v: 1.5, icon: Rabbit }, { v: 2, icon: Rabbit }].map((s) => (
            <button
              key={s.v}
              type="button"
              aria-pressed={speed === s.v}
              onClick={() => setSpeed(s.v)}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-xs font-bold transition",
                speed === s.v ? "border-orange bg-orange/20 text-orange" : "border-white/15 text-white/50 hover:border-white/40"
              )}
            >
              {s.icon && <s.icon className="size-3.5" />} {s.v}x
            </button>
          ))}
          <button type="button" onClick={play} className="grid size-8 cursor-pointer place-items-center rounded-full border border-white/15 text-white/50 transition hover:border-white/40 hover:text-white" title="Replay">
            <Repeat className="size-3.5" />
          </button>
        </div>
        <p className="mt-2.5 text-xs font-semibold text-white/40">{played ? "Played — now answer below" : "Tap to listen to the sentence"}</p>
        {audioError && <p role="alert" className="mt-2 max-w-sm text-center text-xs text-gold">{audioError}</p>}
        {audioError && played && <p className="mt-2 max-w-sm rounded-xl bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/80">{sentence}</p>}
      </div>
      <h2 className="mb-5 text-center font-display text-lg font-extrabold text-white">{ex.question}</h2>
      <div className="flex flex-col gap-2.5">
        {ex.options!.map((o) => {
          let tone: "idle" | "selected" | "correct" | "wrong" = "idle";
          if (checked !== null) {
            if (o === ex.correct) tone = "correct";
            else if (o === sel) tone = "wrong";
          } else if (o === sel) tone = "selected";
          return (
            <button
              key={o}
              type="button"
              disabled={checked !== null || !played}
              onClick={() => { setSel(o); onAnswer(true); }}
              className={cn(
                "cursor-pointer rounded-2xl border-2 p-4 text-left font-display text-[14px] font-bold transition-all",
                tone === "idle" && "border-white/12 bg-white/[0.05] text-white enabled:hover:border-orange/60 enabled:hover:bg-orange/10 disabled:opacity-40",
                tone === "selected" && "border-orange bg-orange/20 text-white",
                tone === "correct" && "border-green bg-green/20 text-green",
                tone === "wrong" && "border-red bg-red/20 text-red"
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── IMAGE IDENTIFICATION ─────────── */
function ImageEx({ ex, checked, onAnswer, register }: ExProps) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { register(() => sel === ex.correct); }); // eslint-disable-line
  return (
    <div>
      <span className="mx-auto mb-5 block w-fit rounded-lg bg-pink/15 px-3.5 py-1.5 font-display text-[11px] font-extrabold uppercase tracking-widest text-pink">Identify</span>
      <h2 className="text-center font-display text-lg font-bold text-white/80">{ex.question}</h2>
      <p className="mt-1 mb-7 text-center font-mono text-[34px] font-bold tracking-wide text-gradient">{ex.target}</p>
      <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
        {ex.imageOptions!.map((o) => {
          const isSel = sel === o.icon;
          let cls = "border-white/12 bg-white/[0.05] text-white hover:border-primary/60 hover:bg-primary/15";
          if (checked !== null) {
            if (o.icon === ex.correct) cls = "border-green bg-green/20 text-green";
            else if (isSel) cls = "border-red bg-red/20 text-red";
            else cls = "border-white/10 bg-white/[0.03] text-white/40";
          } else if (isSel) cls = "border-primary bg-primary/25 text-white shadow-lift";
          return (
            <motion.button
              key={o.icon}
              whileTap={{ scale: 0.94 }}
              disabled={checked !== null}
              onClick={() => { setSel(o.icon); onAnswer(true); }}
              className={cn(
                "relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 transition-all",
                cls, checked === false && isSel && "anim-shake"
              )}
            >
              <span className="grid size-16 place-items-center rounded-3xl bg-white/[0.07]">
                <I k={o.icon} className="size-8" />
              </span>
              <span className="font-display text-[13px] font-bold">{o.label}</span>
              {checked !== null && o.icon === ex.correct && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-green text-white">
                  <Check className="size-4" strokeWidth={3.5} />
                </motion.span>
              )}
              {checked === false && isSel && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-red text-white">
                  <X className="size-4" strokeWidth={3.5} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function TranslateEx({ ex, checked, onAnswer, register }: ExProps) {
  const [val, setVal] = useState("");
  useEffect(() => { register(() => norm(val) === norm(ex.correct!)); }); // eslint-disable-line
  return (
    <div>
      <Question q={ex.question} hint={ex.hint} />
      <textarea
        value={val}
        disabled={checked !== null}
        onChange={(e) => { setVal(e.target.value); onAnswer(e.target.value.trim().length > 0); }}
        rows={3}
        placeholder="Type your translation…"
        className={cn(
          "w-full resize-none rounded-2xl border-2 bg-white/[0.05] p-4 font-display text-[15px] font-semibold text-white outline-none transition placeholder:text-white/30",
          checked === null ? "border-white/15 focus:border-primary/70" : norm(val) === norm(ex.correct!) ? "border-green bg-green/10" : "border-red bg-red/10"
        )}
      />
      <p className="mt-2 text-xs text-white/40">{val.trim().split(/\s+/).filter(Boolean).length} words</p>
    </div>
  );
}

/* ─────────── QUIT DIALOG ─────────── */
function QuitDialog({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-[180] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onStay} />
      <motion.div
        initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className="relative w-full max-w-sm rounded-[28px] border border-white/10 bg-[#1b1b33] p-7 text-center"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-red/15 text-red">
          <Heart className="size-7" fill="currentColor" strokeWidth={1} />
        </span>
        <h3 className="mt-4 font-display text-xl font-extrabold text-white">Leave this lesson?</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/55">You're doing great — your progress in this session will be lost if you quit now.</p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button onClick={onStay} className="h-13 cursor-pointer rounded-2xl bg-gradient-to-br from-primary to-primary-strong py-3.5 font-display text-[15px] font-extrabold text-white shadow-lift transition hover:brightness-110">
            Keep learning
          </button>
          <button onClick={onQuit} className="cursor-pointer rounded-2xl py-2.5 font-display text-sm font-bold text-white/45 transition hover:text-red">
            Quit lesson
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── COMPLETE SCREEN ─────────── */
function CompleteScreen({ lesson, score, xp, seconds, onDone, onRetry, onPractice }: {
  lesson: Lesson; score: number; xp: number; seconds: number; onDone: () => void; onRetry: () => void; onPractice: () => void;
}) {
  const [dispXP, setDispXP] = useState(0);
  useEffect(() => {
    confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 }, colors: ["#6C5CE7", "#00D2D3", "#F8B500", "#FF6B6B", "#fff"] });
    setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.7 } }), 350);
    setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.7 } }), 550);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setDispXP(Math.round(xp * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [xp]);
  const stars = score >= 90 ? 3 : score >= 70 ? 2 : 1;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto flex max-w-md flex-col items-center px-6 pb-16 pt-14 text-center">
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="relative grid size-36 place-items-center rounded-full"
        style={{ background: "conic-gradient(from 200deg, #6C5CE7, #00D2D3, #F8B500, #6C5CE7)" }}
      >
        <div className="grid size-[118px] place-items-center rounded-full bg-[#12122a]">
          <div>
            <p className="font-mono text-4xl font-bold text-white">{score}<span className="text-lg text-white/40">%</span></p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">accuracy</p>
          </div>
        </div>
        <span className="absolute inset-0 rounded-full bg-primary/30 anim-ping-slow" />
      </motion.div>

      <div className="mt-4 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.15, type: "spring", stiffness: 300, damping: 12 }}>
            <Star className={cn("size-9", i < stars ? "text-gold drop-shadow-[0_0_10px_rgba(248,181,0,0.6)]" : "text-white/15")} fill="currentColor" strokeWidth={0} />
          </motion.span>
        ))}
      </div>

      <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white">
        {score >= 90 ? "Outstanding!" : score >= 70 ? "Great job!" : "Lesson complete!"}
      </h2>
      <p className="mt-1.5 text-sm text-white/55">{lesson.title} — {score >= 90 ? "you mastered this topic" : "solid progress, keep going"}</p>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: "spring" }}
        className="mt-6 flex items-center gap-2 rounded-full bg-gold/15 px-6 py-3 ring-1 ring-gold/30"
      >
        <Zap className="size-6 text-gold" fill="currentColor" strokeWidth={1} />
        <span className="font-mono text-2xl font-bold text-gold">+{dispXP} XP</span>
      </motion.div>

      <div className="mt-6 grid w-full grid-cols-3 gap-2.5">
        {[
          { icon: Target, v: `${score}%`, l: "Accuracy", c: "text-green" },
          { icon: Clock, v: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, l: "Time", c: "text-cyan" },
          { icon: BookOpen, v: `+${lesson.newWords}`, l: "New words", c: "text-primary" },
        ].map((s, i) => (
          <motion.div key={s.l} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.1 }}
            className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5"
          >
            <s.icon className={cn("mx-auto size-5", s.c)} />
            <p className="mt-1.5 font-mono text-lg font-bold text-white">{s.v}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">{s.l}</p>
          </motion.div>
        ))}
      </div>

      {/* practice with real people */}
      <motion.button
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        onClick={onPractice}
        className="mt-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl p-4 text-left text-white shadow-glow-cyan transition hover:brightness-110"
        style={{ background: "linear-gradient(120deg,#00898a 0%,#00bfc0 60%,#6C5CE7 140%)" }}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20"><Mic className="size-5" /></span>
        <span className="flex-1">
          <span className="block font-display text-[13.5px] font-extrabold">Practice with real people!</span>
          <span className="block text-[11px] text-white/75">Apply what you learned — find a speaking partner now</span>
        </span>
        <ArrowRight className="size-4.5 shrink-0" />
      </motion.button>

      <div className="mt-4 flex w-full flex-col gap-2.5">
        <button onClick={onDone} className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-strong font-display text-base font-extrabold text-white shadow-glow transition hover:brightness-110">
          Collect rewards <ArrowRight className="size-5" />
        </button>
        <button onClick={onRetry} className="flex cursor-pointer items-center justify-center gap-1.5 py-2.5 font-display text-sm font-bold text-white/45 transition hover:text-white">
          <RotateCcw className="size-4" /> Practice again
        </button>
      </div>
    </motion.div>
  );
}

/* ─────────── MAIN FLOW ─────────── */
export default function LessonFlow({ lesson }: { lesson: Lesson }) {
  const { closeLesson, completeLesson, openLesson, lessonLoading, lessonError } = useApp();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [answerable, setAnswerable] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [quitting, setQuitting] = useState(false);
  const [done, setDone] = useState(false);
  const [bonusPop, setBonusPop] = useState<number>(0);
  const startRef = useRef(Date.now());
  const judgeRef = useRef<() => boolean>(() => false);

  const ex: Exercise = lesson.exercises[idx];
  const total = lesson.exercises.length;
  const correctCount = results.filter(Boolean).length;
  const perXP = total > 0 ? Math.max(1, Math.floor(lesson.xp / total)) : 0;

  const register = (fn: () => boolean) => { judgeRef.current = fn; };

  // speaking exercises auto-check once the recording analysis completes
  useEffect(() => {
    if (ex?.type === "speak" && answerable && checked === null) {
      const t = setTimeout(() => {
        const ok = judgeRef.current();
        setChecked(ok);
        setBonusPop(ok ? perXP : 0);
        if (ok) setTimeout(() => setBonusPop(0), 1300);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [answerable, ex, checked, perXP]);

  const check = () => {
    const ok = judgeRef.current();
    setChecked(ok);
    if (ok) { setBonusPop(perXP); setTimeout(() => setBonusPop(0), 1300); }
  };

  const next = () => {
    setResults((r) => [...r, checked!]);
    setChecked(null);
    setAnswerable(false);
    if (idx + 1 >= total) setDone(true);
    else setIdx(idx + 1);
  };

  const finish = () => {
    const finalScore = Math.round((results.filter(Boolean).length / total) * 100);
    const earned = Math.max(5, Math.round((lesson.xp * (finalScore / 100)) / 5) * 5);
    completeLesson(lesson, finalScore, earned);
  };

  const retry = () => {
    setIdx(0); setResults([]); setChecked(null); setAnswerable(false); setDone(false);
    startRef.current = Date.now();
  };

  const renderEx = () => {
    if (!ex) return null;
    const props: ExProps = { ex, checked, onAnswer: setAnswerable, register };
    switch (ex.type) {
      case "mc": return <MCEx key={ex.id} {...props} />;
      case "fill": return <FillEx key={ex.id} {...props} />;
      case "arrange": return <ArrangeEx key={ex.id} {...props} />;
      case "match": return <MatchEx key={ex.id} {...props} />;
      case "speak": return <SpeakEx key={ex.id} {...props} />;
      case "translate": return <TranslateEx key={ex.id} {...props} />;
      case "listen": return <ListenEx key={ex.id} {...props} />;
      case "image": return <ImageEx key={ex.id} {...props} />;
    }
  };

  const progress = total > 0 ? ((idx + (checked !== null ? 1 : 0)) / total) * 100 : 0;

  if (lessonLoading || lessonError || total === 0) return (
    <motion.div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-[#0b0b16] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center text-white shadow-2xl">
        {lessonLoading ? <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan" /> : <BookOpen className="mx-auto size-9 text-cyan" />}
        <h2 className="mt-4 font-display text-xl font-extrabold">{lessonLoading ? "Loading lesson exercises…" : "Lesson practice unavailable"}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{lessonLoading ? `Preparing topic-specific exercises for ${lesson.title}.` : lessonError ?? "This lesson does not have any exercises yet."}</p>
        {!lessonLoading && <button onClick={() => openLesson(lesson)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-display text-sm font-bold text-white"><RotateCcw className="size-4" /> Try again</button>}
        <button onClick={closeLesson} className="mx-auto mt-3 block cursor-pointer py-2 text-sm font-bold text-white/50 hover:text-white">Close lesson</button>
      </div>
    </motion.div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-[140] overflow-y-auto bg-[#0b0b16]"
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-1/3 size-96 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-0 right-10 size-72 rounded-full bg-cyan/10 blur-[120px]" />
      </div>

      {!started ? (
        <LessonIntro lesson={lesson} onStart={() => { setStarted(true); startRef.current = Date.now(); }} onClose={closeLesson} />
      ) : !done ? (
        <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-40 pt-5 sm:px-6">
          {/* header */}
          <div className="flex items-center gap-4">
            <button onClick={() => setQuitting(true)} className="grid size-10 cursor-pointer place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white">
              <X className="size-5.5" />
            </button>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/12">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-[#8b7dff] to-cyan"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
            <div className="relative flex items-center gap-1 font-mono text-sm font-bold text-gold">
              <Zap className="size-4" fill="currentColor" strokeWidth={1} />
              {correctCount * perXP}
              <AnimatePresence>
                {bonusPop > 0 && (
                  <motion.span
                    initial={{ opacity: 0, y: 4, scale: 0.7 }} animate={{ opacity: 1, y: -18, scale: 1 }} exit={{ opacity: 0, y: -30 }}
                    className="absolute -top-1 right-0 text-xs"
                  >
                    +{bonusPop}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* lesson meta */}
          <div className="mt-4 mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/35">
            <I k={lesson.icon} className="size-4 text-primary" />
            {lesson.title} · {idx + 1}/{total}
            {lesson.kind !== "lesson" && <span className="rounded bg-red/20 px-1.5 py-0.5 text-red">{lesson.kind === "boss" ? "BOSS" : "CHECKPOINT"}</span>}
          </div>

          {/* exercise */}
          <div className="mt-4 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={ex.id}
                initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {renderEx()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <CompleteScreen
          lesson={lesson}
          score={Math.round((results.filter(Boolean).length / total) * 100)}
          xp={Math.max(5, Math.round((lesson.xp * (results.filter(Boolean).length / total)) / 5) * 5)}
          seconds={Math.floor((Date.now() - startRef.current) / 1000)}
          onDone={finish}
          onRetry={retry}
          onPractice={() => { finish(); useApp.getState().setTab("live"); }}
        />
      )}

      {/* bottom action / feedback bar */}
      {!done && (
        <AnimatePresence>
          {checked === null ? (
            <motion.div
              key="check"
              initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }}
              className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[#0b0b16]/90 p-4 backdrop-blur-xl"
            >
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
                <p className="hidden text-xs font-semibold text-white/35 sm:block">
                  {ex.type === "speak" ? "Tap the mic when you're ready" : ex.type === "match" ? "Match all the pairs to continue" : "Select an answer, then check"}
                </p>
                <button
                  onClick={check}
                  disabled={!answerable || ex.type === "speak"}
                  className={cn(
                    "h-13 flex-1 cursor-pointer rounded-2xl px-8 py-3.5 font-display text-[15px] font-extrabold uppercase tracking-wider transition sm:flex-none",
                    answerable && ex.type !== "speak"
                      ? "bg-gradient-to-br from-green to-[#1db866] text-white shadow-[0_10px_30px_-6px_rgba(46,213,115,0.6)] hover:brightness-110"
                      : "cursor-not-allowed bg-white/10 text-white/30"
                  )}
                >
                  {ex.type === "speak" ? "Auto-checking" : "Check"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="feedback"
              initial={{ y: 130 }} animate={{ y: 0 }} exit={{ y: 130 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className={cn(
                "fixed inset-x-0 bottom-0 z-10 border-t-2 p-4 backdrop-blur-xl",
                checked ? "border-green bg-[#0a1f14]/95" : "border-red bg-[#210f14]/95"
              )}
            >
              <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 sm:gap-4">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", checked ? "bg-green text-[#0a1f14]" : "bg-red text-white")}>
                  {checked ? <Check className="size-6" strokeWidth={3.5} /> : <X className="size-6" strokeWidth={3.5} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-display text-lg font-extrabold", checked ? "text-green" : "text-red")}>
                    {checked ? "Correct!" : "Not quite"}
                  </p>
                  <p className="truncate text-sm text-white/60">
                    {checked
                      ? ex.explanation ?? "Nice work — keep the momentum going."
                      : ex.correctArr
                        ? `Correct order: ${ex.correctArr.join(" ")}`
                        : ex.pairs
                          ? "Some pairs were mismatched — review and retry."
                          : `Correct answer: ${ex.correct}`}
                  </p>
                </div>
                <button
                  onClick={next}
                  className={cn(
                    "h-13 cursor-pointer rounded-2xl px-10 py-3.5 font-display text-[15px] font-extrabold uppercase tracking-wider text-white transition hover:brightness-110",
                    checked ? "bg-gradient-to-br from-green to-[#1db866] shadow-[0_10px_30px_-6px_rgba(46,213,115,0.6)]" : "bg-gradient-to-br from-red to-[#d64545]"
                  )}
                >
                  {idx + 1 >= total ? "Finish" : "Continue"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {quitting && <QuitDialog onStay={() => setQuitting(false)} onQuit={closeLesson} />}
      </AnimatePresence>

      <div className="hidden"><Trash2 className="size-0" /></div>
    </motion.div>
  );
}

/* ─────────── LESSON INTRO SCREEN ─────────── */
export function LessonIntro({ lesson, onStart, onClose }: { lesson: Lesson; onStart: () => void; onClose: () => void }) {
  const [preview, setPreview] = useState(false);
  const previewWords = lesson.exercises.find((e) => e.pairs)?.pairs ?? lesson.exercises.find((e) => e.correctArr)
    ? (lesson.exercises.find((e) => e.pairs)?.pairs?.map((p) => `${p.a} — ${p.b}`) ?? lesson.exercises.find((e) => e.correctArr)!.correctArr!)
    : [];
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 pb-16 text-center">
      <button onClick={onClose} className="absolute left-4 top-5 grid size-10 cursor-pointer place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white">
        <X className="size-5" />
      </button>
      <motion.span
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 font-display text-[11px] font-extrabold uppercase tracking-widest text-primary"
      >
        {lesson.kind === "boss" ? "Boss battle" : lesson.kind === "checkpoint" ? "Checkpoint quiz" : "Up next"}
      </motion.span>
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: [0, 1.12, 1] }} transition={{ duration: 0.7, times: [0, 0.65, 1], delay: 0.1 }}
        className="mt-6 grid size-[104px] place-items-center rounded-full text-white shadow-glow"
        style={{ background: lesson.kind === "boss"
          ? "linear-gradient(135deg,#FF6B6B,#cc0000)"
          : "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
      >
        <I k={lesson.icon} className="size-12" />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="mt-6 font-display text-[30px] font-extrabold tracking-tight text-white"
      >
        {lesson.title}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/55">
        {lesson.desc}
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="mt-6 flex flex-wrap justify-center gap-2">
        {[
          { icon: Clock, t: `~${lesson.mins} min` }, { icon: BookOpen, t: `${lesson.newWords} words` }, { icon: Zap, t: `+${lesson.xp} XP` },
        ].map((p) => (
          <span key={p.t} className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-2 text-xs font-bold text-white/75">
            <p.icon className="size-3.5 text-primary" /> {p.t}
          </span>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.46 }} className="mt-3 flex flex-wrap justify-center gap-1.5">
        {["Vocabulary", "Listening", "Speaking"].map((s) => (
          <span key={s} className="rounded-lg bg-primary/15 px-2.5 py-1 text-[10.5px] font-bold text-primary">{s}</span>
        ))}
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
        onClick={onStart}
        className="mt-9 flex h-14 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-strong font-display text-base font-extrabold text-white shadow-glow"
      >
        <Play className="size-5 fill-white" /> Start Lesson
      </motion.button>
      {previewWords.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="mt-3 w-full max-w-xs">
          <button onClick={() => setPreview(!preview)} className="mx-auto flex cursor-pointer items-center gap-1 py-2 font-display text-[13px] font-bold text-primary hover:opacity-80">
            Preview words <ChevronDown className={cn("size-4 transition-transform", preview && "rotate-180")} />
          </button>
          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
              >
                <div className="space-y-1.5 p-4">
                  {previewWords.map((w) => (
                    <p key={w} className="text-[13px] font-semibold text-white/70">{w}</p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
