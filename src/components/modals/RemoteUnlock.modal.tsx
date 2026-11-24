/**
 * @file RemoteUnlock.modal.tsx
 * Asks for the password of a vault pulled from WebDAV or picked from a backup
 * so it can be decrypted locally and diffed against the open vault (ConflictResolutionModal).
 * The remote copy may use a different salt/KDF, so the current session keys
 * can't open it — the password is needed. It is only passed to openVault()
 * and never stored.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { openVault, type OpenVaultResult } from "../../core/vault/serializer";
import { WrongPasswordError } from "../../core/errors";
import type { VaultData } from "../../core/vault/schema";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

interface Props {
  payload: string;
  onOpened: (remote: VaultData, opened: OpenVaultResult) => void | Promise<void>;
  onCancel: () => void;
}

export function RemoteUnlockModal({ payload, onOpened, onCancel }: Props) {
  const { t } = useTranslation();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const opened = await openVault(payload, pw);
      setPw("");
      await onOpened(opened.vault, opened);
    } catch (ex: unknown) {
      setErr(
        ex instanceof WrongPasswordError
          ? t("remoteUnlock.wrongPassword")
          : t("remoteUnlock.openFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onCancel}
      dismissable={!busy}
      labelledBy="remote-unlock-title"
      onSubmit={submit}
    >
      <h2 id="remote-unlock-title" className="sv-modal-title mb-1">
        {t("remoteUnlock.title")}
      </h2>
      <p className="sv-modal-subtitle mb-4">{t("remoteUnlock.description")}</p>
      <Field label={t("remoteUnlock.passwordLabel")} error={err}>
        {(p) => (
          <input
            {...p}
            type="password"
            className="sv-input w-full mb-2"
            autoFocus
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        )}
      </Field>
      <div className="flex gap-3 justify-end mt-4">
        <Button onClick={onCancel} disabled={busy}>
          {t("remoteUnlock.cancel")}
        </Button>
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          busyLabel={t("remoteUnlock.decrypting")}
          disabled={!pw}
        >
          {t("remoteUnlock.continue")}
        </Button>
      </div>
    </Modal>
  );
}

export default RemoteUnlockModal;
