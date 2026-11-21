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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
          detail: t("health.detail.noPassword"),
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
            detail: `${t(`entry.strength.${analysis.score}`)} · ${t("entry.strength.bits", { bits: Math.round(analysis.effectiveEntropy) })}`,
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
            detail: t("health.detail.reused", { count }),
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
            detail: t("health.detail.old", { count: days }),
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
          detail: t("health.detail.noTotp"),
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
          detail: t("health.detail.pwned", {
            count: result.count,
            formatted: result.count.toLocaleString(),
          }),
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
  }, [entries, breaches, t]);

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
        title: pwned > 0 ? t("health.scan.found", { count: pwned }) : t("health.scan.none"),
        message: t("health.scan.scanned", { count: unique.length }),
      });
    } catch (err: any) {
      addToast({
        type: "error",
        title: t("health.scan.failed"),
        message: err?.message ?? t("health.scan.networkError"),
      });
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
      ? t("health.score.excellent")
      : stats.score >= 60
        ? t("health.score.good")
        : stats.score >= 40
          ? t("health.score.fair")
          : t("health.score.poor");

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-display font-medium mb-1">{t("health.title")}</h1>
        <p className="text-sm text-(--text-secondary)">{t("health.subtitle")}</p>
      </header>

      {/* Score Card */}
      <div className="sv-card mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-(--text-secondary) mb-1">{t("health.score.title")}</div>
          <div className="flex items-baseline gap-3">
            <span style={{ fontSize: 56, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
              {stats.score}
            </span>
            <span className="text-lg" style={{ color: scoreColor }}>
              {scoreLabel}
            </span>
          </div>
          <div className="text-xs text-(--text-tertiary) mt-2">
            {t("health.score.basedOn", { count: stats.totalLogins })}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button
            onClick={handleScanBreaches}
            disabled={scanning || entries.length === 0}
            className="sv-btn-primary"
          >
            {scanning ? t("health.scan.scanning") : t("health.scan.button")}
          </button>
          <span className="text-xs text-(--text-tertiary)">{t("health.scan.privacy")}</span>
        </div>
      </div>

      {/* Issue cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IssueCard
          title={t("health.cards.pwned")}
          icon="🚨"
          items={stats.pwned}
          accent="var(--danger)"
          onFix={fixEntry}
          onOpen={openEntry}
          emptyMessage={
            breaches.size === 0 ? t("health.cards.notScanned") : t("health.cards.noneFound")
          }
        />
        <IssueCard
          title={t("health.cards.weak")}
          icon="⚠️"
          items={stats.weak}
          accent="var(--danger)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title={t("health.cards.reused")}
          icon="🔁"
          items={stats.reused}
          accent="var(--warning)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title={t("health.cards.old")}
          icon="📅"
          items={stats.old}
          accent="var(--warning)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title={t("health.cards.missing")}
          icon="❓"
          items={stats.missingPw}
          accent="var(--text-tertiary)"
          onFix={fixEntry}
          onOpen={openEntry}
        />
        <IssueCard
          title={t("health.cards.noTotp")}
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
  const { t } = useTranslation();
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
        <p className="text-xs text-(--text-tertiary) py-3">
          {emptyMessage ?? t("health.cards.noIssues")}
        </p>
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
                {t("health.cards.fix")}
              </button>
            </li>
          ))}
          {items.length > 3 && !expanded && (
            <button onClick={() => setExpanded(true)} className="sv-btn-ghost text-xs w-full mt-2">
              {t("health.cards.showMore", { count: items.length - 3 })}
            </button>
          )}
        </ul>
      )}
    </div>
  );
}

export default HealthPage;
