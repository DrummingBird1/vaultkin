/**
 * @file src/services/sync.service.ts
 * WebDAV backup transport for the *encrypted* vault blob (E2E: the server only
 * ever sees ciphertext).
 *
 * Design choice: this exposes explicit **push** (upload local → remote) and
 * **pull** (download remote → local) with caller confirmation, rather than
 * silent bidirectional sync. Auto-merge of two diverged encrypted blobs needs
 * the decrypt→compare→re-encrypt loop (see ConflictResolutionModal); until that
 * is wired, last-write-wins automation could destroy data, so we keep the user
 * in control. ETag is tracked so push can warn on remote changes (If-Match).
 *
 * Credentials live inside the encrypted vault (settings.sync), so they are
 * only available while it is unlocked and are wiped from memory on lock. The
 * remote blob carries them too, encrypted like everything else. Older builds
 * kept them in sessionStorage in plaintext; that copy is moved into the vault
 * and deleted the first time it is seen.
 */
import { useVaultStore } from "../store/vault.store";

export interface SyncConfig {
  enabled: boolean;
  url?: string; // full URL to the vault file, e.g. https://dav.host/securevault.svault
  username?: string;
}

export type SyncResult =
  | { ok: true; etag?: string }
  | {
      ok: false;
      reason: "disabled" | "not-configured" | "auth" | "not-found" | "conflict" | "network";
      message?: string;
    };

const LEGACY_CRED_KEY = "sv_sync_cred"; // sessionStorage, pre-M4 (plaintext)
const ETAG_KEY = "sv_sync_etag"; // sessionStorage, not secret

type Cred = { url: string; username: string; password: string };

/** Only https: the production CSP blocks anything else, and Basic auth over
 *  plain http would expose the WebDAV password. */
export class InsecureSyncUrlError extends Error {}

function writeCred(cred: Cred | undefined): void {
  const { vault } = useVaultStore.getState();
  if (!vault) return;
  const settings = { ...vault.settings };
  if (cred) settings.sync = cred;
  else delete settings.sync;
  useVaultStore.setState({ vault: { ...vault, settings }, isDirty: true });
}

function loadCred(): Cred | null {
  const { vault } = useVaultStore.getState();
  if (!vault) return null; // locked
  try {
    const legacy = sessionStorage.getItem(LEGACY_CRED_KEY);
    if (legacy) {
      sessionStorage.removeItem(LEGACY_CRED_KEY);
      const c = JSON.parse(legacy) as Cred;
      if (!vault.settings.sync && c?.url && /^https:/i.test(c.url)) writeCred(c);
    }
  } catch {
    /* unreadable legacy copy: dropped */
  }
  return useVaultStore.getState().vault?.settings.sync ?? null;
}

function authHeader(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`);
}

export const SyncService = {
  getConfig(): SyncConfig {
    const c = loadCred();
    return c ? { enabled: true, url: c.url, username: c.username } : { enabled: false };
  },

  /** Save credentials into the vault. An empty password keeps the saved one
   *  (the form never shows it back). Throws InsecureSyncUrlError for non-https. */
  configure(url: string, username: string, password: string): void {
    const u = url.trim();
    if (!/^https:\/\//i.test(u)) throw new InsecureSyncUrlError("WebDAV URL must use https");
    const keep = loadCred();
    writeCred({ url: u, username, password: password || keep?.password || "" });
  },

  disconnect(): void {
    writeCred(undefined);
    sessionStorage.removeItem(LEGACY_CRED_KEY);
    sessionStorage.removeItem(ETAG_KEY);
  },

  /** Verify the URL is reachable and credentials are accepted. */
  async testConnection(): Promise<SyncResult> {
    const c = loadCred();
    if (!c) return { ok: false, reason: "not-configured" };
    try {
      const res = await fetch(c.url, {
        method: "HEAD",
        headers: { Authorization: authHeader(c.username, c.password) },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
      if (res.status === 404) return { ok: true }; // file not there yet — fine, first push creates it
      if (!res.ok) return { ok: false, reason: "network", message: `HTTP ${res.status}` };
      return { ok: true, etag: res.headers.get("ETag") ?? undefined };
    } catch (e: any) {
      return { ok: false, reason: "network", message: e?.message };
    }
  },

  /** Upload the local encrypted payload. */
  async push(encryptedPayload: string): Promise<SyncResult> {
    const c = loadCred();
    if (!c) return { ok: false, reason: "not-configured" };
    try {
      const res = await fetch(c.url, {
        method: "PUT",
        headers: {
          Authorization: authHeader(c.username, c.password),
          "Content-Type": "application/octet-stream",
        },
        body: encryptedPayload,
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
      if (!res.ok) return { ok: false, reason: "network", message: `HTTP ${res.status}` };
      const etag = res.headers.get("ETag");
      if (etag) sessionStorage.setItem(ETAG_KEY, etag);
      return { ok: true, etag: etag ?? undefined };
    } catch (e: any) {
      return { ok: false, reason: "network", message: e?.message };
    }
  },

  /** Download the remote encrypted payload, or null if none exists. */
  async pull(): Promise<{ result: SyncResult; payload?: string }> {
    const c = loadCred();
    if (!c) return { result: { ok: false, reason: "not-configured" } };
    try {
      const res = await fetch(c.url, {
        method: "GET",
        headers: { Authorization: authHeader(c.username, c.password) },
      });
      if (res.status === 401 || res.status === 403)
        return { result: { ok: false, reason: "auth" } };
      if (res.status === 404) return { result: { ok: false, reason: "not-found" } };
      if (!res.ok)
        return { result: { ok: false, reason: "network", message: `HTTP ${res.status}` } };
      const payload = await res.text();
      const etag = res.headers.get("ETag");
      if (etag) sessionStorage.setItem(ETAG_KEY, etag);
      return { result: { ok: true, etag: etag ?? undefined }, payload };
    } catch (e: any) {
      return { result: { ok: false, reason: "network", message: e?.message } };
    }
  },
};
