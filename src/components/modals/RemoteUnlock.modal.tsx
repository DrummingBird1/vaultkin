/**
 * @file RemoteUnlock.modal.tsx
 * Asks for the master password of a vault pulled from WebDAV so it can be
 * decrypted locally and diffed against the open vault (ConflictResolutionModal).
 * The remote copy may use a different salt/KDF, so the current session keys
 * can't open it — the password is needed. It is only passed to openVault()
 * and never stored.
 */
import React, { useState } from "react";
import { openVault } from "../../core/vault/serializer";
import { WrongPasswordError } from "../../core/errors";
import type { VaultData } from "../../core/vault/schema";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

interface Props {
  payload: string;
  onOpened: (remote: VaultData) => void;
  onCancel: () => void;
}

export function RemoteUnlockModal({ payload, onOpened, onCancel }: Props) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { vault } = await openVault(payload, pw);
      setPw("");
      onOpened(vault);
    } catch (ex: unknown) {
      setErr(
        ex instanceof WrongPasswordError
          ? "Wrong password for the remote vault."
          : "Remote vault could not be opened.",
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
        Unlock remote vault
      </h2>
      <p className="sv-modal-subtitle mb-4">
        Enter the master password of the WebDAV copy. Usually it is the same as this vault's.
      </p>
      <Field label="Remote master password" error={err}>
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
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy} busyLabel="Decrypting…" disabled={!pw}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}

export default RemoteUnlockModal;
