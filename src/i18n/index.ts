/**
 * @file src/i18n/index.ts
 * i18next setup. Proof-of-concept scope: infrastructure is real and
 * complete, but only the Unlock page (src/pages/Unlock.page.tsx) is fully
 * migrated to `useTranslation()` so far — every other page/component still
 * has hardcoded English strings. Same "deliberately partial, documented"
 * pattern as this app's RTL support: real infrastructure, incremental
 * migration, not a half-finished feature pretending to be complete. See
 * CLAUDE.md's known gotchas for what's left.
 *
 * No i18next-browser-languagedetector dependency — this app already has an
 * established pattern for user-chosen (not browser-inferred) preferences
 * persisted to localStorage (theme, accent color — see ui.store.ts), so
 * language follows the same explicit-choice pattern instead of pulling in
 * a library for auto-detection nobody asked for.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import he from "./locales/he.json";
import { LANGUAGE_STORAGE_KEY } from "../constants";

export const SUPPORTED_LANGUAGES = ["en", "he"] as const;
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

/** Switches the active language and persists the choice — mirrors setTheme/setAccent in ui.store.ts. */
export function setLanguage(lang: SupportedLanguage): void {
  i18n.changeLanguage(lang);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export default i18n;
