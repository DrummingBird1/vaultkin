import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EntryRow } from "../EntryRow";
import { useDragReorder } from "../../../hooks/useDragReorder";
import type { EntryViewProps } from "./types";

const ROW_HEIGHT_PX = 60;

/** Virtualized list with drag-to-reorder (disabled while a search is active). */
export function ListView({
  entries,
  selectedId,
  query,
  onSelect,
  onFavorite,
  onReorder,
}: EntryViewProps & { onReorder: (fromId: string, toId: string) => void }) {
  const { t } = useTranslation();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), []);
  const drag = useDragReorder({ disabled: !!query, onReorder });

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => el,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8,
  });

  useEffect(() => {
    const idx = entries.findIndex((e) => e.id === selectedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer instance isn't a stable dep
  }, [selectedId]);

  return (
    <div ref={ref} className="h-full overflow-y-auto" role="list" aria-label={t("vault.entries")}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const entry = entries[row.index];
          return (
            <div
              key={row.key}
              role="listitem"
              draggable={!query}
              onDragStart={drag.onDragStart(entry.id)}
              onDragOver={drag.onDragOver(entry.id)}
              onDrop={drag.onDrop(entry.id)}
              onDragEnd={drag.onDragEnd}
              className="absolute top-0 start-0 w-full pb-1"
              style={{
                transform: `translateY(${row.start}px)`,
                opacity: drag.overId === entry.id ? 0.5 : 1,
              }}
            >
              <EntryRow
                entry={entry}
                selected={entry.id === selectedId}
                query={query}
                onClick={() => onSelect(entry.id)}
                onFavorite={() => onFavorite(entry.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
