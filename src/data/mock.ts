/* ──────────────────────────────────────────────────────────
   LINGOLIVE — MOCK DATA LAYER
   Neutral guest profile, bundled course structure and badge definitions
   ────────────────────────────────────────────────────────── */

export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type League = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

/* ─────────── CURRENT USER ─────────── */
export interface Person {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string | null;
  flag: string; // ISO code for flag img
  level: CEFR;
}
export interface CurrentUser {
  id: string;
  displayName: string;
  firstName: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  bio: string;
  country: string;
  flag: string;
  nativeLanguage: string;
  targetLanguage: string;
  targetFlag: string;
  dailyGoalMinutes: number;
  level: CEFR;
  league: League;
  leagueRank: number;
  trustScore: number;
  isVerified: boolean;
  tier: "FREE" | "PREMIUM" | "PRO";
  initials: string;
  color: string;
  stats: {
    wordsLearned: number;
    speakingHours: number;
    partnersMet: number;
    lessonsCompleted: number;
    totalXP: number;
    totalCalls: number;
    roomMinutes: number;
  };
  skills: { label: string; value: number }[];
  interests: string[];
}

export const CURRENT_USER: CurrentUser = {
  id: "guest",
  displayName: "Guest learner",
  firstName: "Learner",
  username: "",
  avatarUrl: null,
  email: "",
  bio: "",
  country: "",
  flag: "un",
  nativeLanguage: "Turkish",
  targetLanguage: "English",
  targetFlag: "gb",
  dailyGoalMinutes: 15,
  level: "A1",
  league: "Bronze",
  leagueRank: 0,
  trustScore: 0,
  isVerified: false,
  tier: "FREE",
  initials: "GL",
  color: "#6C5CE7",
  stats: {
    wordsLearned: 0,
    speakingHours: 0,
    partnersMet: 0,
    lessonsCompleted: 0,
    totalXP: 0,
    totalCalls: 0,
    roomMinutes: 0,
  },
  skills: [],
  interests: [],
};

/* ─────────── DAILY MISSIONS ─────────── */
export interface Mission {
  id: string;
  text: string;
  icon: string;
  xp: number;
  done: boolean;
  current: number;
  target: number;
}
export const DAILY_MISSIONS: Mission[] = [
  { id: "m_words", text: "Review 10 vocabulary cards", icon: "book", xp: 15, done: false, current: 0, target: 10 },
  { id: "m_lesson", text: "Complete 1 lesson", icon: "cap", xp: 25, done: false, current: 0, target: 1 },
  { id: "m_call", text: "Speak for 5 minutes", icon: "mic", xp: 30, done: false, current: 0, target: 5 },
  { id: "m_room", text: "Join a live room", icon: "rooms", xp: 20, done: false, current: 0, target: 1 },
];

/* ─────────── LESSONS / UNITS ─────────── */
export type ExerciseType = "mc" | "fill" | "arrange" | "match" | "speak" | "translate" | "listen" | "image";
export interface Exercise {
  id: string;
  type: ExerciseType;
  question: string;
  options?: string[];
  words?: string[]; // word bank (arrange/fill)
  pairs?: { a: string; b: string }[]; // match
  correct?: string;
  correctArr?: string[];
  sentence?: string; // speaking / listening prompt
  hint?: string;
  explanation?: string;
  blanks?: [string, string]; // fill: [before, after]
  target?: string; // image identification target word
  imageOptions?: { icon: string; label: string }[]; // image identification grid
}
export interface Lesson {
  id: string;
  title: string;
  icon: string;
  desc: string;
  mins: number;
  xp: number;
  newWords: number;
  kind: "lesson" | "checkpoint" | "boss";
  exercises: Exercise[];
}
export interface Unit {
  id: string;
  title: string;
  desc: string;
  icon: string;
  level: CEFR;
  lessons: Lesson[];
}

const genericPool = (prefix: string): Exercise[] => [
  {
    id: `${prefix}_g1`, type: "mc",
    question: "Choose the correct sentence:",
    options: ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."],
    correct: "She doesn't like coffee.",
    explanation: "Third person singular uses \"doesn't\" + base verb.",
  },
  {
    id: `${prefix}_g2`, type: "arrange",
    question: "Put the words in the correct order:",
    words: ["I", "have", "been", "studying", "English", "for", "two", "years", "yesterday"],
    correctArr: ["I", "have", "been", "studying", "English", "for", "two", "years"],
  },
  {
    id: `${prefix}_g3`, type: "fill",
    question: "Complete the sentence:",
    blanks: ["I've lived here ", " 2019."],
    words: ["since", "for", "from", "at"],
    correct: "since",
    explanation: "Use \"since\" with a point in time, \"for\" with a duration.",
  },
  {
    id: `${prefix}_g4`, type: "speak",
    question: "Say this sentence out loud:",
    sentence: "I would like to improve my English speaking skills.",
  },
  {
    id: `${prefix}_g5`, type: "translate",
    question: "Translate to English: \"Bugün hava çok güzel\"",
    correct: "The weather is very nice today",
    hint: "Start with \"The weather...\"",
  },
  {
    id: `${prefix}_g6`, type: "listen",
    question: "Listen and choose what you heard:",
    sentence: "The train leaves at quarter past nine.",
    options: [
      "The train leaves at quarter past nine.",
      "The train leaves at half past nine.",
      "The plane leaves at quarter past nine.",
      "The train arrives at quarter to nine.",
    ],
    correct: "The train leaves at quarter past nine.",
  },
  {
    id: `${prefix}_g7`, type: "image",
    question: "Which picture matches the word?",
    target: "RESTAURANT",
    imageOptions: [
      { icon: "food", label: "Restaurant" }, { icon: "bus", label: "Bus" },
      { icon: "hotel", label: "Hotel" }, { icon: "cart", label: "Supermarket" },
    ],
    correct: "food",
  },
];

export const UNITS: Unit[] = [
  {
    id: "unit_1", title: "Unit 1", desc: "Basics — start your English journey", icon: "sprout", level: "A1",
    lessons: [
      {
        id: "l1", title: "Greetings & Introductions", icon: "wave", desc: "Greet people and introduce yourself",
        mins: 8, xp: 25, newWords: 12, kind: "lesson",
        exercises: [
          { id: "l1e1", type: "mc", question: "How do you say \"Merhaba\" in English?", options: ["Goodbye", "Hello", "Thank you", "Please"], correct: "Hello", explanation: "\"Hello\" is the most common English greeting." },
          { id: "l1e2", type: "fill", question: "Complete the sentence:", blanks: ["Nice to ", " you!"], words: ["meet", "see", "know", "find"], correct: "meet", explanation: "\"Nice to meet you\" is said when meeting someone for the first time." },
          { id: "l1e3", type: "arrange", question: "Arrange: \"Benim adim Emma\"", words: ["My", "name", "is", "Emma", "Hello"], correctArr: ["My", "name", "is", "Emma"] },
          { id: "l1e4", type: "speak", question: "Say this sentence out loud:", sentence: "Hello, my name is Emma. Nice to meet you!" },
          { id: "l1e5", type: "match", question: "Match the greetings:", pairs: [
            { a: "Hello", b: "Merhaba" }, { a: "Goodbye", b: "Güle güle" }, { a: "Good morning", b: "Günaydin" }, { a: "Thank you", b: "Tesekkürler" },
          ] },
        ],
      },
      { id: "l2", title: "Numbers & Counting", icon: "hash", desc: "Count from 1 to 1000", mins: 10, xp: 25, newWords: 15, kind: "lesson", exercises: genericPool("l2") },
      { id: "l3", title: "Colors & Shapes", icon: "palette", desc: "Describe the world around you", mins: 8, xp: 25, newWords: 10, kind: "lesson", exercises: genericPool("l3") },
      { id: "l4", title: "Family & Relationships", icon: "users", desc: "Talk about your family", mins: 10, xp: 25, newWords: 14, kind: "lesson", exercises: genericPool("l4") },
      { id: "l5", title: "Telling Time", icon: "clock", desc: "Ask and answer about time", mins: 8, xp: 25, newWords: 8, kind: "lesson", exercises: genericPool("l5") },
      { id: "cp1", title: "Checkpoint Quiz", icon: "gem", desc: "Test what you learned in Unit 1", mins: 15, xp: 100, newWords: 0, kind: "checkpoint", exercises: genericPool("cp1") },
    ],
  },
  {
    id: "unit_2", title: "Unit 2", desc: "Daily Life — master everyday situations", icon: "leaf", level: "A2",
    lessons: [
      { id: "l6", title: "At the Supermarket", icon: "cart", desc: "Shop like a local", mins: 10, xp: 30, newWords: 16, kind: "lesson", exercises: genericPool("l6") },
      { id: "l7", title: "Food & Drinks", icon: "food", desc: "Order food and describe flavors", mins: 12, xp: 30, newWords: 20, kind: "lesson", exercises: genericPool("l7") },
      { id: "l8", title: "Public Transport", icon: "bus", desc: "Navigate buses, trains and metro", mins: 10, xp: 30, newWords: 12, kind: "lesson", exercises: genericPool("l8") },
      {
        id: "l9", title: "Weather & Seasons", icon: "cloud", desc: "Talk about the weather like a native",
        mins: 10, xp: 30, newWords: 14, kind: "lesson",
        exercises: [
          { id: "l9e1", type: "mc", question: "What does \"It's raining cats and dogs\" mean?", options: ["Animals are falling from the sky", "It's raining very heavily", "The weather is hot", "It's snowing outside"], correct: "It's raining very heavily", explanation: "This English idiom means it's raining very hard." },
          { id: "l9e2", type: "fill", question: "Complete the sentence:", blanks: ["It's very ", " today. You should wear a coat!"], words: ["cold", "hot", "warm", "sunny"], correct: "cold" },
          { id: "l9e3", type: "arrange", question: "\"Hava bu hafta çok sicak olacak\"", words: ["The", "weather", "will", "be", "very", "hot", "this", "week", "cold"], correctArr: ["The", "weather", "will", "be", "very", "hot", "this", "week"] },
          { id: "l9e4", type: "match", question: "Match the weather words:", pairs: [
            { a: "Sunny", b: "Güneşli" }, { a: "Rainy", b: "Yağmurlu" }, { a: "Cloudy", b: "Bulutlu" }, { a: "Windy", b: "Rüzgarli" }, { a: "Snowy", b: "Karli" },
          ] },
          { id: "l9e5", type: "mc", question: "Which season comes after summer?", options: ["Spring", "Winter", "Autumn", "Monsoon"], correct: "Autumn", explanation: "The four seasons are Spring, Summer, Autumn, Winter." },
          { id: "l9e6", type: "speak", question: "Describe today's weather:", sentence: "Today it is sunny and warm. The temperature is about twenty five degrees." },
          { id: "l9e7", type: "listen", question: "Listen and choose what you heard:", sentence: "It will be cloudy with a chance of rain tomorrow.", options: [
            "It will be cloudy with a chance of rain tomorrow.",
            "It will be sunny with a chance of snow tomorrow.",
            "It was cloudy with a chance of rain yesterday.",
            "It will be cloudy with a lot of rain tomorrow.",
          ], correct: "It will be cloudy with a chance of rain tomorrow." },
          { id: "l9e8", type: "image", question: "Which picture matches the word?", target: "UMBRELLA", imageOptions: [
            { icon: "cloud", label: "Cloud" }, { icon: "clock", label: "Clock" },
            { icon: "hotel", label: "Umbrella" }, { icon: "home", label: "House" },
          ], correct: "hotel" },
          { id: "l9e9", type: "translate", question: "Translate: \"Yarin hava nasil olacak?\"", correct: "What will the weather be like tomorrow", hint: "Start with \"What will...\"" },
        ],
      },
      { id: "l10", title: "At Home", icon: "home", desc: "Describe your home and furniture", mins: 10, xp: 30, newWords: 18, kind: "lesson", exercises: genericPool("l10") },
      { id: "boss1", title: "Boss Battle", icon: "crown", desc: "Prove your Daily Life mastery", mins: 20, xp: 500, newWords: 0, kind: "boss", exercises: genericPool("boss1") },
    ],
  },
  {
    id: "unit_3", title: "Unit 3", desc: "Travel — explore the world in English", icon: "plane", level: "B1",
    lessons: [
      { id: "l11", title: "At the Airport", icon: "plane", desc: "Navigate check-in and boarding", mins: 12, xp: 35, newWords: 16, kind: "lesson", exercises: genericPool("l11") },
      { id: "l12", title: "Hotel Check-in", icon: "hotel", desc: "Book and check into your room", mins: 10, xp: 35, newWords: 14, kind: "lesson", exercises: genericPool("l12") },
      { id: "l13", title: "At the Restaurant", icon: "food", desc: "Order food and handle the bill", mins: 12, xp: 35, newWords: 18, kind: "lesson", exercises: genericPool("l13") },
      { id: "l14", title: "Asking Directions", icon: "map", desc: "Find your way in any city", mins: 10, xp: 35, newWords: 12, kind: "lesson", exercises: genericPool("l14") },
      { id: "cp2", title: "Checkpoint Quiz", icon: "gem", desc: "Test your Travel knowledge", mins: 15, xp: 100, newWords: 0, kind: "checkpoint", exercises: genericPool("cp2") },
    ],
  },
  {
    id: "unit_4", title: "Unit 4", desc: "Work — excel in professional settings", icon: "brief", level: "B2",
    lessons: [
      { id: "l15", title: "Office Vocabulary", icon: "brief", desc: "Essential office words", mins: 10, xp: 40, newWords: 20, kind: "lesson", exercises: genericPool("l15") },
      { id: "l16", title: "Running Meetings", icon: "present", desc: "Lead and join meetings", mins: 12, xp: 40, newWords: 16, kind: "lesson", exercises: genericPool("l16") },
      { id: "l17", title: "Writing Emails", icon: "mail", desc: "Write professional emails", mins: 15, xp: 40, newWords: 14, kind: "lesson", exercises: genericPool("l17") },
      { id: "boss2", title: "Final Boss", icon: "crown", desc: "The ultimate challenge", mins: 25, xp: 1000, newWords: 0, kind: "boss", exercises: genericPool("boss2") },
    ],
  },
];

/* ─────────── LIVE — ROOMS ─────────── */
export interface Speaker extends Person { speaking?: boolean; muted?: boolean }
export interface VoiceRoom {
  id: string; name: string; topic: string; level: string;
  flags: [string, string]; langs: [string, string];
  speakers: Speaker[]; speakerCount: number; listeners: number;
  duration: string; isNew?: boolean; accent: string;
  /** Present only for Supabase-backed rooms; selects the real Zego experience. */
  roomMode?: "VOICE" | "VIDEO" | "STREAM";
  backendRoom?: true;
  backendId?: string;
  backendHostId?: string | null;
  zegoRoomId?: string;
  maxParticipants?: number;
  createdAt?: string;
}
/* ─────────── CHAT ─────────── */
export type MsgType = "sent" | "received" | "correction" | "voice";
export interface Message {
  id: string; type: MsgType; time: string;
  text?: string; read?: boolean;
  original?: string; corrected?: string; explanation?: string;
  duration?: string;
  /** Public Supabase Storage URL for a real recorded voice message. */
  audioUrl?: string;
}
export interface Conversation {
  id: string; user: Person & { id?: string; online: boolean; verified: boolean; nativeLanguage?: string };
  lastMessage: string; time: string; unread: number;
  messages: Message[];
  isPinned?: boolean;
}
/* ─────────── BADGES ─────────── */
export interface BadgeDef {
  id: string; name: string; desc: string; icon: string;
  category: "speaking" | "learning" | "consistency" | "social";
  rarity: Rarity; xp: number;
}
export const BADGES: BadgeDef[] = [
  { id: "b_call1", name: "First Conversation", desc: "Complete your first direct call", icon: "video", category: "speaking", rarity: "Common", xp: 50 },
  { id: "b_call10", name: "10 Direct Calls", desc: "Complete 10 direct calls", icon: "call10", category: "speaking", rarity: "Rare", xp: 200 },
  { id: "b_host", name: "Room Host", desc: "Host your first live room", icon: "rooms", category: "speaking", rarity: "Rare", xp: 150 },
  { id: "b_lesson1", name: "First Lesson", desc: "Complete your very first lesson", icon: "book", category: "learning", rarity: "Common", xp: 25 },
  { id: "b_lesson50", name: "50 Lessons", desc: "Complete 50 lessons", icon: "cap", category: "learning", rarity: "Rare", xp: 300 },
  { id: "b_streak7", name: "7-Day Streak", desc: "Study 7 days in a row", icon: "flame", category: "consistency", rarity: "Common", xp: 100 },
  { id: "b_streak30", name: "30-Day Streak", desc: "Study 30 days in a row", icon: "flame2", category: "consistency", rarity: "Rare", xp: 400 },
  { id: "b_streak100", name: "100-Day Streak", desc: "Study 100 days in a row", icon: "flame3", category: "consistency", rarity: "Epic", xp: 1000 },
  { id: "b_streak365", name: "365-Day Streak", desc: "Study 365 days in a row", icon: "flame3", category: "consistency", rarity: "Legendary", xp: 3000 },
];

/* ─────────── MISC ─────────── */
export const CEFR_STEPS: { level: CEFR; label: string }[] = [
  { level: "A1", label: "Beginner" }, { level: "A2", label: "Elementary" },
  { level: "B1", label: "Intermediate" }, { level: "B2", label: "Upper-Int." },
  { level: "C1", label: "Advanced" }, { level: "C2", label: "Mastery" },
];

export const LEVEL_COLORS: Record<CEFR, string> = {
  A1: "#2ED573", A2: "#7BED9F", B1: "#74B9FF", B2: "#6C5CE7", C1: "#E84393", C2: "#F8B500",
};

export const LEAGUE_COLORS: Record<League, string> = {
  Bronze: "#CD7F32", Silver: "#B8BDC9", Gold: "#FFD700", Platinum: "#A29BFE", Diamond: "#74B9FF",
};

export const RARITY_STYLES: Record<Rarity, { text: string; ring: string; bg: string }> = {
  Common: { text: "text-fg-sec", ring: "ring-border", bg: "bg-bg-sec" },
  Rare: { text: "text-blue", ring: "ring-blue/40", bg: "bg-blue/10" },
  Epic: { text: "text-primary", ring: "ring-primary/40", bg: "bg-primary/10" },
  Legendary: { text: "text-gold", ring: "ring-gold/50", bg: "bg-gold/10" },
};

