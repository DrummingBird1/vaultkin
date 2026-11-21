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
import { BreachService } from "./breach.service";
import { HistoryService } from "./history.service";
import { ExtensionBridge } from "./extension-bridge.service";
import { BridgeService } from "./bridge.service";
import { useSessionStore } from "../store/session.store";
import { EXTENSION_ID_STORAGE_KEY } from "../constants";

export const AppLifecycle = {
  async onUnlock(_vault: VaultData, _keys: SessionKeys, autoLockMs: number): Promise<void> {
    useSessionStore.getState().setAutoLockMs(autoLockMs);
    useSessionStore.getState().bumpActivity();
    AutosaveService.start();
  },
  async onLock(): Promise<void> {
    try {
      await AutosaveService.flushNow();
    } catch {
      /* best effort */
    }
    AutosaveService.stop();
    ClipboardService.cancelClear();
    BreachService.clearCache();
    HistoryService.clear();
    // Native-messaging bridge: close every extension session (ADR 0007).
    BridgeService.onLock();
    // Tell the paired browser extension to drop its cached entries too —
    // otherwise a locked main vault would leave plaintext credentials
    // reachable in the extension for up to its own 5-minute idle timeout.
    // No-ops if no extension is paired or we're not in a Chromium tab.
    const extId = localStorage.getItem(EXTENSION_ID_STORAGE_KEY);
    if (extId) ExtensionBridge.lock(extId);
  },
};
