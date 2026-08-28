/**
 * @file src/core/password/strength.test.ts
 * analyzeStrength — see CLAUDE.md invariant #6: the exported function is
 * `analyzeStrength`, entropy field is `effectiveEntropy`. The
 * `analyzePassword` / `.entropy` names are a backward-compat alias/field
 * kept for callers that haven't migrated — both are covered here too so a
 * future removal is a deliberate, visible test change, not a silent break.
 */
import { describe, it, expect } from "vitest";
import { analyzeStrength, analyzePassword } from "./strength";

describe("analyzeStrength", () => {
  it("scores an empty password as Very Weak with zero entropy", () => {
    const r = analyzeStrength("");
    expect(r.score).toBe(0);
    expect(r.label).toBe("Very Weak");
    expect(r.effectiveEntropy).toBe(0);
  });

  it("scores a long random password as Strong or Very Strong", () => {
    const r = analyzeStrength("xK9#mQ2$vL7@pR4!zN8&wT5*yH");
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it("flags a commonly leaked password even if it 'looks' varied enough", () => {
    const r = analyzeStrength("password");
    expect(r.feedback.some((f) => /commonly leaked/i.test(f))).toBe(true);
  });

  it("flags short passwords with a length suggestion", () => {
    const r = analyzeStrength("abc123");
    expect(r.feedback.some((f) => /12\+ characters/i.test(f))).toBe(true);
  });

  it("flags a single repeated character", () => {
    const r = analyzeStrength("aaaaaaaaaaaa");
    expect(r.feedback.some((f) => /repeated characters/i.test(f))).toBe(true);
  });

  it("flags an obvious ascending sequence", () => {
    const r = analyzeStrength("myPass1234word");
    expect(r.feedback.some((f) => /sequences/i.test(f))).toBe(true);
  });

  it("effectiveEntropy is always <= raw entropy", () => {
    for (const pw of ["password", "abc123", "Xk9#mQ2$vL7@pR4!", "aaaa", ""]) {
      const r = analyzeStrength(pw);
      expect(r.effectiveEntropy).toBeLessThanOrEqual(r.entropy);
    }
  });

  it("effectiveEntropy never goes negative", () => {
    const r = analyzeStrength("aaaaaaaaaa"); // short + repeated + no variety: penalty-heavy
    expect(r.effectiveEntropy).toBeGreaterThanOrEqual(0);
  });

  it("score is monotonic with a clearly weaker vs. clearly stronger password", () => {
    const weak = analyzeStrength("abc123");
    const strong = analyzeStrength("xK9#mQ2$vL7@pR4!zN8&wT5*yH");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("produces a human-readable crackTimeDisplay for every score band", () => {
    for (const pw of [
      "",
      "a",
      "abc123",
      "correcthorsebatterystaple",
      "xK9#mQ2$vL7@pR4!zN8&wT5*yH",
    ]) {
      const r = analyzeStrength(pw);
      expect(typeof r.crackTimeDisplay).toBe("string");
      expect(r.crackTimeDisplay.length).toBeGreaterThan(0);
    }
  });

  it("analyzePassword is an alias for analyzeStrength", () => {
    expect(analyzePassword).toBe(analyzeStrength);
  });
});
