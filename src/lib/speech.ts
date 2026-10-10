const SPEECH_LOCALES: Record<string, string> = {
  en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", zh: "zh-CN", ja: "ja-JP",
  ko: "ko-KR", pt: "pt-BR", ru: "ru-RU", ar: "ar-SA", it: "it-IT", hi: "hi-IN",
  tr: "tr-TR", nl: "nl-NL", sv: "sv-SE",
};

export const getSpeechLocale = (languageCode: string) => SPEECH_LOCALES[languageCode] || "en-US";
