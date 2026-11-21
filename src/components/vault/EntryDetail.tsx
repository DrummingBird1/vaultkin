/**
 * @file src/components/vault/EntryDetail.tsx
 * Right-hand detail panel for the selected entry.
 */
import { AttachmentsPanel } from "./AttachmentsPanel";
import { useTranslation } from "react-i18next";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { ClipboardService } from "../../services/clipboard.service";
import { HistoryService } from "../../services/history.service";
import { IconClose } from "../icons";
import { EntryFavicon } from "./EntryFavicon";
import { SHOW_PASSWORD_TIMEOUT_MS } from "../../constants";
import type { VaultEntry } from "../../core/vault/schema";

export function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onClose,
}: {
  entry: VaultEntry;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [showPw, setShowPw] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toastSuccess } = useUIStore();
  const updateEntry = useVaultStore((s) => s.updateEntry);

  // Past versions for this entry (in-memory, cleared on lock).
  const versions = HistoryService.get(entry.id);

  const restoreVersion = (v: VaultEntry) => {
    updateEntry(entry.id, {
      title: v.title,
      username: v.username,
      password: v.password,
      url: v.url,
      notes: v.notes,
      totpSecret: v.totpSecret,
      category: v.category,
      tags: v.tags,
      customFields: v.customFields,
    });
    toastSuccess(t("entryDetail.restored"), t("entryDetail.restoredBody"));
    setShowHistory(false);
  };

  // Auto-hide the password after a short window. Reduces shoulder-surfing /
  // accidental-screenshot risk if the user wanders off with the panel open.
  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    setSecondsLeft(Math.round(SHOW_PASSWORD_TIMEOUT_MS / 1000));
    hideTimerRef.current = setTimeout(() => {
      setShowPw(false);
      setSecondsLeft(0);
    }, SHOW_PASSWORD_TIMEOUT_MS);
    tickTimerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
  }, []);

  const togglePw = useCallback(() => {
    setShowPw((prev) => {
      const next = !prev;
      if (next) startHideTimer();
      else {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (tickTimerRef.current) clearInterval(tickTimerRef.current);
        setSecondsLeft(0);
      }
      return next;
    });
  }, [startHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  const copyField = async (value: string, label: string) => {
    const ok = await ClipboardService.copy(value, label);
    if (ok)
      toastSuccess(
        t("entryDetail.copied", { label }),
        t("entryDetail.clearsIn", { seconds: ClipboardService.getRemainingSeconds() }),
      );
  };

  return (
    <div
      className="w-80 shrink-0 border-s border-(--border-subtle) bg-(--bg-surface) flex flex-col"
      style={{ animation: "slideUp 200ms ease both" }}
    >
      <div className="flex items-center justify-between p-4 border-b border-(--border-subtle)">
        <div className="flex items-center gap-3 min-w-0">
          <EntryFavicon
            title={entry.title}
            url={entry.url}
            className="w-9 h-9 rounded-xl bg-(--accent-dim) text-sm shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--text-primary) truncate">{entry.title}</p>
            <p className="text-xs text-(--text-tertiary) truncate">{entry.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label={t("entry.edit")}
            className="p-1.5 rounded-lg text-(--text-tertiary) hover:text-(--accent-text) hover:bg-(--accent-dim) transition-colors text-xs"
          >
            {t("entryDetail.edit")}
          </button>
          <button
            onClick={onClose}
            aria-label={t("entryDetail.close")}
            className="p-1.5 rounded-lg text-(--text-tertiary) hover:text-(--text-primary) transition-colors"
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* URL */}
        {entry.url && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.url")}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-(--accent-text) hover:underline truncate flex-1"
              >
                {entry.url}
              </a>
              <button
                onClick={() => copyField(entry.url!, t("entryDetail.url"))}
                aria-label={t("entryDetail.copyUrl")}
                className="text-(--text-tertiary) hover:text-(--accent-text) transition-colors text-xs shrink-0"
              >
                {t("entryDetail.copy")}
              </button>
            </div>
          </div>
        )}

        {/* Username */}
        {entry.username && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.username")}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-(--text-primary) flex-1 truncate">
                {entry.username}
              </span>
              <button
                onClick={() => copyField(entry.username!, t("entryDetail.username"))}
                aria-label={t("entryDetail.copyUsername")}
                className="text-(--text-tertiary) hover:text-(--accent-text) transition-colors text-xs"
              >
                {t("entryDetail.copy")}
              </button>
            </div>
          </div>
        )}

        {/* Password */}
        {entry.password && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.password")}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-(--text-primary) flex-1">
                {showPw ? entry.password : "•".repeat(Math.min(entry.password.length, 20))}
              </span>
              <button
                onClick={togglePw}
                aria-label={showPw ? t("unlock.hidePassword") : t("unlock.showPassword")}
                className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors text-xs"
              >
                {showPw ? t("entryDetail.hideIn", { seconds: secondsLeft }) : t("entryDetail.show")}
              </button>
              <button
                onClick={() => copyField(entry.password!, t("entryDetail.password"))}
                aria-label={t("entryDetail.copyPassword")}
                className="text-(--text-tertiary) hover:text-(--accent-text) transition-colors text-xs"
              >
                {t("entryDetail.copy")}
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.notes")}
            </label>
            <p className="text-sm text-(--text-secondary) mt-1 whitespace-pre-wrap leading-relaxed">
              {entry.notes}
            </p>
          </div>
        )}

        {/* SSH key: public half only; the private key never leaves the vault UI. */}
        {entry.ssh && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
                {t("entry.ssh.publicKey")}
              </label>
              <button
                onClick={() => copyField(entry.ssh!.publicKey, t("entry.ssh.publicKey"))}
                className="text-(--text-tertiary) hover:text-(--accent-text) transition-colors text-xs"
              >
                {t("entryDetail.copy")}
              </button>
            </div>
            <p dir="ltr" className="text-xs font-mono text-(--text-secondary) mt-1 break-all">
              {entry.ssh.publicKey}
            </p>
            <p dir="ltr" className="text-xs font-mono text-(--text-tertiary) mt-1">
              {entry.ssh.fingerprint}
            </p>
          </div>
        )}

        <AttachmentsPanel entry={entry} />

        {/* TOTP badge */}
        {entry.totpSecret && (
          <div className="p-3 bg-(--accent-dim) border border-(--accent)/20 rounded-xl">
            <p className="text-xs font-medium text-(--accent-text) mb-1">
              {t("entryDetail.twoFactorEnabled")}
            </p>
            <p className="text-xs text-(--text-tertiary)">{t("entryDetail.totpHint")}</p>
          </div>
        )}

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.tags")}
            </label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-(--bg-elevated) border border-(--border-subtle) text-(--text-secondary)"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom fields */}
        {entry.customFields?.length > 0 && (
          <div>
            <label className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
              {t("entryDetail.customFields")}
            </label>
            <div className="mt-1.5 flex flex-col gap-2">
              {entry.customFields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 p-2 bg-(--bg-elevated) rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-(--text-tertiary)">{f.label}</p>
                    <p className="text-sm font-mono text-(--text-primary) truncate">
                      {f.type === "password" ? "•••••••" : f.value}
                    </p>
                  </div>
                  <button
                    onClick={() => copyField(f.value, f.label)}
                    className="text-(--text-tertiary) hover:text-(--accent-text) text-xs"
                  >
                    {t("entryDetail.copy")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Version history */}
        {versions.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider hover:text-(--accent-text) transition-colors"
            >
              <span className="inline-block rtl:-scale-x-100">{showHistory ? "▾" : "▸"}</span>{" "}
              {t("entryDetail.previousVersions", { count: versions.length })}
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-col gap-1.5">
                {versions.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 bg-(--bg-elevated) rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-(--text-secondary) truncate">{v.title}</p>
                      <p className="text-[11px] text-(--text-tertiary)">
                        {v.updatedAt
                          ? new Date(v.updatedAt).toLocaleString()
                          : t("entryDetail.earlierVersion")}
                      </p>
                    </div>
                    <button
                      onClick={() => restoreVersion(v)}
                      className="text-(--accent-text) hover:underline text-xs shrink-0"
                    >
                      {t("entryDetail.restore")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="p-4 border-t border-(--border-subtle)">
        <button
          onClick={onDelete}
          className="w-full text-sm text-(--danger) hover:bg-(--danger-dim) py-2 rounded-xl transition-colors"
        >
          {t("entryDetail.delete")}
        </button>
      </div>
    </div>
  );
}
