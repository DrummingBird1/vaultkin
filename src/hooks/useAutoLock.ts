/**
 * @file src/hooks/useAutoLock.ts
 * Locks the vault after `autoLockMs` of user inactivity (no mouse, key,
 * touch). Also locks if the OS reports the screen has gone to sleep.
 */
import { useEffect } from "react";
import { useSessionStore } from "../store/session.store";
import { lockApplication } from "../store";

const EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

export function useAutoLock(): void {
  const { isUnlocked, autoLockMs, bumpActivity } = useSessionStore();

  useEffect(() => {
    if (!isUnlocked) return;
    const handler = () => bumpActivity();
    EVENTS.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    return () => EVENTS.forEach(ev => window.removeEventListener(ev, handler));
  }, [isUnlocked, bumpActivity]);

  useEffect(() => {
    if (!isUnlocked || autoLockMs <= 0) return;
    const interval = setInterval(() => {
      const last = useSessionStore.getState().lastActivityAt;
      if (Date.now() - last >= autoLockMs) {
        lockApplication("inactivity");
      }
    }, Math.max(1000, Math.floor(autoLockMs / 30)));
    return () => clearInterval(interval);
  }, [isUnlocked, autoLockMs]);
}
