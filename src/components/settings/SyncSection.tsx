import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { IPCService } from "../../services/ipc.service";
import { SyncService } from "../../services/sync.service";
import { RemoteUnlockModal } from "../modals/RemoteUnlock.modal";
import { ConflictResolutionModal } from "../modals/ConflictResolution.modal";
import type { VaultData } from "../../core/vault/schema";
import { SettingsSection } from "./shared";

export function SyncSection() {
  const { toastError, toastSuccess } = useUIStore();
  const vault = useVaultStore((s) => s.vault);
  const existing = SyncService.getConfig();
  const [url, setUrl] = useState(existing.url ?? "");
  const [user, setUser] = useState(existing.username ?? "");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  // Pull flow: download → RemoteUnlockModal → ConflictResolutionModal → the
  // winner replaces the open vault and autosave re-encrypts it under the
  // CURRENT session keys. Nothing is overwritten before the user decides.
  const [pulled, setPulled] = useState<string | null>(null);
  const [remote, setRemote] = useState<VaultData | null>(null);

  const connect = async () => {
    if (!url.trim() || !user.trim())
      return toastError("Missing details", "Enter URL and username.");
    SyncService.configure(url, user, pass);
    setBusy(true);
    const r = await SyncService.testConnection();
    setBusy(false);
    if (r.ok) toastSuccess("Connected", "WebDAV reachable and credentials accepted.");
    else toastError("Connection failed", r.reason);
  };

  const push = async () => {
    setBusy(true);
    try {
      const payload = await IPCService.vault.load();
      if (!payload) return toastError("Nothing to back up", "No local vault.");
      const r = await SyncService.push(payload);
      if (r.ok) toastSuccess("Backed up", "Encrypted vault uploaded to WebDAV.");
      else toastError("Backup failed", r.message ?? r.reason);
    } finally {
      setBusy(false);
    }
  };

  const pull = async () => {
    setBusy(true);
    try {
      const { result, payload } = await SyncService.pull();
      if (!result.ok) return toastError("Restore failed", result.message ?? result.reason);
      if (!payload) return toastError("Restore failed", "Remote returned empty data.");
      setPulled(payload);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRemote(null);
    setPulled(null);
  };

  const resolve = (winner: VaultData, strategy: "local" | "remote" | "merge") => {
    reset();
    if (strategy === "local")
      return toastSuccess("Kept local vault", "Push to update the WebDAV copy.");
    useVaultStore.setState({
      vault: { ...winner, settings: vault?.settings ?? winner.settings },
      isDirty: true,
    });
    toastSuccess(
      strategy === "merge" ? "Vaults merged" : "Remote vault applied",
      "Saved locally. Push to update the WebDAV copy.",
    );
  };

  return (
    <SettingsSection
      id="sync"
      title="WebDAV backup"
      description={
        <>
          Push or pull the <strong>encrypted</strong> vault to a WebDAV server (Nextcloud, ownCloud,
          etc.). The server never sees plaintext. Pulling opens a merge view — nothing is
          overwritten silently.
        </>
      }
    >
      {pulled && !remote && (
        <RemoteUnlockModal payload={pulled} onOpened={setRemote} onCancel={reset} />
      )}
      {remote && vault && (
        <ConflictResolutionModal
          local={vault}
          remote={remote}
          onResolve={resolve}
          onCancel={reset}
        />
      )}
      <div className="flex flex-col gap-2 mb-3">
        <input
          className="sv-input w-full text-sm"
          aria-label="WebDAV file URL"
          placeholder="https://dav.example.com/securevault.svault"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="sv-input flex-1 text-sm"
            aria-label="WebDAV username"
            placeholder="Username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="off"
          />
          <input
            className="sv-input flex-1 text-sm"
            type="password"
            aria-label="WebDAV password or app token"
            placeholder="Password / app token"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={connect}
          disabled={busy}
          className="sv-btn-secondary flex-1 disabled:opacity-50"
        >
          {busy ? "…" : "Test / Connect"}
        </button>
        <button
          onClick={push}
          disabled={busy}
          className="sv-btn-secondary px-4 disabled:opacity-50"
        >
          Push ↑
        </button>
        <button
          onClick={pull}
          disabled={busy}
          className="sv-btn-secondary px-4 disabled:opacity-50"
        >
          Pull ↓
        </button>
      </div>
      <p className="sv-hint mt-2">
        With 2FA on Nextcloud, use an <strong>app password</strong>. Credentials stay in session
        memory only — re-enter after restart.
      </p>
    </SettingsSection>
  );
}
