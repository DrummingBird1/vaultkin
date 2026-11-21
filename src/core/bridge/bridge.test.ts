import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { encodeFrame, FrameDecoder, MAX_FRAME_BYTES } from "./framing";
import {
  BridgeSession,
  connectionNonce,
  exportPublicKey,
  generateIdentity,
  importPublicKey,
  pairingCode,
} from "./session";

const ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

async function pair() {
  const app = await generateIdentity();
  const ext = await generateIdentity();
  const appPub = await exportPublicKey(app.publicKey);
  const extPub = await exportPublicKey(ext.publicKey);
  return {
    app: await BridgeSession.establish(app, appPub, extPub, "app"),
    ext: await BridgeSession.establish(ext, extPub, appPub, "extension"),
    appPub,
    extPub,
  };
}

describe("framing", () => {
  it("round-trips messages split across arbitrary chunk boundaries", () => {
    fc.assert(
      fc.property(
        fc.array(fc.jsonValue(), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 7 }),
        (msgs, step) => {
          const bytes = msgs.map((m) => encodeFrame(m));
          const all = new Uint8Array(bytes.reduce((s, b) => s + b.length, 0));
          let o = 0;
          for (const b of bytes) {
            all.set(b, o);
            o += b.length;
          }
          const dec = new FrameDecoder();
          const out: unknown[] = [];
          for (let i = 0; i < all.length; i += step)
            out.push(...dec.push(all.subarray(i, i + step)));
          expect(out).toEqual(msgs.map((m) => JSON.parse(JSON.stringify(m))));
        },
      ),
    );
  });

  it("rejects oversized frames before buffering them", () => {
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, MAX_FRAME_BYTES + 1, true);
    expect(() => new FrameDecoder().push(header)).toThrow(/too large/);
  });
});

describe("pairing code", () => {
  it("matches on both sides and changes if any key or the origin differs", async () => {
    const { appPub, extPub } = await pair();
    const other = await exportPublicKey((await generateIdentity()).publicKey);
    const code = await pairingCode(appPub, extPub, ORIGIN);
    expect(code).toMatch(/^\d{6}$/);
    expect(await pairingCode(extPub, appPub, ORIGIN)).toBe(code);
    expect(await pairingCode(appPub, other, ORIGIN)).not.toBe(code);
    expect(await pairingCode(appPub, extPub, "chrome-extension://zzzz/")).not.toBe(code);
  });

  it("rejects malformed public keys", async () => {
    await expect(importPublicKey("AAAA")).rejects.toThrow();
  });
});

describe("BridgeSession", () => {
  it("encrypts both ways", async () => {
    const { app, ext } = await pair();
    const req = await ext.seal({ op: "credentials-for-url", url: "https://github.com/login" });
    expect(JSON.stringify(req)).not.toContain("github");
    expect(await app.open(req)).toEqual({
      op: "credentials-for-url",
      url: "https://github.com/login",
    });
    const res = await app.seal({ ok: true });
    expect(await ext.open(res)).toEqual({ ok: true });
  });

  it("rejects replayed, reordered, reflected and tampered messages", async () => {
    const { app, ext } = await pair();
    const m1 = await ext.seal({ a: 1 });
    const m2 = await ext.seal({ a: 2 });
    expect(await app.open(m2)).toEqual({ a: 2 });
    await expect(app.open(m1)).rejects.toThrow(/Replayed/); // reordered / old
    await expect(app.open(m2)).rejects.toThrow(/Replayed/); // replay
    const own = await app.seal({ x: 1 });
    await expect(app.open(own)).rejects.toThrow(/Bad message/); // reflected back to sender
    const m3 = await ext.seal({ a: 3 });
    const tampered = { ...m3, ct: m3.ct.slice(0, -4) + (m3.ct.endsWith("AAAA") ? "BBBB" : "AAAA") };
    await expect(app.open(tampered)).rejects.toThrow();
    const relabeled = { ...(await ext.seal({ a: 4 })), n: 99 }; // counter not covered → GCM fails
    await expect(app.open(relabeled)).rejects.toThrow();
  });

  it("a message recorded on one connection cannot be replayed into the next", async () => {
    const appId = await generateIdentity();
    const extId = await generateIdentity();
    const appPub = await exportPublicKey(appId.publicKey);
    const extPub = await exportPublicKey(extId.publicKey);
    const connect = async () => {
      const nonces = { extension: connectionNonce(), app: connectionNonce() };
      return {
        app: await BridgeSession.establish(appId, appPub, extPub, "app", nonces),
        ext: await BridgeSession.establish(extId, extPub, appPub, "extension", nonces),
      };
    };
    const first = await connect();
    const recorded = await first.ext.seal({
      op: "credentials-for-url",
      url: "https://bank.example",
    });
    expect(await first.app.open(recorded)).toBeTruthy();
    const second = await connect();
    await expect(second.app.open(recorded)).rejects.toThrow(); // counter 1 is fresh here, key is not
  });

  it("a third party with its own keys cannot read or forge messages", async () => {
    const { app, ext, appPub } = await pair();
    const mallory = await generateIdentity();
    const malloryPub = await exportPublicKey(mallory.publicKey);
    const fake = await BridgeSession.establish(mallory, malloryPub, appPub, "extension");
    await expect(app.open(await fake.seal({ op: "status" }))).rejects.toThrow();
    const res = await app.seal({ secret: "pw" });
    await expect(fake.open(res)).rejects.toThrow();
    expect(await ext.open(res)).toEqual({ secret: "pw" });
  });
});
