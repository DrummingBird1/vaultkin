/**
 * SecureVault — Background Service Worker (MV3)
 *
 * Two sources of logins, in order:
 *  1. The desktop app over the end-to-end encrypted native-messaging bridge
 *     (desktop-bridge.ts, ADR 0007): asks for the current site's logins on
 *     demand and caches nothing.
 *  2. Legacy (web build): an in-memory snapshot pushed by "Send to extension",
 *     never persisted, auto-wiped after 5 min idle.
 */
import sharedConstants from "../../src/constants/shared.json" with { type: "json" };
import * as Desktop from "./desktop-bridge";
import { registrableDomain } from "../../src/core/vault/grouping";

/** A form in a frame from a different site than the page it is embedded in. */
function crossSiteFrame(sender) {
  if (!sender.tab?.url || !sender.url || sender.frameId === 0) return null;
  try {
    const frameHost = new URL(sender.url).hostname;
    const topHost = new URL(sender.tab.url).hostname;
    return registrableDomain(frameHost) === registrableDomain(topHost)
      ? null
      : { frameHost, topHost };
  } catch {
    return null;
  }
}

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

// ── Desktop bridge helpers ────────────────────────────────────────────────
/** (Re)connect and wait for the app's hello (or a terminal state). */
async function ensureDesktop() {
  const settled = (k) => k !== "connecting";
  let s = Desktop.getState();
  if (["disconnected", "locked", "app-not-running", "rejected"].includes(s.kind)) {
    Desktop.disconnect();
    await Desktop.connect();
  }
  s = Desktop.getState();
  if (settled(s.kind)) return s;
  return new Promise((resolve) => {
    const off = Desktop.onStateChange((n) => {
      if (settled(n.kind)) {
        off();
        resolve(n);
      }
    });
    setTimeout(() => {
      off();
      resolve(Desktop.getState());
    }, 3000);
  });
}

// ── Passkeys (page → content script → here → app) ───────────────────────
function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * Returns the fields webauthn-inject needs, or null to let the browser's own
 * implementation handle it. The origin comes from the browser (sender.url of
 * the top frame), never from the page; clientDataJSON is built here from it.
 */
async function handlePasskey(msg, sender) {
  if (sender?.frameId !== 0 || !sender.url) return null;
  const origin = new URL(sender.url).origin;
  const o = msg.options ?? {};
  if (typeof o.challenge !== "string" || typeof o.rpId !== "string") return null;
  const state = await ensureDesktop();
  if (state.kind !== "ready") return null;
  const clientData = JSON.stringify({
    type: msg.kind === "create" ? "webauthn.create" : "webauthn.get",
    challenge: o.challenge,
    origin,
    crossOrigin: false,
  });
  const clientDataJSON = b64u(new TextEncoder().encode(clientData));
  try {
    if (msg.kind === "create") {
      const r = await Desktop.passkeyCreate({
        origin,
        rpId: o.rpId,
        userHandle: String(o.user?.id ?? ""),
        userName: String(o.user?.name ?? ""),
        userDisplayName: o.user?.displayName ? String(o.user.displayName) : undefined,
        exclude: Array.isArray(o.exclude) ? o.exclude.map(String) : [],
      });
      if (r.ok) return { ...r, clientDataJSON };
      return r.error === "excluded" ? { error: "excluded" } : null;
    }
    const r = await Desktop.passkeyGet({
      origin,
      rpId: o.rpId,
      clientDataJSON,
      allow: Array.isArray(o.allow) ? o.allow.map(String) : [],
    });
    return r.ok ? { ...r, clientDataJSON } : null;
  } catch {
    return null;
  }
}

// Desktop-bridge requests are async: these handlers return true to keep the
// message channel open until sendResponse is called.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SV_PASSKEY" && (msg.kind === "create" || msg.kind === "get")) {
    handlePasskey(msg, _sender).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type === "SV_DESKTOP_STATUS") {
    ensureDesktop().then(
      (s) => sendResponse(s),
      () => sendResponse({ kind: "disconnected" }),
    );
    return true;
  }
  if (msg?.type === "SV_DESKTOP_PAIR") {
    Desktop.pair().then(
      (code) => sendResponse({ ok: true, code }),
      (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }),
    );
    return true;
  }
  if (msg?.type === "SV_DESKTOP_TOTP" && typeof msg.id === "string") {
    // From a page: the frame's real URL; from the popup: the URL it passes.
    const url = _sender.tab ? _sender.url : msg.url;
    if (typeof url !== "string") return false;
    Desktop.totpCode(msg.id, url).then(
      (r) => sendResponse(r),
      () => sendResponse(null),
    );
    return true;
  }
  if (msg?.type === "SV_CAPTURE" && _sender.tab?.id !== undefined && _sender.url) {
    rememberCapture(_sender.tab.id, _sender.url, msg.username, msg.password);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "SV_PENDING_CAPTURE" && _sender.tab?.id !== undefined) {
    pendingCaptureStatus(_sender.tab.id).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type === "SV_SAVE_LOGIN" && _sender.tab?.id !== undefined) {
    saveCapture(_sender.tab.id).then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "SV_DISMISS_CAPTURE" && _sender.tab?.id !== undefined) {
    captures.delete(_sender.tab.id);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

// ── Save / update prompt: submitted logins, memory only ─────────────────
const CAPTURE_TTL_MS = 3 * 60 * 1000;
/** tabId → { url, username, password, at }. Cleared on save, dismiss, lock, tab close, TTL. */
const captures = new Map();

function rememberCapture(tabId, url, username, password) {
  if (typeof password !== "string" || !password || password.length > 1024) return;
  if (!/^https?:/.test(url)) return;
  captures.set(tabId, {
    url,
    username: typeof username === "string" ? username.slice(0, 256) : "",
    password,
    at: Date.now(),
  });
}

function liveCapture(tabId) {
  const c = captures.get(tabId);
  if (c && Date.now() - c.at > CAPTURE_TTL_MS) captures.delete(tabId);
  return captures.get(tabId) ?? null;
}

async function pendingCaptureStatus(tabId) {
  const c = liveCapture(tabId);
  if (!c) return null;
  const s = await ensureDesktop();
  if (s.kind !== "ready") return null;
  const r = await Desktop.loginStatus({ url: c.url, username: c.username, password: c.password });
  if (!r?.ok || r.status === "same") {
    captures.delete(tabId);
    return null;
  }
  return { status: r.status, username: c.username, site: new URL(c.url).hostname };
}

async function saveCapture(tabId) {
  const c = liveCapture(tabId);
  captures.delete(tabId);
  if (!c) return { ok: false };
  const r = await Desktop.saveLogin({ url: c.url, username: c.username, password: c.password });
  return { ok: !!r?.ok };
}

chrome.tabs?.onRemoved?.addListener((tabId) => captures.delete(tabId));

// Messages from popup + content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (
    /^SV_(DESKTOP_|CAPTURE|PENDING_CAPTURE|SAVE_LOGIN|DISMISS_CAPTURE|PASSKEY)/.test(
      msg?.type ?? "",
    )
  )
    return false; // handled above
  if (msg?.type === "SV_FIND_FOR_URL" && !isUnlocked()) {
    // Ask the desktop app. From a page, the browser-reported frame URL is
    // used (never anything the page could choose); the popup passes the tab URL.
    const url = sender.tab ? sender.url : msg.url;
    const crossSite = sender.tab ? crossSiteFrame(sender) : null;
    ensureDesktop()
      .then((s) =>
        s.kind === "ready"
          ? Desktop.credentialsForUrl(url ?? "").then((matches) => ({
              matches,
              state: Desktop.getState().kind,
            }))
          : { matches: [], state: s.kind },
      )
      .then(
        ({ matches, state }) =>
          sendResponse({
            matches,
            unlocked: state === "ready",
            state,
            crossSite,
            source: "desktop",
          }),
        () => sendResponse({ matches: [], unlocked: false, state: "disconnected" }),
      );
    return true;
  }
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
    captures.clear();
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
