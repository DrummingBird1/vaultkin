/**
 * @file src/core/crypto/encoding.test.ts
 * Base64/hex/utf8 codec + constant-time comparison — the primitives every
 * other crypto-layer test implicitly trusts, so they get their own direct
 * coverage first.
 */
import { describe, it, expect } from "vitest";
import {
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  utf8,
  fromUtf8,
  constantTimeEqual,
} from "./encoding";

describe("bytesToBase64 / base64ToBytes", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 42]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips an empty array", () => {
    const bytes = new Uint8Array([]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips a large random buffer", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(1024));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("throws on invalid base64 input", () => {
    expect(() => base64ToBytes("not!!valid==base64")).toThrow();
  });
});

describe("bytesToHex", () => {
  it("encodes bytes as lowercase, zero-padded hex", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });

  it("encodes an empty array as an empty string", () => {
    expect(bytesToHex(new Uint8Array([]))).toBe("");
  });
});

describe("utf8 / fromUtf8", () => {
  it("round-trips ASCII text", () => {
    expect(fromUtf8(utf8("hello world"))).toBe("hello world");
  });

  it("round-trips multi-byte unicode (emoji, CJK)", () => {
    const text = "日本語 🔒 café";
    expect(fromUtf8(utf8(text))).toBe(text);
  });

  it("round-trips an empty string", () => {
    expect(fromUtf8(utf8(""))).toBe("");
  });
});

describe("constantTimeEqual", () => {
  it("returns true for identical byte arrays", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("returns false for differing byte arrays of the same length", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it("returns false for arrays of different length", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });

  it("returns true for two empty arrays", () => {
    expect(constantTimeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});
