/* ──────────────────────────────────────────────────────────
   LINGOLIVE — secure Turso content gateway
   The Turso auth token is server-only. Browser requests go to
   /api/turso (or the configured HTTPS API host in a native app)
   and the API accepts named, parameterized operations only.
   ────────────────────────────────────────────────────────── */
import { isSupaConfigured, supabase } from "./supabase";
import { isNativeApp, missingNativeApiMessage, resolveApiEndpoint } from "./apiEndpoint";

const env = (k: string): string =>
  (((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k] ?? "") as string).trim();

const API_URL = resolveApiEndpoint("VITE_TURSO_API_URL", "/api/turso");
const TURSO_ENABLED = env("VITE_TURSO_ENABLED").toLowerCase() === "true";
export const isTursoConfigured = () => TURSO_ENABLED && Boolean(API_URL);

if (!TURSO_ENABLED) {
  console.warn("Turso content API is disabled — bundled lesson content will be used.");
} else if (isNativeApp && !API_URL) {
  console.warn("Turso content API has no remote HTTPS host configured for Android.");
}

async function request<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!TURSO_ENABLED) throw new Error("Turso content API is not enabled.");
  if (!API_URL) throw new Error(missingNativeApiMessage("Turso content API"));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupaConfigured()) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, params }),
  });
  const result = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(result.error || `Content API failed (${response.status}).`);
  return result.data as T;
}

const parse = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  try { return JSON.parse(v as string); } catch { return []; }
};

/* ─────────── TYPES (raw rows) ─────────── */
export interface TUnit { id: string; course_id: string; order_index: number; title: string; description: string; emoji: string; level: string }
export interface TLesson { id: string; unit_id: string; order_index: number; title: string; emoji: string; description: string; estimated_minutes: number; xp_reward: number; type: string; new_words_count: number; skills: string }
export interface TExercise { id: string; lesson_id: string; order_index: number; type: string; question: string; options: string | null; correct_answer: string; explanation: string | null; audio_url: string | null; image_urls: string | null; words: string | null; translations: string | null; xp_reward: number }
export interface TWord { id: string; language: string; word: string; translation: string; pronunciation: string | null; part_of_speech: string | null; example_sentence: string | null; example_translation: string | null; difficulty: number; category: string }
export interface TGrammarTopic { id: string; language: string; title: string; description: string; category: string; level: string; content: string; examples: string; common_mistakes: string; native_comparison: string }

/* ─────────── SERVER ALLOW-LIST CLIENT ─────────── */
export const tursoService = {
  getCourse: (language = "en", fromLanguage = "tr") => request<{ units: TUnit[]; lessons: TLesson[] }>("course", { language, fromLanguage }),
  getCoursePairWords: (target: string, native: string, limit = 700) => request<TWord[]>("course_pair_words", { target, native, limit }),
  getExercises: (lessonId: string) => request<TExercise[]>("exercises_for_lesson", { lessonId }),
  getAllExercises: () => request<TExercise[]>("all_exercises"),
  getWordsByCategory: (category: string, language = "en", limit = 50) => request<TWord[]>("words_by_category", { category, language, limit }),
  searchWords: (query: string, language = "en", limit = 30) => request<TWord[]>("search_words", { query, language, limit }),
  getCategoriesWithCount: (language = "en") => request<{ category: string; total_words: number }[]>("word_categories", { language }),
  getDailyWords: (level: string, count = 15, language = "en") => request<TWord[]>("daily_words", { level, count, language }),
  getGrammarTopics: (language = "en") => request<TGrammarTopic[]>("grammar_topics", { language }),
  getGrammarTopic: (topicId: string) => request<TGrammarTopic | null>("grammar_topic", { topicId }),
  getExamQuestions: (examType: string, section: string, limit = 20) => request<Record<string, unknown>[]>("exam_questions", { examType, section, limit }),
  getDailyWordSet: (setId: string) => request<TWord[]>("daily_word_set", { setId }),
  saveWords: (items: Record<string, unknown>[]) => request<{ saved: boolean }>("save_words", { items }),
  saveExercises: (lessonId: string, orderStart: number, items: Record<string, unknown>[]) => request<{ saved: boolean }>("save_exercises", { lessonId, orderStart, items }),
  saveGrammarTopic: (topic: Record<string, unknown>) => request<{ saved: boolean }>("save_grammar_topic", { topic }),
  saveDailyWords: (setId: string, items: Record<string, unknown>[]) => request<{ saved: boolean }>("save_daily_words", { setId, items }),
  saveExamQuestions: (examType: string, section: string, items: Record<string, unknown>[]) => request<{ saved: boolean }>("save_exam_questions", { examType, section, items }),
};

/* ─────────── READ SERVICES ─────────── */
export const lessonService = {
  async getFullCourse(language = "en", fromLanguage = "tr"): Promise<{ units: TUnit[]; lessons: TLesson[] } | null> {
    if (!isTursoConfigured()) return null;
    const course = await tursoService.getCourse(language, fromLanguage);
    return course.units.length ? course : null;
  },
  async getExercises(lessonId: string): Promise<TExercise[]> {
    return isTursoConfigured() ? tursoService.getExercises(lessonId) : [];
  },
  async getAllExercises(): Promise<TExercise[]> {
    return isTursoConfigured() ? tursoService.getAllExercises() : [];
  },
};

export const vocabularyService = {
  async getWordsByCategory(category: string, language = "en", limit = 50): Promise<TWord[]> {
    return isTursoConfigured() ? tursoService.getWordsByCategory(category, language, limit) : [];
  },
  async searchWords(query: string, language = "en", limit = 30): Promise<TWord[]> {
    return isTursoConfigured() ? tursoService.searchWords(query, language, limit) : [];
  },
  async getCategoriesWithCount(language = "en"): Promise<{ category: string; total_words: number }[]> {
    return isTursoConfigured() ? tursoService.getCategoriesWithCount(language) : [];
  },
  async getDailyWords(level: string, count = 15, language = "en"): Promise<TWord[]> {
    return isTursoConfigured() ? tursoService.getDailyWords(level, count, language) : [];
  },
};

export const grammarService = {
  async getTopics(language = "en"): Promise<TGrammarTopic[]> {
    return isTursoConfigured() ? tursoService.getGrammarTopics(language) : [];
  },
};

export const examService = {
  async getQuestions(examType: string, section: string, limit = 20) {
    if (!isTursoConfigured()) return [];
    const rows = await tursoService.getExamQuestions(examType, section, limit);
    return rows.map((q) => ({ ...q, options: parse(q.options) }));
  },
};
