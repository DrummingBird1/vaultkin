/**
 * Unit tests for the small stateful services (previously 0 coverage).
 * Network is always mocked: no test here may reach a real host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DuressService } from "./duress.service";
import { UnlockThrottleService } from "./unlock-throttle.service";
import { BreachService } from "./breach.service";
import { SyncService } from "./sync.service";
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

  it("reports not-configured before configure()", async () => {
    expect(SyncService.getConfig()).toEqual({ enabled: false });
    expect(await SyncService.push("x")).toEqual({ ok: false, reason: "not-configured" });
  });

  it("pushes the ciphertext with Basic auth and records the ETag", async () => {
    SyncService.configure(` ${URL_} `, "user", "pass");
    const fetchMock = vi.fn(
      async (_u: string, _i?: RequestInit) =>
        new Response(null, { status: 201, headers: { ETag: '"e1"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await SyncService.push("CIPHERTEXT")).toEqual({ ok: true, etag: '"e1"' });
    const [u, init] = fetchMock.mock.calls[0];
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
