import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { VaultEntry } from "../../../core/vault/schema";
import { EntryCard } from "../EntryCard";
import type { EntryViewProps } from "./types";

const MIN_COLUMN_PX = 220;
const GAP_PX = 12;
const ROW_HEIGHT_PX = 132;

/**
 * Virtualized card grid. Column count follows the container width via a
 * ResizeObserver on a callback ref (the container mounts conditionally, so a
 * mount-only effect could miss it).
 */
export function GridView({ entries, selectedId, query, onSelect, onFavorite }: EntryViewProps) {
  const { t } = useTranslation();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), []);
  const [cols, setCols] = useState(4);

  useEffect(() => {
    if (!el) return;
    const compute = () =>
      setCols(Math.max(1, Math.floor((el.clientWidth + GAP_PX) / (MIN_COLUMN_PX + GAP_PX))));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const virtualizer = useVirtualizer({
    count: Math.ceil(entries.length / cols),
    getScrollElement: () => el,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 4,
  });

  useEffect(() => {
    const idx = entries.findIndex((e) => e.id === selectedId);
    if (idx >= 0) virtualizer.scrollToIndex(Math.floor(idx / cols), { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer instance isn't a stable dep
  }, [selectedId, cols]);

  return (
    <div ref={ref} className="h-full overflow-y-auto" role="list" aria-label={t("vault.entries")}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const rowEntries: VaultEntry[] = entries.slice(row.index * cols, row.index * cols + cols);
          return (
            <div
              key={row.key}
              className="absolute top-0 start-0 w-full grid"
              style={{
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: GAP_PX,
                paddingBottom: GAP_PX,
              }}
            >
              {rowEntries.map((entry) => (
                <div role="listitem" key={entry.id}>
                  <EntryCard
                    entry={entry}
                    selected={entry.id === selectedId}
                    query={query}
                    onClick={() => onSelect(entry.id)}
                    onFavorite={() => onFavorite(entry.id)}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
