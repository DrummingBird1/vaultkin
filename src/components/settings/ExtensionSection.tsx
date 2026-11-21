import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { Unplug } from "lucide-react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { ExtensionBridge } from "../../services/extension-bridge.service";
import { BridgeService } from "../../services/bridge.service";
import { EXTENSION_ID_STORAGE_KEY } from "../../constants";
import { Button } from "../ui/Button";
import { describeExtensionOrigin } from "../../lib/browser-origin";
import { SettingsSection } from "./shared";

const EXT_ID = /^[a-p]{32}$/;
const NO_PAIRINGS: never[] = [];

export function ExtensionSection() {
  const { t, i18n } = useTranslation();
  const { toastError, toastSuccess } = useUIStore();
  const entries = useVaultStore((s) => s.vault?.entries);
  // Stable fallback: a fresh [] per render would make the store selector loop.
  const paired = useVaultStore((s) => s.vault?.bridge?.paired) ?? NO_PAIRINGS;
  // Desktop app: native-messaging bridge (ADR 0007).
  const desktopBridge = typeof window !== "undefined" ? window.electron?.bridge : undefined;
  // Web build opened in a Chromium tab: legacy snapshot push (externally_connectable).
  const webPush = !desktopBridge && typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
  const [extId, setExtId] = useState(
    () =>
      (typeof localStorage !== "undefined" && localStorage.getItem(EXTENSION_ID_STORAGE_KEY)) || "",
  );
  const [installing, setInstalling] = useState(false);
  const when = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(iso),
        )
      : "—";

  const save = () => {
    localStorage.setItem(EXTENSION_ID_STORAGE_KEY, extId.trim());
    toastSuccess(t("settings.extension.saved"), "");
  };

  const install = async () => {
    const id = extId.trim();
    if (!EXT_ID.test(id))
      return toastError(t("settings.extension.noId"), t("settings.extension.noIdBody"));
    localStorage.setItem(EXTENSION_ID_STORAGE_KEY, id);
    setInstalling(true);
    try {
      const r = await desktopBridge!.installHost([id]);
      toastSuccess(t("bridge.settings.installed", { count: r.registered }), "");
    } catch (e) {
      toastError(t("bridge.settings.installFailed"), e instanceof Error ? e.message : "");
    } finally {
      setInstalling(false);
    }
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

  const idField = (
    <>
      <label className="sv-label" htmlFor="ext-id">
        {t("settings.extension.id")}
      </label>
      <div className="flex gap-2 mb-1">
        <input
          id="ext-id"
          dir="ltr"
          className="sv-input flex-1 font-mono text-sm"
          placeholder="abcdefghijklmnopabcdefghijklmnop"
          value={extId}
          onChange={(e) => setExtId(e.target.value)}
          aria-describedby="ext-id-hint"
        />
        {!desktopBridge && (
          <button onClick={save} className="sv-btn-secondary px-4">
            {t("settings.extension.save")}
          </button>
        )}
      </div>
      <p id="ext-id-hint" className="sv-hint mb-3">
        {t("settings.extension.findId")}
      </p>
    </>
  );

  return (
    <SettingsSection
      id="extension"
      title={t("settings.extension.title")}
      description={t("settings.extension.description")}
    >
      {desktopBridge ? (
        <>
          {idField}
          <Button variant="primary" className="w-full" busy={installing} onClick={install}>
            {t("bridge.settings.connect")}
          </Button>
          <p className="sv-hint mt-2">{t("bridge.settings.connectHint")}</p>

          <h3 className="text-sm font-medium mt-6 mb-2">{t("bridge.settings.title")}</h3>
          {paired.length === 0 ? (
            <p className="sv-hint">{t("bridge.settings.none")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {paired.map((p) => (
                <li
                  key={p.origin}
                  className="flex items-center gap-3 p-3 rounded-xl border border-(--border-subtle)"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate" dir="ltr">
                      {describeExtensionOrigin(p.origin)}
                    </p>
                    <p className="text-xs text-(--text-tertiary)">
                      {t("bridge.settings.pairedOn", { when: when(p.pairedAt) })}
                      {p.lastSeenAt
                        ? ` · ${t("bridge.settings.lastSeen", { when: when(p.lastSeenAt) })}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    icon={<Unplug className="w-3.5 h-3.5" />}
                    onClick={() => {
                      BridgeService.unpair(p.origin);
                      toastSuccess(t("bridge.settings.disconnected"), "");
                    }}
                  >
                    {t("bridge.settings.disconnect")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : webPush ? (
        <>
          {idField}
          <div className="flex gap-2">
            <button onClick={send} className="sv-btn-primary flex-1">
              {t("settings.extension.send")}
            </button>
            <button onClick={lock} className="sv-btn-secondary px-4">
              {t("settings.extension.lock")}
            </button>
          </div>
        </>
      ) : (
        <p className="sv-hint">{t("settings.extension.unavailable")}</p>
      )}
    </SettingsSection>
  );
}
