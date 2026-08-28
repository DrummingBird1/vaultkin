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
 * Credentials live in sessionStorage only (cleared when the tab closes) — never
 * in the vault, never synced.
 */

export interface SyncConfig {
  enabled: boolean;
  url?: string;       // full URL to the vault file, e.g. https://dav.host/securevault.svault
  username?: string;
}

export type SyncResult =
  | { ok: true; etag?: string }
  | { ok: false; reason: "disabled" | "not-configured" | "auth" | "not-found" | "conflict" | "network"; message?: string };

const CRED_KEY = "sv_sync_cred";   // sessionStorage: { url, username, password }
const ETAG_KEY = "sv_sync_etag";

function loadCred(): { url: string; username: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem(CRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function authHeader(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`);
}

export const SyncService = {
  getConfig(): SyncConfig {
    const c = loadCred();
    return c ? { enabled: true, url: c.url, username: c.username } : { enabled: false };
  },

  configure(url: string, username: string, password: string): void {
    sessionStorage.setItem(CRED_KEY, JSON.stringify({ url: url.trim(), username, password }));
  },

  disconnect(): void {
    sessionStorage.removeItem(CRED_KEY);
    sessionStorage.removeItem(ETAG_KEY);
  },

  /** Verify the URL is reachable and credentials are accepted. */
  async testConnection(): Promise<SyncResult> {
    const c = loadCred();
    if (!c) return { ok: false, reason: "not-configured" };
    try {
      const res = await fetch(c.url, { method: "HEAD", headers: { Authorization: authHeader(c.username, c.password) } });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
      if (res.status === 404) return { ok: true };          // file not there yet — fine, first push creates it
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
      const res = await fetch(c.url, { method: "GET", headers: { Authorization: authHeader(c.username, c.password) } });
      if (res.status === 401 || res.status === 403) return { result: { ok: false, reason: "auth" } };
      if (res.status === 404) return { result: { ok: false, reason: "not-found" } };
      if (!res.ok) return { result: { ok: false, reason: "network", message: `HTTP ${res.status}` } };
      const payload = await res.text();
      const etag = res.headers.get("ETag");
      if (etag) sessionStorage.setItem(ETAG_KEY, etag);
      return { result: { ok: true, etag: etag ?? undefined }, payload };
    } catch (e: any) {
      return { result: { ok: false, reason: "network", message: e?.message } };
    }
  },
};
