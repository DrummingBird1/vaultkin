/**
 * @file src/components/vault/EntryRow.tsx
 * List-view entry row.
 */
import React from "react";
import { IconStar } from "../icons";
import { Highlight } from "./Highlight";
import { EntryFavicon } from "./EntryFavicon";
import type { EntryItemProps } from "./EntryItem.types";

export const EntryRow = React.memo(function EntryRow({
  entry,
  selected,
  query,
  onClick,
  onFavorite,
}: EntryItemProps) {
  return (
    <div
      onClick={onClick}
      data-entry-id={entry.id}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
        selected
          ? "bg-[var(--accent-dim)] border border-[var(--accent)]"
          : "bg-[var(--bg-surface)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
      }`}
    >
      <EntryFavicon
        title={entry.title}
        url={entry.url}
        className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          <Highlight text={entry.title} query={query} />
        </p>
        <p className="text-xs text-[var(--text-tertiary)] truncate">
          <Highlight text={entry.username || ""} query={query} />
        </p>
      </div>
      {entry.totpSecret && (
        <span className="text-[10px] bg-[var(--accent-dim)] text-[var(--accent)] px-1.5 py-0.5 rounded-full border border-[var(--accent)]/20">
          2FA
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFavorite();
        }}
        aria-label={entry.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={entry.favorite}
        className={
          entry.favorite ? "text-amber-400" : "text-[var(--text-tertiary)] hover:text-amber-400"
        }
      >
        <IconStar className="w-3.5 h-3.5" fill={entry.favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
});
