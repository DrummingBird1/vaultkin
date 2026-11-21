/**
 * @file src/components/vault/EntryCard.tsx
 * Grid-view entry tile.
 */
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <div
      onClick={onClick}
      data-entry-id={entry.id}
      className={`relative group flex flex-col gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-150 ${
        selected
          ? "border-(--accent) bg-(--accent-dim)"
          : "border-(--border-default) bg-(--bg-surface) hover:border-(--border-strong) hover:bg-(--bg-elevated)"
      }`}
    >
      <div className="flex items-start justify-between">
        <EntryFavicon
          title={entry.title}
          url={entry.url}
          className="w-10 h-10 rounded-xl bg-(--bg-elevated) border border-(--border-subtle) text-base"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
          aria-label={entry.favorite ? t("entry.favoriteRemove") : t("entry.favoriteAdd")}
          aria-pressed={entry.favorite}
          className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all ${entry.favorite ? "opacity-100 text-amber-400" : "text-(--text-tertiary) hover:text-amber-400"}`}
        >
          <IconStar className="w-4 h-4" fill={entry.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-(--text-primary) truncate">
          <Highlight text={entry.title} query={query} />
        </p>
        <p className="text-xs text-(--text-tertiary) truncate mt-0.5">
          <Highlight text={entry.username || entry.url || entry.category} query={query} />
        </p>
      </div>
      {entry.totpSecret && (
        <span className="self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--accent-dim) text-(--accent) border border-(--accent)/20">
          {t("entryCard.twoFactor")}
        </span>
      )}
    </div>
  );
});
