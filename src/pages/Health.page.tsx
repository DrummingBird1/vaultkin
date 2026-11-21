/**
 * @file Health.page.tsx
 * @description Password Health dashboard — surfaces weak, old, reused, and
 * pwned passwords across the vault.
 *
 * Computes everything client-side from the in-memory vault.
 * The HIBP breach check is opt-in (lazy-loaded on user click) because it
 * requires a network call.
 */

import React, { useMemo, useState } from "react";
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import { analyzeStrength } from "../core/password/strength";
import { BreachService, type BreachResult } from "../services/breach.service";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface HealthIssue {
  entryId: string;
  title: string;
  username?: string;
  type: "weak" | "old" | "reused" | "pwned" | "no-totp" | "missing-pw";
  severity: "low" | "medium" | "high";
  detail: string;
}

export function HealthPage() {
  const { entries, selectEntry } = useVaultStore();
  const { setActivePage, openEditEntry, addToast } = useUIStore();
  const [breaches, setBreaches] = useState<Map<string, BreachResult>>(new Map());
  const [scanning, setScanning] = useState(false);

  const stats = useMemo(() => {
    const weak: HealthIssue[] = [];
    const old: HealthIssue[] = [];
    const reused: HealthIssue[] = [];
    const noTotp: HealthIssue[] = [];
    const missingPw: HealthIssue[] = [];

    const passwordCounts = new Map<string, number>();
    for (const e of entries) {
      if (e.password) passwordCounts.set(e.password, (passwordCounts.get(e.password) ?? 0) + 1);
    }

    for (const entry of entries) {
      if (entry.type !== "login" && entry.type !== "totp") continue;

      // Missing password (login without password is a config issue)
      if (entry.type === "login" && !entry.password) {
        missingPw.push({
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          type: "missing-pw",
          severity: "low",
          detail: "No password set",
        });
        continue;
      }

      if (entry.password) {
        const analysis = analyzeStrength(entry.password);
        if (analysis.score <= 1) {
          weak.push({
            entryId: entry.id,
            title: entry.title,
            username: entry.username,
            type: "weak",
            severity: analysis.score === 0 ? "high" : "medium",
            detail: `${analysis.label} · ${Math.round(analysis.effectiveEntropy)} bits`,
          });
        }

        const count = passwordCounts.get(entry.password) ?? 0;
        if (count > 1) {
          reused.push({
            entryId: entry.id,
            title: entry.title,
            username: entry.username,
            type: "reused",
            severity: "medium",
            detail: `Used ${count} times across your vault`,
          });
        }
      }

      // Old: passwords not updated in 90+ days (uses updatedAt as proxy)
      if (entry.updatedAt) {
        const age = Date.now() - new Date(entry.updatedAt).getTime();
        if (age > NINETY_DAYS_MS) {
          const days = Math.floor(age / (24 * 60 * 60 * 1000));
          old.push({
            entryId: entry.id,
            title: entry.title,
            username: entry.username,
            type: "old",
            severity: days > 365 ? "high" : "low",
            detail: `Last changed ${days} days ago`,
          });
        }
      }

      // Login without 2FA (a soft warning)
      if (entry.type === "login" && !entry.totpSecret && entry.url) {
        noTotp.push({
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          type: "no-totp",
          severity: "low",
          detail: "Consider enabling 2FA",
        });
      }
    }

    // Pwned issues (only after scan)
    const pwned: HealthIssue[] = [];
    for (const entry of entries) {
      if (!entry.password) continue;
      const result = breaches.get(entry.password);
      if (result?.isPwned) {
        pwned.push({
          entryId: entry.id,
          title: entry.title,
          username: entry.username,
          type: "pwned",
          severity: "high",
          detail: `Found ${result.count.toLocaleString()} times in breach databases`,
        });
      }
    }

    // Compute overall score (0-100)
    const totalLogins = entries.filter((e) => e.type === "login").length || 1;
    const issuePenalty =
      weak.length * 8 +
      reused.length * 5 +
      old.length * 3 +
      pwned.length * 12 +
      missingPw.length * 4;
    const score = Math.max(0, Math.min(100, 100 - Math.round((issuePenalty / totalLogins) * 10)));

    return { weak, old, reused, noTotp, missingPw, pwned, score, totalLogins };
  }, [entries, breaches]);

  async function handleScanBreaches() {
    setScanning(true);
    try {
      const passwords = entries.map((e) => e.password).filter((p): p is string => !!p);
      const unique = [...new Set(passwords)];
      const results = await BreachService.checkBatch(unique);
      setBreaches(results);
      const pwned = [...results.values()].filter((r) => r.isPwned).length;
      addToast({
        type: pwned > 0 ? "warning" : "success",
        title: pwned > 0 ? `${pwned} compromised passwords found` : "No breaches detected",
        message: `Scanned ${unique.length} unique passwords against HIBP`,
      });
    } catch (err: any) {
      addToast({ type: "error", title: "Scan failed", message: err?.message ?? "Network error" });
    } finally {
      setScanning(false);
    }
  }

  function openEntry(id: string) {
    selectEntry(id);
    setActivePage("vault");
  }

  function fixEntry(id: string) {
    setActivePage("vault");
    openEditEntry(id);
  }

  const scoreColor =
    stats.score >= 80 ? "var(--success)" : stats.score >= 60 ? "var(--warning)" : "var(--danger)";

  const scoreLabel =
    stats.score >= 80
      ? "Excellent"
      : stats.score >= 60
        ? "Good"
        : stats.score >= 40
          ? "Fair"
          : "Poor";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-display font-medium mb-1">Password Health</h1>
        <p className="text-sm text-(--text-secondary)">Audit of all your stored credentials.</p>
      </header>

      {/* Score Card */}
      <div className="sv-card mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-(--text-secondary) mb-1">Overall Score</div>
          <div className="flex items-baseline gap-3">
            <span style={{ fontSize: 56, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
              {stats.score}
            </span>
            <span className="text-lg" style={{ color: scoreColor }}>
              {scoreLabel}
            </span>
          </div>
          <div className="text-xs text-(--text-tertiary) mt-2">
            Based on {stats.totalLogins} login {stats.totalLogins === 1 ? "entry" : "entries"}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button
            onClick={handleScanBreaches}
            disabled={scanning || entries.length === 0}
            className="sv-btn-primary"
          >
            {scanning ? "Scanning…" : "🛡️ Scan for breaches"}
          </button>
          <span className="text-xs text-(--text-tertiary)">Privacy-preserving (k-anonymity)</span>
        </div>
      </div>

      {/* Issue cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IssueCard
          title="Compromised passwords"
          icon="🚨"
          items={stats.pwned}
          accent="var(--danger)"
          onFix={fixEntry}
          onOpen={openEntry}
          emptyMessage={breaches.size === 0 ? "Not scanned yet" : "None found"}
        />
        <IssueCard
          title="Weak passwords"
          icon="⚠️"
          items={stats.weak}
          accent="var(--danger)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title="Reused passwords"
          icon="🔁"
          items={stats.reused}
          accent="var(--warning)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title="Old passwords"
          icon="📅"
          items={stats.old}
          accent="var(--warning)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title="Missing passwords"
          icon="❓"
          items={stats.missingPw}
          accent="var(--text-tertiary)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title="No 2FA enabled"
          icon="🔓"
          items={stats.noTotp}
          accent="var(--text-tertiary)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
      </div>
    </div>
  );
}

interface IssueCardProps {
  title: string;
  icon: string;
  items: HealthIssue[];
  accent: string;
  onFix: (id: string) => void;
  onOpen: (id: string) => void;
  emptyMessage?: string;
}

function IssueCard({ title, icon, items, accent, onFix, onOpen, emptyMessage }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div className="sv-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2">
          <span>{icon}</span> {title}
        </h3>
        <span
          className="sv-badge"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-(--text-tertiary) py-3">{emptyMessage ?? "✓ No issues"}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((it) => (
            <li
              key={`${it.type}-${it.entryId}`}
              className="flex items-center justify-between gap-2 py-2 border-b border-(--border-subtle) last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{it.title}</div>
                <div className="text-xs text-(--text-tertiary) truncate">
                  {it.username ?? it.detail}
                </div>
              </div>
              <button onClick={() => onFix(it.entryId)} className="sv-btn-ghost text-xs">
                Fix
              </button>
            </li>
          ))}
          {items.length > 3 && !expanded && (
            <button onClick={() => setExpanded(true)} className="sv-btn-ghost text-xs w-full mt-2">
              Show {items.length - 3} more
            </button>
          )}
        </ul>
      )}
    </div>
  );
}

export default HealthPage;
