/**
 * @file SshAgentSection.tsx
 * Settings → SSH agent (desktop only).
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SshAgentService } from "../../services/ssh-agent.service";
import { ClipboardService } from "../../services/clipboard.service";
import { SettingsSection } from "./shared";

export function SshAgentSection() {
  const { t } = useTranslation();
  const [on, setOn] = useState(() => SshAgentService.isEnabled());
  const [path, setPath] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const desktop = !!window.electron?.sshAgent;

  useEffect(() => {
    if (desktop && on) void SshAgentService.setEnabled(true).then(setPath);
  }, [desktop, on]);

  if (!desktop) return null;
  const isWin = window.electron?.platform === "win32";
  const snippet = path
    ? isWin
      ? `setx SSH_AUTH_SOCK "${path}"`
      : `Host *\n  IdentityAgent ${path}`
    : "";

  const toggle = async (next: boolean) => {
    setOn(next);
    const p = await SshAgentService.setEnabled(next);
    setPath(p);
    setFailed(next && !p);
  };

  return (
    <SettingsSection
      id="sshAgent"
      title={t("settings.sshAgent.title")}
      description={t("settings.sshAgent.description")}
    >
      <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer mb-3">
        <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} />
        {t("settings.sshAgent.enable")}
      </label>
      {failed && <p className="sv-error">{t("settings.sshAgent.notRunning")}</p>}
      {path && (
        <>
          <p className="text-xs text-(--text-tertiary) mb-1">{t("settings.sshAgent.running")}</p>
          <div className="flex gap-2 items-start">
            <pre
              dir="ltr"
              className="flex-1 text-xs font-mono bg-(--bg-elevated) rounded-lg p-2 whitespace-pre-wrap break-all"
            >
              {snippet}
            </pre>
            <button
              type="button"
              className="sv-btn-secondary text-xs px-3"
              onClick={() => void ClipboardService.copy(snippet)}
            >
              {t("settings.sshAgent.copy")}
            </button>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
