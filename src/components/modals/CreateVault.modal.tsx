/**
 * @file CreateVault.modal.tsx
 * @description First-run vault creation: master password setup + vault initialization.
 *
 * SECURITY NOTES:
 * - Password is NEVER stored — only used to derive session keys.
 * - Argon2id KDF parameters are displayed to the user for transparency.
 * - A recovery hint (NOT the password) can optionally be stored in localStorage.
 * - The vault is created with a random salt and encrypted before first save.
 *
 * FLOW:
 *   1. Enter + confirm master password (with strength requirements)
 *   2. Optional: set recovery hint
 *   3. Confirm → createVault() → unlock → onVaultCreated()
 */

import React, { useState, useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { analyzeStrength } from "../../core/password/strength";
import { generatePassword } from "../../core/password/generator";
import { createVault } from "../../core/vault/serializer";
import { IPCService } from "../../services/ipc.service";
import { AppLifecycle } from "../../services/app-lifecycle.service";
import { onVaultUnlocked } from "../../store";
import { useSessionStore } from "../../store/session.store";
import { Modal } from "../ui/Modal";

interface Props {
  onClose?: () => void;
}

const STRENGTH_MIN = 3; // "Strong" or better required

export function CreateVaultModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { unlock } = useSessionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"password" | "confirm" | "creating" | "done">("password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hint, setHint] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const strength = analyzeStrength(password);
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
  const strengthColor = strengthColors[strength.score] ?? strengthColors[0];
  const strengthLabel = t(`entry.strength.${strength.score}`, { defaultValue: "" });

  function handleGenerateSuggestion() {
    const pw = generatePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: true,
    });
    setPassword(pw);
    setConfirm(pw);
    setShowPw(true);
    setShowConfirm(true);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!password) {
      errs.password = t("createVault.errors.passwordRequired");
    } else if (strength.score < STRENGTH_MIN) {
      errs.password = t("createVault.errors.tooWeak", { strength: strengthLabel });
    }

    if (!confirm) {
      errs.confirm = t("createVault.errors.confirmRequired");
    } else if (password !== confirm) {
      errs.confirm = t("createVault.errors.mismatch");
    }

    if (hint && hint.toLowerCase().includes(password.toLowerCase())) {
      errs.hint = t("createVault.errors.hintContainsPassword");
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate() {
    if (!validate()) return;
    setStep("creating");
    setProgress(10);

    try {
      // Store hint (NOT password) in localStorage if provided
      if (hint.trim()) {
        localStorage.setItem("sv_password_hint", hint.trim());
      }

      setProgress(30);

      // Create and encrypt new vault
      const { encryptedPayload, vault, sessionKeys } = await createVault(password, {
        entries: [],
        folders: [],
        tombstones: [],
        settings: {
          autoLockMs: 5 * 60 * 1000,
          defaultCategory: "websites",
          theme: "dark",
          accentColor: "#6366F1",
          viewMode: "grid",
        },
        meta: {
          createdAt: new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
        },
      });

      setProgress(80);

      // Save to storage
      await IPCService.vault.save(encryptedPayload);

      setProgress(95);

      // Unlock application
      unlock(sessionKeys, vault.settings.autoLockMs);
      onVaultUnlocked(vault);
      await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);

      setProgress(100);
      setStep("done");
    } catch (err: any) {
      setErrors({ global: err?.message ?? t("createVault.errors.failed") });
      setStep("password");
      setProgress(0);
    }
  }

  return (
    <Modal
      onClose={onClose}
      dismissable={step !== "creating"}
      className="max-w-md"
      label={t("createVault.label")}
    >
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="w-12 h-12 rounded-2xl bg-(--accent-dim) border border-(--accent)/20 flex items-center justify-center text-xl"
          style={{ boxShadow: "0 0 30px rgba(var(--accent-rgb),0.2)" }}
        >
          🔐
        </div>
        <div>
          <h2 className="text-xl font-bold text-(--text-primary)">{t("createVault.title")}</h2>
          <p className="text-sm text-(--text-tertiary)">{t("createVault.subtitle")}</p>
        </div>
      </div>

      {/* ── Step: Password Entry ── */}
      {(step === "password" || step === "confirm") && (
        <div className="flex flex-col gap-5">
          {errors.global && (
            <div className="p-3 bg-(--danger-dim) border border-(--danger)/20 rounded-xl text-sm text-(--danger)">
              {errors.global}
            </div>
          )}

          {/* Master password */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="sv-label mb-0">{t("createVault.passwordLabel")}</label>
              <button
                type="button"
                onClick={handleGenerateSuggestion}
                className="text-xs text-(--accent-text) hover:underline font-medium"
              >
                {t("createVault.suggest")}
              </button>
            </div>
            <div className="relative">
              <input
                ref={inputRef}
                className={`sv-input w-full pe-10 font-mono ${errors.password ? "border-(--danger)" : ""}`}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("createVault.passwordPlaceholder")}
                autoComplete="new-password"
                aria-label={t("createVault.passwordAria")}
              />
              <button
                type="button"
                className="absolute end-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-7 min-h-7 rounded-md text-(--text-tertiary) hover:text-(--text-secondary)"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? t("unlock.hidePassword") : t("unlock.showPassword")}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.password && <p className="sv-error">{errors.password}</p>}
            {/* Strength bar */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-0.5 mb-1">
                  {strengthColors.map((c, i) => (
                    <div
                      key={i}
                      className="flex-1 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        background: i <= strength.score ? strengthColor : "var(--border-subtle)",
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </span>
                  <span className="text-xs text-(--text-tertiary)">
                    {t("createVault.entropy", { bits: Math.round(strength.effectiveEntropy) })}
                  </span>
                </div>
                {strength.feedback.length > 0 && (
                  <p className="text-xs text-(--text-tertiary) mt-1">
                    {t(`strength.feedback.${strength.feedbackKeys[0]}`)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="sv-label">{t("createVault.confirmLabel")}</label>
            <div className="relative">
              <input
                className={`sv-input w-full pe-10 font-mono ${errors.confirm ? "border-(--danger)" : ""}`}
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("createVault.confirmPlaceholder")}
                autoComplete="new-password"
                aria-label={t("createVault.confirmAria")}
              />
              <button
                type="button"
                className="absolute end-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-7 min-h-7 rounded-md text-(--text-tertiary) hover:text-(--text-secondary)"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? t("unlock.hidePassword") : t("unlock.showPassword")}
              >
                {showConfirm ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.confirm && <p className="sv-error">{errors.confirm}</p>}
            {confirm && password === confirm && !errors.confirm && (
              <p className="text-xs text-(--success) mt-1">{t("createVault.match")}</p>
            )}
          </div>

          {/* Hint */}
          <div>
            <label className="sv-label">{t("createVault.hintLabel")}</label>
            <input
              className={`sv-input w-full ${errors.hint ? "border-(--danger)" : ""}`}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("createVault.hintPlaceholder")}
            />
            {errors.hint && <p className="sv-error">{errors.hint}</p>}
            <p className="text-xs text-(--text-tertiary) mt-1">{t("createVault.hintHelp")}</p>
          </div>

          {/* Security notice */}
          <div className="p-4 bg-(--bg-elevated) rounded-xl border border-(--border-subtle) text-xs text-(--text-tertiary) leading-relaxed">
            🔒{" "}
            <Trans
              i18nKey="createVault.notice"
              components={{ strong: <strong className="text-(--text-secondary)" /> }}
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="sv-btn-primary w-full py-3 text-base font-semibold mt-1"
            disabled={!password || !confirm}
          >
            {t("createVault.submit")}
          </button>
        </div>
      )}

      {/* ── Step: Creating ── */}
      {step === "creating" && (
        <div className="flex flex-col items-center justify-center py-12 gap-6">
          <div className="w-16 h-16 rounded-2xl bg-(--accent-dim) flex items-center justify-center text-2xl animate-pulse">
            🔐
          </div>
          <div className="w-full max-w-xs text-center">
            <p className="text-sm font-medium text-(--text-primary) mb-3">
              {progress < 50
                ? t("createVault.progress.deriving")
                : progress < 85
                  ? t("createVault.progress.encrypting")
                  : t("createVault.progress.saving")}
            </p>
            <div className="h-2 bg-(--bg-elevated) rounded-full overflow-hidden">
              <div
                className="h-full bg-(--accent) rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-(--text-tertiary) mt-2">{progress}%</p>
          </div>
        </div>
      )}

      {/* ── Step: Done (vault opens automatically) ── */}
      {step === "done" && (
        <div className="flex flex-col items-center text-center py-8 gap-4">
          <div
            className="w-16 h-16 rounded-full bg-(--success-dim) flex items-center justify-center text-3xl"
            style={{ animation: "scaleIn 300ms ease both" }}
          >
            ✅
          </div>
          <div>
            <h3 className="text-lg font-semibold text-(--text-primary)">{t("createVault.done")}</h3>
            <p className="text-sm text-(--text-tertiary) mt-1">{t("createVault.doneBody")}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
