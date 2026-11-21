/**
 * @file src/core/watchtower/watchtower.ts
 * Vault security report ("Watchtower"): pure analysis of decrypted entries.
 * No network, no React, no i18n — issue details are i18n KEYS + params, and the
 * breach data (HIBP k-anonymity results) is passed in by the caller.
 *
 * Checks:
 *  - pwned:        password seen in a known breach (needs a breach scan)
 *  - weak:         strength score 0–1
 *  - reused:       same password on more than one login (grouped)
 *  - insecure-url: login whose URL is plain http:// (credentials sent in clear)
 *  - expiring-card / expired-card: card expiry within 60 days / already past
 *  - old:          password not changed in 180+ days
 *  - missing-password: login with neither password nor passkey
 *  - no-2fa:       login with a URL but no one-time-code secret (informational)
 *
 * Score: 100 minus weighted penalties per affected entry, normalized by the
 * number of credential entries, so a 3-entry vault and a 300-entry vault are
 * comparable. Each entry is penalized at most once per category.
 */
import type { VaultEntry } from "../vault/schema";
import { analyzeStrength } from "../password/strength";

export type IssueType =
  | "pwned"
  | "weak"
  | "reused"
  | "insecure-url"
  | "expired-card"
  | "expiring-card"
  | "old"
  | "missing-password"
  | "no-2fa";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface WatchtowerIssue {
  type: IssueType;
  severity: Severity;
  entryId: string;
  /** i18n key under "watchtower.detail." plus interpolation params. */
  detailKey: string;
  params?: Record<string, string | number>;
  /** For reused passwords: the group id shared by all entries using it. */
  group?: string;
}

export interface WatchtowerReport {
  issues: WatchtowerIssue[];
  byType: Record<IssueType, WatchtowerIssue[]>;
  score: number;
  /** Credential entries considered (logins + cards). */
  considered: number;
  /** Groups of entry ids that share one password (size ≥ 2). */
  reusedGroups: string[][];
}

export interface BreachLookup {
  get(password: string): { count: number; isPwned: boolean } | undefined;
}

export const DAY_MS = 86_400_000;
export const OLD_AFTER_DAYS = 180;
export const CARD_WARN_DAYS = 60;

const PENALTY: Record<IssueType, number> = {
  pwned: 30,
  weak: 20,
  reused: 15,
  "insecure-url": 10,
  "expired-card": 8,
  "expiring-card": 3,
  old: 4,
  "missing-password": 5,
  "no-2fa": 0, // informational: many sites don't offer 2FA
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/** "MM/YY" or "MM/YYYY" → last millisecond of that month (UTC), or null. */
export function cardExpiryEnd(expiry: string | undefined): number | null {
  const m = /^\s*(0?[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})\s*$/.exec(expiry ?? "");
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return Date.UTC(year, month, 1) - 1; // first ms of next month - 1
}

function isHttp(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return false;
    // Local addresses (routers, NAS, dev servers) commonly have no TLS.
    return (
      !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) &&
      !u.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export function analyzeVault(
  entries: VaultEntry[],
  opts: { breaches?: BreachLookup; now?: number } = {},
): WatchtowerReport {
  const now = opts.now ?? Date.now();
  const issues: WatchtowerIssue[] = [];
  const add = (i: WatchtowerIssue) => issues.push(i);

  const credentialEntries = entries.filter((e) => e.type === "login" || e.type === "card");

  // Reused passwords: group by exact password value (in memory only).
  const byPassword = new Map<string, string[]>();
  for (const e of entries) {
    if (e.type !== "login" || !e.password) continue;
    const ids = byPassword.get(e.password) ?? [];
    ids.push(e.id);
    byPassword.set(e.password, ids);
  }
  const reusedGroups: string[][] = [];
  const groupOf = new Map<string, string>();
  for (const ids of byPassword.values()) {
    if (ids.length < 2) continue;
    const group = `g${reusedGroups.length + 1}`;
    reusedGroups.push(ids);
    for (const id of ids) groupOf.set(id, group);
  }

  for (const e of entries) {
    if (e.type === "login") {
      if (!e.password) {
        add({
          type: "missing-password",
          severity: "low",
          entryId: e.id,
          detailKey: "missingPassword",
        });
      } else {
        const breach = opts.breaches?.get(e.password);
        if (breach?.isPwned)
          add({
            type: "pwned",
            severity: "critical",
            entryId: e.id,
            detailKey: "pwned",
            params: { count: breach.count },
          });

        const s = analyzeStrength(e.password);
        if (s.score <= 1)
          add({
            type: "weak",
            severity: s.score === 0 ? "high" : "medium",
            entryId: e.id,
            detailKey: "weak",
            params: { bits: Math.round(s.effectiveEntropy) },
          });

        const group = groupOf.get(e.id);
        if (group) {
          const size = reusedGroups[Number(group.slice(1)) - 1].length;
          add({
            type: "reused",
            severity: "high",
            entryId: e.id,
            detailKey: "reused",
            params: { count: size },
            group,
          });
        }

        const changed = Date.parse(e.updatedAt ?? e.createdAt ?? "");
        if (Number.isFinite(changed)) {
          const days = Math.floor((now - changed) / DAY_MS);
          if (days >= OLD_AFTER_DAYS)
            add({
              type: "old",
              severity: days >= 365 ? "medium" : "low",
              entryId: e.id,
              detailKey: "old",
              params: { count: days },
            });
        }
      }
      if (isHttp(e.url))
        add({ type: "insecure-url", severity: "high", entryId: e.id, detailKey: "insecureUrl" });
      if (e.url && !e.totpSecret)
        add({ type: "no-2fa", severity: "info", entryId: e.id, detailKey: "no2fa" });
    }

    if (e.type === "card" || e.cardNumber) {
      const end = cardExpiryEnd(e.cardExpiry);
      if (end !== null) {
        const daysLeft = Math.floor((end - now) / DAY_MS);
        if (daysLeft < 0)
          add({
            type: "expired-card",
            severity: "medium",
            entryId: e.id,
            detailKey: "expiredCard",
            params: { expiry: e.cardExpiry!.trim() },
          });
        else if (daysLeft <= CARD_WARN_DAYS)
          add({
            type: "expiring-card",
            severity: "low",
            entryId: e.id,
            detailKey: "expiringCard",
            params: { count: daysLeft },
          });
      }
    }
  }

  const byType = Object.fromEntries(
    (Object.keys(PENALTY) as IssueType[]).map((t) => [t, issues.filter((i) => i.type === t)]),
  ) as Record<IssueType, WatchtowerIssue[]>;

  const considered = credentialEntries.length;
  const penalty = issues.reduce((sum, i) => sum + PENALTY[i.type], 0);
  const score =
    considered === 0 ? 100 : Math.max(0, Math.min(100, Math.round(100 - penalty / considered)));

  issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return { issues, byType, score, considered, reusedGroups };
}
