import React, { useState } from "react";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";
import { AUTO_LOCK_OPTIONS } from "../../constants";
import { ChangePasswordModal } from "../modals/ChangePassword.modal";
import { VaultBackupQRModal } from "../modals/VaultBackupQR.modal";
import { UpgradeEncryptionModal } from "../modals/UpgradeEncryption.modal";
import { RecoveryKitModal } from "../modals/RecoveryKit.modal";
import { SettingsSection, persistSettings } from "./shared";

type Dialog = "change-pw" | "qr" | "upgrade-kdf" | "recovery-kit" | null;

export function SecuritySection() {
  const { autoLockMs, setAutoLockMs, sessionKeys } = useSessionStore();
  const lockOnHide = useVaultStore((s) => !!s.vault?.settings.lockOnHide);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const isLegacyKdf = sessionKeys?.kdf.name === "PBKDF2-SHA256";

  return (
    <SettingsSection id="security" title="Security">
      {dialog === "change-pw" && <ChangePasswordModal onClose={close} />}
      {dialog === "qr" && <VaultBackupQRModal onClose={close} />}
      {dialog === "upgrade-kdf" && <UpgradeEncryptionModal onClose={close} />}
      {dialog === "recovery-kit" && <RecoveryKitModal onClose={close} />}

      {isLegacyKdf && (
        <div className="mb-5 p-3 rounded-xl border border-(--accent)/30 bg-(--accent-dim)">
          <p className="text-sm text-(--text-primary) mb-2">
            This vault still uses the older PBKDF2-SHA256 key derivation. Upgrade to Argon2id for
            stronger protection against offline brute-force attacks.
          </p>
          <button onClick={() => setDialog("upgrade-kdf")} className="sv-btn-primary text-sm px-4">
            Upgrade encryption
          </button>
        </div>
      )}
      <div className="mb-5">
        <label className="sv-label" htmlFor="auto-lock">
          Auto-lock after
        </label>
        <select
          id="auto-lock"
          className="sv-input w-full"
          value={autoLockMs}
          onChange={(e) => {
            const v = +e.target.value;
            setAutoLockMs(v);
            persistSettings({ autoLockMs: v });
          }}
        >
          {AUTO_LOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-(--text-tertiary) mt-1">
          Locks the vault after this much keyboard / mouse inactivity.
        </p>
      </div>
      <label className="flex items-center gap-2 mb-5 text-sm text-(--text-secondary) cursor-pointer">
        <input
          type="checkbox"
          checked={lockOnHide}
          onChange={(e) => persistSettings({ lockOnHide: e.target.checked })}
          className="rounded-sm border-(--border-default)"
        />
        Lock immediately when switching to another tab or window
      </label>
      <button onClick={() => setDialog("change-pw")} className="sv-btn-secondary w-full mb-2">
        Change master password
      </button>
      <button onClick={() => setDialog("qr")} className="sv-btn-secondary w-full mb-2">
        Export QR backup
      </button>
      <button onClick={() => setDialog("recovery-kit")} className="sv-btn-secondary w-full">
        Recovery Kit
      </button>
    </SettingsSection>
  );
}
