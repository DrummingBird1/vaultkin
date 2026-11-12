/**
 * @file src/lib/contrast.ts
 * WCAG contrast helpers for the user-chosen accent color.
 *
 * The accent is used two ways: as text/borders on dark surfaces (where it must
 * stay light) and as the fill of primary buttons with white text (where it
 * must be dark enough). `solidAccent` keeps the hue and darkens only as much
 * as needed for white text to reach 4.5:1 (WCAG AA for normal text); the
 * result goes into --accent-solid, used by filled buttons only.
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
