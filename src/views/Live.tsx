import { lazy, Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Mic, MicOff, Headphones, Users, Radio,
  Plus, X, Check, Eye, Play,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import type { VoiceRoom } from "../data/mock";
import { Card, Button, Avatar, LiveChip, Pill, Flag, Num, SectionHeader } from "../components/ui";
import { PageTitle } from "../components/layout";
import { MatchingOverlay, PostCallOverlay, initialsOf, type CallPartner } from "../components/live";
import { createQuickMatch, type QMMatch } from "../lib/quickmatch";
import { roomService, supabase } from "../lib/supabase";
import { languageFlag, mapDbVoiceRoom, type DbVoiceRoomRow } from "../lib/roomMapping";
import { getSessionUserId, backendReady, syncCallActivity } from "../lib/backend";
import { isZegoConfigured } from "../lib/zego";
import type { CallCaptionLine } from "../lib/callTypes";
const ZegoCall = lazy(() => import("../components/ZegoCall"));

type Flow = "idle" | "matching" | "call" | "post";
type LiveTab = "voice" | "video" | "streams";

/* ─────────── TAB BAR ─────────── */
function LiveTabs({ tab, setTab }: { tab: LiveTab; setTab: (t: LiveTab) => void }) {
  const tabs: { id: LiveTab; label: string; icon: typeof Mic }[] = [
    { id: "voice", label: "Voice Rooms", icon: Mic },
    { id: "video", label: "Video", icon: Video },
    { id: "streams", label: "Streams", icon: Radio },
  ];
  return (
    <div className="flex gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-card">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={cn(
            "relative flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-display text-[13px] font-bold transition-colors",
            tab === t.id ? "text-white" : "text-fg-sec hover:text-fg"
          )}
        >
          {tab === t.id && (
            <motion.span layoutId="live-tab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary-strong shadow-lift" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
          )}
          <t.icon className="relative size-4" />
          <span className="relative hidden sm:inline">{t.label}</span>
          <span className="relative sm:hidden">{t.label.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}

/* ─────────── QUICK MATCH HERO ─────────── */
function QuickMatchHero({ onStart, online }: { onStart: () => void; online: number | null }) {
  return (
    <Card className="relative overflow-hidden p-0">
      <div className="absolute inset-0" style={{ background: "linear-gradient(130deg,#191536 0%,#2a2264 55%,#0d3f4b 120%)" }} />
      <div className="absolute inset-0 dotgrid opacity-20" />
      <div className="relative grid gap-6 p-6 sm:grid-cols-2 sm:items-center sm:p-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85 backdrop-blur">
            {online === null ? <span className="size-2 rounded-full bg-white/40" /> : <span className="relative flex size-2"><span className="absolute h-full w-full animate-ping rounded-full bg-green opacity-80" /><span className="relative size-2 rounded-full bg-green" /></span>}
            {online === null ? "Online count unavailable" : <><Num value={online} /> learners online now</>}
          </span>
          <h2 className="mt-4 font-display text-[26px] font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
            Find a video partner <span className="text-gradient">in seconds</span>
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
            Smart matching pairs you with partners at your level. Earn XP for every minute you speak.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="lg" onClick={onStart} className="shadow-glow-cyan">
              <Video className="size-5" /> Match Now
            </Button>
            <div className="flex items-center gap-1">
              {[5, 15, 30].map((m) => (
                <span key={m} className="rounded-full border border-white/25 px-3 py-1.5 text-[11px] font-bold text-white/75">
                  {m} min
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="relative mx-auto grid aspect-square w-full max-w-[240px] place-items-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0 rounded-full border border-cyan/40 anim-radar" style={{ animationDelay: `${i * 0.9}s` }} />
          ))}
          <div className="absolute inset-[16%] rounded-full border border-white/10" />
          <div className="absolute inset-[34%] rounded-full border border-white/15" />
          <motion.button
            onClick={onStart}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            className="relative grid size-24 cursor-pointer place-items-center rounded-full text-white shadow-glow sm:size-28"
            style={{ background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
          >
            <span className="absolute inset-0 rounded-full bg-primary/50 anim-ping-slow" />
            <Video className="relative size-10" strokeWidth={2} />
          </motion.button>
        </div>
      </div>
    </Card>
  );
}

/* ─────────── VOICE ROOM CARD ─────────── */
function VoiceRoomCard({ room, i, onJoin, joining }: {
  room: VoiceRoom; i: number; onJoin: (room: VoiceRoom) => void; joining: boolean;
}) {
  const { joinedRooms } = useApp();
  const joined = joinedRooms.includes(room.id);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }} transition={{ delay: (i % 4) * 0.06 }}
    >
      <Card hover className="relative overflow-hidden p-5">
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: room.accent }} />
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag code={room.flags[0]} size={18} />
            <span className="text-xs font-bold text-fg-ter">⇄</span>
            <Flag code={room.flags[1]} size={18} />
            <Pill>{room.level}</Pill>
          </div>
          <div className="flex items-center gap-1.5">
            {room.isNew && <span className="rounded-full bg-pink/15 px-2 py-0.5 font-display text-[10px] font-extrabold text-pink">NEW</span>}
            <LiveChip />
          </div>
        </div>

        <h3 className="mt-3 font-display text-[17px] font-extrabold leading-snug tracking-tight text-fg">{room.name}</h3>
        <p className="mt-0.5 text-xs font-semibold text-fg-ter">
          {room.topic} · {room.langs[0]} ⇄ {room.langs[1]} · {room.duration}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {room.speakers.map((s) => (
            <div key={s.initials + s.name} className="relative flex flex-col items-center gap-1">
              <div className="relative">
                {s.speaking && <span className="absolute -inset-1 rounded-full border-2 border-green/70 anim-ping-slow" />}
                <Avatar initials={s.initials} color={s.color} size={42} src={s.avatarUrl} />
              </div>
              <span className="max-w-[52px] truncate text-[9.5px] font-bold text-fg-ter">{s.name.split(" ")[0]}</span>
              {s.muted && (
                <span className="absolute -right-0.5 top-0 grid size-4 place-items-center rounded-full bg-red text-white">
                  <MicOff className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <span className="grid size-[42px] place-items-center rounded-full bg-bg-sec font-mono text-[10px] font-bold text-fg-sec">
              +{Math.max(0, room.speakerCount - room.speakers.length)}
            </span>
            <span className="text-[9.5px] font-bold text-fg-ter">speakers</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
          <span className="flex items-center gap-3 text-[11px] font-bold text-fg-ter">
            <span className="flex items-center gap-1"><Headphones className="size-3.5" /> {room.listeners}</span>
            <span className="flex items-center gap-1"><Mic className="size-3.5" /> {room.speakerCount}</span>
          </span>
          <Button size="sm" variant={joined ? "secondary" : "primary"} disabled={joining} onClick={() => onJoin(room)}>
            {joining ? "Joining…" : joined ? "Re-enter" : "Join room"}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

/* ─────────── REAL VIDEO ROOM CARD ─────────── */
function VideoRoomCard({ room, i, onJoin, joining }: {
  room: VoiceRoom; i: number; onJoin: (room: VoiceRoom) => void; joining: boolean;
}) {
  const { joinedRooms } = useApp();
  const joined = joinedRooms.includes(room.id);
  const host = room.speakers[0];
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }} transition={{ delay: (i % 4) * 0.06 }}>
      <Card hover className="overflow-hidden p-0">
        <div className="relative flex h-32 items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${room.accent}, #17142f 88%)` }}>
          <span className="absolute -right-4 -top-10 size-36 rounded-full bg-white/10 blur-xl" />
          <Video className="relative size-12 text-white/80" strokeWidth={1.7} />
          <span className="absolute left-3 top-3"><LiveChip /></span>
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white">
            <Users className="size-3.5" /> {room.speakerCount}
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Pill className="!py-0.5 !text-[10px]">VIDEO</Pill>
            <Pill className="!py-0.5 !text-[10px]">{room.level}</Pill>
          </div>
          <h3 className="mt-2 truncate font-display text-[15px] font-extrabold text-fg">{room.name}</h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-fg-ter">{room.topic} · {room.langs[0]} ⇄ {room.langs[1]}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Avatar initials={host?.initials || "LL"} color={host?.color || room.accent} size={30} src={host?.avatarUrl} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-fg-sec">{host?.name || "Room host"} · {room.duration}</span>
            <Button size="sm" variant={joined ? "secondary" : "primary"} disabled={joining} onClick={() => onJoin(room)}>
              {joining ? "Joining…" : joined ? "Re-enter" : "Join video"}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* ─────────── REAL STREAM CARD ─────────── */
function StreamCard({ room, i, onJoin, joining }: {
  room: VoiceRoom; i: number; onJoin: (room: VoiceRoom) => void; joining: boolean;
}) {
  const { joinedRooms } = useApp();
  const joined = joinedRooms.includes(room.id);
  const host = room.speakers[0];
  const currentUserId = getSessionUserId();
  const isHost = !!currentUserId && room.backendHostId === currentUserId;
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }} transition={{ delay: (i % 3) * 0.07 }}>
      <Card hover className="overflow-hidden p-0">
        <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: `radial-gradient(circle at 72% 24%, ${room.accent}9c, transparent 34%), linear-gradient(135deg, #17132f, ${room.accent} 130%)` }}>
          <span className="absolute -bottom-16 -left-8 size-48 rounded-full bg-white/10 blur-2xl" />
          <Radio className="relative size-16 text-white/85" strokeWidth={1.5} />
          <span className="absolute left-3 top-3"><LiveChip /></span>
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
            <Eye className="size-3.5" /> {room.listeners} watching
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
            {room.duration}
          </span>
          <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} onClick={() => onJoin(room)} disabled={joining}
            aria-label={isHost ? "Open your live stream" : "Watch live stream"}
            className="absolute bottom-3 right-3 grid size-11 cursor-pointer place-items-center rounded-full bg-white text-fg shadow-lift disabled:opacity-60">
            {joining ? <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <Play className="size-5 fill-fg" />}
          </motion.button>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Avatar initials={host?.initials || "LL"} color={host?.color || room.accent} size={42} src={host?.avatarUrl} online />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14px] font-extrabold text-fg">{room.name}</p>
            <p className="truncate text-[11.5px] font-semibold text-fg-ter">{host?.name || "Room host"} · {room.topic}</p>
          </div>
          <Pill className="hidden sm:inline-flex !py-1 !text-[10px]">{room.level}</Pill>
          <Button size="sm" variant={isHost ? "soft" : "danger"} disabled={joining} onClick={() => onJoin(room)}>
            {joining ? "Joining…" : isHost ? "Manage" : joined ? "Re-enter" : "Watch"}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

const TOPICS = ["Daily Chat", "Sports", "Tech", "Movies", "Travel", "Music", "Business", "Gaming"];
const SHEET_LEVELS = ["A1–A2", "B1–B2", "C1–C2", "All levels"];
const LEVEL_TO_DB: Record<string, string> = { "A1–A2": "A1–A2", "B1–B2": "B1–B2", "C1–C2": "C1–C2", "All levels": "All levels" };
type RoomMode = "VOICE" | "VIDEO" | "STREAM";

/* ─────────── CREATE ROOM SHEET ─────────── */
function CreateRoomSheet({ onClose, onCreate, defaultType }: {
  onClose: () => void; onCreate: (r: VoiceRoom) => void; defaultType: RoomMode;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("Daily Chat");
  const [level, setLevel] = useState("B1–B2");
  const [max, setMax] = useState(10);
  const [roomType, setRoomType] = useState<RoomMode>(defaultType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, earnBadge } = useApp();
  const valid = name.trim().length >= 3;
  const typeOptions: { id: RoomMode; label: string; description: string }[] = [
    { id: "VOICE", label: "Voice", description: "Audio room" },
    { id: "VIDEO", label: "Video", description: "Camera room" },
    { id: "STREAM", label: "Stream", description: "Host + viewers" },
  ];

  const create = async () => {
    const hostId = getSessionUserId();
    if (!valid || busy) return;
    if (!backendReady() || !hostId) {
      setError("Sign in first to create a real live room.");
      return;
    }
    if (!isZegoConfigured()) {
      setError("ZEGO is not configured, so live audio/video cannot start. Set the public App ID and server-side token endpoint first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const capacity = roomType === "STREAM" ? 1000 : max;
      const data = await roomService.createRoom({
        name: name.trim(), topic, type: roomType, level: LEVEL_TO_DB[level] || level,
        language1: user.nativeLanguage, language2: user.targetLanguage,
        hostId, maxSpeakers: capacity,
      });
      earnBadge("b_host");
      const room = mapDbVoiceRoom({
        ...data,
        type: roomType,
        host_id: hostId,
        max_speakers: capacity,
        speaker_count: 1,
        listener_count: 0,
        host: {
          id: hostId, display_name: user.displayName,
          country_flag: user.flag, current_level: user.level,
        },
      } as DbVoiceRoomRow);
      onCreate(room);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the room. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = roomType === "STREAM" ? "Create a live stream" : roomType === "VIDEO" ? "Create a video room" : "Create a voice room";

  return (
    <motion.div className="fixed inset-0 z-[150] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] border-t border-border bg-card shadow-lift"
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="flex items-center justify-between px-6 pb-2 pt-3">
          <h3 className="font-display text-xl font-extrabold text-fg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec hover:bg-bg-sec"><X className="size-5" /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-fg-sec">Room type</span>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((option) => (
                <button key={option.id} type="button" onClick={() => setRoomType(option.id)} className={cn(
                  "cursor-pointer rounded-2xl border px-3 py-2.5 text-left transition",
                  roomType === option.id ? "border-primary bg-primary-faint text-primary" : "border-border bg-card text-fg-sec hover:border-primary/50"
                )}>
                  <span className="block font-display text-xs font-extrabold">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold opacity-75">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-fg-sec">{roomType === "STREAM" ? "Stream title" : "Room name"}</span>
            <input
              value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
              placeholder={roomType === "STREAM" ? "Tonight: English conversation live…" : "Evening English Practice…"}
              className="h-12 w-full rounded-2xl border-2 border-border bg-bg-sec/50 px-4 text-sm font-semibold text-fg outline-none transition placeholder:text-fg-ter focus:border-primary/60"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-bold text-fg-sec">Topic</span>
            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)} className={cn(
                  "cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold transition",
                  topic === t ? "border-primary bg-primary text-white" : "border-border text-fg-sec hover:border-primary/50"
                )}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-bold text-fg-sec">Level</span>
            <div className="flex gap-1.5">
              {SHEET_LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => setLevel(l)} className={cn(
                  "flex-1 cursor-pointer rounded-xl border py-2.5 font-display text-xs font-bold transition",
                  level === l ? "border-primary bg-primary text-white" : "border-border text-fg-sec hover:border-primary/50"
                )}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
            <span className="text-xs font-bold text-fg-sec">Pair:</span>
            <span className="flex items-center gap-1.5 rounded-full bg-bg-sec px-3 py-1.5 text-xs font-bold text-fg"><Flag code={languageFlag(user.nativeLanguage)} size={14} /> {user.nativeLanguage}</span>
            <span className="text-fg-ter">⇄</span>
            <span className="flex items-center gap-1.5 rounded-full bg-bg-sec px-3 py-1.5 text-xs font-bold text-fg"><Flag code={languageFlag(user.targetLanguage)} size={14} /> {user.targetLanguage}</span>
          </div>
          {roomType === "STREAM" ? (
            <p className="rounded-2xl border border-primary/15 bg-primary-faint px-4 py-3 text-xs font-semibold leading-relaxed text-fg-sec">
              Stream viewers join as listen-only audience. The host can start the Zego live broadcast after the room opens.
            </p>
          ) : (
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-bold">
                <span className="text-fg-sec">Room capacity</span>
                <span className="font-mono text-primary">{max}</span>
              </div>
              <input type="range" min={2} max={15} value={max} onChange={(e) => setMax(Number(e.target.value))} className="w-full accent-[#6C5CE7]" />
            </div>
          )}
          {error && <p role="alert" className="rounded-2xl bg-red/10 px-4 py-3 text-sm font-semibold text-red">{error}</p>}
          <Button size="lg" disabled={!valid || busy} onClick={create}>
            <Check className="size-5" /> {busy ? "Creating room…" : title}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── FILTER CHIPS ─────────── */
const LEVEL_FILTERS = ["All", "A1–A2", "B1–B2", "C1–C2", "Native"];
const TOPIC_FILTERS = ["All", "Chat", "Sports", "Tech", "Movies", "Travel", "Music", "Business"];

function ChipRow({ options, active, onPick }: { options: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {options.map((f) => (
        <button
          key={f}
          onClick={() => onPick(f)}
          className={cn(
            "shrink-0 cursor-pointer rounded-full border px-3.5 py-2 font-display text-[12px] font-bold transition",
            active === f ? "border-primary bg-primary text-white shadow-lift" : "border-border bg-card text-fg-sec hover:border-primary/50 hover:text-primary"
          )}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

/* ─────────── LIVE VIEW ─────────── */
export default function LiveView() {
  const [tab, setTab] = useState<LiveTab>("voice");
  const [levelF, setLevelF] = useState("All");
  const [topicF, setTopicF] = useState("All");
  const [flow, setFlow] = useState<Flow>("idle");
  const [callSecs, setCallSecs] = useState(0);
  const [callTranscript, setCallTranscript] = useState("");
  const [sheet, setSheet] = useState(false);
  const [sheetType, setSheetType] = useState<RoomMode>("VOICE");
  const [dbRooms, setDbRooms] = useState<VoiceRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomRefresh, setRoomRefresh] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const realOnline = backendReady();
  const [online, setOnline] = useState<number | null>(realOnline ? 0 : null);
  const { addXP, pushToast, progressMission, earnBadge, user, openRoom } = useApp();
  const [match, setMatch] = useState<QMMatch | null>(null);

  useEffect(() => {
    document.body.style.overflow = flow !== "idle" || sheet ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [flow, sheet]);

  // All active room kinds come from Supabase; room rows refresh via Realtime plus a safety poll.
  useEffect(() => {
    if (!backendReady()) {
      setDbRooms([]);
      setRoomsLoading(false);
      setRoomsError(null);
      return;
    }
    let alive = true;
    const loadRooms = async () => {
      try {
        const rows = await roomService.getRooms();
        if (!alive) return;
        setDbRooms((rows as DbVoiceRoomRow[]).map(mapDbVoiceRoom));
        setRoomsError(null);
      } catch (e) {
        if (!alive) return;
        setRoomsError(e instanceof Error ? e.message : "Could not load live rooms.");
      } finally {
        if (alive) setRoomsLoading(false);
      }
    };
    void loadRooms();
    const channel = getSessionUserId() ? roomService.subscribeToRooms(() => { void loadRooms(); }) : null;
    const timer = window.setInterval(() => { void loadRooms(); }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [roomRefresh]);

  // Only show a live count when it was actually read from the configured backend.
  useEffect(() => {
    if (!realOnline) { setOnline(null); return; }
    let alive = true;
    const count = async () => {
      try {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count: c, error } = await supabase.from("users")
          .select("id", { count: "exact", head: true })
          .eq("is_online", true).gt("last_seen", since);
        if (alive) setOnline(error ? null : c ?? 0);
      } catch { if (alive) setOnline(null); }
    };
    void count();
    const t = setInterval(() => void count(), 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [realOnline]);

  const endCall = (secs: number, lines: CallCaptionLine[]) => {
    setCallSecs(secs);
    const uid = getSessionUserId();
    setCallTranscript(lines.filter((line) => line.userId === uid).map((line) => line.text.trim()).filter(Boolean).join("\n"));
    if (match && uid) createQuickMatch(supabase).endMatch(uid, match).catch(() => undefined);
    setFlow(secs > 0 ? "post" : "idle");
  };
  const finishCall = () => {
    const mins = Math.floor(Math.max(0, callSecs) / 60);
    const uid = getSessionUserId();
    if (uid && callSecs > 0) {
      syncCallActivity(mins);
      earnBadge("b_call1");
      if (mins > 0) {
        addXP(mins * 6, { speaking: mins, sync: true, source: "CALL" });
        progressMission("m_call", mins);
      } else {
        useApp.setState((state) => ({ user: { ...state.user, stats: { ...state.user.stats, totalCalls: state.user.stats.totalCalls + 1 } } }));
      }
    }
    pushToast({
      title: callTranscript ? "Call report ready" : "Call ended",
      desc: callTranscript ? "The report is based on the real transcript captured during your call." : "No speech transcript was captured. Enable live captions next time to get an AI report.",
      icon: "sparkles", tone: callTranscript ? "green" : "primary",
    });
    setMatch(null);
    setCallTranscript("");
    setFlow("idle");
  };
  const cancelMatchCall = () => {
    const uid = getSessionUserId();
    if (match && uid) void createQuickMatch(supabase).endMatch(uid, match).catch(() => undefined);
    setMatch(null);
    setFlow("idle");
  };

  const handleJoinRoom = async (room: VoiceRoom) => {
    if (!room.backendRoom || !room.backendId) {
      pushToast({ title: "Sample room only", desc: "This room is not connected to a live audio service and can't be joined.", icon: "rooms", tone: "red" });
      return;
    }
    if (!isZegoConfigured()) {
      pushToast({ title: "Room media unavailable", desc: "ZEGO is not configured for live audio/video in this build.", icon: "video", tone: "red" });
      return;
    }
    const uid = getSessionUserId();
    if (!uid) {
      pushToast({ title: "Sign in required", desc: "Sign in to join this real live room.", icon: "rooms", tone: "red" });
      return;
    }
    setJoiningId(room.id);
    try {
      const role = room.backendHostId === uid ? "HOST" : room.roomMode === "STREAM" ? "LISTENER" : "SPEAKER";
      await roomService.joinRoom(room.backendId, uid, role);
      openRoom(room);
    } catch (e) {
      pushToast({
        title: "Could not join room",
        desc: e instanceof Error ? e.message : "Please try again.",
        icon: "rooms", tone: "red",
      });
    } finally {
      setJoiningId(null);
      setRoomRefresh((n) => n + 1);
    }
  };

  const rooms = dbRooms.filter((r) => (r.roomMode || "VOICE") === "VOICE");
  const videoRooms = dbRooms.filter((r) => r.roomMode === "VIDEO");
  const streamRooms = dbRooms.filter((r) => r.roomMode === "STREAM");
  const filtered = rooms.filter((r) => {
    const lvlOk = levelF === "All" || r.level === levelF || (levelF === "Native" && /^(C1|C2|Native)/i.test(r.level));
    const topic = r.topic.toLowerCase();
    const topicOk = topicF === "All" || topic.includes(topicF.toLowerCase()) ||
      (topicF === "Chat" && /daily|conversation/i.test(topic));
    return lvlOk && topicOk;
  });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Live"
        sub="Real conversations with real people, 24/7"
        right={
          <div className="flex items-center gap-2">
            <Pill className="px-3.5 py-2 text-xs">
              {online === null ? <span className="size-2 rounded-full bg-fg-ter" /> : <span className="relative flex size-2"><span className="absolute h-full w-full animate-ping rounded-full bg-green opacity-75" /><span className="relative size-2 rounded-full bg-green" /></span>}
              {online === null ? "Online count unavailable" : `${online} online`}
            </Pill>
            <Button size="icon" onClick={() => { setSheetType(tab === "streams" ? "STREAM" : tab === "video" ? "VIDEO" : "VOICE"); setSheet(true); }} title="Create a room" className="size-11 rounded-2xl">
              <Plus className="size-5" strokeWidth={2.6} />
            </Button>
          </div>
        }
      />

      <LiveTabs tab={tab} setTab={setTab} />

      <AnimatePresence mode="wait">
        {/* ═══ VOICE TAB ═══ */}
        {tab === "voice" && (
          <motion.div key="v" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-4">
            <ChipRow options={LEVEL_FILTERS} active={levelF} onPick={setLevelF} />
            <ChipRow options={TOPIC_FILTERS} active={topicF} onPick={setTopicF} />
            {!backendReady() && (
              <p className="rounded-2xl border border-border bg-card px-4 py-3 text-xs font-semibold text-fg-sec">
                Supabase is not configured. Real rooms are hidden and cannot be created or joined until the live backend is connected.
              </p>
            )}
            {roomsLoading && backendReady() && (
              <Card className="p-7 text-center">
                <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-3 text-sm font-semibold text-fg-sec">Finding live rooms…</p>
              </Card>
            )}
            {roomsError && backendReady() && (
              <Card className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="font-display text-base font-extrabold text-fg">Live rooms could not load</p>
                <p className="max-w-md text-sm text-fg-sec">{roomsError}</p>
                <Button size="sm" variant="outline" onClick={() => { setRoomsLoading(true); setRoomRefresh((n) => n + 1); }}>Try again</Button>
              </Card>
            )}
            {!roomsLoading && !roomsError && backendReady() && filtered.length === 0 && (
              <Card className="flex flex-col items-center p-8 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary-faint text-primary"><Mic className="size-6" /></span>
                <h3 className="mt-4 font-display text-lg font-extrabold text-fg">No active voice rooms yet</h3>
                <p className="mt-1 max-w-sm text-sm text-fg-sec">Start a real room; it will appear here for everyone and open a live audio call.</p>
                <Button className="mt-4" onClick={() => setSheet(true)}><Plus className="size-4" /> Create the first room</Button>
              </Card>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((r, i) => (
                <VoiceRoomCard key={r.id} room={r} i={i} onJoin={handleJoinRoom} joining={joiningId === r.id} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ VIDEO TAB ═══ */}
        {tab === "video" && (
          <motion.div key="vid" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-7">
            <QuickMatchHero onStart={() => setFlow("matching")} online={online} />
            <section className="flex flex-col gap-4">
              <SectionHeader title="Active video rooms" />
              {roomsLoading && backendReady() && (
                <Card className="p-7 text-center">
                  <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="mt-3 text-sm font-semibold text-fg-sec">Loading real video rooms…</p>
                </Card>
              )}
              {roomsError && backendReady() && (
                <Card className="flex flex-col items-center gap-3 p-6 text-center">
                  <p className="font-display text-base font-extrabold text-fg">Video rooms could not load</p>
                  <p className="max-w-md text-sm text-fg-sec">{roomsError}</p>
                  <Button size="sm" variant="outline" onClick={() => { setRoomsLoading(true); setRoomRefresh((n) => n + 1); }}>Try again</Button>
                </Card>
              )}
              {!roomsLoading && !roomsError && videoRooms.length === 0 && (
                <Card className="flex flex-col items-center p-8 text-center">
                  <span className="grid size-14 place-items-center rounded-2xl bg-primary-faint text-primary"><Video className="size-6" /></span>
                  <h3 className="mt-4 font-display text-lg font-extrabold text-fg">No active video rooms</h3>
                  <p className="mt-1 max-w-sm text-sm text-fg-sec">Create a room to start a real Zego video call. It will appear here for other signed-in learners.</p>
                  <Button className="mt-4" onClick={() => { setSheetType("VIDEO"); setSheet(true); }}><Plus className="size-4" /> Create video room</Button>
                </Card>
              )}
              {videoRooms.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {videoRooms.map((r, i) => <VideoRoomCard key={r.id} room={r} i={i} onJoin={handleJoinRoom} joining={joiningId === r.id} />)}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {/* ═══ STREAMS TAB ═══ */}
        {tab === "streams" && (
          <motion.div key="s" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-5">
            <Card className="relative overflow-hidden border-0 p-0">
              <div className="absolute inset-0" style={{ background: "linear-gradient(130deg,#191536 0%,#2a2264 55%,#0d3f4b 120%)" }} />
              <div className="absolute inset-0 dotgrid opacity-20" />
              <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                <div className="max-w-xl">
                  <Pill className="!border-white/15 !bg-white/10 !text-white"><Radio className="size-3.5" /> ZEGO LIVE</Pill>
                  <h2 className="mt-3 font-display text-2xl font-extrabold text-white">Teach live. Learn together.</h2>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">Create a real-time stream; viewers join as listen-only audience. Your room appears in this feed while it is active.</p>
                </div>
                <Button variant="secondary" size="lg" onClick={() => { setSheetType("STREAM"); setSheet(true); }} className="shrink-0">
                  <Plus className="size-5" /> Go live
                </Button>
              </div>
            </Card>
            <section className="flex flex-col gap-4">
              <SectionHeader title="Active live streams" />
              {roomsLoading && backendReady() && (
                <Card className="p-7 text-center">
                  <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="mt-3 text-sm font-semibold text-fg-sec">Finding live streams…</p>
                </Card>
              )}
              {roomsError && backendReady() && (
                <Card className="flex flex-col items-center gap-3 p-6 text-center">
                  <p className="font-display text-base font-extrabold text-fg">Live streams could not load</p>
                  <p className="max-w-md text-sm text-fg-sec">{roomsError}</p>
                  <Button size="sm" variant="outline" onClick={() => { setRoomsLoading(true); setRoomRefresh((n) => n + 1); }}>Try again</Button>
                </Card>
              )}
              {!roomsLoading && !roomsError && streamRooms.length === 0 && (
                <Card className="flex flex-col items-center p-8 text-center">
                  <span className="grid size-14 place-items-center rounded-2xl bg-primary-faint text-primary"><Radio className="size-6" /></span>
                  <h3 className="mt-4 font-display text-lg font-extrabold text-fg">Nothing is live right now</h3>
                  <p className="mt-1 max-w-sm text-sm text-fg-sec">Start the first stream. The audience will see it here and can join the live broadcast.</p>
                  <Button className="mt-4" onClick={() => { setSheetType("STREAM"); setSheet(true); }}><Radio className="size-4" /> Start a stream</Button>
                </Card>
              )}
              {streamRooms.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {streamRooms.map((r, i) => <StreamCard key={r.id} room={r} i={i} onJoin={handleJoinRoom} joining={joiningId === r.id} />)}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* overlays */}
      <AnimatePresence>
        {flow === "matching" && (
          <MatchingOverlay
            onMatched={(m) => {
              if (!m) { setFlow("idle"); return; }
              setMatch(m);
              setCallTranscript("");
              setFlow("call");
            }}
            onCancel={() => setFlow("idle")}
          />
        )}
        {flow === "call" && match && (
          <Suspense fallback={<div className="fixed inset-0 z-[152] grid place-items-center bg-[#0b0b16] text-sm font-bold text-white/70">Preparing ZEGO call…</div>}>
            <ZegoCall
              roomId={match.zegoRoom}
              backendRoomId={match.roomId}
              userId={getSessionUserId() ?? ""}
              userName={user.displayName}
              partnerName={match.partner.displayName}
              partnerId={match.partner.id}
              voice={false}
              onLeave={endCall}
              onCancel={cancelMatchCall}
            />
          </Suspense>
        )}
        {flow === "post" && (
          <PostCallOverlay
            seconds={callSecs}
            transcript={callTranscript}
            partner={match ? {
              id: match.partner.id,
              name: match.partner.displayName,
              initials: initialsOf(match.partner.displayName),
              avatarUrl: match.partner.avatarUrl,
              flag: match.partner.flag,
              level: match.partner.level,
              native: match.partner.nativeLanguage,
            } satisfies CallPartner : null}
            onDone={finishCall}
          />
        )}
        {sheet && (
          <CreateRoomSheet
            defaultType={sheetType}
            onClose={() => setSheet(false)}
            onCreate={(r) => {
              setDbRooms((current) => [r, ...current.filter((x) => x.id !== r.id)]);
              setTab(r.roomMode === "STREAM" ? "streams" : r.roomMode === "VIDEO" ? "video" : "voice");
              openRoom(r);
              setRoomRefresh((n) => n + 1);
              const label = r.roomMode === "STREAM" ? "live stream" : r.roomMode === "VIDEO" ? "video room" : "voice room";
              pushToast({ title: "Room created", desc: `Opening "${r.name}" as a real Zego ${label}.`, icon: "video", tone: "green" });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
