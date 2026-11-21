import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { IPCService } from "../../services/ipc.service";
import { SyncService, InsecureSyncUrlError } from "../../services/sync.service";
import { RemoteUnlockModal } from "../modals/RemoteUnlock.modal";
import { ConflictResolutionModal } from "../modals/ConflictResolution.modal";
import type { VaultData } from "../../core/vault/schema";
import { SettingsSection } from "./shared";
import { FolderSyncService, useFolderSyncStore } from "../../services/folder-sync.service";
import { AutosaveService } from "../../services/autosave.service";

export function SyncSection() {
  const { t } = useTranslation();
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
  const [pullSource, setPullSource] = useState<"webdav" | "folder">("webdav");
  const folder = useFolderSyncStore();
  useEffect(() => {
    void FolderSyncService.refresh();
  }, []);

  const pullFolder = async () => {
    const payload = await FolderSyncService.pull();
    if (!payload) return toastError(t("settings.sync.folder.empty"));
    setPullSource("folder");
    setPulled(payload);
  };

  const connect = async () => {
    if (!url.trim() || !user.trim())
      return toastError(t("settings.sync.missing"), t("settings.sync.missingBody"));
    try {
      SyncService.configure(url, user, pass);
    } catch (err) {
      if (err instanceof InsecureSyncUrlError)
        return toastError(t("settings.sync.httpsOnly"), t("settings.sync.httpsOnlyBody"));
      throw err;
    }
    setPass("");
    setBusy(true);
    const r = await SyncService.testConnection();
    setBusy(false);
    if (r.ok) toastSuccess(t("settings.sync.connected"), t("settings.sync.connectedBody"));
    else toastError(t("settings.sync.connectFailed"), r.reason);
  };

  const push = async () => {
    setBusy(true);
    try {
      const payload = await IPCService.vault.load();
      if (!payload) return toastError(t("settings.sync.nothing"), t("settings.sync.nothingBody"));
      const r = await SyncService.push(payload);
      if (r.ok) toastSuccess(t("settings.sync.pushed"), t("settings.sync.pushedBody"));
      else toastError(t("settings.sync.pushFailed"), r.message ?? r.reason);
    } finally {
      setBusy(false);
    }
  };

  const pull = async () => {
    setBusy(true);
    try {
      const { result, payload } = await SyncService.pull();
      if (!result.ok)
        return toastError(t("settings.sync.pullFailed"), result.message ?? result.reason);
      if (!payload)
        return toastError(t("settings.sync.pullFailed"), t("settings.sync.emptyRemote"));
      setPullSource("webdav");
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
    if (pullSource === "folder") {
      // The folder copy has now been seen; write the resolved vault back once
      // autosave has stored it.
      setTimeout(async () => {
        await AutosaveService.flushNow();
        const p = await IPCService.vault.load();
        if (p) await FolderSyncService.push(p);
      }, 0);
    }
    if (strategy === "local")
      return toastSuccess(t("settings.sync.keptLocal"), t("settings.sync.pushToUpdate"));
    useVaultStore.setState({
      vault: { ...winner, settings: vault?.settings ?? winner.settings },
      isDirty: true,
    });
    toastSuccess(
      strategy === "merge" ? t("settings.sync.merged") : t("settings.sync.appliedRemote"),
      t("settings.sync.savedLocally"),
    );
  };

  return (
    <SettingsSection
      id="sync"
      title={t("settings.sync.title")}
      description={t("settings.sync.description")}
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
          aria-label={t("settings.sync.url")}
          placeholder="https://dav.example.com/securevault.svault"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="sv-input flex-1 text-sm"
            aria-label={t("settings.sync.username")}
            placeholder={t("settings.sync.usernamePlaceholder")}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="off"
          />
          <input
            className="sv-input flex-1 text-sm"
            type="password"
            aria-label={t("settings.sync.password")}
            placeholder={t("settings.sync.passwordPlaceholder")}
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
          {busy ? "…" : t("settings.sync.connect")}
        </button>
        <button
          onClick={push}
          disabled={busy}
          className="sv-btn-secondary px-4 disabled:opacity-50"
        >
          {t("settings.sync.push")}
        </button>
        <button
          onClick={pull}
          disabled={busy}
          className="sv-btn-secondary px-4 disabled:opacity-50"
        >
          {t("settings.sync.pull")}
        </button>
      </div>
      <p className="sv-hint mt-2">{t("settings.sync.hint")}</p>

      {FolderSyncService.available() && (
        <div className="mt-6 pt-4 border-t border-(--border-subtle)">
          <h3 className="font-medium text-sm mb-1">{t("settings.sync.folder.title")}</h3>
          <p className="text-xs text-(--text-tertiary) mb-3">
            {t("settings.sync.folder.description")}
          </p>
          {folder.dir && (
            <p
              dir="ltr"
              data-testid="sync-folder"
              className="text-xs font-mono text-(--text-secondary) mb-2 break-all"
            >
              {folder.dir}
            </p>
          )}
          {folder.state === "conflict" && (
            <p className="sv-error mb-2">{t("settings.sync.folder.conflict")}</p>
          )}
          {folder.state === "error" && (
            <p className="sv-error mb-2">{t("settings.sync.folder.error")}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void FolderSyncService.choose()}
              className="sv-btn-secondary flex-1"
            >
              {folder.dir ? t("settings.sync.folder.change") : t("settings.sync.folder.choose")}
            </button>
            {folder.dir && (
              <>
                <button onClick={() => void pullFolder()} className="sv-btn-secondary px-4">
                  {t("settings.sync.folder.pull")}
                </button>
                <button
                  onClick={() => void FolderSyncService.stop()}
                  className="sv-btn-secondary px-4"
                >
                  {t("settings.sync.folder.stop")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
