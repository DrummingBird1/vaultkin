/**
 * @file src/services/clipboard.service.ts
 * Copy-with-auto-clear. 30 seconds after a copy the clipboard is wiped, but
 * only if it still holds what we copied (a later copy of the user's own is
 * left alone).
 *
 * Desktop: the copy goes through the main process, which on Windows keeps it
 * out of Clipboard History (Win+V) and cloud clipboard sync
 * (src/electron/secure-clipboard.ts). Browser build: navigator.clipboard.
 */

const CLEAR_AFTER_MS = 30_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let clearAt = 0;
let lastCopied: string | null = null;

const desktop = () => (typeof window !== "undefined" ? window.electron?.clipboard : undefined);

async function clearIfOurs(): Promise<void> {
  const d = desktop();
  if (d) {
    await d.clearSecret().catch(() => false);
  } else {
    try {
      // Reading may be refused (permission / focus); then clear unconditionally.
      const now = await navigator.clipboard.readText().catch(() => lastCopied);
      if (now === lastCopied) await navigator.clipboard.writeText("");
    } catch {
      /* nothing more we can do */
    }
  }
  lastCopied = null;
}

export const ClipboardService = {
  async copy(value: string, _label?: string): Promise<boolean> {
    try {
      const d = desktop();
      if (d) {
        const r = await d.writeSecret(value);
        if (!r.ok) return false;
      } else {
        await navigator.clipboard.writeText(value);
      }
      lastCopied = value;
      if (clearTimer) clearTimeout(clearTimer);
      clearAt = Date.now() + CLEAR_AFTER_MS;
      clearTimer = setTimeout(() => {
        clearTimer = null;
        clearAt = 0;
        void clearIfOurs();
      }, CLEAR_AFTER_MS);
      return true;
    } catch {
      return false;
    }
  },
  getRemainingSeconds(): number {
    if (!clearAt) return 0;
    return Math.max(0, Math.round((clearAt - Date.now()) / 1000));
  },
  cancelClear(): void {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
      clearAt = 0;
    }
  },
  /** Wipe now (e.g. on lock) if the clipboard still holds our last copy. */
  async clearNow(): Promise<void> {
    this.cancelClear();
    if (lastCopied !== null || desktop()) await clearIfOurs();
  },
};
