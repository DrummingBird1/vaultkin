/**
 * @file src/pages/Settings.page.tsx
 * Theme · auto-lock timer · change master password · danger zone (delete vault).
 */
import React, { useState } from "react";
import { useUIStore }      from "../store/ui.store";
import { useSessionStore } from "../store/session.store";
import { useVaultStore }   from "../store/vault.store";
import { ChangePasswordModal } from "../components/modals/ChangePassword.modal";
import { VaultBackupQRModal } from "../components/modals/VaultBackupQR.modal";
import { IPCService }      from "../services/ipc.service";
import { DuressService }   from "../services/duress.service";
import { ExtensionBridge } from "../services/extension-bridge.service";
import { SyncService }     from "../services/sync.service";
import { lockApplication } from "../store";

const EXT_ID_KEY = "sv_extension_id";

const ACCENTS = [
  { hex: "#6366F1", name: "Indigo" },
  { hex: "#8B5CF6", name: "Violet" },
  { hex: "#EC4899", name: "Pink" },
  { hex: "#10B981", name: "Emerald" },
  { hex: "#F59E0B", name: "Amber" },
  { hex: "#EF4444", name: "Red" },
];

const LOCK_OPTIONS = [
  { label: "1 minute",   value: 60_000 },
  { label: "5 minutes",  value: 5 * 60_000 },
  { label: "15 minutes", value: 15 * 60_000 },
  { label: "1 hour",     value: 60 * 60_000 },
  { label: "Never",      value: 0 },
];

export function SettingsPage() {
  const { theme, setTheme, accentColor, setAccent, toastError, toastSuccess } = useUIStore();
  const { autoLockMs, setAutoLockMs } = useSessionStore();
  const { vault } = useVaultStore();
  const [showChangePw, setShowChangePw] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  // Duress enrollment state
  const [duressEnrolled, setDuressEnrolled] = useState(() => DuressService.isEnrolled());
  const [duressPw, setDuressPw]       = useState("");
  const [duressConfirm, setDuressConfirm] = useState("");
  const [duressErr, setDuressErr]     = useState("");

  const handleEnrollDuress = async () => {
    setDuressErr("");
    if (duressPw !== duressConfirm) { setDuressErr("Passwords do not match."); return; }
    try {
      await DuressService.enroll(duressPw, "");
      setDuressEnrolled(true);
      setDuressPw(""); setDuressConfirm("");
      toastSuccess("Duress password set", "Entering it will wipe the local vault and show a decoy.");
    } catch (e: any) {
      setDuressErr(e?.message ?? "Failed to set duress password.");
    }
  };

  const handleDisableDuress = () => {
    DuressService.disenroll();
    setDuressEnrolled(false);
    toastSuccess("Duress password removed", "");
  };

  // Browser-extension bridge
  const [extId, setExtId] = useState(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem(EXT_ID_KEY)) || "");

  const handleSaveExtId = () => {
    localStorage.setItem(EXT_ID_KEY, extId.trim());
    toastSuccess("Extension ID saved", "");
  };

  const handleSendToExtension = async () => {
    if (!extId.trim()) { toastError("No extension ID", "Enter your extension ID first."); return; }
    if (!vault?.entries.length) { toastError("Nothing to send", "Vault is empty."); return; }
    const ok = await ExtensionBridge.syncEntries(extId.trim(), vault.entries);
    if (ok) toastSuccess("Sent to extension", `${vault.entries.length} entries · auto-clears in 5 min.`);
    else    toastError("Send failed", "Is the extension installed and the ID correct?");
  };

  const handleLockExtension = async () => {
    if (!extId.trim()) return;
    await ExtensionBridge.lock(extId.trim());
    toastSuccess("Extension locked", "Its cached entries were cleared.");
  };

  // WebDAV backup
  const existingSync = SyncService.getConfig();
  const [syncUrl, setSyncUrl]   = useState(existingSync.url ?? "");
  const [syncUser, setSyncUser] = useState(existingSync.username ?? "");
  const [syncPass, setSyncPass] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const handleSyncConnect = async () => {
    if (!syncUrl.trim() || !syncUser.trim()) { toastError("Missing details", "Enter URL and username."); return; }
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
      if (!payload) { toastError("Nothing to back up", "No local vault."); return; }
      const r = await SyncService.push(payload);
      if (r.ok) toastSuccess("Backed up", "Encrypted vault uploaded to WebDAV.");
      else toastError("Backup failed", r.message ?? r.reason);
    } finally { setSyncBusy(false); }
  };

  const handleSyncPull = async () => {
    if (!window.confirm("Restore from WebDAV?\n\nThis OVERWRITES your local vault with the remote copy. You'll re-enter your master password afterwards.")) return;
    setSyncBusy(true);
    try {
      const { result, payload } = await SyncService.pull();
      if (!result.ok) { toastError("Restore failed", result.message ?? result.reason); return; }
      if (!payload) { toastError("Restore failed", "Remote returned empty data."); return; }
      await IPCService.vault.save(payload);
      lockApplication("manual");
      window.location.reload();
    } finally { setSyncBusy(false); }
  };

  const persistSettings = (patch: Partial<{ theme: "dark" | "light"; accentColor: string; autoLockMs: number }>) => {
    if (!vault) return;
    const newSettings = { ...vault.settings };
    if (patch.theme)        newSettings.theme = patch.theme;
    if (patch.accentColor)  newSettings.accentColor = patch.accentColor;
    if (patch.autoLockMs !== undefined) newSettings.autoLockMs = patch.autoLockMs;
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
    } catch (e: any) {
      toastError("Delete failed", e?.message ?? "Unknown error");
    }
  };

  return (
    <>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {showQR && <VaultBackupQRModal onClose={() => setShowQR(false)} />}

      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-display font-medium">Settings</h1>

        {/* Appearance */}
        <section className="sv-card">
          <h2 className="font-medium mb-4">Appearance</h2>
          <div className="mb-5">
            <label className="sv-label">Theme</label>
            <div className="flex gap-2">
              {(["dark","light"] as const).map(t => (
                <button key={t} onClick={() => { setTheme(t); persistSettings({ theme: t }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    theme === t ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]" : "border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                  }`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="sv-label">Accent color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENTS.map(a => {
                const active = accentColor.hex.toLowerCase() === a.hex.toLowerCase();
                return (
                  <button key={a.hex} onClick={() => { setAccent(a.hex, a.name); persistSettings({ accentColor: a.hex }); }}
                    aria-label={`Accent color ${a.name}`}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${active ? "scale-110 border-[var(--text-primary)]" : "border-transparent hover:scale-105"}`}
                    style={{ background: a.hex }} />
                );
              })}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="sv-card">
          <h2 className="font-medium mb-4">Security</h2>
          <div className="mb-5">
            <label className="sv-label">Auto-lock after</label>
            <select className="sv-input w-full" value={autoLockMs}
              onChange={e => { const v = +e.target.value; setAutoLockMs(v); persistSettings({ autoLockMs: v }); }}>
              {LOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Locks the vault after this much keyboard / mouse inactivity.
            </p>
          </div>
          <button onClick={() => setShowChangePw(true)} className="sv-btn-secondary w-full mb-2">
            Change master password
          </button>
          <button onClick={() => setShowQR(true)} className="sv-btn-secondary w-full">
            Export QR backup
          </button>
        </section>

        {/* Duress password */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">Duress password</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            A second password that, when entered at unlock, silently wipes the
            local vault and opens an empty decoy. For coercion scenarios.
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
              <input className="sv-input w-full" type="password" placeholder="Duress password (min 6 chars)"
                value={duressPw} onChange={e => setDuressPw(e.target.value)} autoComplete="new-password" />
              <input className="sv-input w-full" type="password" placeholder="Confirm duress password"
                value={duressConfirm} onChange={e => setDuressConfirm(e.target.value)} autoComplete="new-password" />
              {duressErr && <p className="sv-error">{duressErr}</p>}
              <button onClick={handleEnrollDuress} disabled={!duressPw || !duressConfirm}
                className="sv-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed">
                Set duress password
              </button>
              <p className="sv-hint">
                ⚠ Must differ from your master password. Stored as a SHA-256 hash only.
                Cloud backups are not wiped — remove those separately for full protection.
              </p>
            </div>
          )}
        </section>

        {/* Browser extension */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">Browser extension</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            Push a minimal snapshot (title, URL, username, password, TOTP) to the
            companion Chrome extension for autofill. The extension holds it in
            memory only and auto-clears after 5 minutes idle.
          </p>
          <label className="sv-label">Extension ID</label>
          <div className="flex gap-2 mb-3">
            <input className="sv-input flex-1 font-mono text-sm" placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
              value={extId} onChange={e => setExtId(e.target.value)} />
            <button onClick={handleSaveExtId} className="sv-btn-secondary px-4">Save</button>
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
            Find the ID at <span className="font-mono">chrome://extensions</span> (Developer mode).
          </p>
        </section>

        {/* WebDAV backup */}
        <section className="sv-card">
          <h2 className="font-medium mb-1">WebDAV backup</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            Push or pull the <strong>encrypted</strong> vault to a WebDAV server
            (Nextcloud, ownCloud, etc.). The server never sees plaintext. Manual
            push/pull only — no silent overwrite.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <input className="sv-input w-full text-sm" placeholder="https://dav.example.com/securevault.svault"
              value={syncUrl} onChange={e => setSyncUrl(e.target.value)} />
            <div className="flex gap-2">
              <input className="sv-input flex-1 text-sm" placeholder="Username"
                value={syncUser} onChange={e => setSyncUser(e.target.value)} autoComplete="off" />
              <input className="sv-input flex-1 text-sm" type="password" placeholder="Password / app token"
                value={syncPass} onChange={e => setSyncPass(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSyncConnect} disabled={syncBusy} className="sv-btn-secondary flex-1 disabled:opacity-50">
              {syncBusy ? "…" : "Test / Connect"}
            </button>
            <button onClick={handleSyncPush} disabled={syncBusy} className="sv-btn-secondary px-4 disabled:opacity-50">
              Push ↑
            </button>
            <button onClick={handleSyncPull} disabled={syncBusy} className="sv-btn-secondary px-4 disabled:opacity-50">
              Pull ↓
            </button>
          </div>
          <p className="sv-hint mt-2">
            With 2FA on Nextcloud, use an <strong>app password</strong>. Credentials stay in
            session memory only — re-enter after restart.
          </p>
        </section>

        {/* Danger zone */}
        <section className="sv-card border-[var(--danger)]/30">
          <h2 className="font-medium mb-2 text-[var(--danger)]">Danger zone</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-3">
            Permanently delete the local vault. Cloud backups are not touched.
          </p>
          <input className="sv-input w-full mb-3" placeholder='Type DELETE to enable the button'
            value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} />
          <button onClick={handleDeleteVault} disabled={confirmDelete !== "DELETE"}
            className="sv-btn-danger w-full disabled:opacity-40 disabled:cursor-not-allowed">
            Delete local vault
          </button>
        </section>
      </div>
    </>
  );
}

export default SettingsPage;
