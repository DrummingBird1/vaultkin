/**
 * @file BackupPicker.modal.tsx
 * Picks an encrypted backup: a .svault file (Recovery Kit, sync copy) or the
 * text of scanned QR backup codes. It only checks that the payload is a vault;
 * the caller asks for its password and decides what to do with it.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { payloadSalt } from "../../core/vault/serializer";
import { IncompleteBackupError, joinBackup } from "../../services/backup-text";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

const MAX_BYTES = 50 * 1024 * 1024;

interface Props {
  onPicked: (payload: string) => void;
  onCancel: () => void;
}

export function BackupPickerModal({ onPicked, onCancel }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (file && file.size > MAX_BYTES) return setError(t("importVault.tooLargeBody"));
    setBusy(true);
    try {
      const payload = joinBackup(file ? await file.text() : text);
      payloadSalt(payload); // throws VaultCorruptError when this isn't a vault
      onPicked(payload);
    } catch (err) {
      setError(
        err instanceof IncompleteBackupError
          ? err.missing.length
            ? t("restoreBackup.missing", { parts: err.missing.slice(0, 20).join(", ") })
            : t("restoreBackup.mixed")
          : t("restoreBackup.invalid"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onCancel} label={t("restoreBackup.title")} onSubmit={submit}>
      <h2 className="sv-modal-title mb-1">{t("restoreBackup.title")}</h2>
      <p className="sv-modal-subtitle mb-4">{t("restoreBackup.description")}</p>
      <label className="sv-label" htmlFor="backup-file">
        {t("restoreBackup.file")}
      </label>
      <input
        id="backup-file"
        type="file"
        className="mb-4 w-full text-sm"
        accept=".svault,.txt,application/json"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <label className="sv-label" htmlFor="backup-text">
        {t("restoreBackup.text")}
      </label>
      <textarea
        id="backup-text"
        dir="ltr"
        rows={4}
        spellCheck={false}
        autoComplete="off"
        disabled={!!file}
        className="sv-input w-full font-mono text-xs"
        placeholder="SVQR:1/3:…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p className="sv-error mt-2" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3 justify-end mt-4">
        <Button onClick={onCancel}>{t("remoteUnlock.cancel")}</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!file && !text.trim()}>
          {t("remoteUnlock.continue")}
        </Button>
      </div>
    </Modal>
  );
}
