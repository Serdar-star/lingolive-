import type { CurrentUser, Mission } from "../data/mock";
import type { AIMessage, AIProgressItem, AIQuiz, AIWordCard } from "../store/store";

export interface EngineCtx {
  user: CurrentUser;
  xp: number;
  levelNum: number;
  xpToNext: number;
  streak: number;
  todayXP: number;
  missions: Mission[];
  nextLessonTitle: string;
  completedCount: number;
  practice: boolean;
}

type Out = Omit<AIMessage, "id" | "time">;
export interface EngineResult { msgs: Out[]; practice: boolean }

/* ─────────── CONTENT POOLS ─────────── */
const WORD_POOL: AIWordCard[] = [
  { word: "reservation", pro: "/ˌrez.ɚˈveɪ.ʃən/", tr: "rezervasyon", ex: "I'd like to make a reservation for two." },
  { word: "approximately", pro: "/əˈprɒk.sɪ.mət.li/", tr: "yaklaşık olarak", ex: "The journey takes approximately two hours." },
  { word: "achievement", pro: "/əˈtʃiːv.mənt/", tr: "başarı", ex: "Finishing Unit 2 was a real achievement." },
  { word: "neighborhood", pro: "/ˈneɪ.bɚ.hʊd/", tr: "mahalle", ex: "My neighborhood is very quiet at night." },
  { word: "delicious", pro: "/dɪˈlɪʃ.əs/", tr: "lezzetli", ex: "This kebab is absolutely delicious!" },
  { word: "nervous", pro: "/ˈnɜː.vəs/", tr: "gergin, heyecanlı", ex: "I always get nervous before interviews." },
  { word: "available", pro: "/əˈveɪ.lə.bəl/", tr: "müsait, mevcut", ex: "Are you available for a call tonight?" },
  { word: "journey", pro: "/ˈdʒɜː.ni/", tr: "yolculuk", ex: "Learning a language is a long journey." },
  { word: "borrow", pro: "/ˈbɒr.oʊ/", tr: "ödünç almak", ex: "Can I borrow your charger for a minute?" },
  { word: "improve", pro: "/ɪmˈpruːv/", tr: "geliştirmek", ex: "Daily speaking will improve your fluency." },
];

const QUIZ_POOL: { question: string; options: string[]; answer: number; explanation: string }[] = [
  { question: "Choose the correct sentence:", options: ["She don't like tea.", "She doesn't likes tea.", "She doesn't like tea.", "She not like tea."], answer: 2, explanation: "Third person singular uses \"doesn't\" + base verb (no -s)." },
  { question: "\"I ___ never ___ sushi.\" (Present Perfect)", options: ["have / tried", "had / try", "have / try", "did / tried"], answer: 0, explanation: "Present perfect = have/has + V3 (tried)." },
  { question: "Pick the past participle of \"go\":", options: ["goed", "went", "gone", "going"], answer: 2, explanation: "go → went → gone. \"Went\" is past simple, \"gone\" is V3." },
  { question: "\"If it rains tomorrow, I ___ at home.\"", options: ["will stay", "would stay", "stayed", "stay"], answer: 0, explanation: "First conditional: if + present, will + verb." },
  { question: "Which one is correct?", options: ["I am agree with you.", "I agree with you.", "I agreeding with you.", "I am agreeing you."], answer: 1, explanation: "\"Agree\" is a stative verb — no \"am\", no -ing." },
  { question: "\"She has lived here ___ 2019.\"", options: ["for", "since", "from", "at"], answer: 1, explanation: "\"Since\" + point in time (2019), \"for\" + duration (5 years)." },
];

const PRACTICE_PROMPTS = [
  "Nice one! Next: describe your favorite meal. What is it, and when do you usually eat it?",
  "Good! Now tell me: where did you go on your last trip? What did you like most there?",
  "Great! Question: what do you usually do on Sunday mornings?",
  "Well done! Tell me about a movie you watched recently — would you recommend it?",
  "Awesome! Last one: what's your dream job, and why?",
];

const MISTAKES: [RegExp, string, string][] = [
  [/\bi goed\b/i, "I went", "\"go\" is irregular: go → went → gone"],
  [/\bshe don't\b/i, "she doesn't", "third person needs \"doesn't\""],
  [/\bhe don't\b/i, "he doesn't", "third person needs \"doesn't\""],
  [/\bi am agree\b/i, "I agree", "\"agree\" is a verb — no \"am\" needed"],
  [/\bpeoples\b/i, "people", "\"people\" is already plural"],
  [/\bmore better\b/i, "better", "\"better\" is already comparative"],
  [/\bi have went\b/i, "I have gone", "present perfect needs V3: gone"],
  [/\bi have 25 years\b/i, "I am 25 years old", "English uses \"am\" with age"],
];

const GRAMMAR: Record<string, string> = {
  perfect: `**Present Perfect** — great choice, this one clicks for most B1 learners.
Structure: **have/has + V3** (past participle)
• I **have visited** London twice.
• She **has eaten** lunch already.

Türkçe'deki "-miş" geçmiş zamana çok benzer: "I have been to Paris" ≈ "Paris'e gitmişim".

**Ne zaman kullanılır?**
• Experience: I **have tried** sushi (at some point in life)
• Change: She **has grown** taller
• Continuing: I **have lived** here **for** 5 years / **since** 2019

Heads up — in Lesson 7 you wrote "I have went". The correct form is **I have gone** (gone = V3 of go). You've nearly got it!`,
  past: `**Past Simple** — finished actions at a finished time.
Structure: **subject + V2** • **didn't + V1** • **Did + subject + V1?**
• I **went** to the store yesterday.
• She **didn't watch** the match.
• **Did** you **enjoy** the concert?

Key time markers: yesterday, last week, in 2015, two days ago.
Quick contrast: **Past simple** = done, time known. **Present perfect** = experience, time unknown.`,
  continuous: `**Present Continuous** — happening now or around now.
Structure: **am/is/are + V-ing**
• I **am studying** English right now.
• It **is raining** outside.
Also used for fixed future plans: "I **am meeting** Maria tonight."`,
  future: `**Future forms** — two main players:
• **will + V1** → instant decisions & predictions: "I **will help** you." / "It **will rain**."
• **going to + V1** → plans & visible signs: "I **am going to travel** to Spain." / "Look at those clouds — it **is going to rain**."
Tip: use "going to" for plans you've already decided.`,
  conditional: `**First Conditional** — real possibilities.
Structure: **if + present simple, will + V1**
• If it **rains**, I **will stay** home.
• If you **practice** daily, you **will reach** B2 this year.
The "if" part never takes "will" — that's the #1 mistake to avoid!`,
};

const MOTIVATIONS = [
  "every learner hits this wall — and every fluent speaker climbed over it",
  "progress feels invisible day to day, then suddenly obvious — like a river carving stone",
  "5 focused minutes today beats a heroic 2 hours you never start",
];

function detectMistake(text: string): { fix: string; why: string } | null {
  for (const [re, fix, why] of MISTAKES) {
    if (re.test(text)) return { fix, why };
  }
  return null;
}

function has(text: string, ...keys: string[]) {
  const t = text.toLowerCase();
  return keys.some((k) => t.includes(k));
}

/* ─────────── ENGINE ─────────── */
export function respond(input: string, ctx: EngineCtx): EngineResult {
  const t = input.toLowerCase().trim();
  const name = ctx.user.firstName;
  const done = ctx.missions.filter((m) => m.done).length;
  const weak = [...ctx.user.skills].sort((a, b) => a.value - b.value)[0];
  const speakingMission = ctx.missions.find((m) => m.id === "m_call");
  const roomMission = ctx.missions.find((m) => m.id === "m_room");

  /* — practice mode (conversational) — */
  const isPracticeIntent = has(t, "practice", "konuş", "talk", "sohbet", "ingilizce konuş");
  if ((ctx.practice && !has(t, "quiz", "stop", "progress", "words", "grammar")) || isPracticeIntent) {
    const mistake = detectMistake(input);
    if (isPracticeIntent) {
      return {
        practice: true,
        msgs: [
          { role: "assistant", text:
`Let's do it — free conversation, ${name}! I'll keep it at your B1 level and correct mistakes gently along the way.

First topic, from your interests: you like **movies**, right?

Tell me — what was the **last movie** you watched? Did you like it? Why or why not?
(Take your time. Write anything, perfect English is not required — I'll help you polish it.)` },
        ],
      };
    }
    // in-practice reply
    const prompt = PRACTICE_PROMPTS[Math.floor(Math.random() * PRACTICE_PROMPTS.length)];
    if (mistake) {
      return {
        practice: true,
        msgs: [
          { role: "assistant", text:
`Excellent effort! One small fix:
• You wrote: "${input.trim().slice(0, 80)}"
• Better: "**${mistake.fix}**" — ${mistake.why}.

Keep going though — your sentence structure is really solid for B1.
${prompt}` },
        ],
      };
    }
    return {
      practice: ctx.practice,
      msgs: [
        { role: "assistant", text:
`I'm genuinely impressed — clean, natural English!

Small style tip for next time: try adding a **reason** with "because" or a **connector** like "however". It instantly lifts your writing to B2.

${prompt}` },
      ],
    };
  }

  /* — progress / stats — */
  if (has(t, "progress", "istatistik", "kaç kelime", "how many", "stats", "bugün", "today")) {
    const progress: AIProgressItem[] = [
      { icon: "cap", label: "Lessons today", value: `${done + 1}/${ctx.missions.length}`, bar: ((done + 1) / ctx.missions.length) * 100 },
      { icon: "book", label: "Words learned (total)", value: ctx.user.stats.wordsLearned.toLocaleString() },
      { icon: "mic", label: "Speaking today", value: speakingMission && speakingMission.done ? "✅ done" : "❌ not yet" },
      { icon: "zap", label: "XP today", value: `${ctx.todayXP}`, bar: Math.min(100, (ctx.todayXP / 200) * 100) },
    ];
    return {
      practice: false,
      msgs: [
        { role: "assistant", text:
`Here's your day at a glance, ${name}:

**${ctx.todayXP} XP earned today** — and a **${ctx.streak}-day streak** alive and burning.
You learned **23 new words** today; your best category was **Food & Drinks** (8 words). There are **32 cards** due for review — want me to quiz you after this?`,
          progress,
          actions: [
            { label: "Flashcards", icon: "note", go: "flashcards" },
            { label: "Detailed stats", icon: "book", go: "learn" },
          ],
        },
      ],
    };
  }

  /* — what should I study — */
  if (has(t, "ne yapmalıyım", "what should", "recommend", "öner", "next", "plan", "ne çalışayım")) {
    return {
      practice: false,
      msgs: [
        { role: "assistant", text:
`Great question — here's my read of your day:

✅ **${done}/${ctx.missions.length} missions** complete
✅ Words learned
${speakingMission?.done ? "✅" : "❌"} **Speaking practice** ${speakingMission?.done ? "done" : "still open"}
${roomMission?.done ? "✅" : "❌"} **Voice room** ${roomMission?.done ? "done" : "still open"}

My prescription: your weakest skill right now is **${weak.label} (${weak.value}%)**. Join the "Morning Coffee Chat" voice room for 10 minutes — it has 8 speakers live — then close the day with "${ctx.nextLessonTitle}" (worth +30 XP).`,
          actions: [
            { label: "Join voice room", icon: "rooms", go: "room" },
            { label: `Start "${ctx.nextLessonTitle}"`, icon: "cap", go: "lesson" },
            { label: "Find video partner", icon: "video", go: "live" },
          ],
        },
      ],
    };
  }

  /* — grammar — */
  if (has(t, "grammar", "tense", "açıkla", "explain", "present", "past", "future", "conditional", "gelecek")) {
    let body = GRAMMAR.perfect;
    if (has(t, "past", "geçmiş") && !has(t, "perfect")) body = GRAMMAR.past;
    else if (has(t, "continuous", "şimdiki")) body = GRAMMAR.continuous;
    else if (has(t, "future", "will", "going to", "gelecek")) body = GRAMMAR.future;
    else if (has(t, "conditional", "if clause", "koşul")) body = GRAMMAR.conditional;
    return {
      practice: false,
      msgs: [
        { role: "assistant", text: body },
        { role: "assistant", text: "Want to lock it in? I can fire a quick quiz — tap below or just say \"quiz me\".", quiz: nextQuiz() },
      ],
    };
  }

  /* — quiz — */
  if (has(t, "quiz", "test", "soru sor", "sınava sok")) {
    return {
      practice: false,
      msgs: [
        { role: "assistant", text: "Quiz time! Here's a B1-level question — trust yourself, you know this:", quiz: nextQuiz() },
      ],
    };
  }

  /* — vocabulary — */
  if (has(t, "word", "kelime", "vocab", "sözcük")) {
    const words = [...WORD_POOL].sort(() => 0.5 - Math.random()).slice(0, 3);
    return {
      practice: false,
      msgs: [
        { role: "assistant", text: `Three words at your level, ${name} — read each one out loud, then tell me a sentence using any of them. I'll check it.`, words },
      ],
    };
  }

  /* — writing check — */
  if (has(t, "check", "kontrol", "düzelt", "correct my", "writing") || input.trim().length > 60) {
    const mistake = detectMistake(input);
    const startsLower = /^[a-z]/.test(input.trim());
    return {
      practice: false,
      msgs: [
        { role: "assistant", text:
`Here's your writing check:

${mistake ? `⚠️ One grammar slip:\n• "**${mistake.fix}**" — ${mistake.why}` : "✅ **No grammar mistakes found** — seriously impressive."}
${startsLower ? "• Start sentences with a **capital letter**.\n" : ""}• Punctuation, articles and verb forms all look right.
• Style: this reads natural for B1+. To push toward B2, add one **linking word** ("however", "meanwhile", "as a result").

Overall: **9/10**. Keep writing Moments like this every day and your Writing skill (58%) will climb fast.` },
      ],
    };
  }

  /* — motivation — */
  if (has(t, "motiv", "tired", "yoruldum", "boring", "give up", "pes", "sıkıldım", "lazy")) {
    return {
      practice: false,
      msgs: [
        { role: "assistant", text:
`Hey — ${MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)]}. Look at where you already are, ${name}:

🔥 **${ctx.streak}-day streak** (incredible discipline)
📚 **${ctx.user.stats.wordsLearned.toLocaleString()} words** learned
🗣️ **${ctx.user.stats.speakingHours} hours** of speaking
👥 **${ctx.user.stats.partnersMet} partners** met

You're B1 — most learners never get this far. The dip you're feeling is literally the feeling of growth.
My advice: no heroics today. Just **5 minutes** — one flashcard deck or a short visit to a voice room. Small steps > no steps. I've got you.`,
          actions: [
            { label: "5-min flashcards", icon: "note", go: "flashcards" },
            { label: "Quick video match", icon: "video", go: "live" },
          ],
        },
      ],
    };
  }

  /* — greetings / fallback — */
  if (has(t, "hello", "hi", "hey", "merhaba", "selam")) {
    return {
      practice: false,
      msgs: [
        { role: "assistant", text:
`Hey ${name}! Great to see you — you're ${ctx.xpToNext - ctx.xp} XP from **Level ${ctx.levelNum + 1}**, by the way.

What are we doing today? I can check your progress, teach words, explain grammar, quiz you, or just chat in English with gentle corrections.` },
      ],
    };
  }

  /* — default smart fallback — */
  return {
    practice: false,
    msgs: [
      { role: "assistant", text:
`Interesting question! I didn't find that in my lesson bank yet — but here's what I can do brilliantly right now:

• **"My progress today"** — live stats from your account
• **"Explain present perfect"** — with your own mistakes as examples
• **"Teach me words"** — 3 new words with Turkish meanings
• **"Quiz me"** — instant B1 questions
• **"Practice English"** — free conversation with gentle corrections
• **"Motivate me"** — fully data-backed pep talks

Which one shall we try?` },
    ],
  };
}

/* quiz rotation */
let quizIdx = 0;
export function nextQuiz(): AIQuiz {
  const q = QUIZ_POOL[quizIdx % QUIZ_POOL.length];
  quizIdx++;
  return { ...q, answered: null };
}

export function gradeQuiz(q: AIQuiz, pick: number): Out {
  const ok = pick === q.answer;
  return {
    role: "assistant",
    text: ok
      ? `**Correct!** ${q.explanation}

You're clearly ready for harder material — say "quiz me" anytime for another round.`
      : `Not quite — the right answer is "**${q.options[q.answer]}**".
${q.explanation}

Want another one? Just say "quiz me".`,
  };
}

/* context-aware suggestion pills */
export function suggestPills(ctx: EngineCtx): string[] {
  const out: string[] = [];
  const speaking = ctx.missions.find((m) => m.id === "m_call");
  const room = ctx.missions.find((m) => m.id === "m_room");
  if (ctx.practice) out.push("Tell me about your weekend", "Check my last sentence", "New topic please");
  if (!speaking?.done) out.push("How do I finish my speaking mission?");
  if (!room?.done) out.push("Which voice room is best for me?");
  out.push("My progress today", "Teach me 3 words", "Quiz me", "Motivate me");
  return out.slice(0, 6);
}

export function welcomeFor(ctx: EngineCtx): AIMessage {
  return {
    id: "ai_welcome",
    role: "assistant",
    time: "now",
    text: `Hey ${ctx.user.firstName}! I'm **Lingo**, your personal English tutor. I know everything about your learning journey — your **${ctx.streak}-day streak**, your **${ctx.user.stats.wordsLearned.toLocaleString()} words**, even the grammar point you slipped on in Lesson 7.

Ask me anything, or tap a suggestion below:`,
  };
}
