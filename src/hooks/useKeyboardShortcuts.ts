/**
 * @file src/hooks/useKeyboardShortcuts.ts
 * App-wide hotkeys, registered once by AppShell:
 *   Ctrl/⌘+K command palette · +N new entry · +L lock · +G generator · +, settings
 * and useSlashToSearch() for the Vault page's "/" → focus search.
 *
 * Listeners are registered ONCE and read the latest handlers from a ref.
 * Re-subscribing on every render broke the shortcuts: a keydown makes the
 * auto-lock activity tracker re-render the tree synchronously, and a listener
 * removed + re-added during that same dispatch is skipped by the browser.
 */
import { useEffect, useRef } from "react";
import { useUIStore } from "../store/ui.store";
import { lockApplication } from "../store";

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      // Lock always works, even with a dialog open.
      if (key === "l") {
        e.preventDefault();
        lockApplication("manual");
        return;
      }
      const ui = useUIStore.getState();
      // Ctrl+K toggles the palette (closes it when it is the open dialog).
      if (key === "k") {
        e.preventDefault();
        if (ui.paletteOpen) ui.setPaletteOpen(false);
        else if (!document.querySelector('[aria-modal="true"]')) ui.setPaletteOpen(true);
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      switch (key) {
        case "n":
          e.preventDefault();
          ui.requestNewEntry();
          break;
        case "g":
          e.preventDefault();
          ui.setActivePage("generator");
          break;
        case ",":
          e.preventDefault();
          ui.setActivePage("settings");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** "/" focuses the search box when not typing and no dialog is open. */
export function useSlashToSearch(focus: () => void): void {
  const ref = useRef(focus);
  ref.current = focus;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingInForm(e.target) || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}
