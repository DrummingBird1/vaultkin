/**
 * @file src/core/password/generator.property.test.ts
 * Property-based tests for generatePassword: for any valid combination of
 * options, the output must always satisfy the requested shape (length,
 * character-class membership, no ambiguous characters when excluded).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { generatePassword, type GenerateOptions } from "./generator";

const AMBIGUOUS = new Set([..."0O1lI|`'\""]);

const optionsArbitrary = fc.record({
  length: fc.integer({ min: 4, max: 128 }),
  uppercase: fc.boolean(),
  lowercase: fc.boolean(),
  digits: fc.boolean(),
  symbols: fc.boolean(),
  excludeAmbiguous: fc.boolean(),
});

/** At least one character class must be enabled, or generatePassword throws by design. */
function hasAnyClass(o: GenerateOptions): boolean {
  return !!(o.uppercase || o.lowercase || o.digits || o.symbols);
}

describe("generatePassword — property-based", () => {
  it("always returns exactly the requested length", () => {
    fc.assert(
      fc.property(optionsArbitrary.filter(hasAnyClass), (opts) => {
        expect(generatePassword(opts)).toHaveLength(opts.length);
      }),
      { numRuns: 200 },
    );
  });

  it("only uses characters from the enabled classes", () => {
    fc.assert(
      fc.property(optionsArbitrary.filter(hasAnyClass), (opts) => {
        const pw = generatePassword(opts);
        for (const ch of pw) {
          const inUpper = opts.uppercase && /[A-Z]/.test(ch);
          const inLower = opts.lowercase && /[a-z]/.test(ch);
          const inDigit = opts.digits && /[0-9]/.test(ch);
          const inSymbol = opts.symbols && /[!@#$%^&*()\-_=+[\]{};:,.<>/?]/.test(ch);
          expect(inUpper || inLower || inDigit || inSymbol).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("never contains an ambiguous character when excludeAmbiguous is set", () => {
    fc.assert(
      fc.property(
        optionsArbitrary.filter((o) => hasAnyClass(o) && o.excludeAmbiguous),
        (opts) => {
          const pw = generatePassword(opts);
          for (const ch of pw) {
            expect(AMBIGUOUS.has(ch)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("throws when every character class is disabled, regardless of other options", () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 128 }), fc.boolean(), (length, excludeAmbiguous) => {
        expect(() =>
          generatePassword({
            length,
            uppercase: false,
            lowercase: false,
            digits: false,
            symbols: false,
            excludeAmbiguous,
          }),
        ).toThrow();
      }),
      { numRuns: 20 },
    );
  });
});
