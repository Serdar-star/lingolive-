/* ──────────────────────────────────────────────────────────
   LINGOLIVE — Turso-backed, language-pair-aware course loader
   Courses with missing exercises are completed from matched
   vocabulary in the learner's selected target/native pair.
   Pairs without a seeded course receive a 24-lesson path.
   ────────────────────────────────────────────────────────── */
import { UNITS, type Unit, type Lesson, type Exercise, type CEFR } from "../data/mock";
import {
  lessonService,
  isTursoConfigured,
  tursoService,
  type TExercise,
  type TWord,
} from "./turso";
import { langByName } from "../store/language";
import { useApp } from "../store/store";

const ICONS: Record<string, string> = {
  "🌱": "sprout", "🌿": "leaf", "🌳": "map", "🏔️": "brief",
  "👋": "wave", "🔢": "hash", "🎨": "palette", "👨‍👩‍👧‍👦": "users", "⏰": "clock",
  "💎": "gem", "🛒": "cart", "🍽️": "food", "🚌": "bus", "🌤️": "cloud",
  "🏠": "home", "⭐": "crown", "👑": "crown", "✈️": "plane", "🏨": "hotel",
  "🗺️": "map", "🆘": "bellring", "💼": "brief", "👔": "present", "📧": "mail",
  "🎯": "trophy", "📊": "present",
};
const iconOf = (emoji: string, fallback: string) => ICONS[emoji] ?? fallback;

/** One stable key is shared by the loader, app shell and course-path UI. */
export const getCoursePairKey = (target: string, native: string) => `${target}:${native}`;

/** app lesson IDs whose completion must survive the id swap (title → old id) */
const LEGACY: Record<string, string> = {
  "Greetings & Introductions": "l1", "Numbers & Counting": "l2", "Colors & Shapes": "l3",
  "Family & Relationships": "l4", "Telling Time": "l5", "At the Supermarket": "l6",
  "Food & Drinks": "l7", "Public Transport": "l8", "Weather & Seasons": "l9", "At Home": "l10",
};
const checkParse = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  try { return JSON.parse(v as string); } catch { return []; }
};
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
const difficultyOf = (word: TWord) => {
  const value = Number(word.difficulty);
  return Number.isFinite(value) && value >= 1 && value <= 5 ? Math.round(value) : 3;
};

const CATEGORY_LABELS: Record<string, string> = {
  greetings: "Greetings & introductions", food: "Food & drinks", transport: "Transport",
  shopping: "Shopping", home: "Home & daily life", family: "Family & relationships",
  business: "Work & business", daily_life: "Everyday words", medical: "Health & emergencies",
  health: "Health & wellbeing", education: "Education", emotions: "Feelings & emotions",
  travel: "Travel", sports: "Sports", nature: "Nature & weather", fashion: "Clothing & style",
  music: "Music", technology: "Technology", numbers: "Numbers & counting", time: "Time & schedules",
};
const CATEGORY_ICONS: Record<string, string> = {
  greetings: "wave", food: "food", transport: "bus", shopping: "cart", home: "home",
  family: "users", business: "brief", daily_life: "clock", medical: "heart",
  health: "heart", education: "book", emotions: "sparkles", travel: "plane",
  sports: "trophy", nature: "cloud", fashion: "sparkles", music: "sparkles",
  technology: "sparkles", numbers: "hash", time: "clock",
};
const TITLE_CATEGORY_HINTS: { match: RegExp; categories: string[] }[] = [
  { match: /greet|introduc|hello|goodbye/i, categories: ["greetings"] },
  { match: /number|count|time|clock|schedule/i, categories: ["daily_life", "time", "numbers"] },
  { match: /color|shape/i, categories: ["nature", "daily_life"] },
  { match: /family|relationship|people/i, categories: ["family"] },
  { match: /supermarket|shop|market|buy|store/i, categories: ["shopping"] },
  { match: /food|drink|restaurant|meal|cafe/i, categories: ["food"] },
  { match: /transport|bus|train|metro|airport|hotel|direction|travel|flight/i, categories: ["transport", "travel"] },
  { match: /weather|season|nature/i, categories: ["nature"] },
  { match: /home|house|room|furniture/i, categories: ["home"] },
  { match: /emergency|doctor|health|medical|hospital/i, categories: ["medical", "health"] },
  { match: /office|work|meeting|email|job|interview|presentation|business/i, categories: ["business"] },
  { match: /school|study|education|class/i, categories: ["education"] },
  { match: /sport|game|exercise/i, categories: ["sports"] },
  { match: /music|song/i, categories: ["music"] },
  { match: /technology|computer|phone|internet/i, categories: ["technology"] },
  { match: /fashion|clothes|clothing/i, categories: ["fashion"] },
  { match: /emotion|feeling/i, categories: ["emotions"] },
];
function categoryHints(title: string): string[] {
  return TITLE_CATEGORY_HINTS.find((item) => item.match.test(title))?.categories ?? [];
}
function titleForWords(words: TWord[], fallbackIndex: number): string {
  const counts = new Map<string, number>();
  for (const word of words) {
    const category = (word.category || "general").trim().toLowerCase();
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return top && top !== "general"
    ? CATEGORY_LABELS[top] ?? `${top.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())} vocabulary`
    : `Vocabulary set ${String(fallbackIndex).padStart(2, "0")}`;
}

const LEVEL_RANGES: Record<CEFR, [number, number]> = {
  A1: [1, 2], A2: [2, 3], B1: [3, 4], B2: [4, 5], C1: [5, 5], C2: [5, 5],
};
function asLevel(value: string): CEFR {
  return (["A1", "A2", "B1", "B2", "C1", "C2"].includes(value) ? value : "A1") as CEFR;
}
function takeLessonWords(
  pool: TWord[],
  level: CEFR,
  used: Set<string>,
  title: string,
  count = 5,
  extraHints: string[] = [],
): TWord[] {
  const [min, max] = LEVEL_RANGES[level];
  const hints = [...new Set([...extraHints, ...categoryHints(title)])];
  const unused = pool.filter((word) => !used.has(word.id || `${normalized(word.word)}:${normalized(word.translation)}`));
  const inRange = unused.filter((word) => difficultyOf(word) >= min && difficultyOf(word) <= max);
  const candidates = inRange.length >= count ? inRange : unused;
  const sorted = [...candidates].sort((a, b) => {
    const categoryA = (a.category || "general").toLowerCase();
    const categoryB = (b.category || "general").toLowerCase();
    const hintA = hints.length ? (hints.includes(categoryA) ? hints.indexOf(categoryA) : hints.length + 1) : 0;
    const hintB = hints.length ? (hints.includes(categoryB) ? hints.indexOf(categoryB) : hints.length + 1) : 0;
    const midpoint = (min + max) / 2;
    return hintA - hintB
      || Math.abs(difficultyOf(a) - midpoint) - Math.abs(difficultyOf(b) - midpoint)
      || categoryA.localeCompare(categoryB)
      || a.word.localeCompare(b.word);
  });
  const selected: TWord[] = [];
  const seenTarget = new Set<string>();
  const seenNative = new Set<string>();
  for (const word of sorted) {
    const targetKey = normalized(word.word);
    const nativeKey = normalized(word.translation);
    if (!targetKey || !nativeKey || seenTarget.has(targetKey) || seenNative.has(nativeKey)) continue;
    seenTarget.add(targetKey);
    seenNative.add(nativeKey);
    selected.push(word);
    if (selected.length >= count) break;
  }
  for (const word of selected) used.add(word.id || `${normalized(word.word)}:${normalized(word.translation)}`);
  return selected;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function seededShuffle<T>(items: T[], seedText: string): T[] {
  const output = [...items];
  let seed = hashSeed(seedText) || 1;
  for (let i = output.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
function optionsFor(answer: string, pool: TWord[], field: "word" | "translation", seed: string): string[] {
  const answerKey = normalized(answer);
  const seen = new Set([answerKey]);
  const distractors: string[] = [];
  for (const item of pool) {
    const candidate = item[field]?.trim();
    const key = candidate ? normalized(candidate) : "";
    if (!candidate || !key || seen.has(key)) continue;
    seen.add(key);
    distractors.push(candidate);
    if (distractors.length >= 12) break;
  }
  return seededShuffle([answer, ...distractors.slice(0, 3)], seed);
}

/** Build exercises only from verified target/native dictionary pairs. */
function makeVocabularyExercises(
  words: TWord[],
  distractorPool: TWord[],
  targetCode: string,
  nativeCode: string,
  lessonId: string,
): Exercise[] {
  const [mcWord, fillWord, translateWord, listenWord] = [words[0], words[1] ?? words[0], words[2] ?? words[0], words[3] ?? words[0]];
  const targetName = langByName(targetCode).name;
  const nativeName = langByName(nativeCode).name;
  const id = (suffix: string) => `${lessonId}_pair_${suffix}`;
  const matchPairs = words.map((word) => ({ a: word.word, b: word.translation }));
  return [
    {
      id: id("choice"), type: "mc",
      question: `How do you say “${mcWord.translation}” in ${targetName}?`,
      options: optionsFor(mcWord.word, distractorPool, "word", id("choice")),
      correct: mcWord.word,
      explanation: `“${mcWord.translation}” means “${mcWord.word}” in ${targetName}.`,
    },
    {
      id: id("fill"), type: "fill",
      question: `Choose the ${targetName} word for the ${nativeName} clue.`,
      blanks: [`${nativeName}: “${fillWord.translation}” → `, ""],
      words: optionsFor(fillWord.word, distractorPool, "word", id("fill")),
      correct: fillWord.word,
      explanation: `The matching ${targetName} word is “${fillWord.word}”.`,
    },
    {
      id: id("match"), type: "match",
      question: `Match each ${targetName} word with its ${nativeName} meaning.`,
      pairs: matchPairs,
    },
    {
      id: id("translate"), type: "translate",
      question: `Translate into ${targetName}: “${translateWord.translation}”`,
      correct: translateWord.word,
      hint: `One ${targetName} word.`,
      explanation: `“${translateWord.translation}” means “${translateWord.word}”.`,
    },
    {
      id: id("listen"), type: "listen",
      question: `Listen to the ${targetName} word and choose what you heard.`,
      sentence: listenWord.word,
      options: optionsFor(listenWord.word, distractorPool, "word", id("listen")),
      correct: listenWord.word,
      explanation: `The word you heard means “${listenWord.translation}” in ${nativeName}.`,
    },
  ];
}

const DYNAMIC_UNITS: {
  title: string; description: string; icon: string; level: CEFR; topics: string[];
}[] = [
  { title: "Unit 1 · First steps", description: "Build a foundation in everyday vocabulary.", icon: "sprout", level: "A1", topics: ["greetings", "family", "food", "shopping", "daily_life", "travel"] },
  { title: "Unit 2 · Everyday life", description: "Grow your practical vocabulary for daily situations.", icon: "leaf", level: "A2", topics: ["home", "transport", "nature", "health", "emotions", "sports"] },
  { title: "Unit 3 · Explore more", description: "Practice useful words for travel, learning and culture.", icon: "plane", level: "B1", topics: ["travel", "education", "technology", "music", "fashion", "nature"] },
  { title: "Unit 4 · Confident use", description: "Build broader vocabulary for work and real conversations.", icon: "brief", level: "B2", topics: ["business", "technology", "health", "travel", "education", "sports"] },
];
function buildGeneratedCourse(words: TWord[], targetCode: string, nativeCode: string): Unit[] {
  const used = new Set<string>();
  let lessonNumber = 0;
  const targetName = langByName(targetCode).name;
  const units = DYNAMIC_UNITS.map((unitMeta, unitIndex): Unit => {
    const seenTitles = new Map<string, number>();
    const lessons: Lesson[] = unitMeta.topics.map((topic, lessonIndex) => {
      lessonNumber += 1;
      const lessonId = `path_${targetCode}_${nativeCode}_u${unitIndex + 1}_l${lessonIndex + 1}`;
      const lessonWords = takeLessonWords(words, unitMeta.level, used, topic, 5, [topic]);
      if (lessonWords.length < 5) throw new Error(`Not enough matched ${targetName} vocabulary to build lesson ${lessonNumber}.`);
      const baseTitle = titleForWords(lessonWords, lessonNumber);
      const occurrence = (seenTitles.get(baseTitle) ?? 0) + 1;
      seenTitles.set(baseTitle, occurrence);
      const title = occurrence === 1 ? baseTitle : `${baseTitle} · ${occurrence}`;
      const kind = lessonIndex === unitMeta.topics.length - 1
        ? (unitIndex === DYNAMIC_UNITS.length - 1 ? "boss" : "checkpoint")
        : "lesson";
      return {
        id: lessonId,
        title,
        icon: CATEGORY_ICONS[(lessonWords[0]?.category || "").toLowerCase()] ?? "book",
        desc: `Learn ${lessonWords.length} matched ${targetName} words, with meanings in your native language.`,
        mins: kind === "boss" ? 15 : 8,
        xp: kind === "boss" ? 250 : kind === "checkpoint" ? 75 : 25 + unitIndex * 5,
        newWords: lessonWords.length,
        kind,
        exercises: makeVocabularyExercises(lessonWords, words, targetCode, nativeCode, lessonId),
      };
    });
    return {
      id: `path_${targetCode}_${nativeCode}_u${unitIndex + 1}`,
      title: unitMeta.title,
      desc: `${unitMeta.description} Target language: ${targetName}.`,
      icon: unitMeta.icon,
      level: unitMeta.level,
      lessons,
    };
  });
  return units;
}

export function mapExercise(e: TExercise): Exercise {
  const words = checkParse(e.words);
  const translations = checkParse(e.translations);
  const options = checkParse(e.options);
  switch (e.type) {
    case "multiple_choice":
      return { id: e.id, type: "mc", question: e.question, options, correct: e.correct_answer, explanation: e.explanation ?? undefined };
    case "fill_blank": {
      const [b0, b1] = e.question.split("___");
      return { id: e.id, type: "fill", question: "Complete the sentence:", blanks: [b0 ?? "", b1 ?? ""], words, correct: e.correct_answer, explanation: e.explanation ?? undefined };
    }
    case "word_arrangement":
      return { id: e.id, type: "arrange", question: e.question, words, correctArr: e.correct_answer.split(" ") };
    case "matching":
      return { id: e.id, type: "match", question: e.question, pairs: words.map((a, i) => ({ a, b: translations[i] ?? a })) };
    case "listening":
      return { id: e.id, type: "listen", question: e.question, sentence: e.correct_answer, options, correct: e.correct_answer, explanation: e.explanation ?? undefined };
    case "speaking":
      return { id: e.id, type: "speak", question: e.question, sentence: e.correct_answer, explanation: e.explanation ?? undefined };
    case "translation":
      return { id: e.id, type: "translate", question: e.question, correct: e.correct_answer, explanation: e.explanation ?? undefined };
    case "image_choice":
      return { id: e.id, type: "image", question: e.question, target: e.question, imageOptions: options.map((o) => ({ icon: "sparkles", label: o })), correct: e.correct_answer };
    default:
      return { id: e.id, type: "mc", question: e.question, options, correct: e.correct_answer };
  }
}

let hydrationSequence = 0;
export async function hydrateCourse(target = "en", native = "tr"): Promise<void> {
  const pairKey = getCoursePairKey(target, native);
  const state = useApp.getState();
  if (state.coursePairKey === pairKey && (state.courseStatus === "ready" || state.courseStatus === "loading")) return;
  const sequence = ++hydrationSequence;
  useApp.setState({
    coursePairKey: pairKey,
    courseStatus: "loading",
    courseError: null,
    activeLesson: null,
    lessonLoading: false,
    lessonError: null,
  });

  if (!isTursoConfigured()) {
    if (target === "en" && native === "tr") {
      useApp.setState({ coursePairKey: pairKey, courseStatus: "ready", courseError: null });
    } else {
      useApp.setState({
        coursePairKey: pairKey,
        courseStatus: "error",
        courseError: "Connect the Turso vocabulary database to build a course for this language pair.",
      });
    }
    return;
  }

  try {
    const [course, pairWords] = await Promise.all([
      lessonService.getFullCourse(target, native),
      tursoService.getCoursePairWords(target, native, 700),
    ]);
    if (sequence !== hydrationSequence) return;
    if (pairWords.length < 5) throw new Error(`No usable ${langByName(target).name}–${langByName(native).name} vocabulary pairs were returned.`);

    let mapped: Unit[];
    if (!course?.units.length || !course.lessons.length) {
      mapped = buildGeneratedCourse(pairWords, target, native);
    } else {
      const allEx = await lessonService.getAllExercises();
      if (sequence !== hydrationSequence) return;
      const exByLesson = new Map<string, TExercise[]>();
      for (const exercise of allEx) {
        const arr = exByLesson.get(exercise.lesson_id) ?? [];
        arr.push(exercise);
        exByLesson.set(exercise.lesson_id, arr);
      }
      const used = new Set<string>();
      mapped = [...course.units]
        .sort((a, b) => a.order_index - b.order_index)
        .map((unit): Unit => {
          const level = asLevel(unit.level);
          const lessons: Lesson[] = course.lessons
            .filter((lesson) => lesson.unit_id === unit.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map((lesson) => {
              const dbExercises = (exByLesson.get(lesson.id) ?? []).sort((a, b) => a.order_index - b.order_index);
              const live = dbExercises.map(mapExercise);
              const needsExercises = Math.max(0, 5 - live.length);
              const lessonWords = needsExercises
                ? takeLessonWords(pairWords, level, used, lesson.title, 5)
                : [];
              const generated = needsExercises
                ? makeVocabularyExercises(lessonWords, pairWords, target, native, lesson.id)
                : [];
              const existingTypes = new Set(live.map((exercise) => exercise.type));
              const supplements = [
                ...generated.filter((exercise) => !existingTypes.has(exercise.type)),
                ...generated.filter((exercise) => existingTypes.has(exercise.type)),
              ].slice(0, needsExercises);
              const exercises = [...live, ...supplements];
              return {
                id: lesson.id,
                title: lesson.title,
                icon: iconOf(lesson.emoji, "book"),
                desc: lesson.description ?? "",
                mins: lesson.estimated_minutes,
                xp: lesson.xp_reward,
                newWords: live.length >= 5 ? lesson.new_words_count : lessonWords.length,
                kind: lesson.type === "checkpoint" ? "checkpoint" : lesson.type === "boss" ? "boss" : "lesson",
                exercises,
              } satisfies Lesson;
            });
          return {
            id: unit.id,
            title: unit.title.split("—")[0]?.trim() ?? unit.title,
            desc: unit.description ?? "",
            icon: iconOf(unit.emoji, "book"),
            level,
            lessons,
          };
        });
    }

    if (!mapped.length || !mapped.some((unit) => unit.lessons.length)) throw new Error("The selected language pair returned an empty course path.");
    if (mapped.some((unit) => unit.lessons.some((lesson) => lesson.exercises.length === 0))) {
      throw new Error("Some lessons still have no usable exercises; the course was not published to the app.");
    }
    if (sequence !== hydrationSequence) return;

    // Keep the shared array identity: course screens and lesson indexers read it directly.
    UNITS.splice(0, UNITS.length, ...mapped);

    const previousCompleted = useApp.getState().completed;
    const nextCompleted: Record<string, { stars: number; score: number }> = {};
    for (const unit of mapped) {
      for (const lesson of unit.lessons) {
        if (previousCompleted[lesson.id]) nextCompleted[lesson.id] = previousCompleted[lesson.id];
        const legacyId = LEGACY[lesson.title];
        if (legacyId && previousCompleted[legacyId]) nextCompleted[lesson.id] = previousCompleted[legacyId];
      }
    }
    useApp.setState({
      completed: nextCompleted,
      coursePairKey: pairKey,
      courseStatus: "ready",
      courseError: null,
    });
    useApp.getState().pushToast({
      title: "Learning path ready",
      desc: `${mapped.reduce((total, unit) => total + unit.lessons.length, 0)} lessons for ${langByName(native).name} → ${langByName(target).name}`,
      icon: "book",
      tone: "green",
    });
  } catch (error) {
    if (sequence !== hydrationSequence) return;
    const message = error instanceof Error ? error.message : "The course could not be loaded.";
    useApp.setState({ coursePairKey: pairKey, courseStatus: "error", courseError: message });
    console.warn("Turso course hydrate failed", { target, native, error });
  }
}
