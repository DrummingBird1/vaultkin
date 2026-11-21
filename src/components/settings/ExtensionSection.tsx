import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { ExtensionBridge } from "../../services/extension-bridge.service";
import { EXTENSION_ID_STORAGE_KEY } from "../../constants";
import { SettingsSection } from "./shared";

export function ExtensionSection() {
  const { t } = useTranslation();
  const { toastError, toastSuccess } = useUIStore();
  const entries = useVaultStore((s) => s.vault?.entries);
  // chrome.runtime.sendMessage only exists when the app runs as a page in a
  // Chromium browser; the Electron build has no such API.
  const supported = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
  const [extId, setExtId] = useState(
    () =>
      (typeof localStorage !== "undefined" && localStorage.getItem(EXTENSION_ID_STORAGE_KEY)) || "",
  );

  const save = () => {
    localStorage.setItem(EXTENSION_ID_STORAGE_KEY, extId.trim());
    toastSuccess(t("settings.extension.saved"), "");
  };

  const send = async () => {
    if (!extId.trim())
      return toastError(t("settings.extension.noId"), t("settings.extension.noIdBody"));
    if (!entries?.length)
      return toastError(t("settings.extension.nothing"), t("settings.extension.nothingBody"));
    const ok = await ExtensionBridge.syncEntries(extId.trim(), entries);
    if (ok)
      toastSuccess(
        t("settings.extension.sent"),
        t("settings.extension.sentBody", { count: entries.length }),
      );
    else toastError(t("settings.extension.failed"), t("settings.extension.failedBody"));
  };

  const lock = async () => {
    if (!extId.trim()) return;
    await ExtensionBridge.lock(extId.trim());
    toastSuccess(t("settings.extension.locked"), t("settings.extension.lockedBody"));
  };

  return (
    <SettingsSection
      id="extension"
      title={t("settings.extension.title")}
      description={t("settings.extension.description")}
    >
      {supported ? (
        <>
          <label className="sv-label" htmlFor="ext-id">
            {t("settings.extension.id")}
          </label>
          <div className="flex gap-2 mb-3">
            <input
              id="ext-id"
              className="sv-input flex-1 font-mono text-sm"
              placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
              value={extId}
              onChange={(e) => setExtId(e.target.value)}
            />
            <button onClick={save} className="sv-btn-secondary px-4">
              {t("settings.extension.save")}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={send} className="sv-btn-primary flex-1">
              {t("settings.extension.send")}
            </button>
            <button onClick={lock} className="sv-btn-secondary px-4">
              {t("settings.extension.lock")}
            </button>
          </div>
          <p className="sv-hint mt-2">{t("settings.extension.findId")}</p>
        </>
      ) : (
        <p className="sv-hint">{t("settings.extension.unavailable")}</p>
      )}
    </SettingsSection>
  );
}
