/* ──────────────────────────────────────────────────────────
   LINGOLIVE — Otomatik İçerik Sistemi (Turso-first, Groq-fallback)
   Her içerik isteği:
     1. Turso'ya bak → varsa anında döndür (hızlı, ücretsiz)
     2. Yoksa Groq üretir → Turso'ya kaydet → döndür
   Zamanla veritabanı kendini doldurur. Key yoksa sessizce
   mevcut veriye düşer — app asla kırılmaz.
   ────────────────────────────────────────────────────────── */
import { isTursoConfigured, tursoService } from "./turso";
import { isGroqConfigured } from "./groq";
import { missingNativeApiMessage, resolveApiEndpoint } from "./apiEndpoint";

const AI_PROXY = resolveApiEndpoint("VITE_AI_PROXY_URL", "/api/ai");
const GROQ_URL = AI_PROXY ? `${AI_PROXY}/chat` : "";

export const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", zh: "Chinese",
  ja: "Japanese", ko: "Korean", pt: "Portuguese", ru: "Russian", ar: "Arabic",
  it: "Italian", hi: "Hindi", tr: "Turkish", nl: "Dutch", sv: "Swedish",
};

/* ─────────── Groq + parse helpers ─────────── */
async function askGroq(system: string, maxTokens = 4096): Promise<unknown> {
  if (!GROQ_URL) throw new Error(missingNativeApiMessage("AI content service"));
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b", reasoning_effort: "low", temperature: 0.7, max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Generate now. Return ONLY valid JSON." },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const content: string = data.choices[0].message.content.trim();
  try {
    const j = JSON.parse(content);
    return j.items ?? j.words ?? j.exercises ?? j.questions ?? j.data ?? j;
  } catch {
    const a = content.match(/\[[\s\S]*\]/);
    if (a) return JSON.parse(a[0]);
    const o = content.match(/\{[\s\S]*\}/);
    return o ? JSON.parse(o[0]) : null;
  }
}

const ready = () => isTursoConfigured() && isGroqConfigured();

/* ═══════════ 1. KELİME SİSTEMİ ═══════════ */
export const contentGenerator = {
  async getWords(params: {
    langCode: string; nativeLangCode: string; category: string; level: string; count?: number;
  }): Promise<Record<string, unknown>[]> {
    const count = params.count ?? 20;
    if (!isTursoConfigured()) return [];
    const existing = await tursoService.getWordsByCategory(params.category, params.langCode, count);
    if (existing.length >= count * 0.8 || !ready()) return existing as unknown as Record<string, unknown>[];

    let generated: Record<string, unknown>[] = [];
    try {
      const langName = LANG_NAMES[params.langCode] ?? "English";
      const nativeName = LANG_NAMES[params.nativeLangCode] ?? "Turkish";
      const result = (await askGroq(`You are a professional ${langName} language teacher. Generate exactly ${count} ${langName} words for category "${params.category}". Student level: ${params.level}, native language: ${nativeName}.
Return ONLY valid JSON: {"items":[{"word":"<${langName} word>","translation":"<${nativeName} translation>","pronunciation":"/IPA/","part_of_speech":"noun","example_sentence":"<example in ${langName}>","example_translation":"<${nativeName} translation>","difficulty":<1-5>}]}
Rules: relevant to "${params.category}", accurate translations, exactly ${count} unique words.`)) as Record<string, unknown>[] | null;
      if (Array.isArray(result)) {
        generated = result.filter((w) => w?.word && w?.translation).slice(0, count).map((w, i) => ({
          id: `w_${params.langCode}_${params.category}_${Date.now().toString(36)}_${i}`,
          language: params.langCode, word: String(w.word).trim(), translation: String(w.translation).trim(),
          pronunciation: w.pronunciation ?? null, part_of_speech: w.part_of_speech ?? "noun",
          example_sentence: w.example_sentence ?? null, example_translation: w.example_translation ?? null,
          difficulty: Number(w.difficulty) || 1, category: params.category,
        }));
        if (generated.length) await tursoService.saveWords(generated);
      }
    } catch (e) { console.warn("Groq word generation/persistence skipped", e); }

    try {
      const updated = await tursoService.getWordsByCategory(params.category, params.langCode, count);
      return (updated.length ? updated : generated) as unknown as Record<string, unknown>[];
    } catch {
      return generated;
    }
  },

  /* ═══════════ 2. ALIŞTIRMA SİSTEMİ ═══════════ */
  async getExercises(params: {
    lessonId: string; lessonTitle: string; langCode: string; nativeLangCode: string; level: string; count?: number;
  }): Promise<Record<string, unknown>[]> {
    const count = params.count ?? 7;
    if (!isTursoConfigured()) return [];
    const parseValue = (value: unknown) => {
      if (typeof value !== "string") return value ?? null;
      try { return JSON.parse(value); } catch { return value; }
    };
    const parseRows = (rows: unknown[]) => (rows as Record<string, unknown>[]).map((e) => ({
      ...e, options: parseValue(e.options), words: parseValue(e.words), translations: parseValue(e.translations),
    }));

    const existing = await tursoService.getExercises(params.lessonId);
    if (existing.length >= count * 0.8 || !ready()) return parseRows(existing);

    let generated: Record<string, unknown>[] = [];
    try {
      const langName = LANG_NAMES[params.langCode] ?? "English";
      const nativeName = LANG_NAMES[params.nativeLangCode] ?? "Turkish";
      const result = (await askGroq(`You are a ${langName} language teacher creating ${count} varied exercises for the lesson "${params.lessonTitle}". Student level: ${params.level}, native: ${nativeName}, learning: ${langName}.
Return ONLY valid JSON: {"items":[
  {"type":"multiple_choice","question":"...","options":["correct","wrong1","wrong2","wrong3"],"correct_answer":"...","explanation":"<short note in ${nativeName}>"},
  {"type":"fill_blank","question":"Sentence with ___ blank","words":["correct","w1","w2","w3"],"correct_answer":"correct","explanation":"..."},
  {"type":"word_arrangement","question":"<${nativeName} sentence to translate>","words":["word1","word2","word3","word4","extra"],"correct_answer":"word1 word2 word3 word4","explanation":"..."},
  {"type":"matching","question":"Match ${langName} with ${nativeName}","words":["w1","w2","w3","w4","w5"],"translations":["t1","t2","t3","t4","t5"],"correct_answer":"w1|w2|w3|w4|w5","explanation":"..."},
  {"type":"speaking","question":"Say this in ${langName}:","correct_answer":"<natural sentence about ${params.lessonTitle}>","explanation":"..."},
  {"type":"translation","question":"Translate to ${langName}: <${nativeName} sentence>","correct_answer":"<${langName}>","explanation":"..."},
  {"type":"listening","question":"Listen and choose what you heard:","options":["A","B","C","D"],"correct_answer":"..."}
]}
Progressive difficulty, all content must be about "${params.lessonTitle}".`, 5000)) as Record<string, unknown>[] | null;

      if (Array.isArray(result)) {
        generated = result.slice(0, count).map((ex, i) => ({
          id: `${params.lessonId}_ex_${existing.length + i + 1}`,
          lesson_id: params.lessonId, order_index: existing.length + i + 1,
          type: ex.type ?? "multiple_choice", question: ex.question ?? "",
          options: ex.options ?? null, correct_answer: ex.correct_answer ?? "",
          explanation: ex.explanation ?? null, words: ex.words ?? null,
          translations: ex.translations ?? null, xp_reward: 5,
        }));
        if (generated.length) await tursoService.saveExercises(params.lessonId, existing.length, generated);
      }
    } catch (e) { console.warn("Groq exercise generation/persistence skipped", e); }

    try {
      const updated = await tursoService.getExercises(params.lessonId);
      return parseRows(updated.length ? updated : [...existing, ...generated]);
    } catch {
      return parseRows([...existing, ...generated]);
    }
  },

  /* ═══════════ 3. GRAMER SİSTEMİ ═══════════ */
  async getGrammarTopic(params: {
    topicId: string; topicTitle: string; langCode: string; nativeLangCode: string; level: string;
  }): Promise<Record<string, unknown> | null> {
    if (!isTursoConfigured()) return null;
    const existing = await tursoService.getGrammarTopic(params.topicId);
    if (existing || !ready()) return existing as unknown as Record<string, unknown> | null;

    let generated: Record<string, unknown> | null = null;
    try {
      const langName = LANG_NAMES[params.langCode] ?? "English";
      const nativeName = LANG_NAMES[params.nativeLangCode] ?? "Turkish";
      const r = (await askGroq(`You are a ${langName} grammar expert teaching ${nativeName} speakers. Create a full grammar lesson about "${params.topicTitle}" (level ${params.level}).
Return ONLY valid JSON object: {"title":"...","description":"<1-2 sentences in ${nativeName}>","content":"<structure, formation, when to use — in ${nativeName}, max 400 words>","examples":"<5 examples as '${langName} sentence | ${nativeName} translation' lines>","common_mistakes":"<3-4 mistakes as '❌ wrong → ✅ correct' lines>","native_comparison":"<how it differs from ${nativeName} — 2-3 sentences>"}`)) as Record<string, unknown> | null;
      if (r) {
        generated = {
          id: params.topicId, language: params.langCode, title: r.title ?? params.topicTitle,
          description: r.description ?? "", category: "grammar", level: params.level,
          content: r.content ?? "", examples: r.examples ?? "",
          common_mistakes: r.common_mistakes ?? "", native_comparison: r.native_comparison ?? "",
        };
        await tursoService.saveGrammarTopic(generated);
      }
    } catch (e) { console.warn("Groq grammar generation/persistence skipped", e); }

    try {
      const saved = await tursoService.getGrammarTopic(params.topicId);
      return (saved ?? generated) as unknown as Record<string, unknown> | null;
    } catch {
      return generated;
    }
  },

  /* ═══════════ 4. GÜNLÜK KELİME SİSTEMİ ═══════════ */
  async getDailyWords(params: {
    langCode: string; nativeLangCode: string; level: string; date: string; count?: number;
  }): Promise<Record<string, unknown>[]> {
    const count = params.count ?? 15;
    if (!isTursoConfigured()) return [];
    const setId = `daily_${params.langCode}_${params.nativeLangCode}_${params.date}`;
    const existing = await tursoService.getDailyWordSet(setId);
    if (existing.length >= count * 0.8 || !ready()) return existing as unknown as Record<string, unknown>[];

    let generated: Record<string, unknown>[] = [];
    try {
      const langName = LANG_NAMES[params.langCode] ?? "English";
      const nativeName = LANG_NAMES[params.nativeLangCode] ?? "Turkish";
      const levelDiff: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 5 };
      const diff = levelDiff[params.level] ?? 3;
      const result = (await askGroq(`Generate ${count} practical ${langName} words for a ${params.level} student (native: ${nativeName}). Mix categories (food, greetings, emotions, travel...). Difficulty ${diff}/5.
Return ONLY valid JSON: {"items":[{"word":"...","translation":"<${nativeName}>","pronunciation":"/IPA/","part_of_speech":"noun","example_sentence":"...","example_translation":"<${nativeName}>","difficulty":${diff},"category":"..."}]}`)) as Record<string, unknown>[] | null;
      if (Array.isArray(result)) {
        generated = result.filter((w) => w?.word && w?.translation).slice(0, count).map((w, i) => ({
          id: `w_${params.langCode}_daily_${params.date}_${i}`, language: params.langCode,
          word: String(w.word).trim(), translation: String(w.translation).trim(),
          pronunciation: w.pronunciation ?? null, part_of_speech: w.part_of_speech ?? "noun",
          example_sentence: w.example_sentence ?? null, example_translation: w.example_translation ?? null,
          difficulty: Number(w.difficulty) || diff, category: w.category ?? "general",
        }));
        if (generated.length) await tursoService.saveDailyWords(setId, generated);
      }
    } catch (e) { console.warn("Groq daily word generation/persistence skipped", e); }

    try {
      const updated = await tursoService.getDailyWordSet(setId);
      return (updated.length ? updated : [...existing, ...generated]) as unknown as Record<string, unknown>[];
    } catch {
      return [...existing, ...generated] as unknown as Record<string, unknown>[];
    }
  },

  /* ═══════════ 5. SINAV SORUSU SİSTEMİ (IELTS/TOEFL/YDS) ═══════════ */
  async getExamQuestions(params: {
    examType: string; section: string; langCode: string; nativeLangCode: string; count?: number;
  }): Promise<Record<string, unknown>[]> {
    const count = params.count ?? 10;
    if (!isTursoConfigured()) return [];
    const parseOptions = (value: unknown) => {
      if (typeof value !== "string") return value ?? null;
      try { return JSON.parse(value); } catch { return null; }
    };
    const fetchQ = async () => (await tursoService.getExamQuestions(params.examType, params.section, count))
      .map((q) => ({ ...q, options: parseOptions(q.options) }));
    const existing = await fetchQ();
    if (existing.length >= count * 0.8 || !ready()) return existing;

    let generated: Record<string, unknown>[] = [];
    try {
      const nativeName = LANG_NAMES[params.nativeLangCode] ?? "Turkish";
      const examId = `${params.examType}_${params.section}_${params.langCode}`;
      const result = (await askGroq(`Create ${count} realistic ${params.examType} ${params.section} practice questions for a ${nativeName}-speaking student.
Return ONLY valid JSON: {"items":[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"A. ...","explanation":"<why correct — in ${nativeName}>","difficulty":3}]}
${params.section === "reading" ? "Include short reading context." : ""}${params.section === "listening" ? "Describe what is heard, then ask comprehension questions." : ""}`)) as Record<string, unknown>[] | null;
      if (Array.isArray(result)) {
        const unique = Date.now().toString(36);
        generated = result.slice(0, count).map((q, i) => ({
          id: `${examId}_${unique}_${i}`, exam_type: params.examType, section: params.section,
          question: q.question ?? "", options: q.options ?? null,
          correct_answer: q.correct_answer ?? "", explanation: q.explanation ?? null,
          difficulty: Number(q.difficulty) || 3,
        }));
        if (generated.length) await tursoService.saveExamQuestions(params.examType, params.section, generated);
      }
    } catch (e) { console.warn("Groq exam question generation/persistence skipped", e); }

    try {
      const updated = await fetchQ();
      return updated.length ? updated : [...existing, ...generated];
    } catch {
      return [...existing, ...generated];
    }
  },
};
