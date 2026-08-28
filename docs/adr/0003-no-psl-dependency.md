# 0003: Hand-curated multi-part-TLD list instead of the `psl` package

**Status:** Accepted

## Context

The "group entries by service" view (`src/core/vault/grouping.ts`) needs to
turn a URL like `https://accounts.google.com` and
`https://mail.google.com` into the same group key (`google.com`), while
`https://example.co.uk` and `https://other.co.uk` should stay as *separate*
groups (`example.co.uk` / `other.co.uk`), not collapse into a false
`co.uk` group. The general version of this problem — correctly identifying
the "registrable domain" / effective TLD for arbitrary hostnames — is what
the Public Suffix List (PSL) exists to solve, and `psl` is the standard npm
package for consuming it.

`psl` was evaluated and measured: `npm view psl dist.unpackedSize` reported
**711,982 bytes** (~700 KB) unpacked, essentially all of it the PSL data
file itself (the list has tens of thousands of entries covering every
ccTLD's registration policy, most of which this app has no realistic
occasion to ever see a URL for).

## Decision

**Did not add `psl`.** Instead, `grouping.ts`'s `registrableDomain()` uses
the simple "last two dot-separated labels" heuristic, extended by a
hand-curated `COMMON_MULTI_PART_TLDS` `Set` (~40 entries: `co.uk`,
`com.au`, `co.il`, `co.jp`, `com.br`, and similar) — if the last two labels
of a hostname match an entry in that set, take three labels instead of two.

This is not a general, correct PSL implementation. It is a targeted fix for
the multi-part TLDs an actual user's saved-password domains are plausibly
going to include, in service of a **cosmetic grouping feature** — mislabeling
an exotic ccTLD's registration policy here means an entry shows up in a
slightly wrong (or extra) group heading, not a security or data-integrity
issue.

## Consequences

- A domain under a multi-part TLD not in the curated list (some ccTLD this
  app's users are unlikely to have vault entries for) will group by the
  last two labels only, same as a normal two-label domain — occasionally
  producing a technically-wrong group boundary. Accepted: the failure mode
  is "cosmetic grouping is slightly off for an uncommon TLD," not
  "something breaks."
- The list needs occasional manual maintenance if a genuinely common
  multi-part TLD turns out to be missing — there is no automatic
  "official" list backing it, unlike using `psl` directly. Given the
  bounded, non-security-critical scope, this was judged worth the ~700 KB
  saved over pulling in the full data set for a feature that doesn't need
  it to be complete, only reasonably good on common cases.
- If a future feature genuinely needs correct eTLD+1 resolution for
  something security-relevant (e.g., strict-match cookie/origin logic),
  that would warrant revisiting this decision on its own merits — this
  ADR's tradeoff is specific to the grouping feature's cosmetic stakes,
  not a blanket "never use `psl`" position.
