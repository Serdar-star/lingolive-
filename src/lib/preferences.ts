export type SpeechAccent = "American" | "British" | "Australian";
export type SpeechRate = "0.5x" | "1x" | "1.5x" | "2x";

export interface LocalPreferences {
  darkMode: boolean;
  speechAccent: SpeechAccent;
  speechRate: SpeechRate;
  fontScale: 1 | 2 | 3;
  accentColor: string;
  autoPlayVoiceMessages: boolean;
  dailyGoalMinutes: number;
}

const KEY = "lingolive_preferences_v1";
const DEFAULTS: LocalPreferences = {
  darkMode: false,
  speechAccent: "American",
  speechRate: "1x",
  fontScale: 2,
  accentColor: "#6C5CE7",
  autoPlayVoiceMessages: false,
  dailyGoalMinutes: 15,
};
const ALLOWED_ACCENTS: SpeechAccent[] = ["American", "British", "Australian"];
const ALLOWED_RATES: SpeechRate[] = ["0.5x", "1x", "1.5x", "2x"];

export function getLocalPreferences(): LocalPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const value = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      darkMode: value.darkMode === true,
      speechAccent: ALLOWED_ACCENTS.includes(value.speechAccent as SpeechAccent) ? value.speechAccent as SpeechAccent : DEFAULTS.speechAccent,
      speechRate: ALLOWED_RATES.includes(value.speechRate as SpeechRate) ? value.speechRate as SpeechRate : DEFAULTS.speechRate,
      fontScale: value.fontScale === 1 || value.fontScale === 3 ? value.fontScale : DEFAULTS.fontScale,
      accentColor: typeof value.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(value.accentColor) ? value.accentColor : DEFAULTS.accentColor,
      autoPlayVoiceMessages: value.autoPlayVoiceMessages === true,
      dailyGoalMinutes: typeof value.dailyGoalMinutes === "number" && value.dailyGoalMinutes >= 5 && value.dailyGoalMinutes <= 60
        ? Math.round(value.dailyGoalMinutes / 5) * 5
        : DEFAULTS.dailyGoalMinutes,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveLocalPreferences(preferences: LocalPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* browser storage can be disabled */ }
}

export function applyVisualPreferences(preferences: LocalPreferences = getLocalPreferences()): void {
  try {
    document.documentElement.style.setProperty("--primary", preferences.accentColor);
    document.documentElement.style.fontSize = ["15px", "16px", "18px"][preferences.fontScale - 1];
  } catch { /* not in a browser context */ }
}

export function speechRateValue(rate: SpeechRate): number {
  return Number.parseFloat(rate);
}

export function speechLocaleWithAccent(baseLocale: string, accent: SpeechAccent): string {
  const language = baseLocale.split("-")[0].toLowerCase();
  if (language !== "en") return baseLocale;
  return accent === "British" ? "en-GB" : accent === "Australian" ? "en-AU" : "en-US";
}
