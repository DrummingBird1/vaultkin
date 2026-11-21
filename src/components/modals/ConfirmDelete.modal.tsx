/**
 * @file ConfirmDelete.modal.tsx
 * Requires typing the entry title to confirm destructive deletion.
 */
import { useTranslation } from "react-i18next";
import React, { useState, useRef, useEffect } from "react";
import { Modal } from "../ui/Modal";

interface Props {
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ title, description, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Forgiving comparison: trim only. We keep case-sensitivity so the user
  // makes a deliberate confirmation, but avoid the "I added a trailing space
  // and the button mysteriously won't enable" footgun.
  const normalizedTyped = typed.trim();
  const matches = normalizedTyped === title.trim();
  const showHint = typed.length > 0 && !matches;

  return (
    <Modal
      onClose={onCancel}
      className="max-w-sm"
      role="alertdialog"
      label={t("confirmDelete.label")}
    >
      <div className="flex items-center gap-4 mb-5">
        <div className="w-10 h-10 rounded-xl bg-(--danger-dim) flex items-center justify-center text-lg shrink-0">
          🗑️
        </div>
        <div>
          <h2 className="text-base font-semibold text-(--text-primary)">
            {t("confirmDelete.title")}
          </h2>
          <p className="text-sm text-(--text-tertiary) truncate">"{title}"</p>
        </div>
      </div>
      {description && <p className="text-sm text-(--text-secondary) mb-4">{description}</p>}
      <div className="p-3 bg-(--danger-dim) border border-(--danger)/20 rounded-xl text-sm text-(--danger) mb-5">
        {t("confirmDelete.irreversible")}
      </div>
      <div className="mb-5">
        <label className="sv-label" htmlFor="confirm-delete-title">
          {t("confirmDelete.typeTitle")}
        </label>
        <input
          id="confirm-delete-title"
          ref={inputRef}
          className="sv-input w-full"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={title}
          autoComplete="off"
        />
        {showHint && <p className="sv-error">{t("confirmDelete.mismatch")}</p>}
      </div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="sv-btn-secondary px-5">
          {t("confirmDelete.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!matches}
          className="sv-btn-danger px-5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("confirmDelete.confirm")}
        </button>
      </div>
    </Modal>
  );
}
