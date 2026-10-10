import type { RealtimeChannel } from "@supabase/supabase-js";
import { groqService } from "./groq";
import { hasAudibleEnergy } from "./audioSignal";
import { supabase } from "./supabase";
import type { CallCaptionLine } from "./callTypes";

export type CaptionCaptureStatus = "idle" | "connecting" | "listening" | "local-only" | "stopped" | "error";

const CHUNK_MS = 5_000;

/** Captures only after the caller has opted in; transcribes short mic clips and broadcasts text, never audio. */
export class CallCaptionCapture {
  private channel: RealtimeChannel | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunkTimer: number | undefined;
  private stopResolver: (() => void) | null = null;
  private pending = new Set<Promise<void>>();
  private lines: CallCaptionLine[] = [];
  private running = false;
  private sequence = 0;
  private startedAt = Date.now();
  private status: CaptionCaptureStatus = "idle";
  private broadcastReady = false;
  private warnedUnverifiedAudio = false;
  private destroyed = false;

  constructor(
    private readonly roomId: string,
    private readonly userId: string,
    private readonly userName: string,
    private readonly partnerId: string,
    private readonly onLine: (line: CallCaptionLine) => void,
    private readonly onStatus: (status: CaptionCaptureStatus, message?: string) => void,
  ) {}

  getLines(): CallCaptionLine[] {
    return [...this.lines];
  }

  private setStatus(status: CaptionCaptureStatus, message?: string) {
    this.status = status;
    this.onStatus(status, message);
  }

  private addLine(line: CallCaptionLine) {
    if (!line.id || !line.userId || !line.text?.trim()) return;
    if (this.lines.some((item) => item.id === line.id)) return;
    this.lines = [...this.lines, { ...line, text: line.text.trim() }]
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    this.onLine(line);
  }

  private async connectCaptionsChannel(): Promise<boolean> {
    if (this.channel) return true;
    const channel = supabase
      .channel(`call-captions-${this.roomId}`, { config: { private: true, broadcast: { ack: true, self: false } } })
      .on("broadcast", { event: "caption-line" }, ({ payload }) => {
        const line = payload as CallCaptionLine;
        if (!line || line.userId !== this.partnerId || typeof line.text !== "string" || line.text.length > 1200) return;
        this.addLine(line);
      });
    this.channel = channel;

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (!settled) { settled = true; reject(new Error("Realtime caption channel timed out.")); }
        }, 12_000);
        channel.subscribe((state) => {
          if (state === "SUBSCRIBED" && !settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve();
          } else if ((state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") && !settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(new Error(`Realtime captions unavailable (${state}).`));
          }
        });
      });
      this.broadcastReady = true;
      return true;
    } catch (error) {
      console.warn("Call caption broadcast could not connect:", error);
      this.broadcastReady = false;
      if (this.channel === channel) this.channel = null;
      await supabase.removeChannel(channel);
      this.setStatus("local-only", "Altyazılar sadece bu cihazda gösteriliyor; Realtime bağlantısı yok.");
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.destroyed) throw new Error("Caption capture has already ended.");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      this.setStatus("error", "Bu tarayıcı canlı altyazı için mikrofon kaydını desteklemiyor.");
      throw new Error("Microphone recording is not supported in this browser.");
    }
    this.setStatus("connecting", "Mikrofon ve Whisper bağlantısı hazırlanıyor…");
    await this.connectCaptionsChannel();

    let stream: MediaStream;
    this.running = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (error) {
      this.running = false;
      const denied = error instanceof Error && error.name === "NotAllowedError";
      const message = denied
        ? "Altyazı için mikrofon izni gerekli. İzni aç veya altyazıyı kapatıp aramaya devam et."
        : "Altyazı mikrofonu açılamadı. Tarayıcı iznini kontrol et veya altyazıyı kapat.";
      this.setStatus("error", message);
      throw new Error(message);
    }

    if (!this.running || this.destroyed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.startedAt = Date.now();
    this.setStatus(this.broadcastReady ? "listening" : "local-only", "Mikrofon sesi 5 saniyelik parçalarla Whisper'a gönderiliyor.");
    this.startChunk();
  }

  private startChunk() {
    if (!this.running || !this.stream) return;
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    } catch (error) {
      this.running = false;
      this.setStatus("error", "Bu cihazda ses parçası kaydedilemedi; arama devam eder ama altyazı kullanılamaz.");
      console.warn("Call MediaRecorder could not start:", error);
      return;
    }

    const chunks: Blob[] = [];
    const chunkStart = Date.now();
    this.recorder = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => {
      this.running = false;
      this.setStatus("error", "Mikrofon kaydı durdu. Arama devam ediyor; altyazıyı yeniden açmayı deneyebilirsin.");
    };
    recorder.onstop = () => {
      if (this.recorder === recorder) this.recorder = null;
      if (this.running) this.startChunk();
      const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size >= 300) {
        const task = this.transcribeChunk(blob, type, chunkStart).finally(() => this.pending.delete(task));
        this.pending.add(task);
      }
      this.stopResolver?.();
      this.stopResolver = null;
    };

    try {
      recorder.start();
      this.chunkTimer = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, CHUNK_MS);
    } catch (error) {
      this.running = false;
      this.setStatus("error", "Mikrofon kaydı başlatılamadı; altyazı kullanılamıyor.");
      console.warn("Call MediaRecorder start failed:", error);
    }
  }

  private async transcribeChunk(blob: Blob, contentType: string, chunkStart: number) {
    const partNumber = this.sequence++;
    try {
      // Fail closed: neither silent nor undecodable audio is sent to Whisper or broadcast.
      const energy = await hasAudibleEnergy(blob);
      if (energy !== true) {
        if (energy === null && this.running && !this.warnedUnverifiedAudio) {
          this.warnedUnverifiedAudio = true;
          this.setStatus(this.broadcastReady ? "listening" : "local-only", "Bir ses parçası doğrulanamadığı için atlandı; Whisper'a yalnızca doğrulanmış ses gönderilir.");
        }
        return;
      }
      const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
      const text = (await groqService.transcribeAudio(blob, `call-${partNumber}.${extension}`)).trim();
      if (!text) return;
      const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const duplicate = [...this.lines].reverse().find((line) => line.userId === this.userId && Date.now() - Date.parse(line.createdAt) < 12_000);
      if (duplicate && duplicate.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === normalized) return;

      const line: CallCaptionLine = {
        id: `${this.userId}-${chunkStart}-${partNumber}`,
        userId: this.userId,
        userName: this.userName,
        text: text.slice(0, 1200),
        offsetMs: Math.max(0, chunkStart - this.startedAt),
        createdAt: new Date(chunkStart).toISOString(),
      };
      this.addLine(line);
      if (this.channel) {
        const result = await this.channel.send({ type: "broadcast", event: "caption-line", payload: line });
        if (result !== "ok") this.setStatus("local-only", "Altyazı bu cihazda açık; partner cihazına gönderilemedi.");
      }
    } catch (error) {
      this.setStatus("error", error instanceof Error ? error.message : "Whisper transkripsiyonu başarısız oldu.");
      console.warn("Call audio transcription failed:", error);
    }
  }

  async stop(): Promise<CallCaptionLine[]> {
    this.running = false;
    if (this.chunkTimer !== undefined) window.clearTimeout(this.chunkTimer);
    this.chunkTimer = undefined;
    const current = this.recorder;
    if (current?.state === "recording") {
      await new Promise<void>((resolve) => {
        this.stopResolver = resolve;
        try { current.stop(); } catch { resolve(); }
      });
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.pending.size) await Promise.allSettled([...this.pending]);
    if (this.status !== "error" && this.status !== "local-only") this.setStatus("stopped");
    return this.getLines();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    await this.stop();
    const channel = this.channel;
    this.channel = null;
    if (channel) await supabase.removeChannel(channel);
  }
}
