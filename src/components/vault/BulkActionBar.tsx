/**
 * @file src/components/vault/BulkActionBar.tsx
 * Floating action bar shown when one or more entries are multi-selected
 * (see useBulkSelection). Delete is the only bulk action for now — bulk
 * move-to-folder/tag-add would be natural follow-ups but aren't wired yet.
 */
import React from "react";
import { IconTrash, IconClose } from "../icons";

export function BulkActionBar({
  count,
  onDelete,
  onClear,
}: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 px-4 py-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-2xl"
      style={{ animation: "slideUp 150ms ease both" }}
    >
      <span className="text-sm font-medium text-[var(--text-primary)]">{count} selected</span>
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger-dim)] px-3 py-1.5 rounded-xl transition-colors"
      >
        <IconTrash className="w-4 h-4" /> Delete
      </button>
      <button
        onClick={onClear}
        aria-label="Clear selection"
        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg transition-colors"
      >
        <IconClose className="w-4 h-4" />
      </button>
    </div>
  );
}
