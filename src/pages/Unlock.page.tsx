/**
 * @file Unlock.page.tsx — Step 7 final wired version.
 * Integrated with IPCService (IndexedDB / Electron filesystem) + AppLifecycle.
 * Handles: vault check, password unlock, biometric unlock, first-run create flow.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSessionStore } from "../store/session.store";
import { onVaultUnlocked } from "../store";
import { openVault, createVault } from "../core/vault/serializer";
import { createDefaultVaultData } from "../core/vault/vault-types";
import { WrongPasswordError, VaultCorruptError } from "../core/errors";
import { IPCService } from "../services/ipc.service";
import { AppLifecycle } from "../services/app-lifecycle.service";
import { BiometricService } from "../services/biometric.service";
import { DuressService } from "../services/duress.service";
import { UnlockThrottleService, type LockStatus } from "../services/unlock-throttle.service";
import { CreateVaultModal } from "../components/modals/CreateVault.modal";
import {
  IconEye,
  IconEyeOff,
  IconIdCard,
  IconInfo,
  IconWarning,
  IconConstruction,
  IconShield,
} from "../components/icons";

function formatCountdown(t: TFunction, ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return t("countdown.seconds", { count: s });
  return t("countdown.minutesSeconds", { minutes: Math.floor(s / 60), seconds: s % 60 });
}

export function UnlockPage() {
  const { t } = useTranslation();
  const { unlock, setKDFProgress, kdfProgress, isDerivingKey } = useSessionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [bioAvail, setBioAvail] = useState(false);
  const [shake, setShake] = useState(false);
  const [lockStatus, setLockStatus] = useState<LockStatus>(() => UnlockThrottleService.getStatus());
  const hint =
    typeof localStorage !== "undefined" ? localStorage.getItem("sv_password_hint") : null;

  // Live countdown while locked out — ticks the remaining time down and
  // re-enables the form the moment it hits zero, without a page refresh.
  useEffect(() => {
    if (!lockStatus.locked) return;
    const id = setInterval(() => {
      const s = UnlockThrottleService.getStatus();
      setLockStatus(s);
      if (!s.locked) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [lockStatus.locked]);

  useEffect(() => {
    (async () => {
      const [stored, prf] = await Promise.all([
        IPCService.vault.load().catch(() => null),
        // Only surface the biometric button once the PRF-based wrapped-key
        // unlock is implemented + tested. supportsPRF() returns false today,
        // so we don't show a non-functional control. See biometric.service.ts.
        BiometricService.supportsPRF().catch(() => false),
      ]);
      setVaultExists(!!stored);
      setBioAvail(prf);
      if (stored) setTimeout(() => inputRef.current?.focus(), 50);
    })();
  }, []);

  const handleBiometric = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      // The keys-only decryption path (unlock the vault using only the OS
      // keychain-protected session keys, without re-deriving from the master
      // password) is not yet wired end-to-end. Until that lands, we surface a
      // clear message instead of silently calling openVault with arguments it
      // does not accept.
      const keyMaterial = await BiometricService.authenticate(t("unlock.biometricPromptReason"));
      if (!keyMaterial) {
        setError(t("unlock.errors.biometricFailed"));
        return;
      }
      setError(t("unlock.errors.biometricNotSupported"));
    } catch {
      setError(t("unlock.errors.biometricError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim()) {
        setError(t("unlock.errors.emptyPassword"));
        return;
      }

      // ── Throttle check ────────────────────────────────────────────────────────
      // Checked before ANY attempt (including duress) so lockout state can't be
      // used as a side channel to distinguish "duress password" from "wrong
      // password" while locked out.
      const status = UnlockThrottleService.getStatus();
      if (status.locked) {
        setLockStatus(status);
        setError(
          t("unlock.errors.tooManyAttempts", { countdown: formatCountdown(t, status.remainingMs) }),
        );
        return;
      }

      setError("");
      setLoading(true);
      setKDFProgress(0.05);
      try {
        const stored = await IPCService.vault.load();
        if (!stored) {
          setError(t("unlock.errors.noVaultFound"));
          setLoading(false);
          setKDFProgress(0);
          return;
        }

        // ── Duress check ──────────────────────────────────────────────────────
        // If the entered password is the enrolled duress password, we must NOT
        // open the real vault. Either the stored blob is already the decoy (a
        // prior trigger) — in which case it opens with the duress password — or
        // it's still the real vault, which we wipe and replace with an empty
        // decoy. Either way the attacker sees a sparse, innocuous vault.
        if (await DuressService.isDuress(password)) {
          DuressService.markTriggered();
          setKDFProgress(0.3);
          try {
            // Already a decoy? Then it decrypts with the duress password.
            const { vault, sessionKeys } = await openVault(stored, password);
            unlock(sessionKeys, vault.settings.autoLockMs);
            onVaultUnlocked(vault);
            await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);
          } catch {
            // Stored vault is the REAL one (duress pw can't open it). Wipe it
            // and create a fresh empty decoy encrypted with the duress password.
            await IPCService.vault.delete();
            const { encryptedPayload, vault, sessionKeys } = await createVault(
              password,
              createDefaultVaultData(),
            );
            await IPCService.vault.save(encryptedPayload);
            unlock(sessionKeys, vault.settings.autoLockMs);
            onVaultUnlocked(vault);
            await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);
          }
          UnlockThrottleService.recordSuccess();
          setKDFProgress(1);
          return;
        }

        setKDFProgress(0.2);
        const { vault, sessionKeys } = await openVault(stored, password);
        setKDFProgress(0.9);
        unlock(sessionKeys, vault.settings.autoLockMs);
        onVaultUnlocked(vault);
        await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);
        UnlockThrottleService.recordSuccess();
        setKDFProgress(1);
      } catch (err: unknown) {
        const newStatus = UnlockThrottleService.recordFailure();
        setLockStatus(newStatus);
        if (newStatus.locked) {
          setError(
            t("unlock.errors.incorrectPasswordLocked", {
              countdown: formatCountdown(t, newStatus.remainingMs),
            }),
          );
        } else if (err instanceof WrongPasswordError) {
          setError(t("unlock.errors.incorrectPassword"));
        } else if (err instanceof VaultCorruptError) {
          setError(t("unlock.errors.vaultCorrupt"));
        } else {
          setError(t("unlock.errors.vaultCorrupt"));
        }
        setKDFProgress(0);
        setShake(true);
        setTimeout(() => setShake(false), 600);
      } finally {
        setLoading(false);
        setPassword("");
      }
    },
    [password, unlock, setKDFProgress, t],
  );

  const isLoading = loading || isDerivingKey;

  return (
    <>
      {showCreate && <CreateVaultModal onClose={() => setShowCreate(false)} />}
      <div
        className="min-h-screen bg-(--bg-base) flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.08) 0%, transparent 60%)",
        }}
      >
        <div className="w-full max-w-sm" style={{ animation: "slideUp 400ms ease both" }}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div
              className="w-16 h-16 rounded-2xl bg-(--accent-dim) border border-(--accent)/20 flex items-center justify-center mb-4"
              style={{
                boxShadow: "0 0 40px rgba(var(--accent-rgb),0.2)",
                animation: "glow 3s ease-in-out infinite",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C9.24 2 7 4.24 7 7v2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V7c0-2.76-2.24-5-5-5zm0 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v1z"
                  fill="currentColor"
                  className="text-(--accent)"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-(--text-primary) font-display tracking-tight">
              {t("app.name")}
            </h1>
            <p className="text-sm text-(--text-tertiary) mt-1">{t("app.tagline")}</p>
          </div>

          {vaultExists === null && (
            <div
              className="bg-(--bg-surface) border border-(--border-default) rounded-2xl p-5 flex flex-col gap-4 animate-pulse"
              aria-label={t("common.loading")}
              role="status"
            >
              <div className="h-11 rounded-xl bg-(--bg-elevated)" />
              <div className="h-3 w-16 rounded-sm bg-(--bg-elevated) mx-auto" />
              <div className="h-3 w-24 rounded-sm bg-(--bg-elevated)" />
              <div className="h-12 rounded-xl bg-(--bg-elevated)" />
              <div className="h-11 rounded-xl bg-(--bg-elevated)" />
            </div>
          )}

          {/* Unlock form */}
          {vaultExists === true && (
            <div className={shake ? "animate-[shake_600ms_ease_both]" : ""}>
              <div className="bg-(--bg-surface) border border-(--border-default) rounded-2xl p-5 flex flex-col gap-4">
                {bioAvail && (
                  <button
                    type="button"
                    onClick={handleBiometric}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-(--border-default) bg-(--bg-elevated) hover:border-(--accent) hover:bg-(--accent-dim) transition-all text-sm font-medium text-(--text-primary)"
                  >
                    <IconIdCard className="w-5 h-5" /> {t("unlock.biometricButton")}
                  </button>
                )}
                {bioAvail && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-(--border-subtle)" />
                    <span className="text-xs text-(--text-tertiary)">{t("unlock.or")}</span>
                    <div className="flex-1 h-px bg-(--border-subtle)" />
                  </div>
                )}
                <form onSubmit={handleUnlock} className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-(--text-secondary) uppercase tracking-wider block mb-1.5">
                      {t("unlock.passwordLabel")}
                    </label>
                    <div className="relative">
                      <input
                        ref={inputRef}
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading || lockStatus.locked}
                        placeholder={t("unlock.passwordPlaceholder")}
                        autoComplete="current-password"
                        aria-label={t("unlock.passwordLabel")}
                        className="w-full bg-(--bg-elevated) border border-(--border-default) rounded-xl px-4 py-3 text-sm font-mono text-(--text-primary) placeholder-(--text-tertiary) outline-hidden focus:border-(--accent) transition-all pr-10"
                        style={error ? { borderColor: "var(--danger)" } : {}}
                      />
                      <button
                        type="button"
                        aria-label={showPw ? t("unlock.hidePassword") : t("unlock.showPassword")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-tertiary)"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        {showPw ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                    {hint && !error && (
                      <p className="flex items-center gap-1 text-xs text-(--text-tertiary) mt-1">
                        <IconInfo className="w-3.5 h-3.5 shrink-0" /> {hint}
                      </p>
                    )}
                    {error && (
                      <p className="flex items-center gap-1 text-xs text-(--danger) mt-1">
                        <IconWarning className="w-3.5 h-3.5 shrink-0" /> {error}
                      </p>
                    )}
                  </div>
                  {isLoading && kdfProgress > 0 && (
                    <div>
                      <div className="h-1 bg-(--bg-elevated) rounded-full overflow-hidden">
                        <div
                          className="h-full bg-(--accent) rounded-full transition-all duration-300"
                          style={{ width: `${Math.round(kdfProgress * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-(--text-tertiary) text-center mt-1">
                        {kdfProgress < 0.5
                          ? t("unlock.progress.deriving")
                          : kdfProgress < 0.9
                            ? t("unlock.progress.decrypting")
                            : t("unlock.progress.almostDone")}
                      </p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || !password || lockStatus.locked}
                    className="w-full bg-(--accent) text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
                          />
                        </svg>
                        {t("unlock.unlocking")}
                      </>
                    ) : lockStatus.locked ? (
                      t("unlock.locked", { countdown: formatCountdown(t, lockStatus.remainingMs) })
                    ) : (
                      t("unlock.submit")
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* First run */}
          {vaultExists === false && (
            <div className="bg-(--bg-surface) border border-(--border-default) rounded-2xl p-6 text-center flex flex-col gap-5">
              <div className="flex justify-center text-(--text-tertiary)">
                <IconConstruction className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-semibold text-(--text-primary) mb-1">
                  {t("unlock.firstRun.heading")}
                </h3>
                <p className="text-sm text-(--text-tertiary) leading-relaxed">
                  {t("unlock.firstRun.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full bg-(--accent) text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                {t("unlock.firstRun.createButton")}
              </button>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-(--text-tertiary) mt-6">
            <IconShield className="w-3.5 h-3.5" /> {t("app.footer")}
          </p>
        </div>
      </div>
    </>
  );
}
