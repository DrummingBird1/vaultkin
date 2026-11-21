/**
 * @file useArrowNavigation.ts
 * ArrowUp/ArrowDown walk `order` and select the next/previous entry.
 * Ignored while typing in a field or while any modal is open (previously the
 * selection moved behind an open dialog).
 */
import { useEffect, useRef } from "react";
import type { VaultEntry } from "../core/vault/schema";

export function useArrowNavigation(
  order: VaultEntry[],
  selectedId: string | null,
  select: (entry: VaultEntry) => void,
) {
  const state = useRef({ order, selectedId, select });
  state.current = { order, selectedId, select };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const a = document.activeElement;
      if (
        a instanceof HTMLInputElement ||
        a instanceof HTMLTextAreaElement ||
        a instanceof HTMLSelectElement ||
        (a instanceof HTMLElement && a.isContentEditable) ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      const { order, selectedId, select } = state.current;
      if (order.length === 0) return;
      e.preventDefault();
      const i = order.findIndex((en) => en.id === selectedId);
      const next = e.key === "ArrowDown" ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
      if (order[next]) select(order[next]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
