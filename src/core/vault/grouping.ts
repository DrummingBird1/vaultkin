/**
 * @file src/core/vault/grouping.ts
 * Groups vault entries by "service" (registrable domain) for the Service
 * view. See docs/adr/0003-no-psl-dependency.md for why this is a
 * hand-curated heuristic rather than the full `psl` package.
 */
import type { VaultEntry } from "./schema";

// Common multi-part TLDs where the registrable domain is 3 labels, not 2
// ("example.co.uk", not "co.uk"). Not exhaustive — see the ADR for why that's
// an accepted tradeoff for this cosmetic feature.
const COMMON_MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "co.il",
  "org.il",
  "net.il",
  "ac.il",
  "gov.il",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "go.jp",
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "co.nz",
  "net.nz",
  "org.nz",
  "govt.nz",
  "co.za",
  "org.za",
  "net.za",
  "gov.za",
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "com.mx",
  "net.mx",
  "org.mx",
  "gob.mx",
  "co.in",
  "net.in",
  "org.in",
  "gov.in",
  "ac.in",
  "com.sg",
  "net.sg",
  "org.sg",
  "gov.sg",
  "com.tw",
  "net.tw",
  "org.tw",
  "gov.tw",
  "co.kr",
  "ne.kr",
  "or.kr",
  "go.kr",
  "com.hk",
  "net.hk",
  "org.hk",
  "gov.hk",
]);

/** Best-effort registrable-domain extraction — last two labels, extended to
 *  three when the last two match a known multi-part TLD. Not a general PSL
 *  implementation; see the ADR. */
export function registrableDomain(hostname: string): string {
  const labels = hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (COMMON_MULTI_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

/** The group key for an entry — its registrable domain, or a fallback for
 *  entries with no usable URL (grouped together under one bucket rather
 *  than each getting its own single-entry "group"). */
export function getServiceKey(entry: VaultEntry): string {
  if (!entry.url) return "(no domain)";
  try {
    const url = entry.url.includes("://") ? entry.url : `https://${entry.url}`;
    return registrableDomain(new URL(url).hostname);
  } catch {
    return "(no domain)";
  }
}

export interface ServiceGroup {
  key: string;
  entries: VaultEntry[];
}

/** Groups entries by service, sorted by group size (most accounts first),
 *  then alphabetically within equal sizes. Single-entry groups still form —
 *  the view decides whether to visually collapse them, grouping.ts just
 *  produces the partition. */
export function groupByService(entries: VaultEntry[]): ServiceGroup[] {
  const map = new Map<string, VaultEntry[]>();
  for (const entry of entries) {
    const key = getServiceKey(entry);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return Array.from(map.entries())
    .map(([key, groupEntries]) => ({ key, entries: groupEntries }))
    .sort((a, b) => b.entries.length - a.entries.length || a.key.localeCompare(b.key));
}
