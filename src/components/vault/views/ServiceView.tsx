import { useTranslation } from "react-i18next";
import React, { useEffect } from "react";
import type { ServiceGroup } from "../../../core/vault/grouping";
import { EntryRow } from "../EntryRow";
import { EntryFavicon } from "../EntryFavicon";
import { IconChevronDown, IconChevronRight } from "../../icons";
import type { EntryViewProps } from "./types";

/** Entries grouped by domain, collapsible, not virtualized (groups are small). */
export function ServiceView({
  groups,
  expanded,
  onToggleGroup,
  selectedId,
  query,
  onSelect,
  onFavorite,
}: Omit<EntryViewProps, "entries"> & {
  groups: ServiceGroup[];
  expanded: Set<string>;
  onToggleGroup: (key: string) => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (selectedId)
      document
        .querySelector(`[data-entry-id="${CSS.escape(selectedId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, expanded]);

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-2">
      {groups.map((group) => {
        const open = expanded.has(group.key);
        const panelId = `service-${group.key}`;
        return (
          <div
            key={group.key}
            className="rounded-2xl border border-(--border-default) overflow-hidden"
          >
            <button
              onClick={() => onToggleGroup(group.key)}
              aria-expanded={open}
              aria-controls={panelId}
              className="w-full flex items-center gap-3 px-4 py-3 bg-(--bg-surface) hover:bg-(--bg-elevated) transition-colors text-start"
            >
              {open ? (
                <IconChevronDown className="w-4 h-4 text-(--text-tertiary) shrink-0" />
              ) : (
                <IconChevronRight className="w-4 h-4 text-(--text-tertiary) shrink-0 rtl:-scale-x-100" />
              )}
              <EntryFavicon
                title={group.key}
                url={group.key !== "(no domain)" ? group.key : undefined}
                className="w-6 h-6 rounded-lg bg-(--bg-elevated) text-xs shrink-0"
              />
              <span className="text-sm font-medium text-(--text-primary) flex-1">
                {group.key === "(no domain)" ? t("vault.noDomain") : group.key}
              </span>
              <span className="text-xs text-(--text-tertiary)">
                {t("vault.accounts", { count: group.entries.length })}
              </span>
            </button>
            {open && (
              <div id={panelId} className="flex flex-col gap-1 p-2 bg-(--bg-base)">
                {group.entries.map((entry) => (
                  <div key={entry.id} data-entry-id={entry.id}>
                    <EntryRow
                      entry={entry}
                      selected={entry.id === selectedId}
                      query={query}
                      onClick={() => onSelect(entry.id)}
                      onFavorite={() => onFavorite(entry.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
