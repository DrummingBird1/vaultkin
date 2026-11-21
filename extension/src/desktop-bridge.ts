/**
 * Extension endpoint of the desktop bridge (ADR 0007). Runs in the MV3
 * service worker. Talks to the SecureVault desktop app over native messaging
 * (host "com.securevault.bridge"); after pairing every request/answer is
 * sealed end to end (src/core/bridge/session.ts), so neither the host relay
 * nor the app's main process can read it.
 *
 * Identity: an ECDH key pair whose private key is NON-extractable, kept in
 * this extension's IndexedDB (a CryptoKey survives structured clone but can't
 * be read out by script).
 *
 * Nothing about vault entries is cached here: each fill asks the app for the
 * current site's logins only.
 */
import {
  BridgeSession,
  connectionNonce,
  exportPublicKey,
  generateIdentity,
  pairingCode,
  type SealedMessage,
} from "../../src/core/bridge/session";

export type BridgeState =
  | { kind: "disconnected" }
  | { kind: "not-installed" }
  | { kind: "app-not-running" }
  | { kind: "connecting" }
  | { kind: "locked" }
  | { kind: "unpaired" }
  | { kind: "pairing"; code: string }
  | { kind: "rejected" }
  | { kind: "ready" };

export interface BridgeCredential {
  id: string;
  title: string;
  url?: string;
  username?: string;
  password?: string;
  hasTotp: boolean;
  exactHost: boolean;
}

const HOST = "com.securevault.bridge";
const REQUEST_TIMEOUT_MS = 10_000;

let state: BridgeState = { kind: "disconnected" };
let port: chrome.runtime.Port | null = null;
let session: BridgeSession | null = null;
let appPub = "";
let ownPub = "";
let identity: CryptoKeyPair | null = null;
const listeners = new Set<(s: BridgeState) => void>();
const pending: Array<{
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

function setState(s: BridgeState) {
  state = s;
  for (const l of listeners) l(s);
}

// ── Identity in IndexedDB ──────────────────────────────────────────────────
function idb<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("securevault-bridge", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("keys", mode);
      const req = fn(tx.objectStore("keys"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

async function loadIdentity(): Promise<CryptoKeyPair> {
  if (identity) return identity;
  const stored = await idb<CryptoKeyPair | undefined>("readonly", (s) => s.get("identity"));
  identity = stored ?? (await generateIdentity());
  if (!stored) await idb("readwrite", (s) => s.put(identity, "identity"));
  ownPub = await exportPublicKey(identity.publicKey);
  return identity;
}

/** Forget this extension's key (the app will need to pair again). */
export async function resetIdentity(): Promise<void> {
  disconnect();
  identity = null;
  await idb("readwrite", (s) => s.delete("identity"));
}

// ── Connection ────────────────────────────────────────────────────────────
function failPending(msg: string) {
  while (pending.length) {
    const p = pending.shift()!;
    clearTimeout(p.timer);
    p.reject(new Error(msg));
  }
}

export function disconnect(): void {
  port?.disconnect();
  port = null;
  session = null;
  failPending("disconnected");
  setState({ kind: "disconnected" });
}

export async function connect(): Promise<BridgeState> {
  if (port && state.kind !== "disconnected") return state;
  const keys = await loadIdentity();
  setState({ kind: "connecting" });
  const ownNonce = connectionNonce();
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch {
    setState({ kind: "not-installed" });
    return state;
  }

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError?.message ?? "";
    port = null;
    session = null;
    failPending("disconnected");
    if (/not found|forbidden|not allowed/i.test(err)) setState({ kind: "not-installed" });
    else if (state.kind !== "app-not-running") setState({ kind: "disconnected" });
  });

  port.onMessage.addListener(
    async (msg: {
      t?: string;
      locked?: boolean;
      pub?: string;
      nonce?: string;
      paired?: boolean;
      ok?: boolean;
      code?: string;
      m?: SealedMessage;
    }) => {
      if (msg.t === "error" && msg.code === "app-not-running")
        return setState({ kind: "app-not-running" });
      if (msg.t === "error" && msg.code === "not-paired") return setState({ kind: "unpaired" });
      if (msg.t === "hello") {
        if (msg.locked || !msg.pub || !msg.nonce) return setState({ kind: "locked" });
        appPub = msg.pub;
        session = await BridgeSession.establish(keys, ownPub, appPub, "extension", {
          extension: ownNonce,
          app: msg.nonce,
        });
        return setState(msg.paired ? { kind: "ready" } : { kind: "unpaired" });
      }
      if (msg.t === "pair-result")
        return setState(msg.ok ? { kind: "ready" } : { kind: "rejected" });
      if (msg.t === "sealed" && session && msg.m) {
        const p = pending.shift();
        if (!p) return;
        clearTimeout(p.timer);
        try {
          p.resolve(await session.open(msg.m));
        } catch (e) {
          p.reject(e as Error);
          disconnect(); // tampered or replayed: don't trust this connection anymore
        }
      }
    },
  );

  port.postMessage({ t: "hello", pub: ownPub, nonce: ownNonce });
  return state;
}

/** Ask the app to pair; returns the code the user must compare in the app. */
export async function pair(): Promise<string> {
  if (state.kind !== "unpaired" && state.kind !== "rejected")
    throw new Error(`cannot pair in state ${state.kind}`);
  const code = await pairingCode(appPub, ownPub, chrome.runtime.getURL(""));
  setState({ kind: "pairing", code });
  port?.postMessage({ t: "pair-request" });
  return code;
}

async function request<T>(payload: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  if (state.kind !== "ready" || !session || !port) throw new Error("not-ready");
  const sealed = await session.seal(payload);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = pending.findIndex((p) => p.timer === timer);
      if (i >= 0) pending.splice(i, 1);
      reject(new Error("timeout"));
    }, timeoutMs);
    pending.push({ resolve: resolve as (v: unknown) => void, reject, timer });
    port!.postMessage({ t: "sealed", m: sealed });
  });
}

export async function credentialsForUrl(url: string): Promise<BridgeCredential[]> {
  const r = await request<{ ok: boolean; credentials?: BridgeCredential[]; error?: string }>({
    op: "credentials-for-url",
    url,
  });
  if (!r.ok) {
    if (r.error === "locked") setState({ kind: "locked" });
    return [];
  }
  return r.credentials ?? [];
}

export async function totpCode(
  id: string,
  url: string,
): Promise<{ code: string; remaining: number } | null> {
  const r = await request<{ ok: boolean; code?: string; remaining?: number }>({
    op: "totp",
    id,
    url,
  });
  return r.ok && r.code ? { code: r.code, remaining: r.remaining ?? 0 } : null;
}

export function getState(): BridgeState {
  return state;
}

export function onStateChange(fn: (s: BridgeState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Passkey ceremonies wait for the user to confirm in the app. */
const PASSKEY_TIMEOUT_MS = 120_000;

export async function passkeyCreate(req: {
  origin: string;
  rpId: string;
  userHandle: string;
  userName: string;
  userDisplayName?: string;
  exclude: string[];
}): Promise<Record<string, string> & { ok: boolean; error?: string }> {
  return request({ op: "passkey-create", ...req }, PASSKEY_TIMEOUT_MS);
}

export async function passkeyGet(req: {
  origin: string;
  rpId: string;
  clientDataJSON: string;
  allow: string[];
}): Promise<Record<string, string> & { ok: boolean; error?: string }> {
  return request({ op: "passkey-get", ...req }, PASSKEY_TIMEOUT_MS);
}
