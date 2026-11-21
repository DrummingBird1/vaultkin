/**
 * @file src/store/index.ts
 * Cross-store actions. The individual stores stay decoupled; orchestration
 * lives here so we don't introduce circular imports.
 */
import { useSessionStore } from "./session.store";
import { useVaultStore } from "./vault.store";
import { useTOTPStore } from "./totp.store";
import { useUIStore } from "./ui.store";
import { BreachService } from "../services/breach.service";
import { AutosaveService } from "../services/autosave.service";
import type { VaultData } from "../core/vault/schema";
import i18n from "../i18n";

export type LockReason = "manual" | "inactivity" | "duress";

export function onVaultUnlocked(vault: VaultData): void {
  useVaultStore.getState().setVault(vault);
  useUIStore.getState().setTheme(vault.settings.theme);
  useUIStore.getState().setAccent(vault.settings.accentColor);
  useUIStore.getState().setViewMode(vault.settings.viewMode);
}

export function lockApplication(reason: LockReason = "manual"): void {
  // Flush a pending debounced autosave BEFORE wiping vault state below.
  // Previously this order was reversed in effect: AppLifecycle.onLock() (a
  // separate reactive effect watching isUnlocked) calls
  // AutosaveService.flushNow(), but by the time it ran, setVault(null) below
  // had already cleared the very vault flush() needs to build the save
  // payload from — flush() would see vault===null and silently no-op.
  // Net effect: locking within the AUTOSAVE_DEBOUNCE_MS window after an edit
  // discarded that edit without any error, caught only by an E2E test
  // exercising a real add→lock→unlock cycle end-to-end.
  //
  // Fire-and-forget (not awaited) is deliberate and still race-free:
  // flushNow() → flush() is an async function that reads
  // useVaultStore.getState().vault synchronously before its first `await`,
  // and JS runs an async function's body synchronously up to that point —
  // so by the time this call returns control here, flush() has already
  // captured the correct (pre-wipe) vault/keys into its own local
  // variables. The rest of the save then completes in the background using
  // that closure, unaffected by setVault(null) a few lines below. This
  // keeps lockApplication() synchronous so every call site (keyboard
  // shortcut, sidebar button, inactivity timer) still locks the UI
  // immediately, without needing to await a promise everywhere.
  if (useVaultStore.getState().isDirty) {
    AutosaveService.flushNow().catch(() => {});
  }
  useSessionStore.getState().lock();
  useVaultStore.getState().setVault(null);
  useTOTPStore.getState().clear();
  BreachService.clearCache();
  if (reason === "inactivity") {
    useUIStore.getState().toastInfo(i18n.t("lock.lockedTitle"), i18n.t("lock.inactivityBody"));
  }
}
