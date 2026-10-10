import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, ShieldCheck, Loader2 } from "lucide-react";
import { useApp } from "../store/store";
import { getSessionUserId } from "../lib/backend";
import { Avatar, Button, Flag } from "./ui";
const ZegoCall = lazy(() => import("./ZegoCall"));
import { PostCallOverlay } from "./live";
import { useCallsStore } from "../store/calls";
import { initialsOf } from "./live";

function CallPrompt({
  title, peerName, avatarUrl, flag, level, mode, children,
}: {
  title: string; peerName: string; avatarUrl?: string | null; flag?: string | null; level?: string | null;
  mode: "VOICE" | "VIDEO"; children: ReactNode;
}) {
  return (
    <motion.div className="fixed inset-0 z-[160] grid place-items-center bg-[#0b0b16] p-5 text-white"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 40%, rgba(108,92,231,.28), transparent 58%)" }} />
      <div className="relative w-full max-w-sm rounded-[32px] border border-white/10 bg-white/[0.06] p-6 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto grid size-24 place-items-center rounded-full bg-gradient-to-br from-primary to-cyan shadow-glow">
          <Avatar initials={initialsOf(peerName)} color="#6C5CE7" size={76} src={avatarUrl} ring online />
        </div>
        <p className="mt-5 font-display text-xl font-extrabold">{title}</p>
        <p className="mt-1 flex items-center justify-center gap-2 text-sm text-white/70">
          {flag ? <Flag code={flag} size={15} /> : null}{peerName}{level ? ` · ${level}` : ""}
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/65">
          <ShieldCheck className="size-3.5 text-green" /> {mode === "VIDEO" ? "Real ZEGO video call" : "Real ZEGO voice call"}
        </p>
        {children}
      </div>
    </motion.div>
  );
}

export default function CallLayer() {
  const user = useApp((s) => s.user);
  const pushToast = useApp((s) => s.pushToast);
  const userId = getSessionUserId();
  const inboxReady = useCallsStore((s) => s.inboxReady);
  const incoming = useCallsStore((s) => s.incoming);
  const outgoing = useCallsStore((s) => s.outgoing);
  const active = useCallsStore((s) => s.active);
  const completed = useCallsStore((s) => s.completed);
  const error = useCallsStore((s) => s.error);
  const connectInbox = useCallsStore((s) => s.connectInbox);
  const clearError = useCallsStore((s) => s.clearError);
  const acceptIncoming = useCallsStore((s) => s.acceptIncoming);
  const declineIncoming = useCallsStore((s) => s.declineIncoming);
  const cancelOutgoing = useCallsStore((s) => s.cancelOutgoing);
  const cancelActive = useCallsStore((s) => s.cancelActive);
  const completeActive = useCallsStore((s) => s.completeActive);
  const addCaption = useCallsStore((s) => s.addCaption);
  const clearCompleted = useCallsStore((s) => s.clearCompleted);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let disconnect: (() => void) | undefined;
    void connectInbox(userId).then((close) => {
      if (alive) disconnect = close;
      else close();
    });
    return () => {
      alive = false;
      disconnect?.();
      useCallsStore.getState().reset();
    };
  }, [userId, connectInbox]);

  useEffect(() => {
    if (!incoming?.callId || typeof window.AudioContext === "undefined") return;
    let context: AudioContext;
    try { context = new AudioContext(); } catch { return; }
    const ring = () => {
      if (context.state === "closed") return;
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      const now = context.currentTime;
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(660, now);
      tone.frequency.setValueAtTime(520, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      tone.connect(gain);
      gain.connect(context.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(now);
      tone.stop(now + 0.38);
    };
    ring();
    const interval = window.setInterval(ring, 1_450);
    return () => {
      window.clearInterval(interval);
      void context.close().catch(() => undefined);
    };
  }, [incoming?.callId]);

  useEffect(() => {
    if (!error) return;
    pushToast({ title: "Arama", desc: error, icon: "video", tone: "red" });
    clearError();
  }, [error, pushToast, clearError]);

  return (
    <AnimatePresence>
      {incoming && !active && (
        <CallPrompt key="incoming" title="Gelen arama" peerName={incoming.fromName} avatarUrl={incoming.fromAvatarUrl}
          flag={incoming.fromFlag} level={incoming.fromLevel} mode={incoming.mode}>
          <div className="mt-6 flex gap-3">
            <Button variant="danger" className="h-12 flex-1" onClick={() => { void declineIncoming().catch((e) => pushToast({ title: "Arama", desc: e.message, tone: "red" })); }}>
              <PhoneOff className="size-4" /> Reddet
            </Button>
            <Button variant="secondary" className="h-12 flex-1" onClick={() => { void acceptIncoming().catch((e) => pushToast({ title: "Arama açılamadı", desc: e.message, tone: "red" })); }}>
              {incoming.mode === "VIDEO" ? <Video className="size-4" /> : <Phone className="size-4" />} Kabul et
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">Kabul edince ZEGO çağrı ekranına geçeceksin. Canlı altyazı isteğe bağlıdır.</p>
        </CallPrompt>
      )}

      {outgoing && !active && (
        <CallPrompt key="outgoing" title="Aranıyor…" peerName={outgoing.peer.name} avatarUrl={outgoing.peer.avatarUrl}
          flag={outgoing.peer.flag} level={outgoing.peer.level} mode={outgoing.mode}>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-white/60">
            <Loader2 className="size-4 animate-spin text-cyan" /> Karşı tarafın yanıtı bekleniyor
          </div>
          <Button variant="danger" className="mt-5 h-12 w-full" onClick={() => { void cancelOutgoing().catch(() => undefined); }}>
            <PhoneOff className="size-4" /> Aramayı iptal et
          </Button>
          {!inboxReady && <p className="mt-3 text-[11px] text-gold">Arama bildirim servisi yeniden bağlanıyor…</p>}
        </CallPrompt>
      )}

      {active && (
        <Suspense fallback={<div className="fixed inset-0 z-[152] grid place-items-center bg-[#0b0b16] text-sm font-bold text-white/70"><Loader2 className="mr-2 size-4 animate-spin" />Preparing ZEGO call…</div>}>
          <ZegoCall
            key={active.callId}
            roomId={active.roomId}
            callId={active.source === "DIRECT" ? active.callId : undefined}
            userId={active.selfUserId}
            userName={user.displayName}
            partnerName={active.peer.name}
            partnerId={active.peer.id}
            voice={active.mode === "VOICE"}
            forceEnd={!!active.forceEnd}
            onCaption={addCaption}
            onCancel={() => { void cancelActive(); }}
            onLeave={(seconds, lines) => { void completeActive(seconds, lines); }}
          />
        </Suspense>
      )}

      {completed && (
        <PostCallOverlay
          key={`report-${completed.callId}`}
          seconds={completed.seconds}
          transcript={completed.transcript}
          partner={{
            name: completed.peer.name,
            initials: completed.peer.initials || initialsOf(completed.peer.name),
            avatarUrl: completed.peer.avatarUrl,
            flag: completed.peer.flag,
            level: completed.peer.level,
            native: completed.peer.nativeLanguage,
          }}
          onDone={clearCompleted}
        />
      )}

      {!incoming && !outgoing && !active && !completed && null}
    </AnimatePresence>
  );
}
