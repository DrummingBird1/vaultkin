/**
 * @file src/hooks/useKeyboardShortcuts.ts
 * Global hotkeys: Ctrl/⌘+K search · +N new · +L lock · +G generator · +, settings,
 * and "/" to focus search when not typing.
 *
 * The window listener is registered ONCE and reads the latest handlers from a
 * ref. Re-subscribing on every render broke the shortcuts: a keydown makes
 * the auto-lock activity tracker re-render the tree synchronously, and a
 * listener removed + re-added during that same dispatch is skipped by the
 * browser, so Ctrl+L / Ctrl+K / Ctrl+N silently did nothing.
 */
import { useEffect, useRef } from "react";
import { useUIStore } from "../store/ui.store";
import { lockApplication } from "../store";

export interface ShortcutHandlers {
  onNewEntry?: () => void;
  onFocusSearch?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      // Lock always works; every other shortcut is ignored while a dialog is open.
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lockApplication("manual");
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      if (!mod) {
        if (e.key === "/" && !isTypingInForm(e.target)) {
          e.preventDefault();
          h.onFocusSearch?.();
        }
        return;
      }
      const { setActivePage } = useUIStore.getState();
      switch (e.key.toLowerCase()) {
        case "k":
          e.preventDefault();
          h.onFocusSearch?.();
          break;
        case "n":
          if (!h.onNewEntry) return;
          e.preventDefault();
          h.onNewEntry();
          break;
        case "g":
          e.preventDefault();
          setActivePage("generator");
          break;
        case ",":
          e.preventDefault();
          setActivePage("settings");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}
