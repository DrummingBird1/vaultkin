/**
 * @file src/store/session.store.ts
 * Holds session-scoped state: derivation progress, lock state, session keys.
 * Cleared on lock.
 */
import { create } from "zustand";
import type { SessionKeys } from "../core/vault/vault-types";

interface SessionState {
  isUnlocked: boolean;
  sessionKeys: SessionKeys | null;
  autoLockMs: number;
  isDerivingKey: boolean;
  kdfProgress: number;
  lastActivityAt: number;

  unlock: (keys: SessionKeys, autoLockMs: number) => void;
  lock: () => void;
  setKDFProgress: (p: number) => void;
  setDerivingKey: (b: boolean) => void;
  bumpActivity: () => void;
  setAutoLockMs: (ms: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  isUnlocked: false,
  sessionKeys: null,
  autoLockMs: 5 * 60 * 1000,
  isDerivingKey: false,
  kdfProgress: 0,
  lastActivityAt: Date.now(),

  unlock: (keys, autoLockMs) => set({
    isUnlocked: true,
    sessionKeys: keys,
    autoLockMs,
    kdfProgress: 0,
    isDerivingKey: false,
    lastActivityAt: Date.now(),
  }),
  lock: () => set({
    isUnlocked: false,
    sessionKeys: null,
    kdfProgress: 0,
  }),
  setKDFProgress: (p) => set({ kdfProgress: p, isDerivingKey: p > 0 && p < 1 }),
  setDerivingKey: (b) => set({ isDerivingKey: b }),
  bumpActivity: () => set({ lastActivityAt: Date.now() }),
  setAutoLockMs: (ms) => set({ autoLockMs: ms }),
}));
