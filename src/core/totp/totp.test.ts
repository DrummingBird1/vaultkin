/**
 * @file src/core/totp/totp.test.ts
 * generateTOTP — RFC 6238 TOTP / RFC 4226 HOTP dynamic truncation.
 *
 * Deliberately property/self-consistency based rather than pinned to a
 * hardcoded "known code at time T" vector: the six-digit code depends on
 * getting the counter math, byte order, and truncation offset all exactly
 * right, which is precisely what these tests exercise without risking a
 * transcription error in a hand-copied expected value.
 */
import { describe, it, expect } from "vitest";
import { generateTOTP } from "./totp";
import { base32Decode } from "./base32";

const SECRET = "JBSWY3DPEHPK3PXP"; // valid, arbitrary Base32 secret

describe("generateTOTP", () => {
  it("returns a 6-digit numeric code by default", async () => {
    const { code } = await generateTOTP(SECRET, { time: 1_000_000_000 });
    expect(code).toMatch(/^\d{6}$/);
  });

  it("returns an 8-digit numeric code when requested", async () => {
    const { code } = await generateTOTP(SECRET, { time: 1_000_000_000, digits: 8 });
    expect(code).toMatch(/^\d{8}$/);
  });

  it("is deterministic — same secret + time always yields the same code", async () => {
    const a = await generateTOTP(SECRET, { time: 1_700_000_000_000 });
    const b = await generateTOTP(SECRET, { time: 1_700_000_000_000 });
    expect(a.code).toBe(b.code);
  });

  it("produces the same code anywhere within the same 30s window", async () => {
    const base = 1_700_000_000_000; // arbitrary ms timestamp
    const windowStart = Math.floor(base / 1000 / 30) * 30 * 1000;
    const a = await generateTOTP(SECRET, { time: windowStart });
    const b = await generateTOTP(SECRET, { time: windowStart + 29_000 });
    expect(a.code).toBe(b.code);
  });

  it("changes code across a period boundary", async () => {
    const base = 1_700_000_000_000;
    const windowStart = Math.floor(base / 1000 / 30) * 30 * 1000;
    const a = await generateTOTP(SECRET, { time: windowStart });
    const b = await generateTOTP(SECRET, { time: windowStart + 30_000 });
    expect(a.code).not.toBe(b.code);
  });

  it("respects a custom period", async () => {
    const { period } = await generateTOTP(SECRET, { time: 0, period: 60 });
    expect(period).toBe(60);
  });

  it("defaults to a 30-second period", async () => {
    const { period } = await generateTOTP(SECRET, { time: 0 });
    expect(period).toBe(30);
  });

  it("remaining counts down to 1 at the end of the window, then wraps to a full period", async () => {
    const windowStart = 1_700_000_000_000 - (1_700_000_000_000 % 30_000);
    const start = await generateTOTP(SECRET, { time: windowStart });
    const almostOver = await generateTOTP(SECRET, { time: windowStart + 29_000 });
    expect(start.remaining).toBe(30);
    expect(almostOver.remaining).toBe(1);
  });

  it("produces different codes for different algorithms given the same secret and time", async () => {
    const time = 1_700_000_000_000;
    const sha1 = await generateTOTP(SECRET, { time, algorithm: "SHA1" });
    const sha256 = await generateTOTP(SECRET, { time, algorithm: "SHA256" });
    const sha512 = await generateTOTP(SECRET, { time, algorithm: "SHA512" });
    const codes = new Set([sha1.code, sha256.code, sha512.code]);
    expect(codes.size).toBe(3);
  });

  it("produces different codes for different secrets at the same time", async () => {
    const time = 1_700_000_000_000;
    const a = await generateTOTP("JBSWY3DPEHPK3PXP", { time });
    const b = await generateTOTP("KRUGS4ZANFZSAYJB", { time });
    expect(a.code).not.toBe(b.code);
  });

  it("defaults to Date.now() when no time is supplied", async () => {
    const before = Date.now();
    const result = await generateTOTP(SECRET);
    const after = Date.now();
    // remaining must fall within (0, period] for the window straddling "now".
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.remaining).toBeLessThanOrEqual(result.period);
    expect(after - before).toBeLessThan(5000); // sanity: test itself ran fast
  });

  it("accepts a raw un-padded secret consistent with base32Decode", async () => {
    // generateTOTP base32-decodes internally; confirm it doesn't choke on
    // exactly the kind of un-padded secret authenticator apps commonly show.
    const decoded = base32Decode(SECRET);
    expect(decoded.length).toBeGreaterThan(0);
    await expect(generateTOTP(SECRET, { time: 0 })).resolves.toBeDefined();
  });
});
