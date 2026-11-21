/**
 * @file ShareEntry.modal.tsx
 * Share one entry as an encrypted file + a separate code (core/share/share.ts).
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { VaultEntry } from "../../core/vault/schema";
import { createShare, SHARE_FILE_EXT } from "../../core/share/share";
import { ClipboardService } from "../../services/clipboard.service";
import { Modal } from "../ui/Modal";
import { IconClose } from "../icons";

const EXPIRY = [
  { ms: 60 * 60 * 1000, key: "hour" },
  { ms: 24 * 60 * 60 * 1000, key: "day" },
  { ms: 7 * 24 * 60 * 60 * 1000, key: "week" },
] as const;

function safeName(title: string): string {
  return (title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "shared").slice(0, 60);
}

export function ShareEntryModal({ entry, onClose }: { entry: VaultEntry; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [includePassword, setPw] = useState(true);
  const [includeTotp, setTotp] = useState(false);
  const [includeNotes, setNotes] = useState(false);
  const [expiry, setExpiry] = useState<number>(EXPIRY[1].ms);
  const [from, setFrom] = useState("");
  const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);

  const create = async () => {
    const r = await createShare(entry, {
      includePassword,
      includeTotp,
      includeNotes,
      expiresInMs: expiry,
      from: from.trim(),
    });
    const url = URL.createObjectURL(new Blob([r.file], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName(entry.title) + SHARE_FILE_EXT;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setResult({ code: r.code, expiresAt: r.expiresAt });
  };

  const box = (label: string, v: boolean, set: (b: boolean) => void, show = true) =>
    show && (
      <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
        <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
        {label}
      </label>
    );

  return (
    <Modal onClose={onClose} className="max-w-md" label={t("share.title")}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="sv-modal-title">{t("share.title")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("entry.close")}
          className="sv-icon-btn"
        >
          <IconClose />
        </button>
      </div>
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-(--text-secondary)">{t("share.done")}</p>
          <div className="flex gap-2">
            <code
              dir="ltr"
              data-testid="share-code"
              className="flex-1 text-xs font-mono bg-(--bg-elevated) rounded-lg p-2 break-all"
            >
              {result.code}
            </code>
            <button
              type="button"
              className="sv-btn-secondary text-xs px-3"
              onClick={() => void ClipboardService.copy(result.code)}
            >
              {t("share.copyCode")}
            </button>
          </div>
          <p className="text-xs text-(--text-tertiary)">
            {t("share.expires", { date: new Date(result.expiresAt).toLocaleString(i18n.language) })}
          </p>
          <p className="text-xs text-(--text-tertiary)">{t("share.separately")}</p>
          <button type="button" className="sv-btn-primary" onClick={onClose}>
            {t("share.close")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-(--text-secondary)">
            {t("share.intro", { title: entry.title })}
          </p>
          {box(t("share.includePassword"), includePassword, setPw, !!entry.password)}
          {box(t("share.includeTotp"), includeTotp, setTotp, !!entry.totpSecret)}
          {box(t("share.includeNotes"), includeNotes, setNotes, !!entry.notes)}
          <label className="sv-label" htmlFor="share-expiry">
            {t("share.expiry")}
          </label>
          <select
            id="share-expiry"
            className="sv-input w-full"
            value={expiry}
            onChange={(e) => setExpiry(+e.target.value)}
          >
            {EXPIRY.map((x) => (
              <option key={x.key} value={x.ms}>
                {t(`share.expiryOptions.${x.key}`)}
              </option>
            ))}
          </select>
          <label className="sv-label" htmlFor="share-from">
            {t("share.from")}
          </label>
          <input
            id="share-from"
            className="sv-input w-full"
            value={from}
            maxLength={80}
            onChange={(e) => setFrom(e.target.value)}
          />
          <button type="button" className="sv-btn-primary" onClick={() => void create()}>
            {t("share.create")}
          </button>
        </div>
      )}
    </Modal>
  );
}
