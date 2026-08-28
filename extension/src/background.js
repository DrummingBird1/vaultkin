/**
 * SecureVault — Background Service Worker (MV3)
 *
 * Holds an in-memory snapshot of vault entries for the popup + content
 * scripts. The cache is populated by an explicit "Send to extension" action
 * in the main web app, NEVER persisted, and auto-wiped after 5 min idle.
 */

let sessionCache = { entries: [], receivedAt: 0, expiresAt: 0 };
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

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

// Messages from the main web app (externally_connectable origins only)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SV_SYNC_ENTRIES" && Array.isArray(msg.entries)) {
    sessionCache.entries  = msg.entries;
    sessionCache.receivedAt = Date.now();
    sessionCache.expiresAt  = Date.now() + SESSION_TIMEOUT_MS;
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
      unlocked:  isUnlocked(),
      count:     sessionCache.entries.length,
      expiresAt: sessionCache.expiresAt,
    });
    return;
  }
  if (msg?.type === "SV_FIND_FOR_URL") {
    if (!isUnlocked()) { sendResponse({ matches: [], unlocked: false }); return; }
    refreshTimeout();
    sendResponse({ matches: findMatchingEntries(sessionCache.entries, msg.url ?? ""), unlocked: true });
    return;
  }
  if (msg?.type === "SV_GET_ALL") {
    if (!isUnlocked()) { sendResponse({ entries: [], unlocked: false }); return; }
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
  try { pageDomain = new URL(pageUrl).hostname.replace(/^www\./, ""); }
  catch { return []; }

  return entries.filter(e => {
    if (!e.url) return false;
    try {
      const entryDomain = new URL(e.url).hostname.replace(/^www\./, "");
      return pageDomain === entryDomain
          || pageDomain.endsWith("." + entryDomain)
          || entryDomain.endsWith("." + pageDomain);
    } catch { return false; }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[SV-Ext] Extension installed");
});

chrome.alarms?.create?.("sv-session-check", { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name === "sv-session-check"
      && sessionCache.entries.length > 0
      && Date.now() >= sessionCache.expiresAt) {
    clearSession();
  }
});
