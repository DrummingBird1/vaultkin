/**
 * @file src/hooks/useKeyboardShortcuts.ts
 * Global hotkeys: Ctrl/⌘+K search · +N new · +L lock · +G generator · +, settings.
 */
import { useEffect } from "react";
import { useUIStore } from "../store/ui.store";
import { lockApplication } from "../store";

export function useKeyboardShortcuts(handlers: {
  onNewEntry?: () => void;
  onFocusSearch?: () => void;
} = {}): void {
  const setActivePage = useUIStore(s => s.setActivePage);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) {
        // Standalone keys
        if (e.key === "/" && !isTypingInForm(e.target)) {
          e.preventDefault(); handlers.onFocusSearch?.();
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case "k": e.preventDefault(); handlers.onFocusSearch?.(); break;
        case "n": e.preventDefault(); handlers.onNewEntry?.(); break;
        case "l": e.preventDefault(); lockApplication("manual"); break;
        case "g": e.preventDefault(); setActivePage("generator"); break;
        case ",": e.preventDefault(); setActivePage("settings"); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, setActivePage]);
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}
