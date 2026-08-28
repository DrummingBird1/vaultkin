/**
 * @file src/pages/Settings.page.tsx
 * Theme · language · auto-lock timer · change master password · security ·
 * browser extension · WebDAV backup · desktop updates · danger zone.
 */
import React, { useState, useEffect } from "react";
import { useUIStore, type Theme } from "../store/ui.store";
import { useSessionStore } from "../store/session.store";
import { useVaultStore } from "../store/vault.store";
import { ChangePasswordModal } from "../components/modals/ChangePassword.modal";
import { VaultBackupQRModal } from "../components/modals/VaultBackupQR.modal";
import { UpgradeEncryptionModal } from "../components/modals/UpgradeEncryption.modal";
import { RecoveryKitModal } from "../components/modals/RecoveryKit.modal";
import { IPCService } from "../services/ipc.service";
import { DuressService } from "../services/duress.service";
import { ExtensionBridge } from "../services/extension-bridge.service";
import { SyncService } from "../services/sync.service";
import { lockApplication } from "../store";
import { AUTO_LOCK_OPTIONS, EXTENSION_ID_STORAGE_KEY } from "../constants";
import type { UpdateStatus } from "../types/electron-bridge";
import { useTranslation } from "react-i18next";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";

const EXT_ID_KEY = EXTENSION_ID_STORAGE_KEY;

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "high-contrast", label: "High Contrast" },
];

// Only "en"/"he" have translations right now — see src/i18n/index.ts's header
// comment for the proof-of-concept scope (Unlock page fully migrated,
// everything else including this Settings page itself still hardcoded
// English, so switching to Hebrew here only actually changes the Unlock
// screen on next lock/reload).
const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  he: "עברית",
};

const ACCENTS = [
  { hex: "#6366F1", name: "Indigo" },
  { hex: "#8B5CF6", name: "Violet" },
  { hex: "#EC4899", name: "Pink" },
  { hex: "#10B981", name: "Emerald" },
  { hex: "#F59E0B", name: "Amber" },
  { hex: "#EF4444", name: "Red" },
];

export function SettingsPage() {
  const { i18n: i18nInstance } = useTranslation();
  const { theme, setTheme, accentColor, setAccent, toastError, toastSuccess } = useUIStore();
  const { autoLockMs, setAutoLockMs, sessionKeys } = useSessionStore();
  const { vault } = useVaultStore();
  const [showChangePw, setShowChangePw] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showUpgradeKdf, setShowUpgradeKdf] = useState(false);
  const [showRecoveryKit, setShowRecoveryKit] = useState(false);
  const isLegacyKdf = sessionKeys?.kdf.name === "PBKDF2-SHA256";
  const [confirmDelete, setConfirmDelete] = useState("");

  // Duress enrollment state
  const [duressEnrolled, setDuressEnrolled] = useState(() => DuressService.isEnrolled());
  const [duressPw, setDuressPw] = useState("");
  const [duressConfirm, setDuressConfirm] = useState("");
  const [duressErr, setDuressErr] = useState("");

  const handleEnrollDuress = async () => {
    setDuressErr("");
    if (duressPw !== duressConfirm) {
      setDuressErr("Passwords do not match.");
      return;
    }
    try {
      await DuressService.enroll(duressPw, "");
      setDuressEnrolled(true);
      setDuressPw("");
      setDuressConfirm("");
      toastSuccess(
        "Duress password set",
        "Entering it will wipe the local vault and show a decoy.",
      );
    } catch (e: unknown) {
      setDuressErr(e instanceof Error ? e.message : "Failed to set duress password.");
    }
  };

  const handleDisableDuress = () => {
    DuressService.disenroll();
    setDuressEnrolled(false);
    toastSuccess("Duress password removed", "");
  };

  // Desktop update check — window.electron only exists in the Electron
  // build (see src/types/electron-bridge.d.ts). Manual-trigger only: this
  // page never calls check() on its own, only in response to the button
  // below, and onStatus() just listens for whatever the main process
  // reports back after that explicit request (see update.service.ts).
  const hasDesktopUpdateSupport = "electron" in window && !!window.electron?.updates;
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!hasDesktopUpdateSupport) return;
    return window.electron!.updates.onStatus(setUpdateStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasDesktopUpdateSupport is derived from window, stable for the component's lifetime
  }, []);

  const handleCheckForUpdates = () => {
    setUpdateStatus({ status: "checking" });
    window.electron?.updates
      .check()
      .catch((e: unknown) =>
        setUpdateStatus({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
  };
  const handleDownloadUpdate = () => {
    window.electron?.updates
      .download()
      .catch((e: unknown) =>
        setUpdateStatus({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
  };
  const handleRestartAndInstall = () => {
    window.electron?.updates.quitAndInstall();
  };

  // Browser-extension bridge — chrome.runtime.sendMessage(extensionId, ...) only
  // exists when the page is loaded in a Chromium browser tab. The Electron
  // desktop build (and non-Chromium browsers) has no such API, so "send to
  // extension" would silently fail there; detect it up front and explain why
  // instead of showing a misleading "is the extension installed?" error.
  const hasExtensionSupport = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
  const [extId, setExtId] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem(EXT_ID_KEY)) || "",
  );

  const handleSaveExtId = () => {
    localStorage.setItem(EXT_ID_KEY, extId.trim());
    toastSuccess("Extension ID saved", "");
  };

  const handleSendToExtension = async () => {
    if (!extId.trim()) {
      toastError("No extension ID", "Enter your extension ID first.");
      return;
    }
    if (!vault?.entries.length) {
      toastError("Nothing to send", "Vault is empty.");
      return;
    }
    const ok = await ExtensionBridge.syncEntries(extId.trim(), vault.entries);
    if (ok)
      toastSuccess("Sent to extension", `${vault.entries.length} entries · auto-clears in 5 min.`);
    else toastError("Send failed", "Is the extension installed and the ID correct?");
  };

  const handleLockExtension = async () => {
    if (!extId.trim()) return;
    await ExtensionBridge.lock(extId.trim());
    toastSuccess("Extension locked", "Its cached entries were cleared.");
  };

  // WebDAV backup
  const existingSync = SyncService.getConfig();
  const [syncUrl, setSyncUrl] = useState(existingSync.url ?? "");
  const [syncUser, setSyncUser] = useState(existingSync.username ?? "");
  const [syncPass, setSyncPass] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const handleSyncConnect = async () => {
    if (!syncUrl.trim() || !syncUser.trim()) {
      toastError("Missing details", "Enter URL and username.");
      return;
    }
    SyncService.configure(syncUrl, syncUser, syncPass);
    setSyncBusy(true);
    const r = await SyncService.testConnection();
    setSyncBusy(false);
    if (r.ok) toastSuccess("Connected", "WebDAV reachable and credentials accepted.");
    else toastError("Connection failed", r.reason);
  };

  const handleSyncPush = async () => {
    setSyncBusy(true);
    try {
      const payload = await IPCService.vault.load();
      if (!payload) {
        toastError("Nothing to back up", "No local vault.");
        return;
      }
      const r = await SyncService.push(payload);
      if (r.ok) toastSuccess("Backed up", "Encrypted vault uploaded to WebDAV.");
      else toastError("Backup failed", r.message ?? r.reason);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleSyncPull = async () => {
    if (
      !window.confirm(
        "Restore from WebDAV?\n\nThis OVERWRITES your local vault with the remote copy. You'll re-enter your master password afterwards.",
      )
    )
      return;
    setSyncBusy(true);
    try {
      const { result, payload } = await SyncService.pull();
      if (!result.ok) {
        toastError("Restore failed", result.message ?? result.reason);
        return;
      }
      if (!payload) {
        toastError("Restore failed", "Remote returned empty data.");
        return;
      }
      await IPCService.vault.save(payload);
      lockApplication("manual");
      window.location.reload();
    } finally {
      setSyncBusy(false);
    }
  };

  const persistSettings = (
    patch: Partial<{ theme: Theme; accentColor: string; autoLockMs: number; lockOnHide: boolean }>,
  ) => {
    if (!vault) return;
    const newSettings = { ...vault.settings };
    if (patch.theme) newSettings.theme = patch.theme;
    if (patch.accentColor) newSettings.accentColor = patch.accentColor;
    if (patch.autoLockMs !== undefined) newSettings.autoLockMs = patch.autoLockMs;
    if (patch.lockOnHide !== undefined) newSettings.lockOnHide = patch.lockOnHide;
    // Re-set the vault with new settings so autosave picks it up via isDirty.
    useVaultStore.setState({
      vault: { ...vault, settings: newSettings },
      isDirty: true,
    });
  };

  const handleDeleteVault = async () => {
    if (confirmDelete !== "DELETE") {
      toastError("Confirmation required", "Type DELETE to confirm.");
      return;
    }
    try {
      await IPCService.vault.delete();
      lockApplication("manual");
      window.location.reload();
    } catch (e: unknown) {
      toastError("Delete failed", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {showQR && <VaultBackupQRModal onClose={() => setShowQR(false)} />}
      {showUpgradeKdf && <UpgradeEncryptionModal onClose={() => setShowUpgradeKdf(false)} />}
      {showRecoveryKit && <RecoveryKitModal onClose={() => setShowRecoveryKit(false)} />}

      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-medium">Settings</h1>

        {/* Appearance */}
        <section className="sv-card">
          <h2 className="font-medium mb-4">Appearance</h2>
          <div className="mb-5">
            <label className="sv-label">Theme</label>
            <div className="flex gap-2">
              {THEME_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTheme(value);
                    persistSettings({ theme: value });
                  }}
                  aria-pressed={theme === value}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    theme === value
                      ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="sv-hint mt-1">
              High contrast maximizes text/background contrast for low-vision users.
            </p>
          </div>
          <div className="mb-5">
            <label className="sv-label">Language</label>
            <div className="flex gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  aria-pressed={i18nInstance.language === lang}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    i18nInstance.language === lang
                      ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {LANGUAGE_LABELS[lang]}
                </button>
              ))}
            </div>
            <p className="sv-hint mt-1">
              Only the unlock screen is translated so far — everything past that point is still
              English regardless of this setting.
            </p>
          </div>
          <div>
            <label className="sv-label">Accent color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENTS.map((a) => {
                const active = accentColor.hex.toLowerCase() === a.hex.toLowerCase();
                return (
                  <button
                    key={a.hex}
                    onClick={() => {
                      setAccent(a.hex, a.name);
                      persistSettings({ accentColor: a.hex });
                    }}
                    aria-label={`Accent color ${a.name}`}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${active ? "scale-110 border-[var(--text-primary)]" : "border-transparent hover:scale-105"}`}
                    style={{ background: a.hex }}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="sv-card">
          <h2 className="font-medium mb-4">Security</h2>
          {isLegacyKdf && (
            <div className="mb-5 p-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)]">
              <p className="text-sm text-[var(--text-primary)] mb-2">
                This vault still uses the older PBKDF2-SHA256 key derivation. Upgrade to Argon2id
                for stronger protection against offline brute-force attacks.
              </p>
              <button
                onClick={() => setShowUpgradeKdf(true)}
                className="sv-btn-primary text-sm px-4"
              >
                Upgrade encryption
              </button>
            </div>
          )}
          <div className="mb-5">
            <label className="sv-label">Auto-lock after</label>
            <select
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
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Locks the vault after this much keyboard / mouse inactivity.
            </p>
          </div>
          <label className="flex items-center gap-2 mb-5 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={!!vault?.settings.lockOnHide}
              onChange={(e) => persistSettings({ lockOnHide: e.target.checked })}
              className="rounded border-[var(--border-default)]"
            />
            Lock immediately when switching to another tab or window
          </label>
          <button onClick={() => setShowChangePw(true)} className="sv-btn-secondary w-full mb-2">
            Change master password
          </button>
          <button onClick={() => setShowQR(true)} className="sv-btn-secondary w-full mb-2">
            Export QR backup
          </button>
          <button onClick={() => setShowRecoveryKit(true)} className="sv-btn-secondary w-full">
            Recovery Kit
          </button>
        </section>

        {/* Duress password */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">Duress password</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            A second password that, when entered at unlock, silently wipes the local vault and opens
            an empty decoy. For coercion scenarios.
          </p>
          {duressEnrolled ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--success)]">✓ A duress password is set.</span>
              <button onClick={handleDisableDuress} className="sv-btn-secondary text-sm px-4">
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                className="sv-input w-full"
                type="password"
                placeholder="Duress password (min 6 chars)"
                value={duressPw}
                onChange={(e) => setDuressPw(e.target.value)}
                autoComplete="new-password"
              />
              <input
                className="sv-input w-full"
                type="password"
                placeholder="Confirm duress password"
                value={duressConfirm}
                onChange={(e) => setDuressConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {duressErr && <p className="sv-error">{duressErr}</p>}
              <button
                onClick={handleEnrollDuress}
                disabled={!duressPw || !duressConfirm}
                className="sv-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set duress password
              </button>
              <p className="sv-hint">
                ⚠ Must differ from your master password. Stored as a SHA-256 hash only. Cloud
                backups are not wiped — remove those separately for full protection.
              </p>
            </div>
          )}
        </section>

        {/* Browser extension */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">Browser extension</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            Push a minimal snapshot (title, URL, username, password, TOTP) to the companion Chrome
            extension for autofill. The extension holds it in memory only and auto-clears after 5
            minutes idle.
          </p>
          {hasExtensionSupport ? (
            <>
              <label className="sv-label">Extension ID</label>
              <div className="flex gap-2 mb-3">
                <input
                  className="sv-input flex-1 font-mono text-sm"
                  placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
                  value={extId}
                  onChange={(e) => setExtId(e.target.value)}
                />
                <button onClick={handleSaveExtId} className="sv-btn-secondary px-4">
                  Save
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSendToExtension} className="sv-btn-primary flex-1">
                  Send entries to extension
                </button>
                <button onClick={handleLockExtension} className="sv-btn-secondary px-4">
                  Lock extension
                </button>
              </div>
              <p className="sv-hint mt-2">
                Find the ID at <span className="font-mono">chrome://extensions</span> (Developer
                mode).
              </p>
            </>
          ) : (
            <p className="sv-hint">
              Not available here — the extension bridge needs SecureVault open as a page in Chrome
              or Edge. It doesn't work from the desktop app.
            </p>
          )}
        </section>

        {/* WebDAV backup */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">WebDAV backup</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            Push or pull the <strong>encrypted</strong> vault to a WebDAV server (Nextcloud,
            ownCloud, etc.). The server never sees plaintext. Manual push/pull only — no silent
            overwrite.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <input
              className="sv-input w-full text-sm"
              placeholder="https://dav.example.com/securevault.svault"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="sv-input flex-1 text-sm"
                placeholder="Username"
                value={syncUser}
                onChange={(e) => setSyncUser(e.target.value)}
                autoComplete="off"
              />
              <input
                className="sv-input flex-1 text-sm"
                type="password"
                placeholder="Password / app token"
                value={syncPass}
                onChange={(e) => setSyncPass(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncConnect}
              disabled={syncBusy}
              className="sv-btn-secondary flex-1 disabled:opacity-50"
            >
              {syncBusy ? "…" : "Test / Connect"}
            </button>
            <button
              onClick={() => handleSyncPush()}
              disabled={syncBusy}
              className="sv-btn-secondary px-4 disabled:opacity-50"
            >
              Push ↑
            </button>
            <button
              onClick={handleSyncPull}
              disabled={syncBusy}
              className="sv-btn-secondary px-4 disabled:opacity-50"
            >
              Pull ↓
            </button>
          </div>
          <p className="sv-hint mt-2">
            With 2FA on Nextcloud, use an <strong>app password</strong>. Credentials stay in session
            memory only — re-enter after restart.
          </p>
        </section>

        {/* Desktop app updates */}
        {hasDesktopUpdateSupport && (
          <section className="sv-card">
            <h2 className="font-medium mb-1">App updates</h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              Checks GitHub Releases for a newer version. Nothing happens automatically — this only
              runs when you click the button, and nothing downloads or installs without another
              explicit click after that.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheckForUpdates}
                disabled={
                  updateStatus?.status === "checking" || updateStatus?.status === "downloading"
                }
                className="sv-btn-secondary disabled:opacity-50"
              >
                Check for updates
              </button>
              {updateStatus?.status === "checking" && <span className="sv-hint">Checking…</span>}
              {updateStatus?.status === "not-available" && (
                <span className="sv-hint">You're on the latest version.</span>
              )}
              {updateStatus?.status === "error" && (
                <span className="sv-hint text-[var(--danger)]">{updateStatus.message}</span>
              )}
              {updateStatus?.status === "available" && (
                <button onClick={handleDownloadUpdate} className="sv-btn-primary">
                  Download v{updateStatus.version}
                </button>
              )}
              {updateStatus?.status === "downloading" && (
                <span className="sv-hint">Downloading… {updateStatus.percent}%</span>
              )}
              {updateStatus?.status === "downloaded" && (
                <button onClick={handleRestartAndInstall} className="sv-btn-primary">
                  Restart & install v{updateStatus.version}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Danger zone */}
        <section className="sv-card border-[var(--danger)]/30">
          <h2 className="font-medium mb-2 text-[var(--danger)]">Danger zone</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-3">
            Permanently delete the local vault. Cloud backups are not touched.
          </p>
          <input
            className="sv-input w-full mb-3"
            placeholder="Type DELETE to enable the button"
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
          />
          <button
            onClick={handleDeleteVault}
            disabled={confirmDelete !== "DELETE"}
            className="sv-btn-danger w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete local vault
          </button>
        </section>
      </div>
    </>
  );
}

export default SettingsPage;
