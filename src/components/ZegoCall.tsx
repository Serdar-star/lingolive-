import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Captions, CaptionsOff, Headphones, Loader2, PhoneOff, ShieldCheck, Video } from "lucide-react";
import { cn } from "../utils/cn";
import { Button } from "./ui";
import { genRoomId, isZegoConfigured, kitToken, loadZegoUIKitPrebuilt } from "../lib/zego";
import type { ZegoUIKitPrebuilt } from "../lib/zego";
import { CallCaptionCapture, type CaptionCaptureStatus } from "../lib/callCaptions";
import type { CallCaptionLine } from "../lib/callTypes";

export default function ZegoCall({
  roomId,
  callId,
  backendRoomId,
  userId,
  userName,
  partnerName = "Language partner",
  partnerId = "",
  voice = false,
  forceEnd = false,
  onCaption,
  onLeave,
  onCancel,
}: {
  roomId?: string;
  callId?: string;
  backendRoomId?: string;
  userId: string;
  userName: string;
  partnerName?: string;
  partnerId?: string;
  voice?: boolean;
  forceEnd?: boolean;
  onCaption?: (line: CallCaptionLine) => void;
  onLeave: (seconds: number, lines: CallCaptionLine[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const zpRef = useRef<ZegoUIKitPrebuilt | null>(null);
  const captionerRef = useRef<CallCaptionCapture | null>(null);
  const linesRef = useRef<CallCaptionLine[]>([]);
  const callStartedAtRef = useRef(0);
  const leavingRef = useRef(false);
  const joinedRef = useRef(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [lines, setLines] = useState<CallCaptionLine[]>([]);
  const [captionStatus, setCaptionStatus] = useState<CaptionCaptureStatus>("idle");
  const [captionMessage, setCaptionMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const room = roomId ?? genRoomId("call");
  const onLeaveRef = useRef(onLeave);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onLeaveRef.current = onLeave; }, [onLeave]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  const acceptCaption = useCallback((line: CallCaptionLine) => {
    if (!line?.id || !line.text?.trim()) return;
    const next = linesRef.current.some((item) => item.id === line.id)
      ? linesRef.current
      : [...linesRef.current, line].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    linesRef.current = next;
    setLines(next);
    onCaption?.(line);
  }, [onCaption]);

  const startCaptionCapture = useCallback(async () => {
    if (!captionsEnabled || !joinedRef.current) return;
    if (!captionerRef.current) {
      captionerRef.current = new CallCaptionCapture(
        room,
        userId,
        userName,
        partnerId,
        acceptCaption,
        (status, message) => {
          setCaptionStatus(status);
          if (message) setCaptionMessage(message);
        },
      );
    }
    try {
      await captionerRef.current.start();
    } catch (e) {
      setCaptionStatus("error");
      setCaptionMessage(e instanceof Error ? e.message : "Canlı altyazı açılamadı; görüşme devam ediyor.");
    }
  }, [acceptCaption, captionsEnabled, partnerId, room, userId, userName]);

  const finish = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const duration = callStartedAtRef.current
      ? Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000))
      : 0;
    let finalLines = linesRef.current;
    const captioner = captionerRef.current;
    if (captioner) {
      try {
        finalLines = await captioner.stop();
        await captioner.destroy();
      } catch (e) { console.warn("Could not flush final call captions:", e); }
      captionerRef.current = null;
    }
    linesRef.current = finalLines;
    await onLeaveRef.current(duration, finalLines);
  }, []);

  useEffect(() => {
    if (consent === null) return;
    let alive = true;
    const container = box.current;
    if (!container) return;
    if (!isZegoConfigured()) {
      setError("ZEGO App ID bu uygulama yapısında tanımlı değil.");
      return;
    }

    void (async () => {
      try {
        const token = await kitToken(room, userId, userName, true, callId, backendRoomId);
        if (!alive) return;
        const zego = await loadZegoUIKitPrebuilt();
        if (!alive) return;
        const zp = zego.create(token);
        zpRef.current = zp;
        zp.joinRoom({
          container,
          scenario: { mode: zego.OneONoneCall },
          maxUsers: 2,
          turnOnCameraWhenJoining: !voice,
          turnOnMicrophoneWhenJoining: true,
          showPreJoinView: false,
          showRoomDetailsButton: false,
          showUserList: false,
          showTextChat: false,
          showMyCameraToggleButton: !voice,
          showMyMicrophoneToggleButton: true,
          showScreenSharingButton: false,
          onJoinRoom: () => {
            if (!alive) return;
            joinedRef.current = true;
            callStartedAtRef.current = Date.now();
            setConnected(true);
            if (consent) setCaptionsEnabled(true);
          },
          onLeaveRoom: () => { void finish(); },
          onReturnToHomeScreenClicked: () => { void finish(); },
          onUserLeave: (users: unknown[]) => {
            if (users.length > 0 && joinedRef.current) void finish();
          },
        } as never);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "ZEGO araması başlatılamadı.");
      }
    })();

    return () => {
      alive = false;
      const instance = zpRef.current;
      zpRef.current = null;
      try { instance?.destroy(); } catch (e) { console.warn("ZEGO call cleanup failed:", e); }
      if (!leavingRef.current && captionerRef.current) {
        void captionerRef.current.destroy().catch((e) => console.warn("Caption cleanup failed:", e));
        captionerRef.current = null;
      }
      joinedRef.current = false;
    };
  // Consent is chosen once for this call; other controls don't restart the ZEGO room.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendRoomId, callId, consent, room, userId, userName, voice, finish]);

  useEffect(() => {
    if (!connected || callStartedAtRef.current <= 0) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - callStartedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  useEffect(() => {
    if (captionsEnabled && connected) void startCaptionCapture();
    else if (!captionsEnabled && captionerRef.current) {
      void captionerRef.current.stop().catch((e) => console.warn("Caption stop failed:", e));
    }
  }, [captionsEnabled, connected, startCaptionCapture]);

  useEffect(() => {
    if (!forceEnd) return;
    if (!joinedRef.current) onCancelRef.current();
    else void finish();
  }, [forceEnd, finish]);

  const toggleCaptions = () => {
    if (captionsEnabled) {
      setCaptionsEnabled(false);
      return;
    }
    setCaptionMessage("");
    setCaptionsEnabled(true);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const recent = lines.slice(-2);

  if (consent === null) {
    return (
      <motion.div className="fixed inset-0 z-[152] grid place-items-center overflow-y-auto bg-[#0b0b16] p-5 text-white"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[#171730] p-6 shadow-2xl sm:p-7">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/20 text-primary">
            {voice ? <Headphones className="size-8" /> : <Video className="size-8" />}
          </div>
          <h1 className="mt-5 text-center font-display text-2xl font-extrabold">{voice ? "Voice call" : "Video call"}</h1>
          <p className="mt-1 text-center text-sm text-white/60">{partnerName} ile ZEGO üzerinden gerçek arama</p>
          <div className="mt-5 rounded-2xl border border-cyan/20 bg-cyan/5 p-4 text-sm leading-relaxed text-white/70">
            <p className="flex items-center gap-2 font-bold text-white"><Captions className="size-4 text-cyan" /> Canlı altyazı ve görüşme özeti</p>
            <p className="mt-2">Altyazıyı açarsan mikrofonundan 5 saniyelik ses parçaları güvenli sunucu üzerinden Whisper'a gönderilip yazıya çevrilir. Uygulama ham sesi veya dökümü Supabase'e kaydetmez; altyazılar görüşme sırasında diğer katılımcıya anlık gönderilir.</p>
            <p className="mt-2 text-[11px] text-white/45">Aramaya altyazısız da katılabilirsin. Telaffuz puanı üretilmez; rapor yalnızca gerçekten algılanan metne dayanır.</p>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => setConsent(true)}>
              <Captions className="size-5" /> Altyazıyla katıl
            </Button>
            <Button variant="ghost" size="lg" className="!text-white/70 hover:!bg-white/10" onClick={() => setConsent(false)}>
              {voice ? <Headphones className="size-5" /> : <Video className="size-5" />} Altyazısız katıl
            </Button>
            <button onClick={onCancel} className="mt-1 cursor-pointer py-2 text-sm font-bold text-white/45 transition hover:text-white">Aramayı iptal et</button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="fixed inset-0 z-[152] bg-[#0b0b16]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div ref={box} className="absolute inset-0 h-full w-full" />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))] text-white sm:px-5">
        <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 backdrop-blur">
          <span className={cn("size-2 rounded-full", connected ? "bg-green anim-pulse-dot" : "bg-gold animate-pulse")} />
          <span className="font-mono text-xs font-bold">{mm}:{ss}</span>
          <span className="hidden text-[11px] font-semibold text-white/75 sm:inline">{partnerName}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={toggleCaptions} title={captionsEnabled ? "Stop live captions" : "Start live captions"}
            className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-[11px] font-bold backdrop-blur transition", captionsEnabled ? "border-cyan/40 bg-cyan/15 text-cyan" : "border-white/20 bg-black/40 text-white/70")}>
            {captionsEnabled ? <Captions className="size-4" /> : <CaptionsOff className="size-4" />}
            <span className="hidden sm:inline">{captionsEnabled ? "Altyazı açık" : "Altyazıyı aç"}</span>
          </button>
          <span className="hidden items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-[10px] font-bold text-white/70 sm:flex">
            <ShieldCheck className="size-3.5 text-green" /> ZEGO · {room.slice(0, 10)}
          </span>
        </div>
      </header>

      {!connected && !error && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#151529]/90 px-4 py-2 text-xs font-bold text-white/75 shadow-lg backdrop-blur">
            <Loader2 className="size-4 animate-spin text-cyan" /> ZEGO aramasına bağlanıyor…
          </span>
        </div>
      )}

      {captionsEnabled && captionsVisible && (
        <AnimatePresence>
          <motion.div key="captions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute inset-x-3 bottom-28 z-30 mx-auto flex max-w-2xl flex-col gap-2 sm:inset-x-8">
            {recent.length ? recent.map((line) => (
              <div key={line.id} className="self-center rounded-2xl border border-white/10 bg-black/70 px-4 py-2.5 text-center shadow-xl backdrop-blur-md">
                <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cyan">{line.userId === userId ? "You" : line.userName}</p>
                <p className="text-sm font-semibold leading-relaxed text-white sm:text-base">{line.text}</p>
              </div>
            )) : (
              <div className="self-center rounded-xl bg-black/55 px-3 py-2 text-center text-xs font-semibold text-white/60 backdrop-blur">
                {captionMessage || "Gerçek konuşma algılanınca altyazı burada görünecek…"}
              </div>
            )}
            {captionStatus === "error" && captionMessage && (
              <div className="pointer-events-auto self-center rounded-xl border border-red/30 bg-red/15 px-3 py-2 text-center text-[11px] font-semibold text-white">{captionMessage}</div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {error && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#0b0b16]/95 p-6 text-center text-white">
          <div className="max-w-sm">
            <h2 className="font-display text-xl font-extrabold">Arama başlatılamadı</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{error}</p>
            <Button variant="danger" className="mt-5" onClick={onCancel}><PhoneOff className="size-4" /> Geri dön</Button>
          </div>
        </div>
      )}

      {!captionsVisible && captionsEnabled && (
        <button onClick={() => setCaptionsVisible(true)} className="absolute bottom-24 right-4 z-30 grid size-11 cursor-pointer place-items-center rounded-full border border-cyan/35 bg-black/65 text-cyan backdrop-blur" aria-label="Show captions">
          <Captions className="size-5" />
        </button>
      )}
    </motion.div>
  );
}
