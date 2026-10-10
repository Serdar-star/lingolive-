import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Phone, Video, MoreVertical, Send, Mic, Heart, MessageCircle, PenLine,
  ChevronLeft, CheckCheck, Play, Pause, Waves, Lightbulb, ThumbsUp, ShieldCheck, X,
  ImagePlus, ArrowRight, ArrowDown, Pencil, Globe2, Volume2, Loader2, Square,
  Pin, PinOff, Download,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { useChatRT, type RTMomentComment, type RTCorrection } from "../store/chatRT";
import { getSessionUserId } from "../lib/backend";
import { isSupaConfigured, supabase } from "../lib/supabase";
import { getLocalPreferences, speechLocaleWithAccent, speechRateValue } from "../lib/preferences";
import { langByName } from "../store/language";
import type { Conversation, Message, CEFR } from "../data/mock";
import { Avatar, Flag, LevelBadge, Button, WaveBars, EmptyState, Card } from "../components/ui";
import { PageTitle } from "../components/layout";
import { groqService, isGroqConfigured } from "../lib/groq";
import { hasAudibleEnergy } from "../lib/audioSignal";
import { useCallsStore } from "../store/calls";
import type { CallMode } from "../lib/callTypes";

type ChatTab = "messages" | "moments" | "corrections";

/* ═══════════ VOICE BUBBLE ═══════════ */
function VoiceBubble({ msg }: { msg: Message }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !msg.audioUrl) return;
    setPlaybackFailed(false);
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setPlaybackFailed(true);
      setPlaying(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !msg.audioUrl || !getLocalPreferences().autoPlayVoiceMessages) return;
    let active = true;
    void audio.play().catch(() => {
      if (active) { setPlaybackFailed(true); setPlaying(false); }
    });
    return () => { active = false; audio.pause(); };
  }, [msg.audioUrl]);

  return (
    <div className="w-full max-w-md rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void togglePlayback()}
          disabled={!msg.audioUrl}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
          className={cn("grid size-9 shrink-0 place-items-center rounded-full text-white transition", msg.audioUrl ? "bg-primary hover:brightness-110" : "cursor-not-allowed bg-fg-ter/40")}
        >
          {playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}
        </button>
        <WaveBars active={playing} color="bg-primary" className="scale-125" />
        <span className="font-mono text-xs font-bold text-fg-sec">{msg.duration || "0:00"}</span>
        {!msg.audioUrl && <span className="ml-auto text-[10px] font-semibold text-fg-ter">Audio unavailable</span>}
        <audio
          ref={audioRef} src={msg.audioUrl} preload="none" className="hidden"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => { setPlaybackFailed(true); setPlaying(false); }}
        />
      </div>
      {playbackFailed && <p role="alert" className="mt-2 text-[11px] font-semibold text-red">Could not play this audio file.</p>}
      {msg.text && (
        <div className="mt-2 border-t border-border pt-2">
          <button onClick={() => setShowTranscript((v) => !v)} className="cursor-pointer text-[11px] font-bold text-primary hover:underline">
            {showTranscript ? "Hide transcript" : "Whisper transcript"}
          </button>
          {showTranscript && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-fg-sec">{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

/* ═══════════ CORRECTION BUBBLE ═══════════ */
function CorrectionBubble({ msg }: { msg: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-gold/40 bg-gold/[0.07]"
    >
      <div className="flex items-center gap-1.5 border-b border-gold/25 bg-gold/10 px-4 py-2">
        <Lightbulb className="size-3.5 text-gold" />
        <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-gold">Grammar correction from you</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-fg-sec"><span className="line-through decoration-red/70 decoration-2">{msg.original}</span></p>
        <p className="mt-1 font-display text-[15px] font-bold text-fg">{msg.corrected}</p>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-fg-sec">
          <PenLine className="mt-0.5 size-3.5 shrink-0 text-primary" /> {msg.explanation}
        </p>
        <div className="mt-3 flex justify-end">
          <span className="text-[10px] font-semibold text-fg-ter">{msg.time}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════ THREAD ═══════════ */
function Thread({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>(conv.messages);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdActiveRef = useRef(false);
  const recordingRef = useRef(false);
  const holdTimerRef = useRef<number | undefined>(undefined);
  const maxRecordingTimerRef = useRef<number | undefined>(undefined);
  const recordingStartedRef = useRef(0);
  const { pushToast } = useApp();
  const { ready, openConv, closeConv, sendText, sendVoice, broadcastTyping, updateConversationPin } = useChatRT();
  const rtMsgs = useChatRT((s) => s.msgs[conv.id]);
  const rtTyping = useChatRT((s) => s.typing[conv.id]);
  const storedPin = useChatRT((s) => s.convs.find((item) => item.id === conv.id)?.isPinned);
  const isPinned = storedPin ?? conv.isPinned ?? false;
  const lastTypingPing = useRef(0);

  useEffect(() => () => {
    if (holdTimerRef.current !== undefined) window.clearTimeout(holdTimerRef.current);
    if (maxRecordingTimerRef.current !== undefined) window.clearTimeout(maxRecordingTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state === "recording") recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // open the realtime channel for cloud conversations (mock convs keep their seed messages)
  useEffect(() => {
    if (ready && conv.messages.length === 0) {
      void openConv(conv.id).catch((error) => pushToast({ title: "Chat history unavailable", desc: error instanceof Error ? error.message : "Check your connection and retry.", icon: "chat", tone: "red" }));
    }
    return () => { if (ready) closeConv(conv.id); };
  }, [ready, conv.id, conv.messages.length, openConv, closeConv, pushToast]);

  // Merge new messages and RLS-safe partner read receipts from the participant row.
  useEffect(() => {
    if (!rtMsgs) return;
    setMessages((cur) => {
      const latestById = new Map(rtMsgs.map((message) => [message.id, message]));
      let readChanged = false;
      const updated = cur.map((message) => {
        const latest = latestById.get(message.id);
        if (!latest || message.read === latest.read) return message;
        readChanged = true;
        return { ...message, read: latest.read };
      });
      const ids = new Set(cur.map((message) => message.id));
      const add = rtMsgs.filter((message) => !ids.has(message.id));
      return add.length || readChanged ? [...updated, ...add] : cur;
    });
  }, [rtMsgs]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, rtTyping]);

  const handleChange = (v: string) => {
    setText(v);
    if (ready && v.trim() && Date.now() - lastTypingPing.current > 1400) {
      lastTypingPing.current = Date.now();
      broadcastTyping(conv.id, true);
    }
    if (ready && !v.trim()) broadcastTyping(conv.id, false);
  };

  const isCloudConv = ready && conv.messages.length === 0;

  // RLS-protected REST refresh keeps incoming messages visible if private Realtime is denied.
  useEffect(() => {
    if (!isCloudConv) return;
    const timer = window.setInterval(() => {
      void openConv(conv.id).catch((error) => console.warn("Chat polling failed:", error));
    }, 7_000);
    return () => window.clearInterval(timer);
  }, [isCloudConv, conv.id, openConv]);

  const changeConversationPin = async (value: boolean) => {
    if (!isCloudConv) {
      pushToast({ title: "Real conversation required", desc: "Demo conversations do not have server-saved settings.", icon: "chat", tone: "primary" });
      setMoreOpen(false);
      return;
    }
    setMoreBusy(true);
    try {
      await updateConversationPin(conv.id, value);
      setMoreOpen(false);
      pushToast({
        title: value ? "Conversation pinned" : "Conversation unpinned",
        desc: value ? "It will stay at the top of your conversation list." : "It will return to normal sorting.",
        icon: "chat", tone: "green",
      });
    } catch (error) {
      pushToast({ title: "Setting not saved", desc: error instanceof Error ? error.message : "Check your connection and retry.", icon: "alert", tone: "red" });
    } finally {
      setMoreBusy(false);
    }
  };

  const exportConversation = async () => {
    const userId = getSessionUserId();
    if (!userId || !isCloudConv) {
      pushToast({ title: "Real conversation required", desc: "Only saved cloud conversations can be exported.", icon: "chat", tone: "primary" });
      setMoreOpen(false);
      return;
    }
    setMoreBusy(true);
    try {
      const exportData: Array<Record<string, unknown>> = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from("messages")
          .select("id, sender_id, type, content, correction, audio_duration, created_at")
          .eq("conversation_id", conv.id).order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        exportData.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
      const exportRows = exportData.map((row) => ({
        ...row,
        sender: row.sender_id === userId ? "You" : conv.user.name,
      }));
      const blob = new Blob([JSON.stringify({
        exportedAt: new Date().toISOString(),
        conversationId: conv.id,
        partner: conv.user.name,
        note: "Message text and metadata are included. Audio and image file bytes are not embedded.",
        messages: exportRows,
      }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lingolive-chat-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMoreOpen(false);
      pushToast({ title: "Chat export downloaded", desc: "Message text and metadata were exported; media files are not included.", icon: "check", tone: "green" });
    } catch (error) {
      pushToast({ title: "Chat export failed", desc: error instanceof Error ? error.message : "Check your connection and retry.", icon: "alert", tone: "red" });
    } finally {
      setMoreBusy(false);
    }
  };

  const startDirectCall = async (mode: CallMode) => {
    if (!isCloudConv || !conv.user.id) {
      pushToast({ title: "Gerçek sohbet gerekli", desc: "Demo sohbetten arama başlatılamaz. Supabase'teki gerçek bir partner sohbetini aç.", icon: "video", tone: "red" });
      return;
    }
    try {
      await useCallsStore.getState().startDirectCall({
        conversationId: conv.id,
        peer: {
          id: conv.user.id,
          name: conv.user.name,
          initials: conv.user.initials,
          avatarUrl: conv.user.avatarUrl,
          flag: conv.user.flag,
          level: conv.user.level,
          nativeLanguage: conv.user.nativeLanguage,
        },
        mode,
      });
      pushToast({ title: "Arama daveti gönderildi", desc: `${conv.user.name} yanıt verdiğinde görüşme açılacak.`, icon: "video", tone: "green" });
    } catch (error) {
      pushToast({ title: "Arama başlatılamadı", desc: error instanceof Error ? error.message : "Bağlantını kontrol edip tekrar dene.", icon: "video", tone: "red" });
    }
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (!isCloudConv) {
      pushToast({ title: "Message not sent", desc: "This conversation is not connected to the live chat service.", icon: "chat", tone: "red" });
      return;
    }
    setText("");
    broadcastTyping(conv.id, false);
    const ok = await sendText(conv.id, t);
    if (ok) return;
    setText(t);
    pushToast({ title: "Message not sent", desc: "Connection problem — your draft was restored. Try again.", icon: "chat", tone: "red" });
  };

  const stopVoiceRecording = () => {
    if (maxRecordingTimerRef.current !== undefined) window.clearTimeout(maxRecordingTimerRef.current);
    maxRecordingTimerRef.current = undefined;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const beginVoiceRecording = async () => {
    if (!holdActiveRef.current || voiceBusy || !isCloudConv) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceBusy(false);
      pushToast({ title: "Recording not supported", desc: "Use a recent browser with microphone access to record voice messages.", icon: "mic", tone: "red" });
      return;
    }
    setVoiceBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      if (!holdActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setVoiceBusy(false);
        return;
      }
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recordingRef.current = false;
        setRecording(false);
        setVoiceBusy(false);
        pushToast({ title: "Recording failed", desc: "The browser could not capture microphone audio.", icon: "mic", tone: "red" });
      };
      recorder.onstop = async () => {
        setVoiceBusy(true);
        if (maxRecordingTimerRef.current !== undefined) window.clearTimeout(maxRecordingTimerRef.current);
        maxRecordingTimerRef.current = undefined;
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recordingRef.current = false;
        setRecording(false);
        const elapsed = Math.max(1, Math.round((Date.now() - recordingStartedRef.current) / 1000));
        const contentType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: contentType });
        chunksRef.current = [];
        if (blob.size < 300) {
          setVoiceBusy(false);
          pushToast({ title: "No audio captured", desc: "Hold the microphone a little longer and try again.", icon: "mic", tone: "red" });
          return;
        }
        const energy = await hasAudibleEnergy(blob);
        if (energy !== true) {
          setVoiceBusy(false);
          pushToast({
            title: energy === false ? "No speech detected" : "Audio could not be verified",
            desc: energy === false
              ? "That recording was silent, so it wasn't sent. Try speaking closer to the microphone."
              : "This browser couldn't verify the audio, so it wasn't sent. Try a current browser.",
            icon: "mic", tone: energy === false ? "primary" : "red",
          });
          return;
        }
        let transcript = "";
        if (isGroqConfigured()) {
          try {
            const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
            transcript = (await groqService.transcribeAudio(blob, `voice-message.${extension}`)).trim();
          } catch (error) {
            console.warn("Voice note transcription failed; sending the audio without transcript", error);
          }
        }
        try {
          const sent = await sendVoice(conv.id, blob, elapsed, transcript);
          setVoiceBusy(false);
          if (!sent) {
            pushToast({ title: "Voice message not sent", desc: "Sign in to a real conversation and try again.", icon: "mic", tone: "red" });
          } else {
            pushToast({
              title: "Voice message sent",
              desc: transcript ? "Audio uploaded; Whisper transcript is available in the message." : "Audio uploaded. A transcript could not be created this time.",
              icon: "mic", tone: transcript ? "green" : "primary",
            });
          }
        } catch (error) {
          setVoiceBusy(false);
          pushToast({ title: "Voice message not sent", desc: error instanceof Error ? error.message : "Upload failed. Check your connection and try again.", icon: "mic", tone: "red" });
        }
      };
      recorder.start(200);
      recordingRef.current = true;
      setRecording(true);
      setVoiceBusy(false);
      maxRecordingTimerRef.current = window.setTimeout(() => {
        holdActiveRef.current = false;
        stopVoiceRecording();
        pushToast({ title: "Recording limit reached", desc: "Voice messages can be up to 60 seconds.", icon: "mic", tone: "primary" });
      }, 60_000);
    } catch (error) {
      setVoiceBusy(false);
      const message = error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access in your browser, then press and hold again."
        : "Could not open the microphone. Check browser permissions and try again.";
      pushToast({ title: "Microphone unavailable", desc: message, icon: "mic", tone: "red" });
    }
  };

  const startVoiceHold = () => {
    if (voiceBusy || recordingRef.current) return;
    if (!isCloudConv) {
      pushToast({ title: "Real chat required", desc: "Voice notes upload to Supabase in a real signed-in conversation.", icon: "mic", tone: "primary" });
      return;
    }
    holdActiveRef.current = true;
    holdTimerRef.current = window.setTimeout(() => { void beginVoiceRecording(); }, 260);
  };

  const endVoiceHold = () => {
    holdActiveRef.current = false;
    if (holdTimerRef.current !== undefined) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = undefined;
    if (recordingRef.current) stopVoiceRecording();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-[calc(100dvh-180px)] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:h-[calc(100dvh-140px)]"
    >
      <div className="flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <button onClick={onBack} title="Back to conversations" className="grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-bg-sec hover:text-fg">
          <ChevronLeft className="size-5" />
        </button>
        <Avatar initials={conv.user.initials} color={conv.user.color} size={42} src={conv.user.avatarUrl} online={conv.user.online} />
        <div className="flex-1">
          <p className="flex items-center gap-1.5 font-display text-[15px] font-extrabold text-fg">
            {conv.user.name}
            {conv.user.verified && <ShieldCheck className="size-4 text-blue" />}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-ter">
            <Flag code={conv.user.flag} size={13} /> {conv.user.online ? <span className="text-green">Online now</span> : "Offline"} · <LevelBadge level={conv.user.level} />
          </p>
        </div>
        <button onClick={() => { void startDirectCall("VIDEO"); }} aria-label={`Start video call with ${conv.user.name}`} title="Video call"
          className="grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-primary-faint hover:text-primary">
          <Video className="size-[18px]" />
        </button>
        <button onClick={() => { void startDirectCall("VOICE"); }} aria-label={`Start voice call with ${conv.user.name}`} title="Voice call"
          className="grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-primary-faint hover:text-primary">
          <Phone className="size-[18px]" />
        </button>
        <div className="relative">
          <button onClick={() => setMoreOpen((open) => !open)} aria-label="More conversation options" aria-haspopup="menu" aria-expanded={moreOpen} className="grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec transition hover:bg-primary-faint hover:text-primary">
            <MoreVertical className="size-[18px]" />
          </button>
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                role="menu" initial={{ opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.98 }}
                className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift"
              >
                <button role="menuitem" disabled={moreBusy} onClick={() => void changeConversationPin(!isPinned)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-fg transition hover:bg-bg-sec disabled:opacity-50">
                  {isPinned ? <PinOff className="size-4 text-primary" /> : <Pin className="size-4 text-primary" />}
                  {isPinned ? "Unpin conversation" : "Pin conversation"}
                </button>
                <button role="menuitem" disabled={moreBusy} onClick={() => void exportConversation()} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-fg transition hover:bg-bg-sec disabled:opacity-50">
                  <Download className="size-4 text-primary" /> Export chat as JSON
                </button>
                {!isCloudConv && <p className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-fg-ter">Demo chat settings cannot be saved.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg-sec/40 p-4">
        <div className="mx-auto rounded-full bg-card px-3 py-1 text-[10px] font-bold text-fg-ter shadow-card">Today</div>
        {messages.map((m) => {
          if (m.type === "correction") return <div key={m.id} className="flex justify-center"><CorrectionBubble msg={m} /></div>;
          if (m.type === "voice") return <div key={m.id} className="flex"><VoiceBubble msg={m} /></div>;
          const mine = m.type === "sent";
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                mine ? "rounded-br-md bg-gradient-to-br from-primary to-primary-strong text-white shadow-lift" : "rounded-bl-md border border-border bg-card text-fg"
              )}>
                <p>{m.text}</p>
                <p className={cn("mt-1 flex items-center justify-end gap-1 text-[9.5px] font-semibold", mine ? "text-white/60" : "text-fg-ter")}>
                  {m.time}
                  {mine && <CheckCheck className={cn("size-3.5", m.read && "text-cyan")} strokeWidth={2.6} />}
                </p>
              </div>
            </motion.div>
          );
        })}
        {rtTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <Avatar initials={conv.user.initials} color={conv.user.color} size={28} src={conv.user.avatarUrl} />
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-fg-ter anim-pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {!isCloudConv && (
        <div className="border-t border-border bg-gold/10 px-4 py-2 text-center text-[11px] font-bold text-fg-sec">
          Demo conversation — messages stay on this device. Use Quick Match to chat with a real partner.
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border bg-card p-3">
        <button
          type="button"
          onPointerDown={(event) => { event.preventDefault(); startVoiceHold(); }}
          onPointerUp={endVoiceHold}
          onPointerCancel={endVoiceHold}
          onPointerLeave={endVoiceHold}
          onContextMenu={(event) => event.preventDefault()}
          disabled={voiceBusy && !recording}
          aria-label={recording ? "Release to send voice message" : voiceBusy ? "Processing voice message" : "Press and hold to record a voice message"}
          title={recording ? "Release to send" : voiceBusy ? "Processing audio…" : "Press and hold to record"}
          className={cn("grid size-11 shrink-0 touch-none place-items-center rounded-2xl text-white transition disabled:cursor-wait disabled:opacity-70", recording ? "bg-red shadow-[0_0_22px_rgba(255,107,107,0.4)]" : "bg-primary-faint text-primary hover:bg-primary-soft")}
        >
          {voiceBusy && !recording ? <Loader2 className="size-5 animate-spin" /> : recording ? <Square className="size-4 fill-white" /> : <Mic className="size-5" />}
        </button>
        <input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message ${conv.user.name.split(" ")[0]} in English…`}
          className="h-11 flex-1 rounded-2xl border border-border bg-bg-sec/60 px-4 text-sm text-fg outline-none transition placeholder:text-fg-ter focus:border-primary/60 focus:bg-card"
        />
        <Button size="icon" onClick={send} disabled={!text.trim()} className="size-11 rounded-2xl">
          <Send className="size-4.5 -translate-x-px translate-y-px" />
        </Button>
      </div>
    </motion.div>
  );
}

/* ═══════════ CONVERSATION LIST ═══════════ */
function ConvList({ onOpen }: { onOpen: (c: Conversation) => void }) {
  const [q, setQ] = useState("");
  const [banner, setBanner] = useState(true);
  const { convs, ready, conversationsLoading, conversationsError, loadConversations } = useChatRT();
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  const query = q.trim().toLocaleLowerCase();
  const list = (ready ? convs : []).filter((c) => !query || `${c.user.name} ${c.lastMessage}`.toLocaleLowerCase().includes(query));
  return (
    <div className="flex flex-col gap-2">
      <div className="relative mb-1">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-ter" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search conversations…"
          className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm outline-none transition placeholder:text-fg-ter focus:border-primary/60"
        />
      </div>
      {banner && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-1 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-primary-strong p-3.5 text-white shadow-lift">
          <Globe2 className="size-5 shrink-0" />
          <p className="flex-1 text-[12.5px] font-bold">Find new language partners to practice with</p>
          <button onClick={() => useApp.getState().setTab("live")} className="shrink-0 cursor-pointer rounded-full bg-white px-3 py-1.5 font-display text-[11px] font-extrabold text-primary">Browse</button>
          <button onClick={() => setBanner(false)} className="shrink-0 cursor-pointer text-white/70 hover:text-white"><X className="size-4" /></button>
        </motion.div>
      )}
      {list.map((c, i) => (
        <motion.button
          key={c.id}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          onClick={() => onOpen(c)}
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition hover:border-border hover:bg-card hover:shadow-card"
        >
          <Avatar initials={c.user.initials} color={c.user.color} size={50} src={c.user.avatarUrl} online={c.user.online} verified={c.user.verified} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 truncate font-display text-[14.5px] font-extrabold text-fg">
                {c.isPinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Pinned" />}
                <span className="truncate">{c.user.name}</span>
              </p>
              <span className={cn("shrink-0 text-[10.5px] font-bold", c.unread ? "text-primary" : "text-fg-ter")}>{c.time}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className={cn("truncate text-[12.5px]", c.unread ? "font-bold text-fg" : "text-fg-sec")}>{c.lastMessage}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.unread === 0 && <CheckCheck className="size-3.5 text-blue" strokeWidth={2.4} />}
                <Flag code={c.user.flag} size={14} />
                {c.unread > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-strong font-mono text-[10px] font-bold text-white shadow-lift">{c.unread}</span>
                )}
              </div>
            </div>
          </div>
        </motion.button>
      ))}
      {conversationsLoading && <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-primary" /></div>}
      {!conversationsLoading && conversationsError && (
        <Card className="flex items-center justify-between gap-3 border-red/30 p-4" role="alert">
          <p className="text-sm text-fg-sec">Conversations unavailable: {conversationsError}</p>
          <Button size="sm" variant="ghost" onClick={() => void loadConversations()}>Retry</Button>
        </Card>
      )}
      {!conversationsLoading && !conversationsError && !ready && <EmptyState icon="chat" title="Sign in to view messages" sub="Your private conversations are available after you sign in." />}
      {!conversationsLoading && !conversationsError && ready && list.length === 0 && <EmptyState icon="chat" title="No conversations yet" sub="Connect with a real language partner from Discover to start a private chat." />}
    </div>
  );
}

/* ═══════════ MOMENTS — word translation dictionary ═══════════ */
const DICT: Record<string, string> = {
  learned: "öğrendim", difference: "fark", confusing: "kafa karıştırıcı", verb: "fiil", noun: "isim",
  whole: "bütün", difficult: "zor", mistakes: "hatalar", improve: "geliştirmek", interview: "mülakat",
  affect: "etkilemek", effect: "etki", today: "bugün", english: "ingilizce", luck: "şans",
};

function TappableText({ text, onWord }: { text: string; onWord: (w: string) => void }) {
  return (
    <p className="text-sm leading-relaxed text-fg">
      {text.split(" ").map((w, i) => {
        const clean = w.toLowerCase().replace(/[^a-z']/g, "");
        const has = clean in DICT;
        return (
          <button
            key={i}
            onClick={() => has && onWord(clean)}
            className={cn("inline cursor-pointer rounded px-0.5 text-left transition", has ? "hover:bg-primary/15 hover:text-primary" : "cursor-text")}
          >
            {w}{" "}
          </button>
        );
      })}
    </p>
  );
}

interface MomentPost {
  id: string; userId: string; user: { name: string; initials: string; color: string; avatarUrl?: string | null; flag: string; level: CEFR };
  text: string; time: string; likes: number; comments: number; corrections: number; liked: boolean; mine?: boolean; img?: string | boolean;
}

function MomentCommentsDialog({ moment, onClose }: { moment: MomentPost; onClose: () => void }) {
  const [comments, setComments] = useState<RTMomentComment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadComments = useChatRT((s) => s.loadMomentComments);
  const createComment = useChatRT((s) => s.createMomentComment);
  const { pushToast } = useApp();

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    const refresh = async () => {
      try {
        const rows = await loadComments(moment.id);
        if (active) { setComments(rows); setError(null); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load comments.");
      } finally {
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void refresh();
    if (!isSupaConfigured() || !getSessionUserId()) return () => { active = false; };
    const pollTimer = window.setInterval(() => { void refresh(); }, 15_000);
    const channel = supabase.channel(`moment-comments-${moment.id}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "moment_comments", filter: `moment_id=eq.${moment.id}` }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { setLoading(true); void refresh(); }, 200);
      })
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(pollTimer);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [moment.id, loadComments]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    if (!getSessionUserId()) {
      pushToast({ title: "Sign in to comment", desc: "Comments are saved to your account.", icon: "alert", tone: "primary" });
      return;
    }
    setSending(true);
    try {
      const comment = await createComment(moment.id, content);
      if (!comment) throw new Error("Sign in again before commenting.");
      setComments((current) => [...current, comment]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comment could not be saved.");
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[180] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close comments" className="absolute inset-0 cursor-default bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <motion.section role="dialog" aria-modal="true" aria-label="Moment comments" initial={{ y: 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-[28px] border border-border bg-card p-5 shadow-lift sm:rounded-[28px]">
        <div className="mb-3 flex items-center justify-between">
          <div><h3 className="font-display text-lg font-extrabold text-fg">Comments</h3><p className="text-xs text-fg-ter">{moment.user.name}'s Moment</p></div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-bg-sec text-fg-sec"><X className="size-4" /></button>
        </div>
        <div className="min-h-24 flex-1 space-y-3 overflow-y-auto py-2">
          {loading && <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-primary" /></div>}
          {error && <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">{error}</p>}
          {!loading && !error && comments.length === 0 && <p className="py-6 text-center text-sm text-fg-ter">No comments yet. Start the conversation.</p>}
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2.5 rounded-xl bg-bg-sec/70 p-3">
              <Avatar initials={comment.userInitials} color={comment.userColor} size={30} src={comment.avatarUrl} />
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-bold text-fg">{comment.userName}</p><span className="text-[10px] text-fg-ter">{comment.time}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-sec">{comment.content}</p></div>
            </div>
          ))}
        </div>
        <form className="mt-3 flex gap-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-xl border border-border bg-bg-sec px-3 py-2.5 text-sm text-fg outline-none focus:border-primary/50" />
          <Button size="sm" type="submit" disabled={!draft.trim() || sending}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send</Button>
        </form>
      </motion.section>
    </motion.div>
  );
}

function MomentCard({ m, i, onLike }: { m: MomentPost; i: number; onLike: () => void }) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showCorr, setShowCorr] = useState(false);
  const [corrections, setCorrections] = useState<RTCorrection[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsRead, setCorrectionsRead] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [correctionFormOpen, setCorrectionFormOpen] = useState(false);
  const [originalText, setOriginalText] = useState(m.text);
  const [correctedText, setCorrectedText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const { pushToast, user } = useApp();
  const loadCorrections = useChatRT((s) => s.loadMomentCorrections);
  const createCorrection = useChatRT((s) => s.createMomentCorrection);
  const thankCorrection = useChatRT((s) => s.thankCorrection);
  const userId = getSessionUserId();

  const toggleCorrections = async () => {
    const next = !showCorr;
    setShowCorr(next);
    if (!next || correctionsRead) return;
    if (!userId) { setCorrectionsRead(true); return; }
    setCorrectionsLoading(true);
    try {
      setCorrections(await loadCorrections(m.id));
      setCorrectionsRead(true);
    } catch {
      pushToast({ title: "Corrections unavailable", desc: "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setCorrectionsLoading(false);
    }
  };

  const submitCorrection = async () => {
    if (!userId) {
      pushToast({ title: "Sign in to correct", desc: "Corrections are sent to the Moment author.", icon: "alert", tone: "primary" });
      return;
    }
    setSavingCorrection(true);
    try {
      const ok = await createCorrection({ momentId: m.id, receiverId: m.userId, original: originalText, corrected: correctedText, explanation });
      if (!ok) throw new Error("Sign in again before sending this correction.");
      setCorrectionFormOpen(false);
      setCorrectedText(""); setExplanation("");
      pushToast({ title: "Correction sent", desc: "Your correction was saved for the Moment author.", icon: "pen", tone: "green" });
    } catch (e) {
      pushToast({ title: "Correction not sent", desc: e instanceof Error ? e.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setSavingCorrection(false);
    }
  };

  const speakWord = () => {
    if (!("speechSynthesis" in window)) {
      pushToast({ title: "Speech playback unavailable", desc: "This browser does not support text-to-speech.", icon: "alert", tone: "red" });
      return;
    }
    window.speechSynthesis.cancel();
    const prefs = getLocalPreferences();
    const targetCode = langByName(user.targetLanguage).code;
    const locale = speechLocaleWithAccent(targetCode === "en" ? "en-US" : targetCode, prefs.speechAccent);
    const utterance = new SpeechSynthesisUtterance(tooltip ?? "");
    utterance.lang = locale;
    utterance.rate = speechRateValue(prefs.speechRate);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((candidate) => candidate.lang.toLowerCase() === locale.toLowerCase())
      ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith(targetCode.toLowerCase()))
      ?? null;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-20px" }} transition={{ delay: i * 0.06 }}>
      <Card hover className="relative p-5">
        <AnimatePresence>
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }}
              className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 -translate-y-full"
            >
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 shadow-lift">
                <span className="font-display text-[13px] font-bold text-fg">{tooltip}</span>
                <ArrowRight className="size-3.5 text-primary" />
                <span className="text-[13px] font-semibold text-primary">{DICT[tooltip]}</span>
                <button aria-label={`Play pronunciation of ${tooltip}`} onClick={speakWord} className="cursor-pointer text-fg-ter hover:text-primary"><Volume2 className="size-3.5" /></button>
                <button onClick={() => setTooltip(null)} className="cursor-pointer text-fg-ter"><X className="size-3.5" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3">
          <Avatar initials={m.user.initials} color={m.user.color} size={44} src={m.user.avatarUrl} />
          <div className="flex-1">
            <p className="font-display text-[14px] font-extrabold text-fg">{m.mine ? "You" : m.user.name}</p>
            <p className="text-[11px] font-semibold text-fg-ter">{m.time}</p>
          </div>
          <Flag code={m.user.flag} size={16} />
          <LevelBadge level={m.user.level} />
        </div>

        <div className="mt-3">
          <TappableText text={m.text} onWord={setTooltip} />
          <p className="mt-1.5 text-[10px] font-semibold text-fg-ter">Tap a highlighted word to translate</p>
        </div>

        {typeof m.img === "string" && m.img ? (
          <img src={m.img} alt="Moment" className="mt-3 max-h-96 w-full rounded-2xl border border-border object-cover" />
        ) : m.img ? (
          <div className="mt-3 grid h-36 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 via-cyan/15 to-pink/15">
            <ImagePlus className="size-7 text-fg-ter" />
          </div>
        ) : null}

        {m.corrections > 0 && (
          <div className="mt-3">
            <button onClick={() => void toggleCorrections()} className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-primary">
              <PenLine className="size-3.5" /> {m.corrections} correction{m.corrections > 1 ? "s" : ""}
              <ChevronLeft className={cn("size-3.5 transition-transform", showCorr ? "-rotate-90" : "rotate-180")} />
            </button>
            <AnimatePresence>
              {showCorr && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-2 space-y-2">
                    {correctionsLoading && <div className="flex justify-center py-3"><Loader2 className="size-4 animate-spin text-primary" /></div>}
                    {!correctionsLoading && corrections.length === 0 && (
                      <p className="rounded-xl border border-border bg-bg-sec p-3 text-xs leading-relaxed text-fg-sec">
                        {!userId ? "Sign in to view corrections." : "Correction text is visible only to the Moment author and the person who sent it."}
                      </p>
                    )}
                    {corrections.map((correction) => (
                      <div key={correction.id} className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
                        <Avatar initials={correction.otherUserInitials} color={correction.otherUserColor} size={26} src={correction.otherAvatarUrl} />
                        <div className="min-w-0 flex-1 text-[12px] leading-snug">
                          <p className="font-bold text-fg">{correction.giverId === userId ? "Your correction" : correction.otherUserName}</p>
                          <p className="mt-1 text-fg-sec"><span className="line-through decoration-red/60">{correction.original}</span> → <span className="font-bold text-green">{correction.corrected}</span></p>
                          {correction.explanation && <p className="mt-1 italic text-fg-ter">{correction.explanation}</p>}
                          {correction.receiverId === userId && (
                            <button
                              disabled={correction.isThanked}
                              onClick={async () => {
                                try {
                                  const ok = await thankCorrection(correction.id);
                                  if (!ok) throw new Error("Sign in as the Moment author to thank this correction.");
                                  setCorrections((rows) => rows.map((row) => row.id === correction.id ? { ...row, isThanked: true } : row));
                                } catch (e) {
                                  pushToast({ title: "Thanks not saved", desc: e instanceof Error ? e.message : "Try again.", icon: "alert", tone: "red" });
                                }
                              }}
                              className="mt-2 cursor-pointer rounded-full bg-primary-faint px-2.5 py-1 text-[10.5px] font-bold text-primary disabled:cursor-default disabled:opacity-60"
                            >{correction.isThanked ? "Thanked" : "Thank"}</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {correctionFormOpen && (
          <div className="mt-4 space-y-2 rounded-2xl border border-primary/25 bg-primary-faint/40 p-3.5">
            <div className="flex items-center justify-between"><p className="font-display text-sm font-extrabold text-fg">Suggest a correction</p><button onClick={() => setCorrectionFormOpen(false)} aria-label="Close correction form" className="text-fg-ter"><X className="size-4" /></button></div>
            <label className="block text-[11px] font-bold text-fg-sec">Original text
              <textarea value={originalText} onChange={(e) => setOriginalText(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-sm text-fg outline-none focus:border-primary/50" />
            </label>
            <label className="block text-[11px] font-bold text-fg-sec">Improved version
              <textarea value={correctedText} onChange={(e) => setCorrectedText(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-sm text-fg outline-none focus:border-primary/50" />
            </label>
            <label className="block text-[11px] font-bold text-fg-sec">Why? (optional)
              <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-sm text-fg outline-none focus:border-primary/50" />
            </label>
            <div className="flex justify-end"><Button size="sm" disabled={!originalText.trim() || !correctedText.trim() || savingCorrection} onClick={() => void submitCorrection()}>{savingCorrection ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send correction</Button></div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <button
            onClick={onLike}
            aria-label={m.liked ? "Unlike Moment" : "Like Moment"}
            className={cn("flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition", m.liked ? "bg-pink/15 text-pink" : "text-fg-sec hover:bg-bg-sec")}
          >
            <Heart className={cn("size-4 transition", m.liked && "scale-110")} fill={m.liked ? "currentColor" : "none"} />
            {m.likes}
          </button>
          <button onClick={() => setCommentsOpen(true)} className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-fg-sec transition hover:bg-bg-sec">
            <MessageCircle className="size-4" /> {m.comments}
          </button>
          <button
            onClick={() => {
              if (!getSessionUserId()) { pushToast({ title: "Sign in to correct", desc: "Corrections are sent to the Moment author.", icon: "alert", tone: "primary" }); return; }
              if (m.mine || getSessionUserId() === m.userId) { pushToast({ title: "This is your Moment", desc: "You can only correct another learner's post.", icon: "alert", tone: "primary" }); return; }
              setOriginalText(m.text); setCorrectedText(""); setExplanation(""); setCorrectionFormOpen(true);
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-primary transition hover:bg-primary-faint"
          >
            <Pencil className="size-4" /> Correct
          </button>
        </div>
        <AnimatePresence>{commentsOpen && <MomentCommentsDialog moment={m} onClose={() => setCommentsOpen(false)} />}</AnimatePresence>
      </Card>
    </motion.div>
  );
}

/* ═══════════ MOMENTS TAB ═══════════ */
function Moments() {
  const [composing, setComposing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const { pushToast, addXP, user } = useApp();
  const { momentsFeed, momentsLoading, momentsError, loadMoments, createMoment, toggleMomentLike } = useChatRT();
  const posts = (momentsFeed ?? []) as MomentPost[];
  const signedIn = Boolean(getSessionUserId());

  useEffect(() => {
    void loadMoments();
    const pollTimer = window.setInterval(() => { void loadMoments(); }, 15_000);
    if (!isSupaConfigured() || !getSessionUserId()) return () => window.clearInterval(pollTimer);
    let refreshTimer: number | undefined;
    const channel = supabase.channel("moments-live-feed", { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "moments" }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void loadMoments(); }, 250);
      })
      .subscribe();
    return () => {
      window.clearInterval(pollTimer);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadMoments]);

  const post = async () => {
    const t = draft.trim();
    if (!t || posting) return;
    if (!getSessionUserId()) {
      pushToast({ title: "Sign in to post", desc: "Moments are shared with your real learning community.", icon: "alert", tone: "primary" });
      return;
    }
    setPosting(true);
    try {
      const cloudMoment = await createMoment(t, attachFile);
      if (!cloudMoment) throw new Error("Sign in again before posting your Moment.");
      addXP(5, { sync: true, source: "MOMENT" });
      setDraft(""); setComposing(false); setAttachFile(null); setAttachPreview(null);
      pushToast({ title: "Moment posted", desc: "Your post was saved to the community feed.", icon: "pen", tone: "green" });
    } catch (error) {
      pushToast({ title: "Moment not posted", desc: error instanceof Error ? error.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-3 border-dashed bg-card/60 p-4">
        <Avatar initials={signedIn ? user.initials : "?"} color={user.color} size={44} src={signedIn ? user.avatarUrl : null} />
        <button
          onClick={() => {
            if (!signedIn) {
              pushToast({ title: "Sign in to post", desc: "Your Moment will be shared with real learners.", icon: "alert", tone: "primary" });
              return;
            }
            setComposing(true);
          }}
          className="flex-1 cursor-pointer rounded-2xl bg-bg-sec px-4 py-3 text-left text-sm text-fg-ter transition hover:bg-border/60"
        >
          {signedIn ? "Write something in English…" : "Sign in to share a Moment…"}
        </button>
      </Card>

      {momentsError && (
        <Card className="flex items-center justify-between gap-3 border-red/30 p-4" role="alert">
          <p className="text-sm text-fg-sec">Community feed unavailable: {momentsError}</p>
          <Button size="sm" variant="ghost" onClick={() => void loadMoments()}>Retry</Button>
        </Card>
      )}
      {momentsLoading && <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-primary" aria-label="Loading Moments" /></div>}
      {!momentsLoading && !momentsError && posts.length === 0 && (
        <EmptyState icon="chat" title="No Moments yet" sub="When learners share a Moment, it will appear here. Your posts are saved to the live community feed." />
      )}
      {posts.map((m, i) => (
        <MomentCard
          key={m.id} m={m} i={i}
          onLike={async () => {
            try {
              const updated = await toggleMomentLike(m.id);
              if (!updated) pushToast({ title: "Sign in to like Moments", desc: "Likes are saved to your account.", icon: "alert", tone: "primary" });
            } catch {
              pushToast({ title: "Like could not be saved", desc: "Check your connection and try again.", icon: "alert", tone: "red" });
            }
          }}
        />
      ))}

      {/* compose sheet */}
      <AnimatePresence>
        {composing && (
          <motion.div className="fixed inset-0 z-[150] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setComposing(false)} />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="relative w-full max-w-lg rounded-t-[32px] bg-card p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-lift"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-extrabold text-fg">New Moment</h3>
                <Button size="sm" disabled={!draft.trim() || posting} onClick={post}>
                  {posting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {posting ? "Posting…" : "Post"}
                </Button>
              </div>
              <textarea
                autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
                placeholder="Share something in English — the community will help you perfect it…"
                className="w-full resize-none rounded-2xl border-2 border-border bg-bg-sec/50 p-4 text-sm leading-relaxed text-fg outline-none transition placeholder:text-fg-ter focus:border-primary/60"
              />
              {attachPreview && (
                <img src={attachPreview} alt="Attachment preview" className="mt-3 max-h-44 w-full rounded-2xl border border-border object-cover" />
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-bg-sec px-3 py-1.5 text-[11px] font-bold text-fg-sec">
                  Writing in <Flag code="gb" size={13} /> English
                </span>
                <input
                  id="moment-img-input" type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAttachFile(f);
                    setAttachPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
                <label htmlFor="moment-img-input" className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition", attachFile ? "border-primary bg-primary-faint text-primary" : "border-border text-fg-sec")}>
                  <ImagePlus className="size-3.5" /> {attachFile ? attachFile.name.slice(0, 20) : "Add image"}
                </label>
                {attachFile && (
                  <button
                    onClick={() => { setAttachFile(null); setAttachPreview(null); }}
                    className="cursor-pointer rounded-full border border-border px-2.5 py-1.5 text-[11px] font-bold text-fg-sec transition hover:border-red/50 hover:text-red"
                  >
                    Remove
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════ CORRECTIONS TAB ═══════════ */
function Corrections() {
  const [mode, setMode] = useState<"received" | "given">("received");
  const [received, setReceived] = useState<RTCorrection[]>([]);
  const [given, setGiven] = useState<RTCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadMyCorrections = useChatRT((s) => s.loadMyCorrections);
  const thankCorrection = useChatRT((s) => s.thankCorrection);
  const { pushToast } = useApp();

  useEffect(() => {
    let active = true;
    const refresh = async (showLoading: boolean) => {
      if (showLoading) { setLoading(true); setError(null); }
      try {
        const data = await loadMyCorrections();
        if (active) { setReceived(data.received); setGiven(data.given); }
      } catch (e) {
        if (active && showLoading) setError(e instanceof Error ? e.message : "Could not load your corrections.");
        else console.warn("Correction polling failed:", e);
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };
    void refresh(true);
    const pollTimer = window.setInterval(() => { void refresh(false); }, 15_000);
    return () => { active = false; window.clearInterval(pollTimer); };
  }, [loadMyCorrections, reloadKey]);

  const list = mode === "received" ? received : given;
  const onThank = async (id: string) => {
    try {
      const ok = await thankCorrection(id);
      if (!ok) throw new Error("Sign in as the recipient to thank this correction.");
      setReceived((rows) => rows.map((row) => row.id === id ? { ...row, isThanked: true } : row));
      pushToast({ title: "Thanks saved", desc: "The person who helped you will see your appreciation.", icon: "handshake", tone: "green" });
    } catch (e) {
      pushToast({ title: "Thanks not saved", desc: e instanceof Error ? e.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl p-5 text-white shadow-lift" style={{ background: "linear-gradient(130deg,#6C5CE7 0%,#5a4fd8 60%,#00bfc0 130%)" }}>
        <p className="font-display text-[15px] font-extrabold">Your correction exchange</p>
        <p className="mt-0.5 text-xs text-white/80">{given.length} sent · {received.length} received from your real community</p>
      </div>

      <div className="flex gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-card">
        {([["received", `Received (${received.length})`], ["given", `Given (${given.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} className={cn(
            "relative flex-1 cursor-pointer rounded-xl px-3 py-2.5 font-display text-[12.5px] font-bold transition-colors",
            mode === id ? "text-white" : "text-fg-sec"
          )}>
            {mode === id && <motion.span layoutId="corr-tab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary-strong" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-primary" /></div>}
      {error && <Card className="flex items-center justify-between gap-3 border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">{error}</p><Button size="sm" variant="ghost" onClick={() => setReloadKey((n) => n + 1)}>Retry</Button></Card>}
      {!loading && !error && list.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Card hover className="p-4">
            <div className="flex items-center gap-2.5">
              <Avatar initials={c.otherUserInitials} color={c.otherUserColor} size={34} src={c.otherAvatarUrl} />
              <p className="flex-1 truncate font-display text-[13px] font-bold text-fg">{mode === "received" ? `From ${c.otherUserName}` : `To ${c.otherUserName}`}</p>
              <span className="text-[10.5px] font-bold text-fg-ter">{c.time}</span>
            </div>
            <div className="mt-3 rounded-xl bg-red/[0.07] p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-red">Original</p>
              <p className="mt-0.5 text-sm text-fg-sec"><span className="line-through decoration-red/60 decoration-2">{c.original}</span></p>
            </div>
            <div className="my-1.5 flex justify-center"><ArrowDown className="size-4 text-primary" /></div>
            <div className="rounded-xl bg-green/[0.08] p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-green">Corrected</p>
              <p className="mt-0.5 font-display text-sm font-bold text-fg">{c.corrected}</p>
            </div>
            {c.explanation && <p className="mt-2.5 flex items-start gap-1.5 text-[12px] italic leading-relaxed text-fg-sec"><Lightbulb className="mt-0.5 size-3.5 shrink-0 text-gold" /> {c.explanation}</p>}
            {mode === "received" && (
              <div className="mt-3 border-t border-border pt-3">
                <button disabled={c.isThanked} onClick={() => void onThank(c.id)} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition disabled:cursor-default", c.isThanked ? "bg-primary text-white" : "bg-primary-faint text-primary hover:bg-primary-soft")}>
                  <ThumbsUp className="size-3.5" /> {c.isThanked ? "Thanked" : "Thank"}
                </button>
              </div>
            )}
          </Card>
        </motion.div>
      ))}
      {!loading && !error && list.length === 0 && (
        <EmptyState icon="pen" title={`No ${mode} corrections yet`} sub={getSessionUserId() ? "Corrections you send or receive from learners will appear here." : "Sign in to see real corrections from your language community."} />
      )}
    </div>
  );
}

/* ═══════════ CHAT VIEW ═══════════ */
export default function ChatView() {
  const [tab, setTab] = useState<ChatTab>("messages");
  const [open, setOpen] = useState<Conversation | null>(null);
  const conversationsReady = useChatRT((s) => s.ready);
  const conversations = useChatRT((s) => s.convs);
  const onlinePartners = conversations.filter((conversation) => conversation.user.online).length;
  const unreadCount = conversations.reduce((count, conversation) => count + conversation.unread, 0);

  const tabs: { id: ChatTab; label: string; badge?: number }[] = [
    { id: "messages", label: "Messages", ...(unreadCount > 0 ? { badge: unreadCount } : {}) },
    { id: "moments", label: "Moments" },
    { id: "corrections", label: "Corrections" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AnimatePresence mode="wait">
        {open ? (
          <Thread key="thread" conv={open} onBack={() => setOpen(null)} />
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -24 }} className="flex flex-col gap-5">
            <PageTitle
              title="Chat"
              sub="Practice with your language partners"
              right={conversationsReady && onlinePartners > 0 ? <span className="flex items-center gap-1.5 rounded-full bg-green/12 px-3.5 py-2 text-xs font-bold text-green"><Waves className="size-4" /> {onlinePartners} partner{onlinePartners === 1 ? "" : "s"} online in your chats</span> : null}
            />
            <div className="flex gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-card">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative flex-1 cursor-pointer rounded-xl px-4 py-2.5 font-display text-sm font-bold capitalize transition-colors",
                    tab === t.id ? "text-white" : "text-fg-sec hover:text-fg"
                  )}
                >
                  {tab === t.id && (
                    <motion.span layoutId="chat-tab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary-strong shadow-lift" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
                  )}
                  <span className="relative">{t.label}</span>
                  {t.badge && tab !== t.id && (
                    <span className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-red font-mono text-[10px] font-bold text-white">{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {tab === "messages" && (
                <motion.div key="m" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <ConvList onOpen={setOpen} />
                </motion.div>
              )}
              {tab === "moments" && (
                <motion.div key="mm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Moments />
                </motion.div>
              )}
              {tab === "corrections" && (
                <motion.div key="c" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Corrections />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
