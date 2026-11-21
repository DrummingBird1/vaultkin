// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { wrap, unwrap, wrapKeyFromSignature } from "./key-wrap";

describe("Windows Hello key wrapping", () => {
  const raw = randomBytes(64).toString("base64");
  const sig = randomBytes(256).toString("base64");

  it("round-trips with the same signature", () => {
    const key = wrapKeyFromSignature(sig);
    const w = wrap(raw, key);
    expect(w).not.toContain(raw);
    expect(unwrap(w, wrapKeyFromSignature(sig))).toBe(raw);
  });

  it("fails with any other signature or tampered data", () => {
    const w = wrap(raw, wrapKeyFromSignature(sig));
    const other = wrapKeyFromSignature(randomBytes(256).toString("base64"));
    expect(() => unwrap(w, other)).toThrow();
    const bytes = Buffer.from(w, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => unwrap(bytes.toString("base64"), wrapKeyFromSignature(sig))).toThrow();
    expect(() => unwrap("AAAA", wrapKeyFromSignature(sig))).toThrow();
  });
});
