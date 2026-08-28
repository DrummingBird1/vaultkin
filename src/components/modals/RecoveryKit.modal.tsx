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
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { generatePassphrase } from "../../core/password/generator";
import { createVault } from "../../core/vault/serializer";
import { IconClose, IconCopy, IconShield } from "../icons";

export function RecoveryKitModal({ onClose }: { onClose: () => void }) {
  const containerRef = useFocusTrap<HTMLDivElement>(true);
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
        settings: vault.settings,
        meta: vault.meta,
      });
      setRecoveryKey(key);
      setPayload(encryptedPayload);
    } catch {
      toastError("Failed to generate Recovery Kit", "Please try again.");
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
    toastSuccess(
      "Recovery Kit downloaded",
      "Store the file and the passphrase separately, somewhere durable.",
    );
  };

  return (
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={containerRef}
        className="sv-modal max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label="Recovery Kit"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="sv-modal-title flex items-center gap-2">
            <IconShield className="w-5 h-5" /> Recovery Kit
          </h2>
          <button onClick={onClose} aria-label="Close" className="sv-icon-btn">
            <IconClose />
          </button>
        </div>

        {!recoveryKey ? (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Generates a random recovery passphrase, independent of your master password, and a
              snapshot of your current vault that opens only with it. Use this if you ever forget
              your master password — there is no other way to recover a zero-knowledge vault.
            </p>
            <p className="sv-hint mb-5">
              This is a point-in-time snapshot — entries added after today won't be in it.
              Regenerate periodically to keep it useful.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="sv-btn-primary w-full"
            >
              {generating ? "Generating…" : "Generate Recovery Kit"}
            </button>
          </>
        ) : (
          <>
            <div className="p-3 bg-[var(--warning-dim)] border border-[var(--warning)]/30 rounded-xl text-sm text-[var(--warning)] mb-4">
              This passphrase is shown once and never saved anywhere. Write it down or store it in a
              separate password manager — not next to the downloaded file.
            </div>
            <div className="mb-4">
              <label className="sv-label">Recovery passphrase</label>
              <div className="flex items-center gap-2">
                <code className="sv-input flex-1 font-mono text-sm select-all">{recoveryKey}</code>
                <button
                  onClick={handleCopy}
                  aria-label="Copy recovery passphrase"
                  className="sv-btn-secondary px-3"
                >
                  {copied ? "Copied" : <IconCopy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={handleDownload} className="sv-btn-primary w-full mb-3">
              Download Recovery File
            </button>
            <button onClick={onClose} className="sv-btn-secondary w-full">
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
