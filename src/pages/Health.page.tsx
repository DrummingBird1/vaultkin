/**
 * @file Health.page.tsx
 * Watchtower: the vault's security report. All analysis is local and pure
 * (core/watchtower); the only network use is the opt-in HIBP breach scan,
 * which sends 5 hex chars of each password's SHA-1 (k-anonymity).
 */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  ChevronDown,
  CreditCard,
  KeyRound,
  Link2Off,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import { BreachService, type BreachResult } from "../services/breach.service";
import { analyzeVault, type IssueType, type WatchtowerIssue } from "../core/watchtower/watchtower";
import { Button } from "../components/ui/Button";

const CATEGORIES: Array<{ type: IssueType; icon: LucideIcon; tone: string }> = [
  { type: "pwned", icon: Siren, tone: "var(--danger)" },
  { type: "weak", icon: ShieldAlert, tone: "var(--danger)" },
  { type: "reused", icon: Repeat, tone: "var(--warning)" },
  { type: "insecure-url", icon: Link2Off, tone: "var(--warning)" },
  { type: "expired-card", icon: CreditCard, tone: "var(--warning)" },
  { type: "expiring-card", icon: CreditCard, tone: "var(--text-tertiary)" },
  { type: "old", icon: CalendarClock, tone: "var(--text-tertiary)" },
  { type: "missing-password", icon: KeyRound, tone: "var(--text-tertiary)" },
  { type: "no-2fa", icon: ShieldQuestion, tone: "var(--text-tertiary)" },
];

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border-default)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

export function HealthPage() {
  const { t } = useTranslation();
  const entries = useVaultStore((s) => s.entries);
  const selectEntry = useVaultStore((s) => s.selectEntry);
  const { setActivePage, openEditEntry, addToast } = useUIStore();
  const [breaches, setBreaches] = useState<Map<string, BreachResult> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<IssueType | null>(null);

  const report = useMemo(
    () => analyzeVault(entries, { breaches: breaches ?? undefined }),
    [entries, breaches],
  );
  const titleOf = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const scoreLabel =
    report.score >= 80
      ? t("health.score.excellent")
      : report.score >= 60
        ? t("health.score.good")
        : report.score >= 40
          ? t("health.score.fair")
          : t("health.score.poor");

  async function scan() {
    setScanning(true);
    try {
      const unique = [...new Set(entries.map((e) => e.password).filter((p): p is string => !!p))];
      const results = await BreachService.checkBatch(unique);
      setBreaches(results);
      const pwned = [...results.values()].filter((r) => r.isPwned).length;
      addToast({
        type: pwned > 0 ? "warning" : "success",
        title: pwned > 0 ? t("health.scan.found", { count: pwned }) : t("health.scan.none"),
        message: t("health.scan.scanned", { count: unique.length }),
      });
      if (pwned > 0) setOpen("pwned");
    } catch (err: unknown) {
      addToast({
        type: "error",
        title: t("health.scan.failed"),
        message: err instanceof Error ? err.message : t("health.scan.networkError"),
      });
    } finally {
      setScanning(false);
    }
  }

  const fix = (id: string) => {
    setActivePage("vault");
    openEditEntry(id);
  };
  const view = (id: string) => {
    selectEntry(id);
    setActivePage("vault");
  };

  // Distinct entries with something to fix (one entry can have several issues).
  const actionable = new Set(
    report.issues.filter((i) => i.severity !== "info").map((i) => i.entryId),
  ).size;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-display font-medium mb-1">{t("watchtower.title")}</h1>
          <p className="text-sm text-(--text-secondary)">{t("watchtower.subtitle")}</p>
        </header>

        <section
          className="sv-card mb-6 flex flex-wrap items-center gap-6"
          aria-labelledby="wt-score"
        >
          <div className="relative">
            <ScoreRing score={report.score} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums">{report.score}</span>
              <span className="text-xs text-(--text-tertiary)" dir="ltr">
                / 100
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-56">
            <h2 id="wt-score" className="text-lg font-medium">
              {scoreLabel}
            </h2>
            <p className="text-sm text-(--text-secondary) mt-1">
              {actionable === 0
                ? t("watchtower.allClear")
                : t("watchtower.toFix", { count: actionable })}
            </p>
            <p className="text-xs text-(--text-tertiary) mt-1">
              {t("health.score.basedOn", { count: report.considered })}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-1.5">
            <Button
              variant="primary"
              onClick={scan}
              busy={scanning}
              busyLabel={t("health.scan.scanning")}
              disabled={entries.length === 0}
            >
              {breaches ? t("watchtower.rescan") : t("health.scan.button")}
            </Button>
            <span className="text-xs text-(--text-tertiary) max-w-60">
              {t("health.scan.privacy")}
            </span>
          </div>
        </section>

        <div
          className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6"
          role="list"
          aria-label={t("watchtower.categories")}
        >
          {CATEGORIES.map(({ type, icon: Icon, tone }) => {
            const count = report.byType[type].length;
            const pending = type === "pwned" && !breaches;
            return (
              <button
                key={type}
                role="listitem"
                type="button"
                onClick={() => setOpen(open === type ? null : type)}
                aria-expanded={open === type}
                aria-controls="wt-details"
                disabled={count === 0}
                className={`sv-card text-start flex items-center gap-3 transition-colors disabled:opacity-60 enabled:hover:border-(--border-strong) ${open === type ? "border-(--accent)!" : ""}`}
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    color: count ? tone : "var(--success)",
                    background: "var(--bg-elevated)",
                  }}
                >
                  {count ? (
                    <Icon aria-hidden="true" className="w-4.5 h-4.5" />
                  ) : (
                    <ShieldCheck aria-hidden="true" className="w-4.5 h-4.5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {t(`watchtower.types.${type}`)}
                  </span>
                  <span className="block text-xs text-(--text-tertiary)">
                    {pending ? t("health.cards.notScanned") : t("watchtower.count", { count })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {open && (
          <section id="wt-details" className="sv-card" aria-labelledby="wt-details-title">
            <div className="flex items-center justify-between mb-3">
              <h2 id="wt-details-title" className="font-medium">
                {t(`watchtower.types.${open}`)}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="sv-icon-btn"
                aria-label={t("watchtower.collapse")}
              >
                <ChevronDown aria-hidden="true" className="w-4 h-4 rotate-180" />
              </button>
            </div>
            <p className="text-sm text-(--text-secondary) mb-4">{t(`watchtower.advice.${open}`)}</p>
            <IssueList
              issues={report.byType[open]}
              titleOf={titleOf}
              grouped={open === "reused"}
              onFix={fix}
              onView={view}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function IssueList({
  issues,
  titleOf,
  grouped,
  onFix,
  onView,
}: {
  issues: WatchtowerIssue[];
  titleOf: Map<string, { title: string; username?: string }>;
  grouped: boolean;
  onFix: (id: string) => void;
  onView: (id: string) => void;
}) {
  const { t } = useTranslation();
  const groups = grouped
    ? [
        ...issues
          .reduce(
            (m, i) => m.set(i.group!, [...(m.get(i.group!) ?? []), i]),
            new Map<string, WatchtowerIssue[]>(),
          )
          .values(),
      ]
    : [issues];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((list, gi) => (
        <ul
          key={gi}
          className={grouped ? "rounded-xl border border-(--border-subtle) p-2" : ""}
          aria-label={grouped ? t("watchtower.sharedBy", { count: list.length }) : undefined}
        >
          {grouped && (
            <li className="text-xs text-(--text-tertiary) px-2 pb-1">
              {t("watchtower.sharedBy", { count: list.length })}
            </li>
          )}
          {list.map((i) => {
            const e = titleOf.get(i.entryId);
            return (
              <li
                key={`${i.type}-${i.entryId}`}
                className="flex items-center gap-3 px-2 py-2 border-b border-(--border-subtle) last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onView(i.entryId)}
                  className="min-w-0 flex-1 text-start"
                >
                  <span className="block text-sm font-medium truncate">{e?.title ?? "—"}</span>
                  <span className="block text-xs text-(--text-tertiary) truncate">
                    {[e?.username, t(`watchtower.detail.${i.detailKey}`, i.params ?? {})]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  className="text-xs shrink-0"
                  onClick={() => onFix(i.entryId)}
                >
                  {t("health.cards.fix")}
                </Button>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}

export default HealthPage;
