/**
 * @file AttachmentsPanel.tsx
 * Encrypted files on an entry: add, save a decrypted copy, remove.
 */
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VaultEntry } from "../../core/vault/schema";
import {
  encryptAttachment,
  decryptAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
  type VaultAttachment,
} from "../../core/vault/attachment";
import { AttachmentStore } from "../../services/attachment-store";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({ entry }: { entry: VaultEntry }) {
  const { t } = useTranslation();
  const updateEntry = useVaultStore((s) => s.updateEntry);
  const { toastError, toastSuccess } = useUIStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const list = entry.attachments ?? [];

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: VaultAttachment[] = [];
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          toastError(t("attachments.tooLarge", { name: f.name }));
          continue;
        }
        const bytes = new Uint8Array(await f.arrayBuffer());
        const { attachment, blob } = await encryptAttachment(bytes, { name: f.name, type: f.type });
        bytes.fill(0);
        await AttachmentStore.put(attachment.id, blob);
        added.push(attachment);
      }
      if (added.length) {
        updateEntry(entry.id, { attachments: [...list, ...added] });
        toastSuccess(t("attachments.added", { count: added.length }));
      }
    } catch (e) {
      toastError(
        e instanceof AttachmentTooLargeError
          ? t("attachments.tooLarge", { name: "" })
          : t("attachments.failed"),
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const save = async (a: VaultAttachment) => {
    const blob = await AttachmentStore.get(a.id);
    if (!blob) return toastError(t("attachments.missing"));
    try {
      const plain = await decryptAttachment(a, blob);
      const url = URL.createObjectURL(
        new Blob([plain], { type: a.type || "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toastError(t("attachments.damaged"));
    }
  };

  const remove = async (a: VaultAttachment) => {
    updateEntry(entry.id, { attachments: list.filter((x) => x.id !== a.id) });
    await AttachmentStore.delete(a.id).catch(() => {});
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-(--text-tertiary) uppercase tracking-wider">
          {t("attachments.title")}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="text-(--text-tertiary) hover:text-(--accent-text) transition-colors text-xs disabled:opacity-50"
        >
          {busy ? "…" : t("attachments.add")}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label={t("attachments.add")}
          onChange={(e) => void add(e.target.files)}
        />
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-(--text-tertiary)">{t("attachments.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-(--text-secondary)" title={a.name}>
                {a.name}
              </span>
              <span className="text-xs text-(--text-tertiary)" dir="ltr">
                {formatSize(a.size)}
              </span>
              <button
                type="button"
                onClick={() => void save(a)}
                aria-label={t("attachments.saveNamed", { name: a.name })}
                className="text-xs text-(--text-tertiary) hover:text-(--accent-text)"
              >
                {t("attachments.save")}
              </button>
              <button
                type="button"
                onClick={() => void remove(a)}
                aria-label={t("attachments.removeNamed", { name: a.name })}
                className="text-xs text-(--text-tertiary) hover:text-(--danger)"
              >
                {t("attachments.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
