/* ──────────────────────────────────────────────────────────
   LINGOLIVE — 15-language support
   Content language pair used by Turso queries, the auto
   content generator and the AI tutor's system prompt.
   ────────────────────────────────────────────────────────── */
import { create } from "zustand";

export interface LangDef { code: string; name: string; native: string; flag: string }
export const LANGUAGES: LangDef[] = [
  { code: "en", name: "English", native: "English", flag: "gb" },
  { code: "es", name: "Spanish", native: "Español", flag: "es" },
  { code: "fr", name: "French", native: "Français", flag: "fr" },
  { code: "de", name: "German", native: "Deutsch", flag: "de" },
  { code: "zh", name: "Chinese", native: "中文", flag: "cn" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "jp" },
  { code: "ko", name: "Korean", native: "한국어", flag: "kr" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "br" },
  { code: "ru", name: "Russian", native: "Русский", flag: "ru" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "sa" },
  { code: "it", name: "Italian", native: "Italiano", flag: "it" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "in" },
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "tr" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "nl" },
  { code: "sv", name: "Swedish", native: "Svenska", flag: "se" },
];

export const langByName = (name: string): LangDef =>
  LANGUAGES.find((l) => l.name === name) ?? LANGUAGES[12];

interface LanguageState {
  target: string; // code being learned
  native: string; // instruction language code
  setPair: (target: string, native: string) => void;
}

const PERSIST_KEY = "lingolive-lang-pair";
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(PERSIST_KEY) ?? "null") as { target: string; native: string } | null; } catch { return null; }
})();

export const useLanguageStore = create<LanguageState>((set) => ({
  target: saved?.target ?? "en",
  native: saved?.native ?? "tr",
  setPair: (target, native) => {
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify({ target, native })); } catch { /* ignore */ }
    set({ target, native });
  },
}));

export const useLangCodes = () => {
  const { target, native } = useLanguageStore();
  return { targetCode: target, nativeCode: native };
};
