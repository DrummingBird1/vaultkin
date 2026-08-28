/**
 * @file src/services/clipboard.service.ts
 * Copy-with-auto-clear. Writes to navigator.clipboard, then 30 seconds later
 * overwrites with empty string to reduce shoulder-surfing window.
 */

const CLEAR_AFTER_MS = 30_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let clearAt = 0;

export const ClipboardService = {
  async copy(value: string, _label?: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      if (clearTimer) clearTimeout(clearTimer);
      clearAt = Date.now() + CLEAR_AFTER_MS;
      clearTimer = setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {});
        clearTimer = null; clearAt = 0;
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
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; clearAt = 0; }
  },
};
