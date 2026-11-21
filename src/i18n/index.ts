/**
 * @file src/i18n/index.ts
 * i18next setup with English and Hebrew. Every user-facing string goes
 * through `t()` (see src/i18n/locales/*.json); keys are grouped by screen.
 *
 * Direction: <html lang dir> follows the active language (Hebrew → rtl), and
 * layout uses logical utilities (ms-/me-/ps-/pe-/start-/end-/text-start) so
 * the UI mirrors without per-component RTL code.
 *
 * Language is an explicit user choice persisted to localStorage (no
 * browser-language detection), like theme and accent.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import he from "./locales/he.json";
import { LANGUAGE_STORAGE_KEY } from "../constants";

export const SUPPORTED_LANGUAGES = ["en", "he"] as const;
const RTL_LANGUAGES = new Set<string>(["he"]);
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

const storedLanguage =
  typeof localStorage !== "undefined" ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;
const initialLanguage: SupportedLanguage = isSupportedLanguage(storedLanguage)
  ? storedLanguage
  : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes; double-escaping breaks punctuation like "…"
  returnNull: false,
});

/** Mirror the document for right-to-left languages. */
function applyDocumentDirection(lang: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
}
applyDocumentDirection(initialLanguage);
i18n.on("languageChanged", applyDocumentDirection);

export function isRtl(lang: string = i18n.language): boolean {
  return RTL_LANGUAGES.has(lang);
}

/** Switches the active language and persists the choice — mirrors setTheme/setAccent in ui.store.ts. */
export function setLanguage(lang: SupportedLanguage): void {
  i18n.changeLanguage(lang);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export default i18n;
