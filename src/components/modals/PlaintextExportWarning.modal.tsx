/**
 * @file PlaintextExportWarning.modal.tsx
 * CSV export contains every password in plaintext — shown once per export
 * action as a confirm gate, not a one-time dismissible setting, since the
 * consequence (a plaintext file sitting on disk) is the same every time.
 */
import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { IconWarning } from "../icons";
import { Modal } from "../ui/Modal";

export function PlaintextExportWarningModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onCancel}
      className="max-w-sm"
      role="alertdialog"
      label={t("plaintextExport.label")}
    >
      <div className="flex items-center gap-4 mb-5">
        <div className="w-10 h-10 rounded-xl bg-(--warning-dim) flex items-center justify-center text-(--warning) shrink-0">
          <IconWarning className="w-5 h-5" />
        </div>
        <h2 className="text-base font-semibold text-(--text-primary)">
          {t("plaintextExport.title")}
        </h2>
      </div>
      <p className="text-sm text-(--text-secondary) mb-5">
        <Trans i18nKey="plaintextExport.body" components={{ strong: <strong /> }} />
      </p>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="sv-btn-secondary px-5">
          {t("plaintextExport.cancel")}
        </button>
        <button type="button" onClick={onConfirm} className="sv-btn-danger px-5">
          {t("plaintextExport.confirm")}
        </button>
      </div>
    </Modal>
  );
}
