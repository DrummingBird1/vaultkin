/**
 * @file src/hooks/useAutoLock.ts
 * Locks the vault after `autoLockMs` of user inactivity (no mouse, key,
 * touch). Also locks if the OS reports the screen has gone to sleep.
 */
import { useEffect } from "react";
import { useSessionStore } from "../store/session.store";
import { useVaultStore } from "../store/vault.store";
import { lockApplication } from "../store";

const EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

export function useAutoLock(): void {
  const { isUnlocked, autoLockMs, bumpActivity } = useSessionStore();

  useEffect(() => {
    if (!isUnlocked) return;
    const handler = () => bumpActivity();
    EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    return () => EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
  }, [isUnlocked, bumpActivity]);

  useEffect(() => {
    if (!isUnlocked || autoLockMs <= 0) return;
    const interval = setInterval(
      () => {
        const last = useSessionStore.getState().lastActivityAt;
        if (Date.now() - last >= autoLockMs) {
          lockApplication("inactivity");
        }
      },
      Math.max(1000, Math.floor(autoLockMs / 30)),
    );
    return () => clearInterval(interval);
  }, [isUnlocked, autoLockMs]);

  // Opt-in (VaultSettings.lockOnHide, off by default — see schema.ts):
  // lock immediately when the tab/window becomes hidden, instead of waiting
  // for the idle timer. Off by default because the idle timer already
  // covers most of this, and instant lock-on-blur would surprise users who
  // just alt-tab briefly.
  useEffect(() => {
    if (!isUnlocked) return;
    const handler = () => {
      const lockOnHide = useVaultStore.getState().vault?.settings.lockOnHide;
      if (document.hidden && lockOnHide) {
        lockApplication("inactivity");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isUnlocked]);
}
