/**
 * @file PlaintextExportWarning.modal.tsx
 * CSV export contains every password in plaintext — shown once per export
 * action as a confirm gate, not a one-time dismissible setting, since the
 * consequence (a plaintext file sitting on disk) is the same every time.
 */
import React, { useEffect } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { IconWarning } from "../icons";

export function PlaintextExportWarningModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const containerRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  return (
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={containerRef}
        className="sv-modal max-w-sm"
        role="alertdialog"
        aria-modal="true"
        aria-label="Plaintext export warning"
      >
        <div className="flex items-center gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-(--warning-dim) flex items-center justify-center text-(--warning) shrink-0">
            <IconWarning className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-(--text-primary)">
            Export contains plaintext
          </h2>
        </div>
        <p className="text-sm text-(--text-secondary) mb-5">
          The CSV file will contain every password, TOTP secret, and note{" "}
          <strong>unencrypted</strong>. Anyone with access to the file can read it. Delete it
          securely once you're done, and never upload it anywhere.
        </p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="sv-btn-secondary px-5">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="sv-btn-danger px-5">
            Export Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
