/**
 * @file SshTab.tsx
 * SSH key section of the Add/Edit Entry form: generate an Ed25519 key or
 * import an existing (unencrypted) OpenSSH private key.
 */
import { useTranslation } from "react-i18next";
import React, { useId, useState } from "react";
import { generateSshKey, importSshKey } from "../../../core/ssh/ssh-key";
import { ClipboardService } from "../../../services/clipboard.service";
import type { EntryFormState } from "./entry-form";

type Set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) => void;

export function SshTab({ s, set }: { s: EntryFormState; set: Set }) {
  const { t } = useTranslation();
  const ids = { comment: useId(), pem: useId(), pub: useId() };
  const [comment, setComment] = useState("");
  const [importing, setImporting] = useState(false);
  const [pem, setPem] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const keep = (k: { publicKey: string; privateKey: string; fingerprint: string }) =>
    set("ssh", { publicKey: k.publicKey, privateKey: k.privateKey, fingerprint: k.fingerprint });

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      keep(await generateSshKey(comment.trim()));
      if (!s.title.trim()) set("title", comment.trim() || "SSH key");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError("");
    try {
      keep(await importSshKey(pem, comment.trim() || undefined));
      setPem("");
      setImporting(false);
    } catch (e) {
      setError(`${t("entry.ssh.importFailed")}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (s.ssh) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label className="sv-label" htmlFor={ids.pub}>
            {t("entry.ssh.publicKey")}
          </label>
          <textarea
            id={ids.pub}
            readOnly
            dir="ltr"
            rows={3}
            className="sv-input w-full resize-none font-mono text-xs break-all"
            value={s.ssh.publicKey}
          />
        </div>
        <p className="text-xs text-(--text-tertiary)" dir="ltr">
          {t("entry.ssh.fingerprint")}: <span className="font-mono">{s.ssh.fingerprint}</span>
        </p>
        <p className="text-xs text-(--text-tertiary)">{t("entry.ssh.agentHint")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="sv-btn-secondary flex-1"
            onClick={() => void ClipboardService.copy(s.ssh!.publicKey)}
          >
            {t("entry.ssh.copyPublic")}
          </button>
          <button type="button" className="sv-btn-secondary" onClick={() => set("ssh", null)}>
            {t("entry.ssh.remove")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-(--text-tertiary)">{t("entry.ssh.none")}</p>
      <div>
        <label className="sv-label" htmlFor={ids.comment}>
          {t("entry.ssh.comment")}
        </label>
        <input
          id={ids.comment}
          dir="ltr"
          className="sv-input w-full"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {importing ? (
        <>
          <label className="sv-label" htmlFor={ids.pem}>
            {t("entry.ssh.importLabel")}
          </label>
          <textarea
            id={ids.pem}
            dir="ltr"
            rows={6}
            spellCheck={false}
            className="sv-input w-full resize-none font-mono text-xs"
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          />
          <button
            type="button"
            className="sv-btn-primary"
            disabled={!pem || busy}
            onClick={doImport}
          >
            {t("entry.ssh.importButton")}
          </button>
        </>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            className="sv-btn-primary flex-1"
            disabled={busy}
            onClick={generate}
          >
            {t("entry.ssh.generate")}
          </button>
          <button type="button" className="sv-btn-secondary" onClick={() => setImporting(true)}>
            {t("entry.ssh.import")}
          </button>
        </div>
      )}
      {error && <p className="sv-error">{error}</p>}
    </div>
  );
}
