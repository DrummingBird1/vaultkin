/**
 * The extension's desktop-bridge client (extension/src/desktop-bridge.ts)
 * against a simulated app endpoint that uses the same protocol code as the
 * real app (BridgeService). chrome.runtime.connectNative is replaced by an
 * in-memory port pair; IndexedDB by fake-indexeddb.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BridgeSession,
  connectionNonce,
  exportPublicKey,
  generateIdentity,
  pairingCode,
  type SealedMessage,
} from "../../src/core/bridge/session";

const ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

type Listener = (m: unknown) => void;
type FakeChrome = {
  runtime: { getURL: () => string; lastError: undefined; connectNative: () => unknown };
};
const fakeChrome = () => (globalThis as unknown as { chrome: FakeChrome }).chrome;

/** A fake desktop app on the other end of the native port. */
async function fakeApp(opts: {
  locked?: boolean;
  pairedKey?: () => string | null;
  approve?: boolean;
}) {
  const app = await generateIdentity();
  const appPub = await exportPublicKey(app.publicKey);
  let session: BridgeSession | null = null;
  let extPub = "";
  const toExt: Listener[] = [];
  const disconnect: Array<() => void> = [];
  const seen: unknown[] = [];

  const port = {
    onMessage: { addListener: (l: Listener) => toExt.push(l) },
    onDisconnect: { addListener: (l: () => void) => disconnect.push(l) },
    disconnect: () => {},
    postMessage: async (m: { t: string; pub?: string; nonce?: string; m?: SealedMessage }) => {
      seen.push(m);
      const reply = (x: unknown) => setTimeout(() => toExt.forEach((l) => l(x)), 0);
      if (m.t === "hello") {
        if (opts.locked) return reply({ t: "hello", locked: true });
        extPub = m.pub!;
        const appNonce = connectionNonce();
        session = await BridgeSession.establish(app, appPub, extPub, "app", {
          extension: m.nonce!,
          app: appNonce,
        });
        reply({
          t: "hello",
          locked: false,
          pub: appPub,
          nonce: appNonce,
          paired: opts.pairedKey?.() === extPub,
        });
      } else if (m.t === "pair-request") {
        reply({ t: "pair-result", ok: !!opts.approve });
      } else if (m.t === "sealed") {
        const req = (await session!.open(m.m!)) as { op: string; url?: string };
        const payload =
          req.op === "credentials-for-url" && req.url?.includes("github.com")
            ? {
                ok: true,
                credentials: [
                  {
                    id: "1",
                    title: "GitHub",
                    username: "octo",
                    password: "pw",
                    hasTotp: false,
                    exactHost: true,
                  },
                ],
              }
            : { ok: true, credentials: [] };
        reply({ t: "sealed", m: await session!.seal(payload) });
      }
    },
  };
  return { port, appPub, seen, extPubRef: () => extPub };
}

async function settle(
  bridge: typeof import("../../extension/src/desktop-bridge"),
  not = "connecting",
) {
  for (let i = 0; i < 50 && bridge.getState().kind === not; i++)
    await new Promise((r) => setTimeout(r, 10));
  return bridge.getState();
}

beforeEach(() => {
  vi.resetModules();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { getURL: () => ORIGIN, lastError: undefined, connectNative: () => {} },
  };
});

describe("extension desktop-bridge client", () => {
  it("reports a locked app", async () => {
    const app = await fakeApp({ locked: true });
    fakeChrome().runtime.connectNative = () => app.port;
    const bridge = await import("../../extension/src/desktop-bridge");
    await bridge.connect();
    expect((await settle(bridge)).kind).toBe("locked");
  });

  it("pairs with a code the app can reproduce, then asks per site", async () => {
    const app = await fakeApp({ approve: true });
    fakeChrome().runtime.connectNative = () => app.port;
    const bridge = await import("../../extension/src/desktop-bridge");
    await bridge.connect();
    expect((await settle(bridge)).kind).toBe("unpaired");

    const code = await bridge.pair();
    expect(code).toBe(await pairingCode(app.appPub, app.extPubRef(), ORIGIN));
    expect((await settle(bridge, "pairing")).kind).toBe("ready");

    const creds = await bridge.credentialsForUrl("https://github.com/login");
    expect(creds.map((c) => c.title)).toEqual(["GitHub"]);
    expect(await bridge.credentialsForUrl("https://example.org")).toEqual([]);
    // Nothing about the URL or the answer travels in the clear.
    expect(
      JSON.stringify(app.seen.filter((m) => (m as { t: string }).t === "sealed")),
    ).not.toContain("github");
  });

  it("keeps its identity across restarts (same key → already paired)", async () => {
    let pinned: string | null = null;
    const first = await fakeApp({ approve: true });
    fakeChrome().runtime.connectNative = () => first.port;
    let bridge = await import("../../extension/src/desktop-bridge");
    await bridge.connect();
    await settle(bridge);
    pinned = first.extPubRef();

    vi.resetModules(); // service worker restarted
    const second = await fakeApp({ pairedKey: () => pinned });
    fakeChrome().runtime.connectNative = () => second.port;
    bridge = await import("../../extension/src/desktop-bridge");
    await bridge.connect();
    expect((await settle(bridge)).kind).toBe("ready");
    expect(second.extPubRef()).toBe(pinned);
  });
});
