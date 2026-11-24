/**
 * @file src/services/sync.service.ts
 * WebDAV backup transport for the *encrypted* vault blob (E2E: the server only
 * ever sees ciphertext).
 *
 * Design choice: this exposes explicit **push** (upload local → remote) and
 * **pull** (download remote → local) with caller confirmation, rather than
 * silent bidirectional sync. Push refuses to replace a server file this vault
 * has not seen: the version (ETag, else Last-Modified) of the last push or
 * resolved pull is kept in settings.sync.seen and compared before uploading,
 * with If-Match / If-None-Match closing the race on servers that support it.
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

type Cred = { url: string; username: string; password: string; seen?: string };

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

/** Comparable version of a server file. Weak/strong ETag forms compare equal. */
function versionOf(res: Response): string | undefined {
  const etag = res.headers.get("ETag");
  if (etag) return etag.replace(/^W\//, "");
  return res.headers.get("Last-Modified") ?? undefined;
}

function head(c: Cred): Promise<Response> {
  return fetch(c.url, {
    method: "HEAD",
    cache: "no-store",
    headers: { Authorization: authHeader(c.username, c.password) },
  });
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
    writeCred({
      url: u,
      username,
      password: password || keep?.password || "",
      // Another file's version says nothing about this one.
      ...(keep?.url === u && keep.seen ? { seen: keep.seen } : {}),
    });
  },

  disconnect(): void {
    writeCred(undefined);
    sessionStorage.removeItem(LEGACY_CRED_KEY);
  },

  /** Verify the URL is reachable and credentials are accepted. */
  async testConnection(): Promise<SyncResult> {
    const c = loadCred();
    if (!c) return { ok: false, reason: "not-configured" };
    try {
      const res = await head(c);
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
      if (res.status === 404) return { ok: true }; // file not there yet — fine, first push creates it
      if (!res.ok) return { ok: false, reason: "network", message: `HTTP ${res.status}` };
      return { ok: true, etag: res.headers.get("ETag") ?? undefined };
    } catch (e: any) {
      return { ok: false, reason: "network", message: e?.message };
    }
  },

  /** Record that the user has resolved this vault against a server version. */
  markSeen(seen: string | undefined): void {
    const c = loadCred();
    if (!c || c.seen === seen) return;
    const next = { ...c };
    if (seen) next.seen = seen;
    else delete next.seen;
    writeCred(next);
  },

  /** Upload the local encrypted payload. Returns "conflict" instead of
   *  replacing a server file this vault has not seen, unless `force`. */
  async push(encryptedPayload: string, force = false): Promise<SyncResult> {
    const c = loadCred();
    if (!c) return { ok: false, reason: "not-configured" };
    const denied = (s: number) => s === 401 || s === 403;
    try {
      const headers: Record<string, string> = {
        Authorization: authHeader(c.username, c.password),
        "Content-Type": "application/octet-stream",
      };
      if (!force) {
        const cur = await head(c);
        if (denied(cur.status)) return { ok: false, reason: "auth" };
        if (cur.status === 404) {
          headers["If-None-Match"] = "*";
        } else if (!cur.ok) {
          return { ok: false, reason: "network", message: `HTTP ${cur.status}` };
        } else {
          const version = versionOf(cur);
          if (!version || version !== c.seen) return { ok: false, reason: "conflict" };
          // If-Match needs a strong ETag; a weak one would always fail.
          const etag = cur.headers.get("ETag");
          if (etag && !etag.startsWith("W/")) headers["If-Match"] = etag;
        }
      }
      const res = await fetch(c.url, { method: "PUT", headers, body: encryptedPayload });
      if (denied(res.status)) return { ok: false, reason: "auth" };
      if (res.status === 412) return { ok: false, reason: "conflict" };
      if (!res.ok) return { ok: false, reason: "network", message: `HTTP ${res.status}` };
      let seen = res.headers.get("ETag") ? versionOf(res) : undefined;
      if (!seen) {
        // Many servers omit the ETag on PUT. The upload itself succeeded, so a
        // failure here only means the next push asks for a pull first.
        const after = await head(c).catch(() => null);
        if (after?.ok) seen = versionOf(after);
      }
      this.markSeen(seen);
      return { ok: true, etag: seen };
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
        cache: "no-store",
        headers: { Authorization: authHeader(c.username, c.password) },
      });
      if (res.status === 401 || res.status === 403)
        return { result: { ok: false, reason: "auth" } };
      if (res.status === 404) return { result: { ok: false, reason: "not-found" } };
      if (!res.ok)
        return { result: { ok: false, reason: "network", message: `HTTP ${res.status}` } };
      const payload = await res.text();
      // Not marked seen here: the caller does that once the user has resolved it.
      return { result: { ok: true, etag: versionOf(res) }, payload };
    } catch (e: any) {
      return { result: { ok: false, reason: "network", message: e?.message } };
    }
  },
};
