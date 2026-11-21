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
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const strengthColor = strengthColors[strength.score] ?? strengthColors[0];
  const strengthLabel = strengthLabels[strength.score] ?? "";

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
      errs.password = "Master password is required.";
    } else if (strength.score < STRENGTH_MIN) {
      errs.password = `Password too weak (${strengthLabel}). Use at least 12 characters with mixed types.`;
    }

    if (!confirm) {
      errs.confirm = "Please confirm your master password.";
    } else if (password !== confirm) {
      errs.confirm = "Passwords do not match.";
    }

    if (hint && hint.toLowerCase().includes(password.toLowerCase())) {
      errs.hint = "Hint must not contain your password.";
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
      setErrors({ global: err?.message ?? "Failed to create vault. Please try again." });
      setStep("password");
      setProgress(0);
    }
  }

  return (
    <Modal
      onClose={onClose}
      dismissable={step !== "creating"}
      className="max-w-md"
      label="Create vault"
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
          <h2 className="text-xl font-bold text-(--text-primary)">Create Your Vault</h2>
          <p className="text-sm text-(--text-tertiary)">Choose a strong master password</p>
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
              <label className="sv-label mb-0">Master Password *</label>
              <button
                type="button"
                onClick={handleGenerateSuggestion}
                className="text-xs text-(--accent) hover:underline font-medium"
              >
                Suggest strong password
              </button>
            </div>
            <div className="relative">
              <input
                ref={inputRef}
                className={`sv-input w-full pr-10 font-mono ${errors.password ? "border-(--danger)" : ""}`}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter master password"
                autoComplete="new-password"
                aria-label="Master password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-tertiary) hover:text-(--text-secondary)"
                onClick={() => setShowPw((v) => !v)}
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
                    {Math.round(strength.effectiveEntropy)} bits entropy
                  </span>
                </div>
                {strength.feedback.length > 0 && (
                  <p className="text-xs text-(--text-tertiary) mt-1">{strength.feedback[0]}</p>
                )}
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="sv-label">Confirm Master Password *</label>
            <div className="relative">
              <input
                className={`sv-input w-full pr-10 font-mono ${errors.confirm ? "border-(--danger)" : ""}`}
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm master password"
                autoComplete="new-password"
                aria-label="Confirm master password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-tertiary) hover:text-(--text-secondary)"
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? "🙈" : "👁️"}
              </button>
            </div>
            {errors.confirm && <p className="sv-error">{errors.confirm}</p>}
            {confirm && password === confirm && !errors.confirm && (
              <p className="text-xs text-(--success) mt-1">✓ Passwords match</p>
            )}
          </div>

          {/* Hint */}
          <div>
            <label className="sv-label">Password Hint (optional)</label>
            <input
              className={`sv-input w-full ${errors.hint ? "border-(--danger)" : ""}`}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="A clue — never the password itself"
            />
            {errors.hint && <p className="sv-error">{errors.hint}</p>}
            <p className="text-xs text-(--text-tertiary) mt-1">
              Stored locally, never synced. Must not contain your password.
            </p>
          </div>

          {/* Security notice */}
          <div className="p-4 bg-(--bg-elevated) rounded-xl border border-(--border-subtle) text-xs text-(--text-tertiary) leading-relaxed">
            🔒 <strong className="text-(--text-secondary)">Zero-knowledge design:</strong> Your
            master password is never stored or transmitted. It derives your vault key using Argon2id
            (64 MiB, 3 iterations). If you forget it, your vault cannot be recovered.
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="sv-btn-primary w-full py-3 text-base font-semibold mt-1"
            disabled={!password || !confirm}
          >
            Create Vault
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
                ? "Deriving vault key with Argon2id…"
                : progress < 85
                  ? "Encrypting vault with AES-256-GCM…"
                  : "Saving to secure storage…"}
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
            <h3 className="text-lg font-semibold text-(--text-primary)">Vault Created</h3>
            <p className="text-sm text-(--text-tertiary) mt-1">
              Your vault is encrypted and ready to use.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
