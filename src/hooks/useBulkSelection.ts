/**
 * @file src/hooks/useBulkSelection.ts
 * Multi-select state for batch operations.
 */
import { useCallback, useState } from "react";

export function useBulkSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const all = useCallback((ids: string[]) => setSelected(new Set(ids)), []);
  const has = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, count: selected.size, toggle, clear, all, has };
}
