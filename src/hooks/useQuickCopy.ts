/**
 * @file src/hooks/useQuickCopy.ts
 * One-click copy of password / TOTP / username with toast confirmation.
 */
import { useCallback } from "react";
import { ClipboardService } from "../services/clipboard.service";
import { useUIStore } from "../store/ui.store";

export function useQuickCopy() {
  const { toastSuccess, toastError } = useUIStore();

  return useCallback(
    async (value: string, label: string) => {
      const ok = await ClipboardService.copy(value, label);
      if (ok)
        toastSuccess(`${label} copied`, `Clears in ${ClipboardService.getRemainingSeconds()}s`);
      else toastError(`${label} not copied`, "Clipboard permission denied.");
      return ok;
    },
    [toastSuccess, toastError],
  );
}
