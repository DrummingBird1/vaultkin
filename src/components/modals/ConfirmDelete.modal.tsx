/**
 * @file ConfirmDelete.modal.tsx
 * Requires typing the entry title to confirm destructive deletion.
 */
import React, { useState, useRef, useEffect } from "react";

interface Props {
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ title, description, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  // Forgiving comparison: trim only. We keep case-sensitivity so the user
  // makes a deliberate confirmation, but avoid the "I added a trailing space
  // and the button mysteriously won't enable" footgun.
  const normalizedTyped = typed.trim();
  const matches = normalizedTyped === title.trim();
  const showHint = typed.length > 0 && !matches;

  return (
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sv-modal max-w-sm" role="alertdialog" aria-modal="true">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-(--danger-dim) flex items-center justify-center text-lg shrink-0">
            🗑️
          </div>
          <div>
            <h2 className="text-base font-semibold text-(--text-primary)">Delete Entry</h2>
            <p className="text-sm text-(--text-tertiary) truncate">"{title}"</p>
          </div>
        </div>
        {description && <p className="text-sm text-(--text-secondary) mb-4">{description}</p>}
        <div className="p-3 bg-(--danger-dim) border border-(--danger)/20 rounded-xl text-sm text-(--danger) mb-5">
          This action cannot be undone. The entry will be permanently deleted.
        </div>
        <div className="mb-5">
          <label className="sv-label">Type the entry title to confirm</label>
          <input
            ref={inputRef}
            className="sv-input w-full"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={title}
            autoComplete="off"
          />
          {showHint && <p className="sv-error">Title doesn't match (case-sensitive).</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="sv-btn-secondary px-5">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches}
            className="sv-btn-danger px-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
