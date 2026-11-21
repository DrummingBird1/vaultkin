/**
 * @file src/components/vault/BulkActionBar.tsx
 * Floating action bar shown when one or more entries are multi-selected
 * (see useBulkSelection). Delete is the only bulk action for now — bulk
 * move-to-folder/tag-add would be natural follow-ups but aren't wired yet.
 */
import React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div
      className="fixed bottom-6 start-1/2 -translate-x-1/2 z-150 flex items-center gap-3 px-4 py-3 rounded-2xl border border-(--border-default) bg-(--bg-elevated) shadow-2xl"
      style={{ animation: "slideUp 150ms ease both" }}
    >
      <span className="text-sm font-medium text-(--text-primary)">
        {t("bulk.selected", { count })}
      </span>
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 text-sm text-(--danger) hover:bg-(--danger-dim) px-3 py-1.5 rounded-xl transition-colors"
      >
        <IconTrash className="w-4 h-4" /> {t("bulk.delete")}
      </button>
      <button
        onClick={onClear}
        aria-label={t("bulk.clear")}
        className="text-(--text-tertiary) hover:text-(--text-primary) p-1.5 rounded-lg transition-colors"
      >
        <IconClose className="w-4 h-4" />
      </button>
    </div>
  );
}
