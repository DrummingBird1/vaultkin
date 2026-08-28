/**
 * @file src/services/app-lifecycle.service.ts
 * Orchestrates start-of-session (after unlock) and end-of-session (lock) work.
 * Adding a new in-memory cache that holds plaintext-derived data? Wire its
 * clear-on-lock here (see invariant #4 in CLAUDE.md).
 */
import type { VaultData } from "../core/vault/schema";
import type { SessionKeys } from "../core/vault/vault-types";
import { AutosaveService } from "./autosave.service";
import { ClipboardService } from "./clipboard.service";
import { BreachService }    from "./breach.service";
import { HistoryService }   from "./history.service";
import { useSessionStore }  from "../store/session.store";

export const AppLifecycle = {
  async onUnlock(_vault: VaultData, _keys: SessionKeys, autoLockMs: number): Promise<void> {
    useSessionStore.getState().setAutoLockMs(autoLockMs);
    useSessionStore.getState().bumpActivity();
    AutosaveService.start();
  },
  async onLock(): Promise<void> {
    try { await AutosaveService.flushNow(); } catch { /* best effort */ }
    AutosaveService.stop();
    ClipboardService.cancelClear();
    BreachService.clearCache();
    HistoryService.clear();
  },
};
