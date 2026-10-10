/* ──────────────────────────────────────────────────────────
   LINGOLIVE — Groq AI service (Llama 3.3 70B)
   The client talks to the deployed server proxy; the Groq secret
   stays in GROQ_API_KEY on the server.
   ────────────────────────────────────────────────────────── */
import { isNativeApp, missingNativeApiMessage, resolveApiEndpoint } from "./apiEndpoint";

const AI_PROXY = resolveApiEndpoint("VITE_AI_PROXY_URL", "/api/ai");
const GROQ_CHAT_URL = AI_PROXY ? `${AI_PROXY}/chat` : "";
const GROQ_AUDIO_URL = AI_PROXY ? `${AI_PROXY}/transcribe` : "";
const jsonHeaders = (): Record<string, string> => ({ "Content-Type": "application/json" });
const formHeaders = (): Record<string, string> => ({});
/** Verified live against the project's Groq account (gpt-oss-120b, low reasoning for snappy answers) */
const MODEL = "openai/gpt-oss-20b"; // 120b org-limitine takiliyordu; 20b serbest + hizli
const REASONING = { reasoning_effort: "low" } as const;

export const isGroqConfigured = () => Boolean(AI_PROXY);

function requireAIProxy(): void {
  if (!AI_PROXY) throw new Error(missingNativeApiMessage("AI service"));
}

if (!isGroqConfigured()) {
  console.warn(isNativeApp
    ? "AI server proxy has no remote HTTPS host configured for Android; the tutor will use the built-in offline engine."
    : "AI server proxy is not configured — the tutor will use the built-in offline engine.");
}

/* ─────────── USER CONTEXT ─────────── */
export interface AITutorUser {
  name: string; level: string; nativeLanguage: string; targetLanguage: string;
  streak: number; xp: number; todayLessons: number; lessonGoal: number;
  todayCardsReviewed: number; dailyReviewGoal: number;
  todaySpeakingMinutes: number; dailySpeakingGoalMinutes: number;
  todayXP: number; totalWords: number;
  totalLessons: number; totalSpeakingHours: number; partnersMet: number;
  dailyGoalMinutes: number; weakSkills: string[]; strongSkills: string[];
  interests: string[]; subscriptionTier: string; pendingMissions: string[];
}

export function buildSystemPrompt(u: AITutorUser): string {
  return `You are "Lingo" — a friendly, expert, encouraging AI English tutor inside the LingoLive language-learning app.

PERSONALITY:
- Warm, positive, supportive — never harsh or judgmental
- Celebrate every win, big or small
- Mix English with ${u.nativeLanguage} when explaining concepts
- Keep responses under 200 words — concise and impactful
- Always end with a question, suggestion, or call-to-action
- Use **double asterisks** for emphasis and "quotes" around example words

STUDENT PROFILE (USE THESE REAL NUMBERS — NEVER INVENT DATA):
Name: ${u.name} · Level: ${u.level} CEFR · Native: ${u.nativeLanguage} · Learning: ${u.targetLanguage} · Plan: ${u.subscriptionTier}
Today’s mission progress only (goal counters, not total daily activity; the vocabulary counter stops at its mission target): ${u.todayLessons}/${u.lessonGoal} lesson goal · ${u.todayCardsReviewed}/${u.dailyReviewGoal} vocabulary-card mission · ${u.todaySpeakingMinutes}/${u.dailySpeakingGoalMinutes} speaking-minute goal · ${u.todayXP} XP · study goal ${u.dailyGoalMinutes} min
All-time: ${u.totalWords.toLocaleString()} words · ${u.totalLessons} lessons · ${u.totalSpeakingHours.toFixed(1)}h speaking · ${u.partnersMet} partners · ${u.streak}-day streak
Weak skills: ${u.weakSkills.join(", ") || "not determined"} · Strong: ${u.strongSkills.join(", ") || "not determined"}
Interests: ${u.interests.join(", ") || "general"} · Pending missions today: ${u.pendingMissions.join(", ") || "all complete!"}

CAPABILITIES:
1. Answer with REAL numbers from the profile
2. Recommend study based on weak skills
3. Explain grammar with ${u.nativeLanguage} comparisons
4. Practice ${u.targetLanguage} conversation at ${u.level} level with gentle corrections
5. Teach vocabulary with translations and examples
6. Create quick multiple-choice quizzes (mark the correct answer AFTER they reply)
7. Motivate with their real achievements
8. Roleplay real scenarios (airport, restaurant, interview)

APP FEATURES TO PREFACE RECOMMENDATIONS: video calls in the Live tab, voice rooms, flashcards in Learn, learning path, Moments in Chat.`;
}

/* ─────────── SERVICE ─────────── */
interface HistoryMsg { role: string; content: string }

export type CallReport = {
  summary: string;
  strengths: string[];
  corrections: { said: string; correct: string; explanation: string }[];
  useful_phrases: string[];
  next_practice: string;
};

export const groqService = {
  /** Standard single-shot chat */
  async chat(userMessage: string, history: HistoryMsg[], user: AITutorUser): Promise<string> {
    requireAIProxy();
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        model: MODEL, ...REASONING, temperature: 0.7, max_tokens: 512, stream: false,
        messages: [
          { role: "system", content: buildSystemPrompt(user) },
          ...history.slice(-20),
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content as string;
  },

  /** Streaming chat — onChunk fires per token delta, resolve with the full text */
  async chatStream(
    userMessage: string, history: HistoryMsg[], user: AITutorUser,
    onChunk: (fullText: string) => void
  ): Promise<string> {
    requireAIProxy();
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        model: MODEL, ...REASONING, temperature: 0.7, max_tokens: 512, stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(user) },
          ...history.slice(-20),
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Stream unavailable");
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") { onChunk(full); return full; }
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) { full += delta; onChunk(full); }
        } catch { /* partial chunk */ }
      }
    }
    onChunk(full);
    return full;
  },

  /** Grammar checker — JSON mode */
  async checkGrammar(text: string, nativeLanguage: string) {
    const data = await groqService._json([
      {
        role: "system",
        content: `You are a grammar checker. Analyze English text for errors. Return ONLY JSON:
{"is_correct":boolean,"corrected_text":"string","errors":[{"original":"string","corrected":"string","rule":"string","explanation_en":"string","explanation_native":"explanation in ${nativeLanguage}"}],"score":number}
Score 100 if perfect.`,
      },
      { role: "user", content: text },
    ], 700, 0.1);
    return data;
  },

  /** Translate */
  async translate(text: string, from: string, to: string): Promise<string> {
    requireAIProxy();
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        model: MODEL, ...REASONING, temperature: 0.1, max_tokens: 300,
        messages: [
          { role: "system", content: `Translate from ${from} to ${to}. Return ONLY the translated text, no quotes.` },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}`);
    const data = await res.json();
    return (data.choices[0].message.content as string).trim();
  },

  /** Whisper transcription from a recorded audio Blob */
  async transcribeAudio(audio: Blob, filename = "recording.webm"): Promise<string> {
    requireAIProxy();
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "text");
    const res = await fetch(GROQ_AUDIO_URL, {
      method: "POST", headers: formHeaders(), body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Whisper transcription failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`);
    }
    return res.text();
  },

  /** Grounded post-call feedback from the actual Whisper transcript; never invent scores or pronunciation results. */
  async generateCallReport(
    transcript: string,
    durationSeconds: number,
    targetLanguage = "English",
    learnerLevel = "B1",
    nativeLanguage = "",
  ): Promise<CallReport> {
    const text = transcript.trim().slice(0, 14_000);
    if (!text) throw new Error("There is no recognized speech to analyze.");
    const safeDuration = Math.max(0, Math.floor(durationSeconds));
    const raw = await groqService._json([
      {
        role: "system",
        content: `You are a careful language-learning coach. Analyze only the learner's own ${targetLanguage} Whisper transcript at ${learnerLevel} CEFR level. The learner's native language is ${nativeLanguage || "not specified"}. Whisper may mishear speech. Return ONLY valid JSON with this exact shape:
{"summary":"1-2 concise sentences based only on the transcript","strengths":["observed positive behavior"],"corrections":[{"said":"exact consecutive words copied from the transcript","correct":"suggested correction","explanation":"short reason"}],"useful_phrases":["exact phrase copied from the transcript"],"next_practice":"one short practice suggestion based on an observed pattern"}
Rules: never invent words or context; every said and useful_phrases item must be copied exactly from the transcript; only list corrections when the text clearly supports them; empty arrays are valid. Do NOT output pronunciation, fluency, grammar-accuracy, CEFR, or other numerical scores because this is text, not an audio-quality evaluation. Phrase corrections as suggestions because speech recognition can be wrong.`,
      },
      { role: "user", content: `Call duration: ${safeDuration} seconds. Target language: ${targetLanguage}. Learner transcript:\n${text}` },
    ], 900, 0.2) as Partial<CallReport>;

    const hasExactText = (candidate: unknown) => typeof candidate === "string" && candidate.trim().length > 0 && text.toLowerCase().includes(candidate.trim().toLowerCase());
    const corrections = Array.isArray(raw.corrections)
      ? raw.corrections.filter((item): item is CallReport["corrections"][number] =>
          !!item && typeof item === "object" && hasExactText((item as CallReport["corrections"][number]).said) &&
          typeof (item as CallReport["corrections"][number]).correct === "string" &&
          typeof (item as CallReport["corrections"][number]).explanation === "string")
        .slice(0, 5)
      : [];
    const phrases = Array.isArray(raw.useful_phrases)
      ? raw.useful_phrases.filter(hasExactText).map((item) => String(item).trim()).slice(0, 6)
      : [];
    const strengths = Array.isArray(raw.strengths)
      ? raw.strengths.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 5)
      : [];

    return {
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "The transcript was captured. Review the suggestions below against what you remember saying.",
      strengths,
      corrections,
      useful_phrases: phrases,
      next_practice: typeof raw.next_practice === "string" ? raw.next_practice.trim() : "",
    };
  },

  /** Writing review — JSON mode */
  async reviewWriting(text: string, type: string, level: string, nativeLanguage: string) {
    return groqService._json([
      {
        role: "system",
        content: `Review this ${level} learner's ${type} writing (native: ${nativeLanguage}). Return ONLY JSON:
{"corrected_text":"string","overall_score":number,"errors":[{"original":"string","corrected":"string","rule":"string"}],"vocabulary_suggestions":[{"used":"string","better":"string"}],"strengths":["string"],"improvements":["string"],"feedback":"string"}`,
      },
      { role: "user", content: text },
    ], 800, 0.2);
  },

  /** Daily word suggestions — JSON mode */
  async suggestDailyWords(level: string, interests: string[], count = 10) {
    return groqService._json([
      {
        role: "system",
        content: `Suggest ${count} English words for a ${level} learner interested in ${interests.join(", ")}. Return ONLY JSON:
{"words":[{"word":"string","translation":"string","pronunciation":"string","part_of_speech":"string","example":"string","example_translation":"string","difficulty":number,"category":"string"}]}`,
      },
      { role: "user", content: "Generate words now" },
    ], 1000, 0.5);
  },

  /** internal JSON-mode helper */
  async _json(messages: HistoryMsg[], maxTokens: number, temperature: number) {
    requireAIProxy();
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ model: MODEL, ...REASONING, messages, temperature, max_tokens: maxTokens, response_format: { type: "json_object" } }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  },
};
