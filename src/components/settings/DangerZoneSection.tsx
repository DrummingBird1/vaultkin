import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { IPCService } from "../../services/ipc.service";
import { lockApplication } from "../../store";
import { SettingsSection } from "./shared";

export function DangerZoneSection() {
  const { t } = useTranslation();
  const { toastError } = useUIStore();
  const [typed, setTyped] = useState("");

  const del = async () => {
    if (typed !== "DELETE")
      return toastError(
        t("settings.danger.confirmRequired"),
        t("settings.danger.confirmRequiredBody"),
      );
    try {
      await IPCService.vault.delete();
      lockApplication("manual");
      window.location.reload();
    } catch (e: unknown) {
      toastError(t("settings.danger.failed"), e instanceof Error ? e.message : "");
    }
  };

  return (
    <SettingsSection
      id="danger"
      title={t("settings.danger.title")}
      tone="danger"
      description={t("settings.danger.description")}
    >
      <input
        className="sv-input w-full mb-3"
        aria-label={t("settings.danger.typeDelete")}
        placeholder={t("settings.danger.placeholder")}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button
        onClick={del}
        disabled={typed !== "DELETE"}
        className="sv-btn-danger w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("settings.danger.delete")}
      </button>
    </SettingsSection>
  );
}
