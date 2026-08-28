/**
 * @file src/store/index.ts
 * Cross-store actions. The individual stores stay decoupled; orchestration
 * lives here so we don't introduce circular imports.
 */
import { useSessionStore } from "./session.store";
import { useVaultStore }   from "./vault.store";
import { useTOTPStore }    from "./totp.store";
import { useUIStore }      from "./ui.store";
import { BreachService }   from "../services/breach.service";
import type { VaultData }  from "../core/vault/schema";

export type LockReason = "manual" | "inactivity" | "duress";

export function onVaultUnlocked(vault: VaultData): void {
  useVaultStore.getState().setVault(vault);
  useUIStore.getState().setTheme(vault.settings.theme);
  useUIStore.getState().setAccent(vault.settings.accentColor);
  useUIStore.getState().setViewMode(vault.settings.viewMode);
}

export function lockApplication(reason: LockReason = "manual"): void {
  useSessionStore.getState().lock();
  useVaultStore.getState().setVault(null);
  useTOTPStore.getState().clear();
  BreachService.clearCache();
  if (reason === "inactivity") {
    useUIStore.getState().toastInfo("Vault locked", "Due to inactivity.");
  }
}
