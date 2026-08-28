/**
 * @file src/constants/index.ts
 * Central home for magic numbers so they stop drifting across the codebase.
 */
import sharedConstants from "./shared.json";

// ─── Auto-lock ────────────────────────────────────────────────────────────────
export const AUTO_LOCK_DEFAULT_MS = 5 * 60 * 1000;      // 5 minutes
export const AUTO_LOCK_OPTIONS = [
  { label: "1 minute",   value: 60_000 },
  { label: "5 minutes",  value: 5 * 60_000 },
  { label: "15 minutes", value: 15 * 60_000 },
  { label: "1 hour",     value: 60 * 60_000 },
  { label: "Never",      value: 0 },
] as const;

// ─── Clipboard ────────────────────────────────────────────────────────────────
export const CLIPBOARD_CLEAR_MS = 30_000;               // auto-clear after 30s

// ─── Autosave ─────────────────────────────────────────────────────────────────
export const AUTOSAVE_DEBOUNCE_MS = 1500;

// ─── Unlock throttling ────────────────────────────────────────────────────────
export const UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY = 3;      // free attempts, then backoff
export const UNLOCK_BACKOFF_BASE_MS = 1000;             // 1s, doubling each attempt
export const UNLOCK_BACKOFF_MAX_MS  = 5 * 60 * 1000;    // cap at 5 minutes

// ─── HIBP ─────────────────────────────────────────────────────────────────────
export const HIBP_TIMEOUT_MS = 10_000;
export const HIBP_CONCURRENCY = 6;
export const HIBP_CACHE_MAX = 2000;

// ─── Password reveal ──────────────────────────────────────────────────────────
export const SHOW_PASSWORD_TIMEOUT_MS = 10_000;

// ─── Extension bridge ─────────────────────────────────────────────────────────
// The browser extension (extension/src/background.js) is a separate,
// non-bundled build target — it can't import this .ts module — but it CAN
// import shared.json directly (its service worker runs as an ES module; see
// manifest.json's "background": {"type": "module"}). shared.json is the one
// source of truth for values both sides need; don't hardcode this number in
// background.js again.
export const EXTENSION_SESSION_TIMEOUT_MS: number = sharedConstants.EXTENSION_SESSION_TIMEOUT_MS;
// localStorage key for the paired extension ID, shared between Settings.page.tsx
// (where the user sets it) and app-lifecycle.service.ts (which uses it to tell
// the extension to clear its cache when the main vault locks).
export const EXTENSION_ID_STORAGE_KEY = "sv_extension_id";

// ─── Localization ─────────────────────────────────────────────────────────────
// localStorage key for the user's chosen UI language (src/i18n/index.ts sets
// this on init and whenever Settings' language switcher changes it).
export const LANGUAGE_STORAGE_KEY = "sv_language";

// ─── History ──────────────────────────────────────────────────────────────────
export const HISTORY_MAX_VERSIONS = 10;

// ─── Import ───────────────────────────────────────────────────────────────────
export const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024;  // 50 MB
