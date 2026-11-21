/**
 * @file src/hooks/useQuickCopy.ts
 * One-click copy of password / TOTP / username with toast confirmation.
 */
import { useCallback } from "react";
import { ClipboardService } from "../services/clipboard.service";
import { useUIStore } from "../store/ui.store";
import i18n from "../i18n";

export function useQuickCopy() {
  const { toastSuccess, toastError } = useUIStore();

  return useCallback(
    async (value: string, label: string) => {
      const ok = await ClipboardService.copy(value, label);
      if (ok)
        toastSuccess(
          i18n.t("quickCopy.copied", { label }),
          i18n.t("quickCopy.clearsIn", { seconds: ClipboardService.getRemainingSeconds() }),
        );
      else
        toastError(i18n.t("quickCopy.notCopied", { label }), i18n.t("quickCopy.permissionDenied"));
      return ok;
    },
    [toastSuccess, toastError],
  );
}
