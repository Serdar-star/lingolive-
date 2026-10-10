import { supabase } from "./supabase";
import { vocabularyService, type TWord } from "./turso";

export type StudyCard = {
  wordId: string;
  en: string;
  tr: string;
  pronunciation: string;
  example: string;
  srsLevel: number;
};

export type StudyDeck = {
  cards: StudyCard[];
  demo: boolean;
  emptyReason?: string;
  nextReviewAt?: string;
};

const fromTursoWord = (word: TWord, srsLevel = 0): StudyCard => ({
  wordId: word.id,
  en: word.word,
  tr: word.translation,
  pronunciation: word.pronunciation ?? "",
  example: word.example_sentence ?? "",
  srsLevel,
});

/** Load due words, a chosen category, or seed a new learner with real Turso words. */
export async function loadStudyDeck(input: { userId: string | null; level: string; language?: string; category?: string | null; limit?: number }): Promise<StudyDeck> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 12));
  const language = input.language || "en";

  if (input.category) {
    const words = await vocabularyService.getWordsByCategory(input.category, language, limit);
    if (!words.length) return { cards: [], demo: !input.userId, emptyReason: `No words are available in ${input.category} yet.` };
    if (!input.userId) return { cards: words.map((word) => fromTursoWord(word)), demo: true };
    const { data: saved, error } = await supabase.from("user_vocabulary")
      .select("word_id, srs_level").eq("user_id", input.userId).in("word_id", words.map((word) => word.id));
    if (error) throw new Error(`Saved vocabulary could not be loaded: ${error.message}`);
    const levels = new Map((saved ?? []).map((row) => [row.word_id, row.srs_level ?? 0]));
    return { cards: words.map((word) => fromTursoWord(word, levels.get(word.id) ?? 0)), demo: false };
  }

  if (!input.userId) {
    const words = await vocabularyService.getDailyWords(input.level || "B1", limit, language);
    if (!words.length) return { cards: [], demo: true, emptyReason: "Sign in and connect the vocabulary service to start a saved review." };
    return { cards: words.map((word) => fromTursoWord(word)), demo: true };
  }

  const now = new Date().toISOString();
  const { data: due, error: dueError } = await supabase.from("user_vocabulary")
    .select("word_id, word, translation, srs_level, next_review_at")
    .eq("user_id", input.userId).lte("next_review_at", now)
    .order("next_review_at", { ascending: true }).limit(limit);
  if (dueError) throw new Error(`Due vocabulary could not be loaded: ${dueError.message}`);
  if (due?.length) {
    return {
      cards: due.map((row) => ({ wordId: row.word_id, en: row.word, tr: row.translation ?? "", pronunciation: "", example: "", srsLevel: row.srs_level ?? 0 })),
      demo: false,
    };
  }

  const { count, error: countError } = await supabase.from("user_vocabulary")
    .select("word_id", { count: "exact", head: true }).eq("user_id", input.userId);
  if (countError) throw new Error(`Vocabulary status could not be checked: ${countError.message}`);
  if ((count ?? 0) > 0) {
    const { data: upcoming, error: upcomingError } = await supabase.from("user_vocabulary")
      .select("next_review_at").eq("user_id", input.userId)
      .order("next_review_at", { ascending: true }).limit(1);
    if (upcomingError) throw new Error(`Next review time could not be loaded: ${upcomingError.message}`);
    return { cards: [], demo: false, emptyReason: "You have no words due right now.", nextReviewAt: upcoming?.[0]?.next_review_at ?? undefined };
  }

  const seedWords = await vocabularyService.getDailyWords(input.level || "B1", limit, language);
  if (!seedWords.length) return { cards: [], demo: false, emptyReason: "No vocabulary is available to seed your first review." };
  const firstDueAt = new Date().toISOString();
  const { error: seedError } = await supabase.from("user_vocabulary").upsert(
    seedWords.map((word) => ({
      user_id: input.userId!, word_id: word.id, word: word.word, translation: word.translation,
      status: "LEARNING", srs_level: 0, next_review_at: firstDueAt,
    })),
    { onConflict: "user_id,word_id", ignoreDuplicates: true },
  );
  if (seedError) throw new Error(`Your first vocabulary deck could not be prepared: ${seedError.message}`);
  return { cards: seedWords.map((word) => fromTursoWord(word)), demo: false };
}

/** Persist one real review and its next SRS interval; never writes for demo cards. */
export async function saveStudyReview(userId: string, card: StudyCard, grade: 1 | 2 | 3): Promise<void> {
  const nextLevel = grade === 1 ? Math.max(0, card.srsLevel - 1) : Math.min(8, card.srsLevel + (grade === 3 ? 2 : 1));
  const dayIntervals = [1, 2, 4, 7, 14, 30, 60, 90];
  const delay = grade === 1
    ? 10 * 60 * 1000
    : dayIntervals[Math.max(0, Math.min(dayIntervals.length - 1, nextLevel - 1))] * 24 * 60 * 60 * 1000;
  const status = nextLevel >= 5 ? "MASTERED" : nextLevel > 0 ? "REVIEWING" : "LEARNING";
  const { error } = await supabase.from("user_vocabulary").upsert({
    user_id: userId,
    word_id: card.wordId,
    word: card.en,
    translation: card.tr,
    status,
    srs_level: nextLevel,
    next_review_at: new Date(Date.now() + delay).toISOString(),
  }, { onConflict: "user_id,word_id" });
  if (error) throw new Error(`This review was not saved: ${error.message}`);
}
