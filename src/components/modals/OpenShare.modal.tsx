/**
 * @file OpenShare.modal.tsx
 * Open a .svshare file with its code, preview it, add it to the vault.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  openShare,
  ShareExpiredError,
  SHARE_FILE_EXT,
  type SharedEntry,
} from "../../core/share/share";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { Modal } from "../ui/Modal";
import { IconClose } from "../icons";

export function OpenShareModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const addEntry = useVaultStore((s) => s.addEntry);
  const { toastSuccess } = useUIStore();
  const [fileText, setFileText] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<{ entry: SharedEntry; from: string } | null>(null);

  const open = async () => {
    setError("");
    try {
      const r = await openShare(fileText ?? "", code);
      setOpened({ entry: r.entry, from: r.from });
    } catch (e) {
      setError(e instanceof ShareExpiredError ? t("share.expired") : t("share.invalid"));
    }
  };

  const add = () => {
    if (!opened) return;
    const e = opened.entry;
    addEntry({
      type: e.type,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      notes: e.notes,
      totpSecret: e.totpSecret,
      customFields: e.customFields ?? [],
      category: "custom",
      tags: ["shared"],
      favorite: false,
    });
    toastSuccess(t("share.added"), e.title);
    onClose();
  };

  return (
    <Modal onClose={onClose} className="max-w-md" label={t("share.openTitle")}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="sv-modal-title">{t("share.openTitle")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("entry.close")}
          className="sv-icon-btn"
        >
          <IconClose />
        </button>
      </div>
      {opened ? (
        <div className="flex flex-col gap-2">
          {opened.from && (
            <p className="text-xs text-(--text-tertiary)">
              {t("share.fromLabel", { from: opened.from })}
            </p>
          )}
          <p className="font-semibold text-(--text-primary)">{opened.entry.title}</p>
          {opened.entry.username && (
            <p className="text-sm text-(--text-secondary)" dir="ltr">
              {opened.entry.username}
            </p>
          )}
          {opened.entry.url && (
            <p className="text-xs text-(--text-tertiary)" dir="ltr">
              {opened.entry.url}
            </p>
          )}
          <p className="text-xs text-(--text-tertiary)">
            {[
              opened.entry.password && t("share.includePassword"),
              opened.entry.totpSecret && t("share.includeTotp"),
              opened.entry.notes && t("share.includeNotes"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <button type="button" className="sv-btn-primary mt-2" onClick={add}>
            {t("share.addToVault")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="sv-label" htmlFor="share-file">
            {t("share.file")}
          </label>
          <input
            id="share-file"
            type="file"
            accept={SHARE_FILE_EXT + ",application/json"}
            onChange={async (e) => setFileText((await e.target.files?.[0]?.text()) ?? null)}
          />
          <label className="sv-label" htmlFor="share-code-input">
            {t("share.code")}
          </label>
          <input
            id="share-code-input"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="sv-input w-full font-mono text-xs"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="svk1-…"
          />
          {error && <p className="sv-error">{error}</p>}
          <button
            type="button"
            className="sv-btn-primary"
            disabled={!fileText || !code.trim()}
            onClick={() => void open()}
          >
            {t("share.open")}
          </button>
        </div>
      )}
    </Modal>
  );
}
