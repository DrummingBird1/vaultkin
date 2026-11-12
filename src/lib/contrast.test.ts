import { describe, it, expect } from "vitest";
import { contrastRatio, solidAccent } from "./contrast";

// The accent palette offered in Settings.
const PALETTE = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#EF4444"];

describe("contrast", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("every palette accent gets a solid variant white text can sit on (4.5:1)", () => {
    for (const hex of PALETTE) {
      expect(contrastRatio(solidAccent(hex), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("changes as little as needed: an accent that already passes is unchanged", () => {
    expect(solidAccent("#4338ca")).toBe("#4338ca");
    // Indigo was 4.47:1; one small step is enough.
    expect(contrastRatio(solidAccent("#6366F1"), "#6366F1")).toBeLessThan(1.1);
  });

  it("leaves anything that isn't #rrggbb alone", () => {
    expect(solidAccent("tomato")).toBe("tomato");
  });
});
