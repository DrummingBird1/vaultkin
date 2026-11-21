import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { IPCService } from "../../services/ipc.service";
import { SyncService, InsecureSyncUrlError } from "../../services/sync.service";
import { RemoteUnlockModal } from "../modals/RemoteUnlock.modal";
import { ConflictResolutionModal } from "../modals/ConflictResolution.modal";
import type { VaultData } from "../../core/vault/schema";
import { SettingsSection } from "./shared";

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
    </SettingsSection>
  );
}
