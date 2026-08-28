/**
 * @file src/core/totp/base32.test.ts
 * base32Decode / validateBase32Secret against the official RFC 4648 §10
 * test vectors (the standard reference vectors for this codec).
 */
import { describe, it, expect } from "vitest";
import { base32Decode, validateBase32Secret } from "./base32";

function ascii(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("base32Decode — RFC 4648 test vectors", () => {
  it.each([
    ["MY======", "f"],
    ["MZXQ====", "fo"],
    ["MZXW6===", "foo"],
    ["MZXW6YQ=", "foob"],
    ["MZXW6YTB", "fooba"],
    ["MZXW6YTBOI======", "foobar"],
  ])("decodes %s to %j", (encoded, expected) => {
    expect(ascii(base32Decode(encoded))).toBe(expected);
  });

  it("decodes an empty string to an empty byte array", () => {
    expect(base32Decode("")).toEqual(new Uint8Array([]));
  });

  it("is case-insensitive", () => {
    expect(base32Decode("mzxw6ytb")).toEqual(base32Decode("MZXW6YTB"));
  });

  it("ignores whitespace", () => {
    expect(base32Decode("MZXW 6YTB")).toEqual(base32Decode("MZXW6YTB"));
  });

  it("tolerates missing padding", () => {
    expect(base32Decode("MZXW6YQ")).toEqual(base32Decode("MZXW6YQ="));
  });

  it("throws on an invalid character", () => {
    expect(() => base32Decode("MZXW61@@")).toThrow(/Invalid Base32 character/);
  });

  it("rejects digits 0, 1, 8, 9 (not in the RFC 4648 Base32 alphabet)", () => {
    for (const ch of ["0", "1", "8", "9"]) {
      expect(() => base32Decode(`AAAA${ch}`)).toThrow();
    }
  });
});

describe("validateBase32Secret", () => {
  it("accepts a well-formed secret", () => {
    expect(validateBase32Secret("JBSWY3DPEHPK3PXP")).toBe(true);
  });

  it("accepts lowercase input", () => {
    expect(validateBase32Secret("jbswy3dpehpk3pxp")).toBe(true);
  });

  it("accepts padded input", () => {
    expect(validateBase32Secret("MZXW6===")).toBe(true);
  });

  it("accepts input with internal whitespace (as typed/pasted from an authenticator app)", () => {
    expect(validateBase32Secret("JBSW Y3DP EHPK 3PXP")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateBase32Secret("")).toBe(false);
  });

  it("rejects a string that is only whitespace/padding", () => {
    expect(validateBase32Secret("   ===")).toBe(false);
  });

  it("rejects characters outside the Base32 alphabet", () => {
    expect(validateBase32Secret("not-valid-base32!")).toBe(false);
    expect(validateBase32Secret("JBSWY3DP018")).toBe(false); // 0/1/8 aren't in the alphabet
  });
});
