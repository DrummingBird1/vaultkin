/**
 * @file src/services/autosave.service.ts
 * Debounced auto-save. Subscribes to vault store; whenever isDirty becomes
 * true, schedules a re-encrypt + storage write 1.5s later. The 1.5s window
 * coalesces rapid edits into a single save.
 */
import { useVaultStore }   from "../store/vault.store";
import { useSessionStore } from "../store/session.store";
import { reEncryptVault, saveVault } from "../core/vault/serializer";
import { IPCService }      from "./ipc.service";

const DEBOUNCE_MS = 1500;
let pending: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

async function flush(): Promise<void> {
  pending = null;
  const vault = useVaultStore.getState().vault;
  const keys  = useSessionStore.getState().sessionKeys;
  if (!vault || !keys) return;
  try {
    const existing = await IPCService.vault.load();
    const payload = existing
      ? await reEncryptVault(vault, keys, existing)
      : await saveVault(vault, keys);
    await IPCService.vault.save(payload);
    useVaultStore.getState().markClean();
  } catch (err) {
    console.error("[autosave] failed:", err);
  }
}

export const AutosaveService = {
  start(): void {
    if (unsubscribe) return;
    unsubscribe = useVaultStore.subscribe((state, prev) => {
      if (state.isDirty && !prev.isDirty) {
        if (pending) clearTimeout(pending);
        pending = setTimeout(flush, DEBOUNCE_MS);
      }
    });
  },
  stop(): void {
    if (pending) { clearTimeout(pending); pending = null; }
    unsubscribe?.();
    unsubscribe = null;
  },
  async flushNow(): Promise<void> {
    if (pending) { clearTimeout(pending); pending = null; }
    await flush();
  },
};
