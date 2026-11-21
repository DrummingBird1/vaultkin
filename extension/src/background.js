/**
 * SecureVault — Background Service Worker (MV3)
 *
 * Holds an in-memory snapshot of vault entries for the popup + content
 * scripts. The cache is populated by an explicit "Send to extension" action
 * in the main web app, NEVER persisted, and auto-wiped after 5 min idle.
 */
import sharedConstants from "../../src/constants/shared.json" with { type: "json" };

let sessionCache = { entries: [], receivedAt: 0, expiresAt: 0 };
// Single source of truth is src/constants/shared.json (also read by the main
// app's src/constants/index.ts as EXTENSION_SESSION_TIMEOUT_MS) — previously
// this was a hardcoded `5 * 60 * 1000` here, hand-kept in sync with the app
// side. manifest.json declares this service worker as "type": "module" so it
// can import JSON directly; no bundler needed for this one file.
const SESSION_TIMEOUT_MS = sharedConstants.EXTENSION_SESSION_TIMEOUT_MS;

function isUnlocked() {
  return sessionCache.entries.length > 0 && Date.now() < sessionCache.expiresAt;
}

function clearSession() {
  sessionCache = { entries: [], receivedAt: 0, expiresAt: 0 };
  console.info("[SV-Ext] Session cleared");
}

function refreshTimeout() {
  if (sessionCache.entries.length > 0) {
    sessionCache.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
  }
}

// Defense in depth: Chrome already restricts onMessageExternal to the
// externally_connectable.matches origins, but we re-check the sender origin
// against the same list so a manifest slip (e.g. a broad wildcard) can't
// silently widen who may push credentials into the cache.
const ALLOWED_ORIGIN_PATTERNS = (
  chrome.runtime.getManifest().externally_connectable?.matches ?? []
).map(
  (m) =>
    new RegExp(
      "^" +
        m
          .replace(/\/\*$/, "")
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, "[^/]*") +
        "$",
    ),
);

function isAllowedSender(sender) {
  const origin = sender?.origin ?? (sender?.url ? new URL(sender.url).origin : "");
  return !!origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

// Invariant 9 (AGENTS.md): only these fields may ever be cached.
const ALLOWED_FIELDS = ["id", "title", "url", "username", "password", "totpSecret"];
function sanitizeEntry(e) {
  const out = {};
  for (const k of ALLOWED_FIELDS) if (typeof e?.[k] === "string") out[k] = e[k];
  return out;
}

// Messages from the main web app (externally_connectable origins only)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ ok: false, error: "Sender not allowed" });
    return;
  }
  if (msg?.type === "SV_SYNC_ENTRIES" && Array.isArray(msg.entries)) {
    sessionCache.entries = msg.entries.map(sanitizeEntry).filter((e) => e.id);
    sessionCache.receivedAt = Date.now();
    sessionCache.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
    console.info(`[SV-Ext] Received ${msg.entries.length} entries from main app`);
    sendResponse({ ok: true, count: msg.entries.length });
    return;
  }
  if (msg?.type === "SV_LOCK") {
    clearSession();
    sendResponse({ ok: true });
    return;
  }
  sendResponse({ ok: false, error: "Unknown message type" });
});

// Messages from popup + content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SV_GET_STATUS") {
    sendResponse({
      unlocked: isUnlocked(),
      count: sessionCache.entries.length,
      expiresAt: sessionCache.expiresAt,
    });
    return;
  }
  if (msg?.type === "SV_FIND_FOR_URL") {
    if (!isUnlocked()) {
      sendResponse({ matches: [], unlocked: false });
      return;
    }
    refreshTimeout();
    sendResponse({
      matches: findMatchingEntries(sessionCache.entries, msg.url ?? ""),
      unlocked: true,
    });
    return;
  }
  if (msg?.type === "SV_GET_ALL") {
    if (!isUnlocked()) {
      sendResponse({ entries: [], unlocked: false });
      return;
    }
    refreshTimeout();
    sendResponse({ entries: sessionCache.entries, unlocked: true });
    return;
  }
  if (msg?.type === "SV_LOCK") {
    clearSession();
    sendResponse({ ok: true });
    return;
  }
  // All handlers above call sendResponse synchronously, so we do NOT return
  // true (which would tell Chrome to keep the message channel open for async).
  sendResponse({ ok: false, error: "Unknown message type" });
});

function findMatchingEntries(entries, pageUrl) {
  if (!pageUrl) return [];
  let pageDomain;
  try {
    pageDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }

  return entries.filter((e) => {
    if (!e.url) return false;
    try {
      const entryDomain = new URL(e.url).hostname.replace(/^www\./, "");
      return (
        pageDomain === entryDomain ||
        pageDomain.endsWith("." + entryDomain) ||
        entryDomain.endsWith("." + pageDomain)
      );
    } catch {
      return false;
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[SV-Ext] Extension installed");
});

chrome.alarms?.create?.("sv-session-check", { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (
    alarm.name === "sv-session-check" &&
    sessionCache.entries.length > 0 &&
    Date.now() >= sessionCache.expiresAt
  ) {
    clearSession();
  }
});
