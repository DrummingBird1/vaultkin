/**
 * @file RecoveryKit.modal.tsx
 * Generates an emergency-access snapshot: an independent 8-word recovery
 * passphrase + a fresh encrypted export of the current vault contents that
 * opens with that passphrase, not the master password. Point-in-time
 * snapshot, not a live-synced second copy — see
 * docs/adr/0002-recovery-kit-snapshot.md for why. Regenerate periodically
 * to keep it current; this modal doesn't track "last generated."
 */
import React, { useState } from "react";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { generatePassphrase } from "../../core/password/generator";
import { createVault } from "../../core/vault/serializer";
import { IconClose, IconCopy, IconShield } from "../icons";
import { Modal } from "../ui/Modal";
import { useTranslation } from "react-i18next";

export function RecoveryKitModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { vault } = useVaultStore();
  const { toastSuccess, toastError } = useUIStore();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!vault) return;
    setGenerating(true);
    try {
      const key = generatePassphrase({ words: 8, includeNumber: true });
      const { encryptedPayload } = await createVault(key, {
        entries: vault.entries,
        folders: vault.folders,
        tombstones: vault.tombstones ?? [],
        settings: vault.settings,
        meta: vault.meta,
      });
      setRecoveryKey(key);
      setPayload(encryptedPayload);
    } catch {
      toastError(t("recoveryKit.failed"), t("recoveryKit.tryAgain"));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!payload) return;
    const blob = new Blob([payload], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `securevault-recovery-${Date.now()}.svault`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastSuccess(t("recoveryKit.downloaded"), t("recoveryKit.downloadedBody"));
  };

  return (
    <Modal onClose={onClose} className="max-w-md" label={t("recoveryKit.title")}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="sv-modal-title flex items-center gap-2">
          <IconShield className="w-5 h-5" /> {t("recoveryKit.title")}
        </h2>
        <button onClick={onClose} aria-label={t("entry.close")} className="sv-icon-btn">
          <IconClose />
        </button>
      </div>

      {!recoveryKey ? (
        <>
          <p className="text-sm text-(--text-secondary) mb-4">{t("recoveryKit.intro")}</p>
          <p className="sv-hint mb-5">{t("recoveryKit.snapshotHint")}</p>
          <button onClick={handleGenerate} disabled={generating} className="sv-btn-primary w-full">
            {generating ? t("recoveryKit.generating") : t("recoveryKit.generate")}
          </button>
        </>
      ) : (
        <>
          <div className="p-3 bg-(--warning-dim) border border-(--warning)/30 rounded-xl text-sm text-(--warning) mb-4">
            {t("recoveryKit.shownOnce")}
          </div>
          <div className="mb-4">
            <label className="sv-label">{t("recoveryKit.passphrase")}</label>
            <div className="flex items-center gap-2">
              <code className="sv-input flex-1 font-mono text-sm select-all">{recoveryKey}</code>
              <button
                onClick={handleCopy}
                aria-label={t("recoveryKit.copy")}
                className="sv-btn-secondary px-3"
              >
                {copied ? t("recoveryKit.copied") : <IconCopy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={handleDownload} className="sv-btn-primary w-full mb-3">
            {t("recoveryKit.download")}
          </button>
          <button onClick={onClose} className="sv-btn-secondary w-full">
            {t("recoveryKit.done")}
          </button>
        </>
      )}
    </Modal>
  );
}
