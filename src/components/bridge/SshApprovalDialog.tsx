/**
 * @file SshApprovalDialog.tsx
 * Asks before the SSH agent signs with a vault key.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { useSshApprovalStore } from "../../services/ssh-agent.service";

export function SshApprovalDialog() {
  const { t } = useTranslation();
  const pending = useSshApprovalStore((s) => s.pending);
  const [remember, setRemember] = useState(false);
  if (!pending) return null;
  const done = (ok: boolean) => {
    pending.resolve(ok, ok && remember);
    setRemember(false);
  };
  return (
    <Modal
      onClose={() => done(false)}
      role="alertdialog"
      className="max-w-sm"
      label={t("sshAgent.title")}
    >
      <h2 className="sv-modal-title mb-3">{t("sshAgent.title")}</h2>
      <p className="text-sm text-(--text-secondary) mb-2">
        {t("sshAgent.body", { key: pending.entry.title })}
      </p>
      {pending.user && (
        <p className="text-sm text-(--text-secondary) mb-2">
          {t("sshAgent.user")}:{" "}
          <span className="font-mono" dir="ltr">
            {pending.user}
          </span>
        </p>
      )}
      <p className="text-xs font-mono text-(--text-tertiary) mb-4" dir="ltr">
        {pending.entry.ssh?.fingerprint}
      </p>
      <label className="flex items-center gap-2 text-sm text-(--text-secondary) mb-4 cursor-pointer">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t("sshAgent.remember")}
      </label>
      <div className="flex gap-2">
        <button type="button" className="sv-btn-secondary flex-1" onClick={() => done(false)}>
          {t("sshAgent.deny")}
        </button>
        <button
          type="button"
          className="sv-btn-primary flex-1"
          autoFocus
          onClick={() => done(true)}
        >
          {t("sshAgent.allow")}
        </button>
      </div>
    </Modal>
  );
}
