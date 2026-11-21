/**
 * @file src/services/bridge.service.ts
 * App (renderer) endpoint of the browser-extension bridge (ADR 0007).
 *
 * Connection lifecycle, per relay connection:
 *   ext → {t:"hello", pub, nonce}         app → {t:"hello", pub, nonce, paired, locked}
 *   ext → {t:"pair-request"}               app shows the 6-digit code; the user
 *                                          confirms in the app → {t:"pair-result", ok}
 *   ext → {t:"sealed", m}                  app → {t:"sealed", m}   (AES-GCM, see core/bridge)
 *
 * Only a paired origin+public key gets sealed answers, and only while the vault
 * is unlocked. Answers carry the invariant-9 field set for the requested site
 * only. All connections are closed on lock (invariant 4).
 */
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import {
  BridgeSession,
  connectionNonce,
  exportPublicKey,
  importPublicKey,
  pairingCode,
  type SealedMessage,
} from "../core/bridge/session";
import { generateTOTP } from "../core/totp/totp";
import { registrableDomain } from "../core/vault/grouping";
import type { VaultBridge, VaultEntry } from "../core/vault/schema";
import { handlePasskeyCreate, handlePasskeyGet } from "./passkey.service";

type Transport = NonNullable<NonNullable<Window["electron"]>["bridge"]>;

interface Conn {
  origin: string;
  extPub?: string;
  extNonce?: string;
  appNonce: string;
  session?: BridgeSession;
  paired: boolean;
}

export interface PairingPrompt {
  connId: number;
  origin: string;
  code: string;
}

const ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}\/$/;
const conns = new Map<number, Conn>();
let transport: Transport | null = null;

/** The fields the extension may receive (invariant 9). */
export interface BridgeCredential {
  id: string;
  title: string;
  url?: string;
  username?: string;
  password?: string;
  hasTotp: boolean;
  /** true when the entry's host equals the page host (autofill without asking). */
  exactHost: boolean;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Entries for a page: same registrable domain; exactHost marks strict matches. */
export function credentialsForUrl(entries: VaultEntry[], pageUrl: string): BridgeCredential[] {
  const pageHost = hostOf(pageUrl);
  if (!pageHost || !/^https?:/.test(pageUrl)) return [];
  const pageDomain = registrableDomain(pageHost);
  return entries
    .filter((e) => e.type === "login")
    .map((e) => ({ e, host: hostOf(e.url) }))
    .filter(({ host }) => host && registrableDomain(host) === pageDomain)
    .map(({ e, host }) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      username: e.username,
      password: e.password,
      hasTotp: !!e.totpSecret,
      exactHost: host === pageHost,
    }))
    .sort((a, b) => Number(b.exactHost) - Number(a.exactHost));
}

async function ensureIdentity(): Promise<{ bridge: VaultBridge; keys: CryptoKeyPair }> {
  const { vault } = useVaultStore.getState();
  if (!vault) throw new Error("locked");
  let bridge = vault.bridge;
  if (!bridge) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    bridge = {
      appPublicKey: await exportPublicKey(pair.publicKey),
      appPrivateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
      paired: [],
    };
    useVaultStore.setState({ vault: { ...vault, bridge }, isDirty: true });
  }
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    bridge.appPrivateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return { bridge, keys: { privateKey, publicKey: await importPublicKey(bridge.appPublicKey) } };
}

function send(connId: number, msg: object) {
  void transport?.send(connId, msg);
}

async function sendSealed(connId: number, payload: unknown) {
  const c = conns.get(connId);
  if (!c?.session) return;
  send(connId, { t: "sealed", m: await c.session.seal(payload) });
}

function updatePaired(mutate: (b: VaultBridge) => VaultBridge) {
  const { vault } = useVaultStore.getState();
  if (!vault?.bridge) return;
  useVaultStore.setState({ vault: { ...vault, bridge: mutate(vault.bridge) }, isDirty: true });
}

async function handleRequest(
  connId: number,
  req: { op?: unknown; url?: unknown; id?: unknown; [k: string]: unknown },
) {
  const { vault } = useVaultStore.getState();
  if (!vault) return sendSealed(connId, { ok: false, error: "locked" });
  switch (req.op) {
    case "status":
      return sendSealed(connId, { ok: true, unlocked: true });
    case "passkey-create":
      return sendSealed(connId, await handlePasskeyCreate(req));
    case "passkey-get":
      return sendSealed(connId, await handlePasskeyGet(req));
    case "credentials-for-url":
      if (typeof req.url !== "string") break;
      return sendSealed(connId, {
        ok: true,
        credentials: credentialsForUrl(vault.entries, req.url),
      });
    case "totp": {
      // Only for an entry that belongs to the page the extension is asking for.
      if (typeof req.id !== "string" || typeof req.url !== "string") break;
      const allowed = credentialsForUrl(vault.entries, req.url).some(
        (c) => c.id === req.id && c.hasTotp,
      );
      const entry = vault.entries.find((e) => e.id === req.id);
      if (!allowed || !entry?.totpSecret)
        return sendSealed(connId, { ok: false, error: "not-found" });
      const { code, remaining } = await generateTOTP(entry.totpSecret, {
        algorithm: entry.totpAlgorithm,
        digits: entry.totpDigits,
        period: entry.totpPeriod,
      });
      return sendSealed(connId, { ok: true, code, remaining });
    }
  }
  return sendSealed(connId, { ok: false, error: "bad-request" });
}

async function onFrame(connId: number, origin: string, msg: unknown) {
  if (!ORIGIN_RE.test(origin)) return void transport?.close(connId);
  const m = msg as { t?: unknown; pub?: unknown; nonce?: unknown; m?: unknown };
  let c = conns.get(connId);
  if (!c) {
    c = { origin, appNonce: connectionNonce(), paired: false };
    conns.set(connId, c);
  }

  if (m.t === "hello") {
    if (typeof m.pub !== "string" || typeof m.nonce !== "string" || m.nonce.length > 64)
      return void transport?.close(connId);
    try {
      await importPublicKey(m.pub);
    } catch {
      return void transport?.close(connId);
    }
    c.extPub = m.pub;
    c.extNonce = m.nonce;
    if (!useVaultStore.getState().vault) return send(connId, { t: "hello", locked: true });
    const { bridge, keys } = await ensureIdentity();
    c.paired = bridge.paired.some((p) => p.origin === origin && p.publicKey === m.pub);
    c.session = await BridgeSession.establish(keys, bridge.appPublicKey, m.pub, "app", {
      extension: m.nonce,
      app: c.appNonce,
    });
    if (c.paired)
      updatePaired((b) => ({
        ...b,
        paired: b.paired.map((p) =>
          p.origin === origin && p.publicKey === m.pub
            ? { ...p, lastSeenAt: new Date().toISOString() }
            : p,
        ),
      }));
    return send(connId, {
      t: "hello",
      locked: false,
      pub: bridge.appPublicKey,
      nonce: c.appNonce,
      paired: c.paired,
    });
  }

  if (m.t === "pair-request") {
    const vault = useVaultStore.getState().vault;
    if (!vault?.bridge || !c.extPub || c.paired) return;
    const code = await pairingCode(vault.bridge.appPublicKey, c.extPub, origin);
    useUIStore.getState().setPairingPrompt({ connId, origin, code });
    return;
  }

  if (m.t === "sealed") {
    if (!c.session || !c.paired) return send(connId, { t: "error", code: "not-paired" });
    let req: unknown;
    try {
      req = await c.session.open(m.m as SealedMessage);
    } catch {
      return void transport?.close(connId); // tampered / replayed: drop the connection
    }
    return handleRequest(connId, (req ?? {}) as { op?: unknown });
  }
}

export const BridgeService = {
  /** Start listening for relayed extension connections (desktop app only). */
  start(): () => void {
    const t = window.electron?.bridge;
    if (!t) return () => {};
    transport = t;
    const offFrame = t.onFrame(({ connId, origin, msg }) => void onFrame(connId, origin, msg));
    const offClosed = t.onClosed((id) => {
      conns.delete(id);
      const p = useUIStore.getState().pairingPrompt;
      if (p?.connId === id) useUIStore.getState().setPairingPrompt(null);
    });
    return () => {
      offFrame();
      offClosed();
      transport = null;
    };
  },

  /** User answered the pairing prompt in the app. */
  async resolvePairing(accept: boolean): Promise<void> {
    const prompt = useUIStore.getState().pairingPrompt;
    useUIStore.getState().setPairingPrompt(null);
    if (!prompt) return;
    const c = conns.get(prompt.connId);
    if (!c?.extPub) return;
    if (accept) {
      const { origin, extPub } = { origin: c.origin, extPub: c.extPub };
      updatePaired((b) => ({
        ...b,
        paired: [
          ...b.paired.filter((p) => p.origin !== origin),
          { origin, publicKey: extPub, pairedAt: new Date().toISOString() },
        ],
      }));
      c.paired = true;
    }
    send(prompt.connId, { t: "pair-result", ok: accept });
  },

  unpair(origin: string): void {
    updatePaired((b) => ({ ...b, paired: b.paired.filter((p) => p.origin !== origin) }));
    for (const [id, c] of conns) if (c.origin === origin) void transport?.close(id);
  },

  /** Lock teardown (invariant 4): drop every session and pending prompt. */
  onLock(): void {
    for (const id of conns.keys()) void transport?.close(id);
    conns.clear();
    useUIStore.getState().setPairingPrompt(null);
    // A passkey prompt open at lock time is answered "cancelled".
    const pk = useUIStore.getState().passkeyPrompt;
    if (pk?.kind === "create") pk.resolve(false);
    else if (pk?.kind === "get") pk.resolve(null);
  },
};
