/**
 * @file ChangePassword.modal.tsx
 * Re-encrypt vault with a new master password.
 */
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { analyzeStrength } from "../../core/password/strength";
import { openVault, changeMasterPassword } from "../../core/vault/serializer";
import { WrongPasswordError } from "../../core/errors";
import { IPCService } from "../../services/ipc.service";
import { Modal } from "../ui/Modal";

interface Props {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: Props) {
  const { t } = useTranslation();
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

  const handleChange = useCallback(async () => {
    const e: Record<string, string> = {};
    if (!current) e.current = t("changePassword.errors.currentRequired");
    if (!newPw) e.newPw = t("changePassword.errors.newRequired");
    else if (strength.score < 3)
      e.newPw = t("changePassword.errors.tooWeak", {
        strength: t(`entry.strength.${strength.score}`),
      });
    if (newPw !== confirmPw) e.confirm = t("changePassword.errors.mismatch");
    if (current === newPw) e.newPw = t("changePassword.errors.sameAsCurrent");
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
      toastSuccess(t("changePassword.toast"), t("changePassword.toastBody"));
      // Drop the plaintext passwords from React state as soon as we're done.
      // The browser may still hold them on the JS heap until GC, but this
      // minimizes their lifetime and removes them from React DevTools.
      setCurrent("");
      setNewPw("");
      setConfirmPw("");
      setStep("done");
    } catch (err: unknown) {
      if (err instanceof WrongPasswordError) {
        setErrors({ current: t("changePassword.errors.incorrectCurrent") });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrors({ global: t("changePassword.errors.failed", { message: msg }) });
      }
      setStep("form");
      setProgress(0);
    }
  }, [current, newPw, confirmPw, strength, vault, sessionKeys, toastSuccess, t]);

  return (
    <Modal
      onClose={onClose}
      dismissable={step !== "working"}
      className="max-w-sm"
      label={t("changePassword.label")}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-(--text-primary)">{t("changePassword.title")}</h2>
        <button
          onClick={onClose}
          aria-label={t("changePassword.close")}
          className="text-(--text-tertiary) hover:text-(--text-primary) p-1 rounded-lg"
        >
          ✕
        </button>
      </div>

      {step === "form" && (
        <div className="flex flex-col gap-4">
          {errors.global && (
            <div className="p-3 bg-(--danger-dim) border border-(--danger)/20 rounded-xl text-sm text-(--danger)">
              {errors.global}
            </div>
          )}
          <div>
            <label className="sv-label">{t("changePassword.current")}</label>
            <div className="relative">
              <input
                className={`sv-input w-full pe-10 font-mono ${errors.current ? "border-(--danger)" : ""}`}
                type={showCur ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-(--text-tertiary)"
                onClick={() => setShowCur((v) => !v)}
                aria-label={showCur ? t("unlock.hidePassword") : t("unlock.showPassword")}
              >
                {showCur ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.current && <p className="sv-error">{errors.current}</p>}
          </div>
          <div>
            <label className="sv-label">{t("changePassword.new")}</label>
            <div className="relative">
              <input
                className={`sv-input w-full pe-10 font-mono ${errors.newPw ? "border-(--danger)" : ""}`}
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-(--text-tertiary)"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? t("unlock.hidePassword") : t("unlock.showPassword")}
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
                      background: i <= strength.score ? SC[strength.score] : "var(--border-subtle)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="sv-label">{t("changePassword.confirm")}</label>
            <input
              className={`sv-input w-full font-mono ${errors.confirm ? "border-(--danger)" : ""}`}
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
            {errors.confirm && <p className="sv-error">{errors.confirm}</p>}
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <button onClick={onClose} className="sv-btn-secondary px-5">
              {t("changePassword.cancel")}
            </button>
            <button onClick={handleChange} className="sv-btn-primary px-5">
              {t("changePassword.submit")}
            </button>
          </div>
        </div>
      )}

      {step === "working" && (
        <div className="flex flex-col items-center py-10 gap-5">
          <div className="w-14 h-14 rounded-2xl bg-(--accent-dim) flex items-center justify-center text-2xl animate-pulse">
            🔐
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 bg-(--bg-elevated) rounded-full overflow-hidden">
              <div
                className="h-full bg-(--accent) rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-(--text-tertiary) text-center mt-2">
              {t("changePassword.working")}
            </p>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center text-center py-8 gap-4">
          <div className="w-14 h-14 rounded-full bg-(--success-dim) flex items-center justify-center text-3xl">
            ✅
          </div>
          <h3 className="font-semibold text-(--text-primary)">{t("changePassword.done")}</h3>
          <button onClick={onClose} className="sv-btn-primary px-8">
            {t("changePassword.close")}
          </button>
        </div>
      )}
    </Modal>
  );
}
