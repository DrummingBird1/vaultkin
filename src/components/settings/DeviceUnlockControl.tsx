/**
 * @file DeviceUnlockControl.tsx
 * Settings → Security: "Remember this device" (desktop only). Turning it on
 * asks for the master password once, to derive the key that the OS keystore
 * will hold (see device-unlock.service.ts).
 */
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IPCService } from "../../services/ipc.service";
import { DeviceUnlockService, type DeviceUnlockState } from "../../services/device-unlock.service";
import { WrongPasswordError } from "../../core/errors";
import { useUIStore } from "../../store/ui.store";
import { Modal } from "../ui/Modal";
import { IconClose } from "../icons";

export function DeviceUnlockControl() {
  const { t, i18n } = useTranslation();
  const { toastSuccess } = useUIStore();
  const [state, setState] = useState<DeviceUnlockState | null>(null);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    const stored = await IPCService.vault.load().catch(() => null);
    setState(await DeviceUnlockService.state(stored).catch(() => null));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!state || state.kind === "unsupported") return null;

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking(true);
    setError("");
    try {
      const stored = await IPCService.vault.load();
      if (!stored || !(await DeviceUnlockService.enable(stored, password))) {
        setError(t("settings.security.device.failed"));
        return;
      }
      setAsking(false);
      toastSuccess(t("settings.security.device.enabled"));
      await refresh();
    } catch (err) {
      setError(
        err instanceof WrongPasswordError
          ? t("upgradeEncryption.wrongPassword")
          : t("settings.security.device.failed"),
      );
    } finally {
      setPassword("");
      setWorking(false);
    }
  };

  const isMac = window.electron?.platform === "darwin";
  return (
    <div className="mb-5">
      {asking && (
        <Modal
          onClose={() => setAsking(false)}
          dismissable={!working}
          className="max-w-sm"
          label={t("settings.security.device.title")}
          onSubmit={enable}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="sv-modal-title">{t("settings.security.device.title")}</h2>
            <button
              type="button"
              onClick={() => setAsking(false)}
              aria-label={t("entry.close")}
              className="sv-icon-btn"
            >
              <IconClose />
            </button>
          </div>
          <p className="text-sm text-(--text-secondary) mb-4">
            {t("settings.security.device.confirm")}
          </p>
          <label className="sv-label" htmlFor="device-unlock-pw">
            {t("unlock.passwordLabel")}
          </label>
          <input
            id="device-unlock-pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="sv-input w-full mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={working}
          />
          {error && <p className="sv-error mb-2">{error}</p>}
          <button type="submit" className="sv-btn-primary w-full" disabled={!password || working}>
            {t("settings.security.device.turnOn")}
          </button>
        </Modal>
      )}
      <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
        <input
          type="checkbox"
          checked={state.kind === "on"}
          onChange={async (e) => {
            if (e.target.checked) setAsking(true);
            else {
              await DeviceUnlockService.disable();
              await refresh();
            }
          }}
          className="rounded-sm border-(--border-default)"
        />
        {t(isMac ? "settings.security.device.labelMac" : "settings.security.device.label")}
      </label>
      <p className="text-xs text-(--text-tertiary) mt-1">
        {state.kind === "on"
          ? t("settings.security.device.until", {
              date: new Date(state.expiresAt).toLocaleDateString(i18n.language),
            })
          : t(isMac ? "settings.security.device.hintMac" : "settings.security.device.hint")}
      </p>
    </div>
  );
}
