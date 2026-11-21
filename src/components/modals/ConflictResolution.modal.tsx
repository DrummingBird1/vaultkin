/**
 * @file ConflictResolution.modal.tsx
 * @description Side-by-side diff UI when sync detects a conflict.
 *
 * Triggered when SyncService.syncIfEnabled() returns a conflict:
 * the local vault and the remote vault both have changes that don't
 * derive from the same parent. Shows entry-level diffs and lets the
 * user pick "Keep local", "Keep remote", or "Merge both".
 *
 * "Merge both" uses mergeVaults() (core/vault/merge.ts): newest updatedAt
 * wins per entry and schema-v2 tombstones keep deletions deleted.
 */

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VaultData, VaultEntry } from "../../core/vault/schema";
import { mergeVaults } from "../../core/vault/merge";
import { Modal } from "../ui/Modal";

// Compare two entries for "meaningful" equality so the conflict UI doesn't
// flag false positives because of property-order differences in JSON.stringify
// or because tags ended up reordered by some upstream serializer. Fields not
// listed here (e.g. cached views, transient version history) are intentionally
// ignored — sync only cares about user-visible content.
const COMPARED_FIELDS: Array<keyof VaultEntry> = [
  "type",
  "title",
  "username",
  "password",
  "url",
  "notes",
  "totpSecret",
  "totpAlgorithm",
  "totpDigits",
  "totpPeriod",
  "category",
  "folderId",
  "favorite",
  "cardNumber",
  "cardHolder",
  "cardExpiry",
  "cardCVV",
];

function entriesEqual(a: VaultEntry, b: VaultEntry): boolean {
  for (const k of COMPARED_FIELDS) {
    if (a[k] !== b[k]) return false;
  }
  // Tags: compare as sets (order-insensitive).
  const ta = [...(a.tags ?? [])].sort();
  const tb = [...(b.tags ?? [])].sort();
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return false;
  // Custom fields: order matters (user-controlled), but compare deeply.
  const ca = a.customFields ?? [];
  const cb = b.customFields ?? [];
  if (ca.length !== cb.length) return false;
  for (let i = 0; i < ca.length; i++) {
    if (ca[i].id !== cb[i].id) return false;
    if (ca[i].label !== cb[i].label) return false;
    if (ca[i].value !== cb[i].value) return false;
    if (ca[i].type !== cb[i].type) return false;
  }
  return true;
}

interface Props {
  local: VaultData;
  remote: VaultData;
  onResolve: (winner: VaultData, strategy: "local" | "remote" | "merge") => void;
  onCancel: () => void;
}

interface Diff {
  id: string;
  title: string;
  status: "local-only" | "remote-only" | "both" | "conflict";
  local?: VaultEntry;
  remote?: VaultEntry;
}

export function ConflictResolutionModal({ local, remote, onResolve, onCancel }: Props) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<"local" | "remote" | "merge">("merge");

  const diffs = useMemo<Diff[]>(() => {
    const localById = new Map(local.entries.map((e) => [e.id, e]));
    const remoteById = new Map(remote.entries.map((e) => [e.id, e]));
    const all = new Set([...localById.keys(), ...remoteById.keys()]);
    const out: Diff[] = [];
    for (const id of all) {
      const l = localById.get(id);
      const r = remoteById.get(id);
      if (l && !r) out.push({ id, title: l.title, status: "local-only", local: l });
      else if (r && !l) out.push({ id, title: r.title, status: "remote-only", remote: r });
      else if (l && r) {
        out.push({
          id,
          title: l.title,
          status: entriesEqual(l, r) ? "both" : "conflict",
          local: l,
          remote: r,
        });
      }
    }
    // Sort: conflicts first, then local-only, remote-only, identical
    const order = { conflict: 0, "local-only": 1, "remote-only": 2, both: 3 };
    return out.sort((a, b) => order[a.status] - order[b.status]);
  }, [local, remote]);

  const counts = useMemo(
    () => ({
      conflicts: diffs.filter((d) => d.status === "conflict").length,
      localOnly: diffs.filter((d) => d.status === "local-only").length,
      remoteOnly: diffs.filter((d) => d.status === "remote-only").length,
      identical: diffs.filter((d) => d.status === "both").length,
    }),
    [diffs],
  );

  function handleApply() {
    let winner: VaultData;
    if (strategy === "local") winner = local;
    else if (strategy === "remote") winner = remote;
    else winner = mergeVaults(local, remote);
    onResolve(winner, strategy);
  }

  return (
    <Modal onClose={onCancel} className="max-w-[720px]" label={t("conflict.label")}>
      <h2 className="sv-modal-title mb-1">{t("conflict.title")}</h2>
      <p className="sv-modal-subtitle mb-5">{t("conflict.description")}</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5 text-center">
        <Stat
          label={t("conflict.stats.conflicts")}
          value={counts.conflicts}
          color="var(--danger)"
        />
        <Stat
          label={t("conflict.stats.localOnly")}
          value={counts.localOnly}
          color="var(--warning)"
        />
        <Stat
          label={t("conflict.stats.remoteOnly")}
          value={counts.remoteOnly}
          color="var(--accent)"
        />
        <Stat
          label={t("conflict.stats.identical")}
          value={counts.identical}
          color="var(--text-tertiary)"
        />
      </div>

      {/* Diff list */}
      <div
        style={{
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        {diffs.length === 0 ? (
          <p className="text-sm text-(--text-tertiary) p-4 text-center">{t("conflict.noDiffs")}</p>
        ) : (
          <ul>
            {diffs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-(--border-subtle) last:border-b-0"
              >
                <span className="sv-badge" style={statusBadgeStyle(d.status)}>
                  {t(statusLabel(d.status))}
                </span>
                <span className="text-sm flex-1 truncate">{d.title}</span>
                {d.status === "conflict" && (
                  <span className="text-xs text-(--text-tertiary)">
                    {t("conflict.timestamps", {
                      local: fmt(d.local?.updatedAt),
                      remote: fmt(d.remote?.updatedAt),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Strategy picker */}
      <fieldset className="mb-5">
        <legend className="sv-label">{t("conflict.strategy")}</legend>
        <StrategyOption
          value="merge"
          current={strategy}
          onChange={setStrategy}
          title={t("conflict.merge")}
          description={t("conflict.mergeDescription")}
        />
        <StrategyOption
          value="local"
          current={strategy}
          onChange={setStrategy}
          title={t("conflict.keepLocal")}
          description={t("conflict.keepLocalDescription")}
        />
        <StrategyOption
          value="remote"
          current={strategy}
          onChange={setStrategy}
          title={t("conflict.keepRemote")}
          description={t("conflict.keepRemoteDescription")}
        />
      </fieldset>

      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="sv-btn-secondary">
          {t("conflict.cancel")}
        </button>
        <button onClick={handleApply} className="sv-btn-primary">
          {t("conflict.apply")}
        </button>
      </div>
    </Modal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="sv-card" style={{ padding: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div className="text-xs text-(--text-tertiary) mt-1">{label}</div>
    </div>
  );
}

function StrategyOption({
  value,
  current,
  onChange,
  title,
  description,
}: {
  value: "local" | "remote" | "merge";
  current: string;
  onChange: (v: any) => void;
  title: string;
  description: string;
}) {
  const selected = value === current;
  return (
    <label
      onClick={() => onChange(value)}
      className="sv-card flex items-start gap-3 cursor-pointer mb-2"
      style={{
        padding: 12,
        borderColor: selected ? "var(--accent)" : "var(--border-default)",
        background: selected ? "var(--accent-dim)" : "var(--bg-surface)",
      }}
    >
      <input type="radio" checked={selected} onChange={() => {}} className="mt-1" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-(--text-tertiary) mt-1">{description}</div>
      </div>
    </label>
  );
}

/** Returns an i18n key; the caller translates it. */
function statusLabel(s: Diff["status"]): string {
  switch (s) {
    case "conflict":
      return "conflict.status.conflict";
    case "local-only":
      return "conflict.status.local";
    case "remote-only":
      return "conflict.status.remote";
    case "both":
      return "conflict.status.same";
  }
}

function statusBadgeStyle(s: Diff["status"]): React.CSSProperties {
  switch (s) {
    case "conflict":
      return { background: "var(--danger-dim)", color: "var(--danger)" };
    case "local-only":
      return { background: "var(--warning-dim)", color: "var(--warning)" };
    case "remote-only":
      return { background: "var(--accent-dim)", color: "var(--accent-text, var(--accent))" };
    case "both":
      return { background: "var(--bg-overlay)", color: "var(--text-tertiary)" };
  }
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default ConflictResolutionModal;
