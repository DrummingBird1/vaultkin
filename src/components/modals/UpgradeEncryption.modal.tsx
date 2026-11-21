/**
 * @file UpgradeEncryption.modal.tsx
 * Re-encrypts a legacy PBKDF2-SHA256 vault to Argon2id using the SAME
 * password the user already knows — verify-then-rekey, same shape as
 * ChangePasswordModal but with newPassword === currentPassword.
 * changeMasterPassword() always derives with DEFAULT_KDF (Argon2id), so
 * calling it with the unchanged password is enough. See
 * docs/adr/0001-argon2id-kdf.md for why this migration is explicit/manual
 * rather than automatic on next unlock.
 */
import React, { useState, useCallback } from "react";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { openVault, changeMasterPassword } from "../../core/vault/serializer";
import { WrongPasswordError } from "../../core/errors";
import { IPCService } from "../../services/ipc.service";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { IconClose, IconShield } from "../icons";

export function UpgradeEncryptionModal({ onClose }: { onClose: () => void }) {
  const containerRef = useFocusTrap<HTMLDivElement>(true);
  const { unlock, autoLockMs } = useSessionStore();
  const { vault } = useVaultStore();
  const { toastSuccess } = useUIStore();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  const handleUpgrade = useCallback(async () => {
    if (!password) {
      setError("Enter your master password to confirm.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const stored = await IPCService.vault.load();
      if (!stored) throw new Error("No vault found.");
      await openVault(stored, password); // verify — also confirms it's really the current password
      if (!vault) throw new Error("Vault not loaded.");
      const { encryptedPayload, sessionKeys: newKeys } = await changeMasterPassword(
        vault,
        password,
      );
      await IPCService.vault.save(encryptedPayload);
      unlock(newKeys, autoLockMs);
      setDone(true);
      toastSuccess("Encryption upgraded", "Vault now uses Argon2id.");
    } catch (err: unknown) {
      setError(
        err instanceof WrongPasswordError
          ? "Incorrect master password."
          : "Upgrade failed. Please try again.",
      );
    } finally {
      setWorking(false);
    }
  }, [password, vault, unlock, autoLockMs, toastSuccess]);

  return (
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={containerRef}
        className="sv-modal max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade encryption"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="sv-modal-title flex items-center gap-2">
            <IconShield className="w-5 h-5" /> Upgrade Encryption
          </h2>
          <button onClick={onClose} aria-label="Close" className="sv-icon-btn">
            <IconClose />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center text-center py-6 gap-4">
            <p className="text-sm text-(--text-secondary)">
              Your vault now uses Argon2id — the modern, memory-hard key derivation function.
            </p>
            <button onClick={onClose} className="sv-btn-primary px-8">
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-(--text-secondary) mb-4">
              This vault was created with an older key derivation function (PBKDF2-SHA256).
              Re-encrypt it with Argon2id — stronger against offline brute-force — using the same
              master password.
            </p>
            {error && <p className="sv-error mb-3">{error}</p>}
            <label className="sv-label">Master password</label>
            <input
              className="sv-input w-full font-mono mb-5"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={working}
              onKeyDown={(e) => e.key === "Enter" && handleUpgrade()}
            />
            <div className="flex justify-end gap-3">
              <button onClick={onClose} disabled={working} className="sv-btn-secondary px-5">
                Cancel
              </button>
              <button
                onClick={handleUpgrade}
                disabled={working || !password}
                className="sv-btn-primary px-5"
              >
                {working ? "Upgrading…" : "Upgrade"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
