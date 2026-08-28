/**
 * @file ChangePassword.modal.tsx
 * Re-encrypt vault with a new master password.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { analyzeStrength } from "../../core/password/strength";
import { openVault, changeMasterPassword } from "../../core/vault/serializer";
import { WrongPasswordError } from "../../core/errors";
import { IPCService } from "../../services/ipc.service";

interface Props {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: Props) {
  const { sessionKeys, unlock, autoLockMs } = useSessionStore();
  const { vault } = useVaultStore();
  const { toastSuccess } = useUIStore();

  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"form" | "working" | "done">("form");
  const [progress, setProgress] = useState(0);

  const strength = analyzeStrength(newPw);
  const SC = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
  const SL = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleChange = useCallback(async () => {
    const e: Record<string, string> = {};
    if (!current) e.current = "Current password required.";
    if (!newPw) e.newPw = "New password required.";
    else if (strength.score < 3) e.newPw = `Too weak (${SL[strength.score]}).`;
    if (newPw !== confirmPw) e.confirm = "Passwords do not match.";
    if (current === newPw) e.newPw = "Must differ from current.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setStep("working");
    setProgress(20);
    try {
      const stored = await IPCService.vault.load();
      if (!stored) throw new Error("No vault found.");
      setProgress(40);
      await openVault(stored, current); // verify current pw
      setProgress(60);
      if (!vault || !sessionKeys) throw new Error("Vault not loaded.");
      // Re-derive NEW keys from the new password and re-encrypt with them.
      // (The old code re-encrypted with the existing session keys, so the
      //  password never actually changed.)
      const { encryptedPayload, sessionKeys: newKeys } = await changeMasterPassword(vault, newPw);
      setProgress(80);
      await IPCService.vault.save(encryptedPayload);
      // Swap the live session keys to the new ones so the next autosave
      // re-encrypts with keys that match the new salt — otherwise the vault
      // would become undecryptable.
      unlock(newKeys, autoLockMs);
      setProgress(100);
      toastSuccess("Password changed", "Vault re-encrypted with your new password.");
      // Drop the plaintext passwords from React state as soon as we're done.
      // The browser may still hold them on the JS heap until GC, but this
      // minimizes their lifetime and removes them from React DevTools.
      setCurrent("");
      setNewPw("");
      setConfirmPw("");
      setStep("done");
    } catch (err: unknown) {
      if (err instanceof WrongPasswordError) {
        setErrors({ current: "Incorrect current password." });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrors({ global: `Failed: ${msg}` });
      }
      setStep("form");
      setProgress(0);
    }
  }, [current, newPw, confirmPw, strength, vault, sessionKeys, toastSuccess]);

  return (
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sv-modal max-w-sm" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Change Master Password
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {step === "form" && (
          <div className="flex flex-col gap-4">
            {errors.global && (
              <div className="p-3 bg-[var(--danger-dim)] border border-[var(--danger)]/20 rounded-xl text-sm text-[var(--danger)]">
                {errors.global}
              </div>
            )}
            <div>
              <label className="sv-label">Current Password</label>
              <div className="relative">
                <input
                  className={`sv-input w-full pr-10 font-mono ${errors.current ? "border-[var(--danger)]" : ""}`}
                  type={showCur ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                  onClick={() => setShowCur((v) => !v)}
                >
                  {showCur ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.current && <p className="sv-error">{errors.current}</p>}
            </div>
            <div>
              <label className="sv-label">New Password</label>
              <div className="relative">
                <input
                  className={`sv-input w-full pr-10 font-mono ${errors.newPw ? "border-[var(--danger)]" : ""}`}
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.newPw && <p className="sv-error">{errors.newPw}</p>}
              {newPw && (
                <div className="flex gap-0.5 mt-1.5">
                  {SC.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1 h-1 rounded-full"
                      style={{
                        background:
                          i <= strength.score ? SC[strength.score] : "var(--border-subtle)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="sv-label">Confirm New Password</label>
              <input
                className={`sv-input w-full font-mono ${errors.confirm ? "border-[var(--danger)]" : ""}`}
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
              />
              {errors.confirm && <p className="sv-error">{errors.confirm}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={onClose} className="sv-btn-secondary px-5">
                Cancel
              </button>
              <button onClick={handleChange} className="sv-btn-primary px-5">
                Change Password
              </button>
            </div>
          </div>
        )}

        {step === "working" && (
          <div className="flex flex-col items-center py-10 gap-5">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-2xl animate-pulse">
              🔐
            </div>
            <div className="w-full max-w-xs">
              <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
                Re-encrypting vault…
              </p>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center text-center py-8 gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--success-dim)] flex items-center justify-center text-3xl">
              ✅
            </div>
            <h3 className="font-semibold text-[var(--text-primary)]">Password Changed</h3>
            <button onClick={onClose} className="sv-btn-primary px-8">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
