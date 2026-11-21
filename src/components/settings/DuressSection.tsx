import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { DuressService } from "../../services/duress.service";
import { SettingsSection } from "./shared";

export function DuressSection() {
  const { t } = useTranslation();
  const { toastSuccess } = useUIStore();
  const [enrolled, setEnrolled] = useState(() => DuressService.isEnrolled());
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const enroll = async () => {
    setErr("");
    if (pw !== confirm) {
      setErr(t("settings.duress.mismatch"));
      return;
    }
    try {
      await DuressService.enroll(pw, "");
      setEnrolled(true);
      setPw("");
      setConfirm("");
      toastSuccess(t("settings.duress.setToast"), t("settings.duress.setToastBody"));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("settings.duress.failed"));
    }
  };

  const disable = () => {
    DuressService.disenroll();
    setEnrolled(false);
    toastSuccess(t("settings.duress.removedToast"), "");
  };

  return (
    <SettingsSection
      id="duress"
      title={t("settings.duress.title")}
      description={t("settings.duress.description")}
    >
      {enrolled ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-(--success)">{t("settings.duress.isSet")}</span>
          <button onClick={disable} className="sv-btn-secondary text-sm px-4">
            {t("settings.duress.remove")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            className="sv-input w-full"
            type="password"
            aria-label={t("settings.duress.password")}
            placeholder={t("settings.duress.passwordPlaceholder")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className="sv-input w-full"
            type="password"
            aria-label={t("settings.duress.confirm")}
            placeholder={t("settings.duress.confirm")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {err && (
            <p className="sv-error" role="alert">
              {err}
            </p>
          )}
          <button
            onClick={enroll}
            disabled={!pw || !confirm}
            className="sv-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("settings.duress.set")}
          </button>
          <p className="sv-hint">{t("settings.duress.hint")}</p>
        </div>
      )}
    </SettingsSection>
  );
}
