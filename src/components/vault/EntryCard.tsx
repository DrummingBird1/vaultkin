/**
 * @file src/components/vault/EntryCard.tsx
 * Grid-view entry tile.
 */
import React from "react";
import { IconStar } from "../icons";
import { Highlight } from "./Highlight";
import { EntryFavicon } from "./EntryFavicon";
import type { EntryItemProps } from "./EntryItem.types";

export const EntryCard = React.memo(function EntryCard({
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
      className={`relative group flex flex-col gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-150 ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
      }`}
    >
      <div className="flex items-start justify-between">
        <EntryFavicon
          title={entry.title}
          url={entry.url}
          className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-base"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
          aria-label={entry.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={entry.favorite}
          className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all ${entry.favorite ? "opacity-100 text-amber-400" : "text-[var(--text-tertiary)] hover:text-amber-400"}`}
        >
          <IconStar className="w-4 h-4" fill={entry.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          <Highlight text={entry.title} query={query} />
        </p>
        <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
          <Highlight text={entry.username || entry.url || entry.category} query={query} />
        </p>
      </div>
      {entry.totpSecret && (
        <span className="self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20">
          2FA
        </span>
      )}
    </div>
  );
});
