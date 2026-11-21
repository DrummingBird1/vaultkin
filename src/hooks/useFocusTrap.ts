/**
 * @file src/hooks/useFocusTrap.ts
 * Traps Tab/Shift+Tab focus cycling inside a modal while it's open, and
 * restores focus to whatever triggered it on close. Used by <Modal>
 * (src/components/ui/Modal.tsx), which every modal renders.
 */
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusFirst = () => {
      // Respect a child that already took focus (autoFocus / its own effect).
      if (container && container.contains(document.activeElement)) return;
      const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable?.[0] ?? container)?.focus();
    };
    // Defer to next tick — the modal's own children may not be mounted yet
    // in the same synchronous pass this effect runs in.
    const raf = requestAnimationFrame(focusFirst);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") return; // let the modal's own Escape handler close it
      if (e.key !== "Tab" || !container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      } else if (!container.contains(current)) {
        // Focus escaped the container somehow (e.g. programmatic blur) — pull it back in.
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [active]);

  return containerRef;
}
