/**
 * @file Unlock.page.tsx — Step 7 final wired version.
 * Integrated with IPCService (IndexedDB / Electron filesystem) + AppLifecycle.
 * Handles: vault check, password unlock, biometric unlock, first-run create flow.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useSessionStore }   from "../store/session.store";
import { onVaultUnlocked }   from "../store";
import { openVault, createVault } from "../core/vault/serializer";
import { createDefaultVaultData } from "../core/vault/vault-types";
import { IPCService }        from "../services/ipc.service";
import { AppLifecycle }      from "../services/app-lifecycle.service";
import { BiometricService }  from "../services/biometric.service";
import { DuressService }     from "../services/duress.service";
import { CreateVaultModal }  from "../components/modals/CreateVault.modal";

export function UnlockPage() {
  const { unlock, setKDFProgress, kdfProgress, isDerivingKey } = useSessionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [bioAvail,    setBioAvail]    = useState(false);
  const [shake,       setShake]       = useState(false);
  const hint = typeof localStorage !== "undefined" ? localStorage.getItem("sv_password_hint") : null;

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
    setError(""); setLoading(true);
    try {
      // The keys-only decryption path (unlock the vault using only the OS
      // keychain-protected session keys, without re-deriving from the master
      // password) is not yet wired end-to-end. Until that lands, we surface a
      // clear message instead of silently calling openVault with arguments it
      // does not accept.
      const keyMaterial = await BiometricService.authenticate("Unlock SecureVault");
      if (!keyMaterial) { setError("Biometric authentication failed."); return; }
      setError("Biometric unlock not yet supported in this session. Please use your master password.");
    } catch { setError("Biometric unlock failed. Use master password."); }
    finally { setLoading(false); }
  }, []);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setError("Please enter your master password."); return; }
    setError(""); setLoading(true); setKDFProgress(0.05);
    try {
      const stored = await IPCService.vault.load();
      if (!stored) { setError("No vault found."); setLoading(false); setKDFProgress(0); return; }

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
          const { encryptedPayload, vault, sessionKeys } =
            await createVault(password, createDefaultVaultData());
          await IPCService.vault.save(encryptedPayload);
          unlock(sessionKeys, vault.settings.autoLockMs);
          onVaultUnlocked(vault);
          await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);
        }
        setKDFProgress(1);
        return;
      }

      setKDFProgress(0.2);
      const { vault, sessionKeys } = await openVault(stored, password);
      setKDFProgress(0.9);
      unlock(sessionKeys, vault.settings.autoLockMs);
      onVaultUnlocked(vault);
      await AppLifecycle.onUnlock(vault, sessionKeys, vault.settings.autoLockMs);
      setKDFProgress(1);
    } catch (err: any) {
      const msg = err?.message ?? "";
      setError(msg.includes("master password") || msg.includes("integrity") || msg.includes("decrypt")
        ? "Incorrect master password. Please try again."
        : "Failed to unlock vault. The file may be corrupted.");
      setKDFProgress(0);
      setShake(true); setTimeout(() => setShake(false), 600);
    } finally { setLoading(false); setPassword(""); }
  }, [password, unlock, setKDFProgress]);

  const isLoading = loading || isDerivingKey;

  return (
    <>
      {showCreate && <CreateVaultModal onClose={() => setShowCreate(false)} />}
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-6"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.08) 0%, transparent 60%)" }}>
        <div className="w-full max-w-sm" style={{ animation: "slideUp 400ms ease both" }}>

          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] border border-[var(--accent)]/20 flex items-center justify-center mb-4"
              style={{ boxShadow: "0 0 40px rgba(var(--accent-rgb),0.2)", animation: "glow 3s ease-in-out infinite" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C9.24 2 7 4.24 7 7v2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V7c0-2.76-2.24-5-5-5zm0 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-7H9V7a3 3 0 0 1 6 0v1z" fill="currentColor" className="text-[var(--accent)]"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] font-display tracking-tight">SecureVault</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">Zero-knowledge password manager</p>
          </div>

          {vaultExists === null && <div className="text-center text-sm text-[var(--text-tertiary)] animate-pulse">Initializing…</div>}

          {/* Unlock form */}
          {vaultExists === true && (
            <div className={shake ? "[animation:shake_600ms_ease_both]" : ""}>
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 flex flex-col gap-4">
                {bioAvail && (
                  <button type="button" onClick={handleBiometric} disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-all text-sm font-medium text-[var(--text-primary)]">
                    <span className="text-xl">🪪</span> Unlock with Biometrics
                  </button>
                )}
                {bioAvail && <div className="flex items-center gap-3"><div className="flex-1 h-px bg-[var(--border-subtle)]"/><span className="text-xs text-[var(--text-tertiary)]">or</span><div className="flex-1 h-px bg-[var(--border-subtle)]"/></div>}
                <form onSubmit={handleUnlock} className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">Master Password</label>
                    <div className="relative">
                      <input ref={inputRef} type={showPw ? "text" : "password"} value={password}
                        onChange={e => setPassword(e.target.value)} disabled={isLoading}
                        placeholder="Enter master password…" autoComplete="current-password"
                        aria-label="Master password"
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-all pr-10"
                        style={error ? { borderColor: "var(--danger)" } : {}}/>
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                        onClick={() => setShowPw(v => !v)}>{showPw ? "🙈" : "👁️"}</button>
                    </div>
                    {hint && !error && <p className="text-xs text-[var(--text-tertiary)] mt-1">💡 {hint}</p>}
                    {error && <p className="text-xs text-[var(--danger)] mt-1">⚠ {error}</p>}
                  </div>
                  {isLoading && kdfProgress > 0 && (
                    <div>
                      <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-300" style={{ width: `${Math.round(kdfProgress*100)}%` }}/>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] text-center mt-1">
                        {kdfProgress < 0.5 ? "Deriving key…" : kdfProgress < 0.9 ? "Decrypting…" : "Almost done…"}
                      </p>
                    </div>
                  )}
                  <button type="submit" disabled={isLoading || !password}
                    className="w-full bg-[var(--accent)] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isLoading ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"/></svg>Unlocking…</> : "Unlock Vault"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* First run */}
          {vaultExists === false && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 text-center flex flex-col gap-5">
              <div className="text-4xl">🏗️</div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1">No vault found</h3>
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">Create your first SecureVault to get started. Your data stays encrypted on your device.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(true)}
                className="w-full bg-[var(--accent)] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity">
                Create New Vault
              </button>
            </div>
          )}

          <p className="text-center text-xs text-[var(--text-tertiary)] mt-6">🔒 AES-256-GCM · Argon2id · HMAC-SHA256 · Zero-knowledge</p>
        </div>
      </div>
    </>
  );
}
