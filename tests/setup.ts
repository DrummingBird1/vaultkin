/**
 * @file tests/setup.ts
 * @description Global test setup: polyfills, mocks, and shared utilities.
 */
import { vi, beforeEach, afterEach } from "vitest";

// ─── Web Crypto polyfill ──────────────────────────────────────────────────────
// Node 18+ includes WebCrypto at globalThis.crypto — no polyfill needed.
// For older Node: import { webcrypto } from "crypto"; globalThis.crypto = webcrypto as any;

// ─── IndexedDB mock ───────────────────────────────────────────────────────────
// JSDOM doesn't implement IndexedDB. Use a simple Map-backed mock.
const _store = new Map<string, string>();
const makeRequest = (result: any) => {
  const req: any = { result, error: null, onsuccess: null, onerror: null };
  setTimeout(() => req.onsuccess?.(), 0);
  return req;
};

global.indexedDB = {
  open: () => {
    const req: any = {
      result: {
        objectStoreNames: { contains: () => true },
        transaction: () => ({
          objectStore: () => ({
            get:       (k: string) => makeRequest(_store.get(k) ?? null),
            put:       (v: string, k: string) => { _store.set(k, v); return makeRequest(undefined); },
            delete:    (k: string) => { _store.delete(k); return makeRequest(undefined); },
            getAllKeys: () => makeRequest([..._store.keys()]),
          }),
        }),
        createObjectStore: () => {},
      },
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    };
    setTimeout(() => { req.onupgradeneeded?.({ target: req }); req.onsuccess?.(); }, 0);
    return req;
  },
} as any;

// ─── localStorage mock ────────────────────────────────────────────────────────
const _ls = new Map<string, string>();
global.localStorage = {
  getItem:    (k: string) => _ls.get(k) ?? null,
  setItem:    (k: string, v: string) => { _ls.set(k, v); },
  removeItem: (k: string) => { _ls.delete(k); },
  clear:      () => { _ls.clear(); },
  length:     0,
  key:        () => null,
} as any;

// ─── sessionStorage mock ──────────────────────────────────────────────────────
const _ss = new Map<string, string>();
global.sessionStorage = {
  getItem:    (k: string) => _ss.get(k) ?? null,
  setItem:    (k: string, v: string) => { _ss.set(k, v); },
  removeItem: (k: string) => { _ss.delete(k); },
  clear:      () => { _ss.clear(); },
  length:     0,
  key:        () => null,
} as any;

// ─── Clipboard mock ───────────────────────────────────────────────────────────
// navigator.clipboard is a read-only accessor in jsdom, so assign via defineProperty.
Object.defineProperty(global.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText:  vi.fn().mockResolvedValue(""),
  },
});

// ─── Reset store before each test ─────────────────────────────────────────────
beforeEach(() => {
  _store.clear();
  _ls.clear();
  _ss.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
