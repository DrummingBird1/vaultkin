/**
 * @file src/lib/contrast.ts
 * WCAG contrast helpers for the user-chosen accent color.
 *
 * The accent is used two ways: as text/borders on dark surfaces (where it must
 * stay light) and as the fill of primary buttons with white text (where it
 * must be dark enough). `solidAccent` keeps the hue and darkens only as much
 * as needed for white text to reach 4.5:1 (WCAG AA for normal text); the
 * result goes into --accent-solid, used by filled buttons only.
 * `readableAccent` does the opposite job for accent-colored TEXT: it moves the
 * accent toward white (dark themes) or black (light themes) until it reaches
 * 4.5:1 on every surface it can sit on; the result goes into --accent-text.
 */

/** Relative luminance of a #rrggbb color (WCAG 2.x). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #rrggbb colors, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The accent, darkened in small steps until white text on it reaches `min`. */
export function solidAccent(hex: string, min = 4.5): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (c: number[]) =>
    "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  for (let i = 0; i < 100 && contrastRatio(toHex(rgb), "#ffffff") < min; i++) {
    rgb = rgb.map((v) => v * 0.97);
  }
  return toHex(rgb);
}

function parse(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function toHex(c: number[]): string {
  return (
    "#" +
    c
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * The accent adjusted for use as text on the given backgrounds: mixed toward
 * white (if the backgrounds are dark) or black (if light) in small steps until
 * its contrast with EVERY background is at least `min`. Hue is kept as far as
 * possible; returns the input unchanged if it already passes.
 */
export function readableAccent(hex: string, backgrounds: string[], min = 4.5): string {
  const valid = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);
  const bgs = backgrounds.filter(valid);
  if (!valid(hex) || bgs.length === 0) return hex;
  const dark = bgs.every((b) => luminance(b) < 0.18);
  const target = dark ? [255, 255, 255] : [0, 0, 0];
  const base = parse(hex);
  for (let step = 0; step <= 100; step += 2) {
    const t = step / 100;
    const c = toHex(base.map((v, i) => v + (target[i] - v) * t));
    if (bgs.every((b) => contrastRatio(c, b) >= min)) return c;
  }
  return toHex(target);
}
