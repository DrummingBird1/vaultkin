/**
 * @file src/core/password/generator.test.ts
 * generatePassword / generatePassphrase / passphraseEntropyBits.
 *
 * The zero-buffer regression (see the CRITICAL comment in generator.ts) is
 * specifically why "does this actually call crypto.getRandomValues before
 * reading" and "are outputs distinct across calls" are both tested here
 * with real crypto, not a mocked RNG — a mock would have hidden that bug.
 */
import { describe, it, expect } from "vitest";
import { generatePassword, generatePassphrase, passphraseEntropyBits } from "./generator";
import { WORDLIST } from "./wordlist";

describe("generatePassword", () => {
  it("defaults to a 20-character password", () => {
    expect(generatePassword()).toHaveLength(20);
  });

  it("respects a custom length", () => {
    expect(generatePassword({ length: 32 })).toHaveLength(32);
  });

  it("clamps length to a minimum of 4", () => {
    expect(generatePassword({ length: 0 })).toHaveLength(4);
    expect(generatePassword({ length: -5 })).toHaveLength(4);
  });

  it("clamps length to a maximum of 128", () => {
    expect(generatePassword({ length: 9999 })).toHaveLength(128);
  });

  it("produces different output on successive calls (proves the RNG buffer is actually primed)", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));
    // Collisions across 20 draws of a 20-char password would indicate the
    // known zero-buffer bug (every password = first alphabet char repeated).
    expect(passwords.size).toBe(20);
  });

  it("never repeats the same character across an entire password (regression guard for the zero-buffer bug)", () => {
    // Not a general property (real random output CAN repeat a character),
    // but the specific historical bug produced a single character repeated
    // `length` times — so a 40-char password with only one distinct
    // character is a strong smoke-test signal something is badly wrong.
    const pw = generatePassword({ length: 40 });
    expect(new Set(pw).size).toBeGreaterThan(1);
  });

  it("only uses lowercase letters when other classes are disabled", () => {
    const pw = generatePassword({ uppercase: false, digits: false, symbols: false, length: 50 });
    expect(pw).toMatch(/^[a-z]+$/);
  });

  it("only uses uppercase letters when other classes are disabled", () => {
    const pw = generatePassword({ lowercase: false, digits: false, symbols: false, length: 50 });
    expect(pw).toMatch(/^[A-Z]+$/);
  });

  it("only uses digits when other classes are disabled", () => {
    const pw = generatePassword({ uppercase: false, lowercase: false, symbols: false, length: 50 });
    expect(pw).toMatch(/^[0-9]+$/);
  });

  it("only uses symbols when other classes are disabled", () => {
    const pw = generatePassword({ uppercase: false, lowercase: false, digits: false, length: 50 });
    expect(pw).toMatch(/^[!@#$%^&*()\-_=+[\]{};:,.<>/?]+$/);
  });

  it("excludes ambiguous characters when requested", () => {
    const pw = generatePassword({ length: 200, excludeAmbiguous: true });
    expect(pw).not.toMatch(/[0O1lI|`'"]/);
  });

  it("throws when every character class is disabled", () => {
    expect(() =>
      generatePassword({ uppercase: false, lowercase: false, digits: false, symbols: false }),
    ).toThrow();
  });

  it("draws from all enabled classes over enough characters (no modulo-bias blind spot)", () => {
    const pw = generatePassword({ length: 500 });
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });
});

describe("generatePassphrase", () => {
  it("defaults to 5 words separated by hyphens", () => {
    const phrase = generatePassphrase({ includeNumber: false });
    expect(phrase.split("-")).toHaveLength(5);
  });

  it("clamps word count to a minimum of 3", () => {
    expect(generatePassphrase({ words: 1, includeNumber: false }).split("-")).toHaveLength(3);
  });

  it("clamps word count to a maximum of 10", () => {
    expect(generatePassphrase({ words: 50, includeNumber: false }).split("-")).toHaveLength(10);
  });

  it("respects a custom separator", () => {
    const phrase = generatePassphrase({ words: 4, separator: "_", includeNumber: false });
    expect(phrase.split("_")).toHaveLength(4);
    expect(phrase).not.toContain("-");
  });

  it("capitalizes each word by default", () => {
    const words = generatePassphrase({ words: 6, includeNumber: false }).split("-");
    for (const w of words) {
      const letters = w.replace(/\d/g, "");
      expect(letters[0]).toBe(letters[0].toUpperCase());
    }
  });

  it("does not capitalize when capitalize: false", () => {
    const words = generatePassphrase({ words: 6, capitalize: false, includeNumber: false }).split(
      "-",
    );
    for (const w of words) {
      expect(w).toBe(w.toLowerCase());
    }
  });

  it("every word comes from the wordlist (ignoring an appended number suffix)", () => {
    const words = generatePassphrase({ words: 8, capitalize: false, includeNumber: false }).split(
      "-",
    );
    for (const w of words) {
      expect(WORDLIST).toContain(w);
    }
  });

  it("appends a 2-digit number to exactly one word when includeNumber is true", () => {
    const words = generatePassphrase({ words: 6, capitalize: false, includeNumber: true }).split(
      "-",
    );
    const withDigits = words.filter((w) => /\d/.test(w));
    expect(withDigits.length).toBe(1);
    expect(withDigits[0]).toMatch(/\d\d$/);
  });

  it("produces different output on successive calls", () => {
    const phrases = new Set(Array.from({ length: 10 }, () => generatePassphrase()));
    expect(phrases.size).toBeGreaterThan(1);
  });
});

describe("passphraseEntropyBits", () => {
  it("increases monotonically with word count", () => {
    const e5 = passphraseEntropyBits(5, false);
    const e8 = passphraseEntropyBits(8, false);
    expect(e8).toBeGreaterThan(e5);
  });

  it("adds ~6.64 bits (log2(100)) when includeNumber is true, within independent-rounding slack", () => {
    const withNumber = passphraseEntropyBits(5, true);
    const without = passphraseEntropyBits(5, false);
    // Both values are independently Math.round()-ed in passphraseEntropyBits,
    // so the difference can be off from the raw log2(100) by up to ~1 bit.
    expect(Math.abs(withNumber - without - Math.log2(100))).toBeLessThan(1);
  });

  it("matches log2(WORDLIST.length) per word", () => {
    const bitsPerWord = Math.log2(WORDLIST.length);
    expect(passphraseEntropyBits(1, false)).toBe(Math.round(bitsPerWord));
  });
});
