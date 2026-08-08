import en from "./messages/en.json";
import ja from "./messages/ja.json";

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

/** Every message key, with English kept structurally identical to Japanese. */
export type Messages = typeof ja;

const MESSAGES: Record<Locale, Messages> = { ja, en: en as Messages };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Picks the locale-appropriate half of a bilingual value. */
export function pick<T>(locale: Locale, value: { ja: T; en: T }): T {
  return value[locale];
}
