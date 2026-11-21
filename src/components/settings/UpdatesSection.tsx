import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from "react";
import type { UpdateStatus } from "../../types/electron-bridge";
import { SettingsSection } from "./shared";

/** Desktop-only: window.electron exists only in the Electron build. Manual trigger only. */
export function UpdatesSection() {
  const { t } = useTranslation();
  const supported = "electron" in window && !!window.electron?.updates;
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!supported) return;
    return window.electron!.updates.onStatus(setStatus);
  }, [supported]);

  if (!supported) return null;

  const fail = (e: unknown) =>
    setStatus({ status: "error", message: e instanceof Error ? e.message : String(e) });
  const check = () => {
    setStatus({ status: "checking" });
    window.electron?.updates.check().catch(fail);
  };

  return (
    <SettingsSection
      id="updates"
      title={t("settings.updates.title")}
      description={t("settings.updates.description")}
    >
      <div className="flex items-center gap-3" aria-live="polite">
        <button
          onClick={check}
          disabled={status?.status === "checking" || status?.status === "downloading"}
          className="sv-btn-secondary disabled:opacity-50"
        >
          {t("settings.updates.check")}
        </button>
        {status?.status === "checking" && (
          <span className="sv-hint">{t("settings.updates.checking")}</span>
        )}
        {status?.status === "not-available" && (
          <span className="sv-hint">{t("settings.updates.latest")}</span>
        )}
        {status?.status === "error" && (
          <span className="sv-hint text-(--danger)">{status.message}</span>
        )}
        {status?.status === "available" && (
          <button
            onClick={() => window.electron?.updates.download().catch(fail)}
            className="sv-btn-primary"
          >
            {t("settings.updates.download", { version: status.version })}
          </button>
        )}
        {status?.status === "downloading" && (
          <span className="sv-hint">
            {t("settings.updates.downloading", { percent: status.percent })}
          </span>
        )}
        {status?.status === "downloaded" && (
          <button
            onClick={() => window.electron?.updates.quitAndInstall()}
            className="sv-btn-primary"
          >
            {t("settings.updates.install", { version: status.version })}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
