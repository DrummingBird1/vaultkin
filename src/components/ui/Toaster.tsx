/**
 * @file Toaster.tsx
 * Toast stack from ui.store. role="status"/aria-live="polite" so new toasts
 * are announced; aria-atomic=false so only the new toast is read, not the
 * whole stack. Errors use role="alert" to interrupt.
 */
import React from "react";
import { useUIStore, type Toast } from "../../store/ui.store";
import { IconClose, IconInfo, IconWarning } from "../icons";
import i18n from "../../i18n";

const TONE: Record<Toast["type"], string> = {
  success: "var(--success)",
  error: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--border-default)",
};

function ToastIcon({ type }: { type: Toast["type"] }) {
  if (type === "success")
    return (
      <span aria-hidden="true" className="text-(--success)">
        ✓
      </span>
    );
  if (type === "error" || type === "warning")
    return <IconWarning aria-hidden="true" className="w-4 h-4" style={{ color: TONE[type] }} />;
  return <IconInfo aria-hidden="true" className="w-4 h-4 text-(--text-tertiary)" />;
}

export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const remove = useUIStore((s) => s.removeToast);

  return (
    <div
      className="fixed bottom-4 end-4 z-300 flex flex-col gap-2 pointer-events-none min-w-[280px] max-w-[min(420px,calc(100vw-2rem))]"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : undefined}
          className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-xs bg-(--bg-elevated) animate-[slideUp_200ms_ease_both]"
          style={{ borderColor: TONE[t.type] }}
        >
          <span className="mt-0.5 shrink-0">
            <ToastIcon type={t.type} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-(--text-primary) truncate">{t.title}</p>
            {t.message && <p className="text-xs text-(--text-tertiary) mt-0.5">{t.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => remove(t.id)}
            aria-label={i18n.t("toast.dismiss")}
            className="text-(--text-tertiary) hover:text-(--text-primary) transition-colors shrink-0"
          >
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
