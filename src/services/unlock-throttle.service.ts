/**
 * @file src/services/unlock-throttle.service.ts
 * Exponential-backoff throttle on failed unlock attempts — slows down an
 * offline/local brute-force loop against the UI (the real defense against
 * an *offline* attack on a stolen vault file is the KDF cost itself; this
 * throttle is about the in-app attempt loop, e.g. someone with temporary
 * access to an unlocked device trying passwords by hand or via a script
 * driving the UI).
 *
 * State persists in localStorage (not just in-memory) so a page refresh
 * doesn't reset the attempt counter — that would defeat the point.
 */
import {
  UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY,
  UNLOCK_BACKOFF_BASE_MS,
  UNLOCK_BACKOFF_MAX_MS,
} from "../constants";

const STORAGE_KEY = "sv_unlock_throttle";

export interface LockStatus {
  locked: boolean;
  remainingMs: number;
}

interface ThrottleState {
  failureCount: number;
  lockedUntil: number; // epoch ms; 0 = not locked
}

function readState(): ThrottleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { failureCount: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failureCount: typeof parsed.failureCount === "number" ? parsed.failureCount : 0,
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0,
    };
  } catch {
    return { failureCount: 0, lockedUntil: 0 };
  }
}

function writeState(state: ThrottleState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort — throttle just won't survive a refresh if storage is unavailable
  }
}

function statusFromState(state: ThrottleState): LockStatus {
  const remainingMs = Math.max(0, state.lockedUntil - Date.now());
  return { locked: remainingMs > 0, remainingMs };
}

export const UnlockThrottleService = {
  getStatus(): LockStatus {
    return statusFromState(readState());
  },

  /** Call on every failed unlock attempt. Returns the resulting lock status. */
  recordFailure(): LockStatus {
    const state = readState();
    // Still within an existing lockout — don't compound it further.
    if (state.lockedUntil > Date.now()) return statusFromState(state);

    const failureCount = state.failureCount + 1;
    let lockedUntil = 0;
    if (failureCount > UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY) {
      const extraAttempts = failureCount - UNLOCK_MAX_ATTEMPTS_BEFORE_DELAY;
      const delayMs = Math.min(
        UNLOCK_BACKOFF_BASE_MS * 2 ** (extraAttempts - 1),
        UNLOCK_BACKOFF_MAX_MS,
      );
      lockedUntil = Date.now() + delayMs;
    }
    const next = { failureCount, lockedUntil };
    writeState(next);
    return statusFromState(next);
  },

  /** Call on a successful unlock — resets the counter entirely. */
  recordSuccess(): void {
    writeState({ failureCount: 0, lockedUntil: 0 });
  },
};
