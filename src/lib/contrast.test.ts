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

import { readableAccent } from "./contrast";

describe("readableAccent", () => {
  const dark = ["#0d0d12", "#15151b", "#1c1c24", "#232330"];
  const light = ["#fafafb", "#ffffff", "#f4f4f6", "#eaeaf0"];
  const palette = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#EF4444"];

  it("every palette accent reaches 4.5:1 as text on every surface of both themes", () => {
    for (const hex of palette) {
      for (const bgs of [dark, light]) {
        const c = readableAccent(hex, bgs);
        for (const bg of bgs) expect(contrastRatio(c, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("returns a color that already passes unchanged, and ignores bad input", () => {
    expect(readableAccent("#ffffff", dark)).toBe("#ffffff");
    expect(readableAccent("nope", dark)).toBe("nope");
    expect(readableAccent("#6366f1", [])).toBe("#6366f1");
  });
});
