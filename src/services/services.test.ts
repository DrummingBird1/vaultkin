/**
 * Unit tests for the small stateful services (previously 0 coverage).
 * Network is always mocked: no test here may reach a real host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DuressService } from "./duress.service";
import { UnlockThrottleService } from "./unlock-throttle.service";
import { BreachService } from "./breach.service";
import { SyncService, InsecureSyncUrlError } from "./sync.service";
import { useVaultStore } from "../store/vault.store";
import { createDefaultVaultData } from "../core/vault/vault-types";
import { CURRENT_SCHEMA_VERSION } from "../core/vault/migrations";
import { ImportExportService } from "./import-export.service";
import {
  UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY,
  UNLOCK_BACKOFF_BASE_MS,
  UNLOCK_BACKOFF_MAX_MS,
} from "../constants";
import type { VaultEntry } from "../core/vault/schema";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function sha1Upper(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)));
  return [...d]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ─── Duress ──────────────────────────────────────────────────────────────────
describe("DuressService", () => {
  it("enrolls, matches only the duress password, and stores no plaintext", async () => {
    await DuressService.enroll("panic-pass-1", "real-master");
    expect(DuressService.isEnrolled()).toBe(true);
    const stored = JSON.stringify({ ...localStorage });
    expect(stored).not.toContain("panic-pass-1");
    expect(await DuressService.isDuress("panic-pass-1")).toBe(true);
    expect(await DuressService.isDuress("panic-pass-2")).toBe(false);
    expect(await DuressService.isDuress("")).toBe(false);
  });

  it("stores a salted Argon2id hash (different salt each enrollment)", async () => {
    await DuressService.enroll("panic-pass-1", "real-master");
    const a = localStorage.getItem("sv_duress_hash")!;
    await DuressService.enroll("panic-pass-1", "real-master");
    const b = localStorage.getItem("sv_duress_hash")!;
    expect(a).toMatch(/^argon2id\$[A-Za-z0-9+/=]{24}\$[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("still recognises a legacy unsalted SHA-256 enrollment", async () => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("old-panic"));
    const hex = Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("sv_duress_hash", hex);
    expect(await DuressService.isDuress("old-panic")).toBe(true);
    expect(await DuressService.isDuress("other")).toBe(false);
  });

  it("rejects empty, short, or same-as-master duress passwords", async () => {
    await expect(DuressService.enroll("", "m")).rejects.toThrow();
    await expect(DuressService.enroll("short", "m")).rejects.toThrow();
    await expect(DuressService.enroll("same-as-master", "same-as-master")).rejects.toThrow();
    expect(DuressService.isEnrolled()).toBe(false);
  });

  it("is never duress when not enrolled; disenroll clears trigger state", async () => {
    expect(await DuressService.isDuress("anything")).toBe(false);
    await DuressService.enroll("panic-pass-1", "m");
    DuressService.markTriggered();
    expect(DuressService.wasTriggered()).toBeTruthy();
    DuressService.disenroll();
    expect(DuressService.isEnrolled()).toBe(false);
    expect(DuressService.wasTriggered()).toBeNull();
  });
});

// ─── Unlock throttle ─────────────────────────────────────────────────────────
describe("UnlockThrottleService", () => {
  it("allows the free attempts, then backs off exponentially up to the cap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY; i++) {
      expect(UnlockThrottleService.recordFailure().locked).toBe(false);
    }
    let s = UnlockThrottleService.recordFailure();
    expect(s).toEqual({ locked: true, remainingMs: UNLOCK_BACKOFF_BASE_MS });

    // A failure during the lockout doesn't extend it.
    expect(UnlockThrottleService.recordFailure().remainingMs).toBe(UNLOCK_BACKOFF_BASE_MS);

    vi.advanceTimersByTime(UNLOCK_BACKOFF_BASE_MS);
    s = UnlockThrottleService.recordFailure();
    expect(s.remainingMs).toBe(UNLOCK_BACKOFF_BASE_MS * 2);

    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(UNLOCK_BACKOFF_MAX_MS);
      s = UnlockThrottleService.recordFailure();
    }
    expect(s.remainingMs).toBe(UNLOCK_BACKOFF_MAX_MS);
  });

  it("survives a reload (persists) and resets on success", () => {
    for (let i = 0; i <= UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY; i++)
      UnlockThrottleService.recordFailure();
    expect(UnlockThrottleService.getStatus().locked).toBe(true);
    UnlockThrottleService.recordSuccess();
    expect(UnlockThrottleService.getStatus().locked).toBe(false);
  });

  it("treats corrupted stored state as a clean slate", () => {
    localStorage.setItem("sv_unlock_throttle", "{not json");
    expect(UnlockThrottleService.getStatus()).toEqual({ locked: false, remainingMs: 0 });
  });
});

// ─── HIBP breach check (invariant 1: only 5 hex chars leave the device) ──────
describe("BreachService", () => {
  beforeEach(() => BreachService.clearCache());

  it("sends only the 5-char SHA-1 prefix and matches the suffix locally", async () => {
    const pw = "hunter2-test";
    const hash = await sha1Upper(pw);
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(`0000000000000000000000000000000000A:1\r\n${hash.slice(5)}:42\r\n`),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await BreachService.check(pw);
    expect(r).toEqual({ count: 42, isPwned: true });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(pw);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(hash.slice(5));
  });

  it("caches by hash and is cleared by clearCache (lock teardown)", async () => {
    const fetchMock = vi.fn(async () => new Response("ABC:1\n"));
    vi.stubGlobal("fetch", fetchMock);
    await BreachService.check("pw-a");
    await BreachService.check("pw-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    BreachService.clearCache();
    expect(BreachService._cache.size).toBe(0);
  });

  it("checkBatch maps network failures to not-pwned instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    const out = await BreachService.checkBatch(["a1", "b2"]);
    expect([...out.values()]).toEqual([
      { count: 0, isPwned: false },
      { count: 0, isPwned: false },
    ]);
  });

  it("empty password never hits the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await BreachService.check("")).toEqual({ count: 0, isPwned: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── WebDAV sync ─────────────────────────────────────────────────────────────
describe("SyncService", () => {
  const URL_ = "https://dav.example.test/vault.svault";
  beforeEach(() => {
    // Credentials live in the (unlocked) vault.
    useVaultStore.setState({
      vault: { ...createDefaultVaultData(), schemaVersion: CURRENT_SCHEMA_VERSION },
      isDirty: false,
    });
  });
  afterEach(() => useVaultStore.setState({ vault: null, isDirty: false }));

  it("stores credentials only inside the vault, never in browser storage", () => {
    SyncService.configure(URL_, "user", "s3cret-dav");
    expect(useVaultStore.getState().vault?.settings.sync).toEqual({
      url: URL_,
      username: "user",
      password: "s3cret-dav",
    });
    expect(useVaultStore.getState().isDirty).toBe(true);
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain("s3cret-dav");
  });

  it("is unavailable while locked", async () => {
    SyncService.configure(URL_, "user", "pw");
    useVaultStore.setState({ vault: null });
    expect(SyncService.getConfig()).toEqual({ enabled: false });
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "not-configured" });
  });

  it("refuses non-https URLs", () => {
    expect(() => SyncService.configure("http://nas.local/v.svault", "u", "p")).toThrow(
      InsecureSyncUrlError,
    );
    expect(SyncService.getConfig()).toEqual({ enabled: false });
  });

  it("an empty password keeps the saved one", () => {
    SyncService.configure(URL_, "user", "first");
    SyncService.configure(URL_, "user2", "");
    expect(useVaultStore.getState().vault?.settings.sync).toMatchObject({
      username: "user2",
      password: "first",
    });
  });

  it("moves a pre-M4 plaintext sessionStorage copy into the vault and deletes it", () => {
    sessionStorage.setItem(
      "sv_sync_cred",
      JSON.stringify({ url: URL_, username: "old", password: "legacy-pw" }),
    );
    expect(SyncService.getConfig()).toEqual({ enabled: true, url: URL_, username: "old" });
    expect(sessionStorage.getItem("sv_sync_cred")).toBeNull();
    expect(useVaultStore.getState().vault?.settings.sync?.password).toBe("legacy-pw");
  });

  it("reports not-configured before configure()", async () => {
    expect(SyncService.getConfig()).toEqual({ enabled: false });
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "not-configured" });
  });

  it("pushes the ciphertext with Basic auth and records the ETag", async () => {
    SyncService.configure(` ${URL_} `, "user", "pass");
    const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) =>
      _i?.method === "HEAD"
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 201, headers: { ETag: '"e1"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await SyncService.push("CIPHERTEXT")).toEqual({ ok: true, etag: '"e1"' });
    const [u, init] = fetchMock.mock.calls[1];
    expect((init?.headers as Record<string, string>)["If-None-Match"]).toBe("*");
    expect(useVaultStore.getState().vault?.settings.sync?.seen).toBe('"e1"');
    expect(u).toBe(URL_);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe("CIPHERTEXT");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Basic " + btoa("user:pass"),
    );
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [500, "network"],
  ])("maps HTTP %i on push to %s", async (status, reason) => {
    SyncService.configure(URL_, "u", "p");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );
    expect((await SyncService.push("x")) as { reason: string }).toMatchObject({
      ok: false,
      reason,
    });
  });

  /** Minimal WebDAV server holding one file. */
  function server(opts: { etag?: string; modified?: string; raceOnPut?: boolean }) {
    const state = { etag: opts.etag, puts: 0, headers: {} as Record<string, string> };
    const meta = (): Record<string, string> => ({
      ...(state.etag ? { ETag: state.etag } : {}),
      ...(opts.modified ? { "Last-Modified": opts.modified } : {}),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        if (init?.method !== "PUT") return new Response(null, { headers: meta() });
        state.headers = init.headers as Record<string, string>;
        if (opts.raceOnPut) return new Response(null, { status: 412 });
        state.puts++;
        if (state.etag) state.etag = `"after-${state.puts}"`;
        return new Response(null, { status: 204 });
      }),
    );
    return state;
  }

  it("refuses to overwrite a server file it has not seen, unless forced", async () => {
    SyncService.configure(URL_, "u", "p");
    const s = server({ etag: '"other-device"' });
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "conflict" });
    await SyncService.pull(); // downloading alone is not resolving
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "conflict" });
    expect(s.puts).toBe(0);
    expect(await SyncService.push("x", true)).toMatchObject({ ok: true });
    expect(s.puts).toBe(1);
  });

  it("pushes after a resolved pull, then keeps working, and detects a later change", async () => {
    SyncService.configure(URL_, "u", "p");
    const s = server({ etag: 'W/"v1"' });
    SyncService.markSeen((await SyncService.pull()).result.ok ? '"v1"' : undefined);
    expect(await SyncService.push("a")).toMatchObject({ ok: true });
    expect(s.headers["If-Match"]).toBeUndefined(); // weak ETag
    expect(await SyncService.push("b")).toMatchObject({ ok: true });
    expect(s.headers["If-Match"]).toBe('"after-1"');
    s.etag = '"someone-else"';
    expect(await SyncService.push("c")).toEqual({ ok: false, reason: "conflict" });
  });

  it("reports a conflict when the file changes between the check and the upload", async () => {
    SyncService.configure(URL_, "u", "p");
    server({ etag: '"v1"', raceOnPut: true });
    SyncService.markSeen('"v1"');
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "conflict" });
  });

  it("falls back to Last-Modified, and treats an unversioned file as a conflict", async () => {
    const modified = "Tue, 24 Nov 2026 10:00:00 GMT";
    SyncService.configure(URL_, "u", "p");
    server({ modified });
    SyncService.markSeen(modified);
    expect(await SyncService.push("x")).toMatchObject({ ok: true });
    server({});
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "conflict" });
  });

  it("forgets the seen version when the URL changes", () => {
    SyncService.configure(URL_, "u", "p");
    SyncService.markSeen('"v1"');
    SyncService.configure(URL_, "u2", "");
    expect(useVaultStore.getState().vault?.settings.sync?.seen).toBe('"v1"');
    SyncService.configure(URL_ + "2", "u2", "");
    expect(useVaultStore.getState().vault?.settings.sync?.seen).toBeUndefined();
  });

  it("pull returns the payload, or not-found on 404", async () => {
    SyncService.configure(URL_, "u", "p");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("REMOTE")),
    );
    expect(await SyncService.pull()).toMatchObject({ result: { ok: true }, payload: "REMOTE" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect((await SyncService.pull()).result).toEqual({ ok: false, reason: "not-found" });
  });

  it("maps thrown network errors and treats a missing file as reachable", async () => {
    SyncService.configure(URL_, "u", "p");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    expect(await SyncService.testConnection()).toEqual({
      ok: false,
      reason: "network",
      message: "offline",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await SyncService.testConnection()).toEqual({ ok: true });
  });

  it("disconnect forgets credentials", () => {
    SyncService.configure(URL_, "u", "p");
    SyncService.disconnect();
    expect(SyncService.getConfig()).toEqual({ enabled: false });
  });
});

// ─── Import / export ─────────────────────────────────────────────────────────
describe("ImportExportService", () => {
  const entry = (over: Partial<VaultEntry>): VaultEntry => ({
    id: "1",
    type: "login",
    title: "t",
    category: "websites",
    tags: [],
    favorite: false,
    customFields: [],
    ...over,
  });

  it("detects formats", () => {
    const d = (s: string) => ImportExportService.detectFormat(s);
    expect(d('{"encrypted":false,"items":[]}')).toBe("bitwarden");
    expect(d('<?xml version="1.0"?><KeePassFile/>')).toBe("keepass");
    expect(d("url,username,password,extra,name,grouping,fav\nx,y,z,,n,g,0")).toBe("lastpass");
    expect(d("title,url,password\na,b,c")).toBe("csv");
    expect(d("{broken")).toBe("unknown");
    expect(d("just text")).toBe("unknown");
  });

  it("parses Bitwarden JSON", async () => {
    const json = JSON.stringify({
      encrypted: false,
      items: [
        {
          name: "GitHub",
          favorite: true,
          notes: "n",
          login: {
            username: "me",
            password: "pw",
            totp: "JBSW",
            uris: [{ uri: "https://github.com" }],
          },
        },
      ],
    });
    const r = await ImportExportService.import(json, "bitwarden");
    expect(r.errors).toEqual([]);
    expect(r.entries[0]).toMatchObject({
      title: "GitHub",
      username: "me",
      password: "pw",
      url: "https://github.com",
      totpSecret: "JBSW",
      favorite: true,
    });
  });

  it("round-trips CSV export → import, including commas and quotes", async () => {
    const csv = ImportExportService.exportCSV([
      entry({
        title: 'Acme, "Inc"',
        username: "a@b.c",
        password: 'p,"w',
        url: "https://acme.test",
        tags: ["work", "fin"],
      }),
    ]);
    const r = await ImportExportService.import(csv, ImportExportService.detectFormat(csv));
    expect(r.errors).toEqual([]);
    expect(r.entries[0]).toMatchObject({
      title: 'Acme, "Inc"',
      username: "a@b.c",
      password: 'p,"w',
      url: "https://acme.test",
      tags: ["work", "fin"],
    });
  });

  it("reports unsupported formats as errors instead of throwing", async () => {
    expect((await ImportExportService.import("<KeePassFile/>", "keepass")).errors).toHaveLength(1);
    expect((await ImportExportService.import("{", "bitwarden")).errors[0]).toMatch(/Parse error/);
  });
});
