import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Video, ShieldCheck, Sparkles, ChevronDown, Loader2, Check, BookOpen, ArrowRight } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { getSessionUserId, backendReady } from "../lib/backend";
import { supabase } from "../lib/supabase";
import { createQuickMatch, type QMMatch, type QMStatus } from "../lib/quickmatch";
import { isZegoConfigured } from "../lib/zegoConfig";
import { groqService, type CallReport } from "../lib/groq";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar, Button, Flag, LevelBadge } from "./ui";

const AV_COLORS = ["#6C5CE7", "#00D2D3", "#F8B500", "#FF6B6B", "#1DD1A1", "#5F27CD"];
const colorFor = (id: string) => AV_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
export const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "LL";

export type CallPartner = { id?: string; name: string; initials: string; avatarUrl?: string | null; flag?: string | null; level?: string | null; native?: string | null };

/** Quick Match is real-only: no seeded people or simulated fallback calls. */
export function MatchingOverlay({ onMatched, onCancel }: { onMatched: (m: QMMatch | null) => void; onCancel: () => void }) {
  const uid = getSessionUserId();
  const [attempt, setAttempt] = useState(0);
  const hasBackend = backendReady() && !!uid;
  const canStart = hasBackend && isZegoConfigured();
  if (!canStart) {
    const message = !backendReady()
      ? "Supabase is not configured, so real partner matching is unavailable."
      : !uid
        ? "Sign in to find a real language partner."
        : "ZEGO App ID is missing; a real call cannot be started.";
    return (
      <motion.div className="fixed inset-0 z-[150] grid place-items-center bg-[#0d0d1a] p-5 text-center text-white"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
          <Video className="mx-auto size-10 text-cyan" />
          <h2 className="mt-4 font-display text-xl font-extrabold">Real matching unavailable</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{message}</p>
          <Button variant="ghost" className="mt-4 !text-white/75 hover:!bg-white/10" onClick={onCancel}>Close</Button>
        </div>
      </motion.div>
    );
  }
  return <RealMatching key={attempt} uid={uid} onRetry={() => setAttempt((n) => n + 1)} onMatched={onMatched} onCancel={onCancel} />;
}

/* ── Gerçek eşleşme: matching_queue + deterministik room/conv id'leri ── */
function RealMatching({ uid, onMatched, onCancel, onRetry }: { uid: string; onMatched: (m: QMMatch | null) => void; onCancel: () => void; onRetry: () => void }) {
  const { user } = useApp();
  const [st, setSt] = useState<QMStatus>({ status: "waiting", queueSize: 0 });
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(false);
  const matchRef = useRef<QMMatch | null>(null);

  useEffect(() => {
    let alive = true;
    let sent = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    let ch: RealtimeChannel | null = null;
    let lastWake = 0;
    const engine = createQuickMatch(supabase);
    const params = { targetLanguage: user.targetLanguage, nativeLanguage: user.nativeLanguage, level: user.level };

    const tickNow = async () => {
      if (!alive || sent) return;
      try {
        const s = await engine.tick(uid, params);
        if (!alive) return;
        setSt(s);
        if (s.status === "matched") { sent = true; matchRef.current = s.match; if (iv) clearInterval(iv); }
        else if (s.status === "error" || s.status === "not_in_queue") { if (iv) clearInterval(iv); }
      } catch (e) { console.warn("[qm] tick failed:", e); }
    };

    void (async () => {
      try {
        await engine.join(uid, params);
      } catch (e) {
        if (alive) setSt({ status: "error", message: (e as Error).message || "Could not join the queue" });
        return;
      }
      if (!alive) { await engine.leave(uid).catch(() => undefined); return; }
      try {
        ch = engine.subscribe(() => {
          const n = Date.now();
          if (n - lastWake > 400) { lastWake = n; void tickNow(); }
        });
      } catch { /* realtime bonus — interval zaten var */ }
      void tickNow();
      iv = setInterval(() => void tickNow(), 2500);
    })();

    const el = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      alive = false;
      if (iv) clearInterval(iv);
      clearInterval(el);
      if (ch) void supabase.removeChannel(ch);
      const m = matchRef.current;
      if (m && !startedRef.current) void engine.endMatch(uid, m).catch(() => undefined); // eşleşti ama aramaya girilmedi → temizle
      else if (!sent) void engine.leave(uid).catch(() => undefined);
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const partner = st.status === "matched" ? st.match.partner : st.status === "pending" ? st.partner : null;

  return (
    <motion.div
      className="fixed inset-0 z-[150] grid place-items-center overflow-hidden bg-[#0d0d1a]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 50% 40%, rgba(108,92,231,0.35), transparent 55%)" }} />
      <button onClick={onCancel} className="absolute right-5 top-5 z-10 grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20">
        <X className="size-5" />
      </button>

      <div className="relative flex flex-col items-center px-6">
        <div className="relative grid size-[300px] place-items-center sm:size-[360px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0 rounded-full border border-primary/50 anim-radar" style={{ animationDelay: `${i * 0.85}s` }} />
          ))}
          <div className="absolute inset-[18%] rounded-full border border-white/10" />
          <div className="absolute inset-[32%] rounded-full border border-white/15" />
          <span className="absolute inset-0 anim-spin-slow">
            <span className="absolute left-1/2 top-2 size-2.5 -translate-x-1/2 rounded-full bg-cyan shadow-glow-cyan" />
          </span>
          <span className="absolute inset-8 anim-spin-slow" style={{ animationDirection: "reverse" }}>
            <span className="absolute bottom-4 left-6 size-2 rounded-full bg-gold" />
          </span>

          <AnimatePresence mode="wait">
            {!partner ? (
              <motion.div key="scan" exit={{ scale: 0.4, opacity: 0 }} className="relative flex flex-col items-center">
                <div className="grid size-[84px] place-items-center rounded-full bg-gradient-to-br from-primary to-cyan shadow-glow-cyan">
                  <Video className="size-9 text-white" />
                </div>
                <p className="mt-3 font-display text-sm font-bold text-white/90">{user.firstName}</p>
              </motion.div>
            ) : (
              <motion.div key="found" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="relative flex flex-col items-center">
                <div className="flex items-center -space-x-5">
                  <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
                    <Avatar initials={user.initials} color="#6C5CE7" size={72} src={user.avatarUrl} ring />
                  </motion.div>
                  <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
                    <Avatar initials={initialsOf(partner.displayName)} color={colorFor(partner.id)} size={72} src={partner.avatarUrl} ring online />
                  </motion.div>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                  className={cn(
                    "mt-3 flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold",
                    st.status === "matched" ? "bg-green/20 text-green" : "bg-gold/20 text-gold"
                  )}
                >
                  <span className={cn("size-1.5 rounded-full anim-pulse-dot", st.status === "matched" ? "bg-green" : "bg-gold")} />
                  {st.status === "matched" ? "Match found — real partner!" : "Connecting…"}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {st.status === "error" ? (
            <motion.div key="err" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="mt-5 w-full max-w-sm rounded-3xl border border-red/30 bg-red/10 p-5 text-center backdrop-blur-xl">
              <p className="font-display text-base font-extrabold text-white">{st.message}</p>
              <div className="mt-4 flex gap-2.5">
                <Button variant="ghost" className="flex-1 !text-white/70 hover:!bg-white/10" onClick={onCancel}>Close</Button>
                <Button variant="secondary" className="flex-[2]" onClick={onRetry}>Try again</Button>
              </div>
            </motion.div>
          ) : !partner ? (
            <motion.div key="s1" exit={{ opacity: 0, y: -10 }} className="mt-6 text-center">
              <p className="font-display text-lg font-extrabold text-white">Finding your partner…</p>
              <p className="mt-1 text-sm text-white/55">
                {st.status === "waiting" ? `${st.queueSize} learner${st.queueSize === 1 ? "" : "s"} in queue · ` : ""}
                {user.nativeLanguage} ↔ {user.targetLanguage} · {user.level} · {elapsed}s
              </p>
            </motion.div>
          ) : (
            <motion.div key="s2" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-5 w-full max-w-sm rounded-3xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
                    {partner.displayName}
                    <ShieldCheck className="size-4.5 text-blue" />
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/60">
                    {partner.flag ? <Flag code={partner.flag} size={14} /> : null}
                    {partner.nativeLanguage ? `${partner.nativeLanguage} native · ` : ""}learning {user.targetLanguage}
                  </p>
                </div>
                <LevelBadge level={(partner.level ?? user.level) as never} />
              </div>
              <div className="mt-3 flex gap-2 text-center">
                {[
                  { v: st.status === "matched" ? "LIVE" : "…", l: "Handshake" },
                  { v: `${elapsed}s`, l: "Wait time" },
                  { v: partner.level ?? "—", l: "Level" },
                ].map((s) => (
                  <div key={s.l} className="flex-1 rounded-xl bg-white/[0.06] py-2">
                    <p className="font-mono text-sm font-bold text-white">{s.v}</p>
                    <p className="text-[10px] font-semibold text-white/50">{s.l}</p>
                  </div>
                ))}
              </div>
              {st.status === "matched" && (
                <div className="mt-4 flex gap-2.5">
                  <Button variant="ghost" className="flex-1 !text-white/70 hover:!bg-white/10" onClick={onCancel}>Skip</Button>
                  <Button variant="secondary" className="flex-[2]" onClick={() => { startedRef.current = true; onMatched(matchRef.current); }}>
                    <Video className="size-4.5" /> Start Video Call
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Post-call report uses only actual Whisper transcript text; no canned scores or invented metrics. */
export function PostCallOverlay({
  seconds,
  transcript,
  partner,
  onDone,
}: {
  seconds: number;
  transcript: string;
  partner?: CallPartner | null;
  onDone: () => void;
}) {
  const [report, setReport] = useState<CallReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const reportUser = useApp((s) => s.user);
  const cleanedTranscript = transcript.trim();
  const wordCount = cleanedTranscript ? (cleanedTranscript.match(/[\p{L}\p{N}']+/gu) || []).length : 0;
  const captionLines = cleanedTranscript ? cleanedTranscript.split(/\n+/).filter(Boolean).length : 0;

  useEffect(() => {
    confetti({ particleCount: 45, spread: 75, origin: { y: 0.18 }, colors: ["#6C5CE7", "#00D2D3", "#F8B500"] });
  }, []);

  useEffect(() => {
    let alive = true;
    if (!cleanedTranscript) { setReport(null); setBusy(false); setError(null); return; }
    setBusy(true);
    setError(null);
    groqService.generateCallReport(cleanedTranscript, seconds, reportUser.targetLanguage, reportUser.level, reportUser.nativeLanguage)
      .then((value) => { if (alive) setReport(value); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not create the AI report."); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [cleanedTranscript, seconds, attempt, reportUser.targetLanguage, reportUser.level, reportUser.nativeLanguage]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <motion.div className="fixed inset-0 z-[160] overflow-y-auto bg-[#0d0d1a] text-white"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8 sm:py-10">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <span className="absolute -inset-2 rounded-full bg-cyan/15 blur-xl" />
            <Avatar initials={partner?.initials ?? initialsOf(partner?.name ?? "Partner")} color="#6C5CE7" size={84} src={partner?.avatarUrl} ring />
          </div>
          <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight">Call finished</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
            {partner?.flag ? <Flag code={partner.flag} size={14} /> : null}
            {partner?.name ?? "Your language partner"}{partner?.level ? ` · ${partner.level}` : ""}
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-cyan">{mm}:{ss}</p>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#171730] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h3 className="font-display text-base font-extrabold">AI conversation report</h3>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">Based on your actual Whisper transcript in {reportUser.targetLanguage}. AI suggestions can be imperfect; pronunciation is not scored from text.</p>

          {cleanedTranscript ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/[0.05] p-3">
                  <p className="font-mono text-lg font-bold text-white">{wordCount}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Recognized words</p>
                </div>
                <div className="rounded-2xl bg-white/[0.05] p-3">
                  <p className="font-mono text-lg font-bold text-white">{captionLines}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Transcript segments</p>
                </div>
              </div>
              {busy && (
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-primary/10 p-4 text-sm font-semibold text-white/70">
                  <Loader2 className="size-4 animate-spin text-cyan" /> Analyzing the recognized conversation…
                </div>
              )}
              {error && (
                <div role="alert" className="mt-4 rounded-2xl border border-red/25 bg-red/10 p-4">
                  <p className="text-sm font-semibold text-white/80">The transcript was captured, but the AI report request failed.</p>
                  <p className="mt-1 break-words text-xs text-white/45">{error}</p>
                  <Button size="sm" variant="ghost" className="mt-2 !text-white/75 hover:!bg-white/10" onClick={() => setAttempt((v) => v + 1)}>Retry report</Button>
                </div>
              )}
              {report && (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="rounded-2xl bg-primary/10 p-4 text-sm leading-relaxed text-white/80">{report.summary}</p>
                  {!!report.strengths.length && (
                    <div>
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-green">What went well</p>
                      <ul className="flex flex-col gap-2">
                        {report.strengths.map((item, i) => <li key={`${i}-${item}`} className="flex gap-2 text-sm leading-relaxed text-white/70"><Check className="mt-0.5 size-4 shrink-0 text-green" />{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {!!report.corrections.length && (
                    <div>
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gold">Review these transcript suggestions</p>
                      <div className="flex flex-col gap-2">
                        {report.corrections.map((item, i) => (
                          <div key={`${i}-${item.said}`} className="rounded-2xl bg-white/[0.05] p-3">
                            <p className="text-xs text-white/45">Recognized: <span className="line-through decoration-red/60">{item.said}</span></p>
                            <p className="mt-1 text-sm font-bold text-white">Suggested: {item.correct}</p>
                            <p className="mt-1 text-xs leading-relaxed text-white/55">{item.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!report.useful_phrases.length && (
                    <div>
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-cyan">Useful phrases from this call</p>
                      <div className="flex flex-wrap gap-2">{report.useful_phrases.map((item, i) => <span key={`${i}-${item}`} className="rounded-full bg-cyan/10 px-3 py-1.5 text-xs font-bold text-cyan">{item}</span>)}</div>
                    </div>
                  )}
                  {report.next_practice && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-primary"><BookOpen className="size-4" /> Practice next</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-white/75">{report.next_practice}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-white/65">
              No transcript was captured, so no AI report is shown. To get a report next time, join with live captions and allow microphone access. The call itself can still work without captions.
            </div>
          )}
        </section>

        {!!cleanedTranscript && (
          <section className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <button onClick={() => setShowTranscript((v) => !v)} className="flex w-full cursor-pointer items-center justify-between p-4 text-left">
              <span className="text-sm font-bold text-white/75">Whisper transcript</span>
              <ChevronDown className={cn("size-4 text-white/45 transition-transform", showTranscript && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showTranscript && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <p className="whitespace-pre-wrap border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-white/60">{cleanedTranscript}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        <div className="mt-auto pt-6">
          <Button size="lg" className="w-full" onClick={onDone}><ArrowRight className="size-5" /> Done</Button>
        </div>
      </div>
    </motion.div>
  );
}
