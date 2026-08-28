/**
 * @file src/components/vault/EntryDetail.tsx
 * Right-hand detail panel for the selected entry.
 */
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
    toastSuccess("Version restored", "Reverted to the selected previous version.");
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
    if (ok) toastSuccess(`${label} copied`, `Clears in ${ClipboardService.getRemainingSeconds()}s`);
  };

  return (
    <div
      className="w-80 flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col"
      style={{ animation: "slideUp 200ms ease both" }}
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3 min-w-0">
          <EntryFavicon
            title={entry.title}
            url={entry.url}
            className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] text-sm flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {entry.title}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{entry.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            aria-label="Edit entry"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors text-xs"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            aria-label="Close entry details"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* URL */}
        {entry.url && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              URL
            </label>
            <div className="flex items-center gap-2 mt-1">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--accent)] hover:underline truncate flex-1"
              >
                {entry.url}
              </a>
              <button
                onClick={() => copyField(entry.url!, "URL")}
                aria-label="Copy URL"
                className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Username */}
        {entry.username && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Username
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-[var(--text-primary)] flex-1 truncate">
                {entry.username}
              </span>
              <button
                onClick={() => copyField(entry.username!, "Username")}
                aria-label="Copy username"
                className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Password */}
        {entry.password && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Password
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-[var(--text-primary)] flex-1">
                {showPw ? entry.password : "•".repeat(Math.min(entry.password.length, 20))}
              </span>
              <button
                onClick={togglePw}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors text-xs"
              >
                {showPw ? `Hide (${secondsLeft}s)` : "Show"}
              </button>
              <button
                onClick={() => copyField(entry.password!, "Password")}
                aria-label="Copy password"
                className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Notes
            </label>
            <p className="text-sm text-[var(--text-secondary)] mt-1 whitespace-pre-wrap leading-relaxed">
              {entry.notes}
            </p>
          </div>
        )}

        {/* TOTP badge */}
        {entry.totpSecret && (
          <div className="p-3 bg-[var(--accent-dim)] border border-[var(--accent)]/20 rounded-xl">
            <p className="text-xs font-medium text-[var(--accent)] mb-1">2FA Enabled</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              TOTP code available in Authenticator tab
            </p>
          </div>
        )}

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
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
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Custom Fields
            </label>
            <div className="mt-1.5 flex flex-col gap-2">
              {entry.customFields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 p-2 bg-[var(--bg-elevated)] rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-tertiary)]">{f.label}</p>
                    <p className="text-sm font-mono text-[var(--text-primary)] truncate">
                      {f.type === "password" ? "•••••••" : f.value}
                    </p>
                  </div>
                  <button
                    onClick={() => copyField(f.value, f.label)}
                    className="text-[var(--text-tertiary)] hover:text-[var(--accent)] text-xs"
                  >
                    Copy
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
              className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider hover:text-[var(--accent)] transition-colors"
            >
              {showHistory ? "▾" : "▸"} Previous versions ({versions.length})
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-col gap-1.5">
                {versions.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 bg-[var(--bg-elevated)] rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-secondary)] truncate">{v.title}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {v.updatedAt ? new Date(v.updatedAt).toLocaleString() : "earlier version"}
                      </p>
                    </div>
                    <button
                      onClick={() => restoreVersion(v)}
                      className="text-[var(--accent)] hover:underline text-xs flex-shrink-0"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <button
          onClick={onDelete}
          className="w-full text-sm text-[var(--danger)] hover:bg-[var(--danger-dim)] py-2 rounded-xl transition-colors"
        >
          Delete Entry
        </button>
      </div>
    </div>
  );
}
