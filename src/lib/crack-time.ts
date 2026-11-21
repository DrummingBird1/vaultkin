/**
 * @file src/lib/crack-time.ts
 * Localized display of core/password/strength's CrackTime. Units and large
 * numbers come from Intl (e.g. "3 years" / "3 שנים", "4.2 million years").
 */
import type { TFunction } from "i18next";
import type { CrackTime } from "../core/password/strength";

export function formatCrackTime(ct: CrackTime, t: TFunction, lang: string): string {
  if (ct.kind === "instant") return t("strength.crack.instant");
  if (ct.kind === "eternity") return t("strength.crack.eternity");
  try {
    return new Intl.NumberFormat(lang, {
      style: "unit",
      unit: ct.unit,
      unitDisplay: "long",
      notation: ct.value >= 10_000 ? "compact" : "standard",
      compactDisplay: "long",
      maximumFractionDigits: 1,
    }).format(ct.value);
  } catch {
    return `${ct.value} ${ct.unit}`;
  }
}
