import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Headphones, Loader2, Mic, MicOff, Radio, ShieldCheck, Users, Video } from "lucide-react";
import type { VoiceRoom } from "../data/mock";
import { useApp } from "../store/store";
import { backendReady, getSessionUserId } from "../lib/backend";
import { roomService } from "../lib/supabase";
import { isZegoConfigured, kitToken, loadZegoUIKitPrebuilt } from "../lib/zego";
import type { ZegoUIKitPrebuilt } from "../lib/zego";

/** Shared real Zego experience for Supabase-backed voice, video and live-stream rooms. */
export default function ZegoRoomSession({ room }: { room: VoiceRoom }) {
  const box = useRef<HTMLDivElement>(null);
  const zpRef = useRef<ZegoUIKitPrebuilt | null>(null);
  const joinedRef = useRef(false);
  const leavingRef = useRef(false);
  const { closeRoom, user } = useApp();
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [participantCount, setParticipantCount] = useState(Math.max(1, room.speakerCount + room.listeners));
  const [error, setError] = useState<string | null>(null);

  const uid = getSessionUserId();
  const backendId = room.backendId || room.id;
  const zegoRoomId = room.zegoRoomId || room.id.replace(/-/g, "");
  const roomMode = room.roomMode || "VOICE";
  const isStream = roomMode === "STREAM";
  const isVideo = roomMode === "VIDEO";
  const isHost = room.backendHostId === uid;
  const membershipRole = isHost ? "HOST" : isStream ? "LISTENER" : "SPEAKER";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    let alive = true;
    let connectTimeout: number | undefined;

    const finishAndClose = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setConnected(false);
      setMicOn(false);
      if (joinedRef.current && uid) {
        joinedRef.current = false;
        void roomService.leaveRoom(backendId, uid).catch((e) => console.warn("Room leave sync failed:", e));
      }
      closeRoom();
    };

    const connect = async () => {
      if (!backendReady() || !uid) {
        setError("Sign in to join a real room.");
        setConnecting(false);
        return;
      }
      if (!isZegoConfigured()) {
        setError("ZEGO is not configured for this build. Add the public App ID and server-side ZEGO_SERVER_SECRET, then reload.");
        setConnecting(false);
        return;
      }
      const container = box.current;
      if (!container) return;

      try {
        // Idempotent membership check also enforces capacity for rooms and stream audiences.
        await roomService.joinRoom(backendId, uid, membershipRole);
        if (!alive) {
          void roomService.leaveRoom(backendId, uid).catch(() => undefined);
          return;
        }
        joinedRef.current = true;

        const token = await kitToken(
          zegoRoomId,
          uid,
          user.displayName || "Learner",
          !isStream || isHost,
          undefined,
          backendId,
        );
        if (!alive) return;
        const zego = await loadZegoUIKitPrebuilt();
        if (!alive) return;
        const zp = zego.create(token);
        zpRef.current = zp;
        const scenario = isStream
          ? {
              mode: zego.LiveStreaming,
              config: {
                role: isHost ? zego.Host : zego.Audience,
                liveStreamingMode: zego.LiveStreamingMode.RealTimeLive,
              },
            }
          : isVideo
            ? { mode: zego.VideoConference, config: { role: zego.Host } }
            : { mode: zego.GroupCall };

        zp.joinRoom({
          container,
          maxUsers: isStream ? undefined : Math.min(20, Math.max(2, room.maxParticipants || 15)),
          scenario: scenario as NonNullable<Parameters<typeof zp.joinRoom>[0]>["scenario"],
          turnOnCameraWhenJoining: isVideo || (isStream && isHost),
          turnOnMicrophoneWhenJoining: isStream && isHost,
          showPreJoinView: false,
          showMyCameraToggleButton: isVideo || (isStream && isHost),
          showMyMicrophoneToggleButton: !isStream || isHost,
          showScreenSharingButton: isVideo || (isStream && isHost),
          showTurnOffRemoteCameraButton: false,
          showTurnOffRemoteMicrophoneButton: false,
          showRoomDetailsButton: false,
          showRoomTimer: isStream,
          showTextChat: true,
          showUserList: true,
          showNonVideoUser: true,
          showOnlyAudioUser: true,
          showLayoutButton: isVideo,
          layout: "Grid",
          autoHideFooter: false,
          showLeaveRoomConfirmDialog: true,
          onJoinRoom: () => {
            if (!alive) return;
            if (connectTimeout) window.clearTimeout(connectTimeout);
            setConnecting(false);
            setConnected(true);
          },
          onLeaveRoom: finishAndClose,
          onReturnToHomeScreenClicked: finishAndClose,
          onUserJoin: (users) => setParticipantCount((n) => n + users.length),
          onUserLeave: (users) => setParticipantCount((n) => Math.max(1, n - users.length)),
          onMicrophoneStateUpdated: (state) => setMicOn(state === "ON"),
        });

        connectTimeout = window.setTimeout(() => {
          if (alive) setConnecting(false);
        }, 25_000);
      } catch (e) {
        if (joinedRef.current) {
          joinedRef.current = false;
          void roomService.leaveRoom(backendId, uid).catch(() => undefined);
        }
        setError(e instanceof Error ? e.message : "Could not connect to the live room.");
        setConnecting(false);
      }
    };

    void connect();
    return () => {
      alive = false;
      if (connectTimeout) window.clearTimeout(connectTimeout);
      const zp = zpRef.current;
      zpRef.current = null;
      if (joinedRef.current && !leavingRef.current && uid) {
        joinedRef.current = false;
        leavingRef.current = true;
        void roomService.leaveRoom(backendId, uid).catch((e) => console.warn("Room cleanup failed:", e));
      }
      try { zp?.destroy(); } catch (e) { console.warn("Zego cleanup failed:", e); }
    };
  // Room identity and signed-in user stay fixed for the lifetime of this overlay.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendId, zegoRoomId, uid]);

  const leave = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (joinedRef.current && uid) {
      joinedRef.current = false;
      void roomService.leaveRoom(backendId, uid).catch((e) => console.warn("Room leave sync failed:", e));
    }
    closeRoom();
  };

  const modeLabel = isStream ? (isHost ? "Your live broadcast" : "Live stream · audience") : isVideo ? "Video conversation" : "Voice conversation";
  const modeIcon = isStream ? <Radio className="size-3.5" /> : isVideo ? <Video className="size-3.5" /> : <Headphones className="size-3.5" />;

  return (
    <motion.div
      className="fixed inset-0 z-[155] flex flex-col overflow-hidden bg-[#0b0b16] text-white"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.25 }}
    >
      <header className="relative z-10 flex min-h-[70px] items-center gap-3 border-b border-white/10 bg-[#101020] px-4 pt-[max(8px,env(safe-area-inset-top))] sm:px-6">
        <button onClick={leave} aria-label="Leave room" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/8 text-white/80 transition hover:bg-white/15 hover:text-white">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-base font-extrabold sm:text-lg">{room.name}</h1>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-red/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-red sm:inline-flex">
              <span className="size-1.5 animate-pulse rounded-full bg-red" /> {isStream ? "ON AIR" : "LIVE"}
            </span>
          </div>
          <p className="truncate text-xs font-semibold text-white/45">{modeLabel} · {room.topic} · {room.langs[0]} ⇄ {room.langs[1]}</p>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-2 text-xs font-bold text-white/75">
            {isStream ? <Eye className="size-3.5" /> : <Users className="size-3.5" />} {participantCount}
          </span>
          {!isStream || isHost ? (
            <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-2 text-xs font-bold text-white/75">
              {micOn ? <Mic className="size-3.5 text-green" /> : <MicOff className="size-3.5 text-red" />}
              {micOn ? "Mic on" : "Muted"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-[#0b0b16]">
        <div ref={box} className="absolute inset-0 h-full w-full" />
        {!connected && !error && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#151529]/90 px-4 py-2 text-xs font-bold text-white/75 shadow-lg backdrop-blur">
              {connecting ? <Loader2 className="size-4 animate-spin text-cyan" /> : modeIcon}
              {connecting ? "Connecting to Zego…" : "Waiting for room media…"}
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#0b0b16] p-6 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-red/15 text-red"><MicOff className="size-6" /></span>
              <h2 className="mt-4 font-display text-xl font-extrabold">Could not join room</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{error}</p>
              <button onClick={leave} className="mt-6 rounded-2xl bg-primary px-5 py-3 font-display text-sm font-extrabold text-white transition hover:brightness-110">Back to rooms</button>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-white/10 bg-[#101020] px-4 py-2.5 text-center text-[11px] font-semibold text-white/40">
        <ShieldCheck className="size-3.5 shrink-0 text-green" />
        {isStream
          ? "Zego real-time live stream · audience is listen-only"
          : isVideo
            ? "Zego video conference · camera and microphone controls are available"
            : "Zego encrypted audio · camera disabled"}
      </footer>
    </motion.div>
  );
}
