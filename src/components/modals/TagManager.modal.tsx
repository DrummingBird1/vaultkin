/**
 * @file TagManager.modal.tsx
 * Lists every tag in use across the vault with its entry count, and lets
 * the user rename or delete a tag globally (vault.store.ts's
 * renameTagGlobally/deleteTagGlobally — applies to every entry at once,
 * not one at a time).
 */
import React, { useMemo, useState } from "react";
import { useVaultStore } from "../../store/vault.store";
import { IconClose, IconEdit, IconTrash, IconTag } from "../icons";
import { Modal } from "../ui/Modal";
import { useTranslation } from "react-i18next";

export function TagManagerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { vault, renameTagGlobally, deleteTagGlobally } = useVaultStore();
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of vault?.entries ?? []) {
      for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [vault?.entries]);

  const startRename = (tag: string) => {
    setEditingTag(tag);
    setDraftName(tag);
  };

  const commitRename = () => {
    if (editingTag && draftName.trim() && draftName.trim() !== editingTag) {
      renameTagGlobally(editingTag, draftName.trim());
    }
    setEditingTag(null);
  };

  return (
    <Modal onClose={onClose} className="max-w-md" label={t("tagManager.title")}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="sv-modal-title">{t("tagManager.title")}</h2>
        <button onClick={onClose} aria-label={t("entry.close")} className="sv-icon-btn">
          <IconClose />
        </button>
      </div>

      {tagCounts.length === 0 ? (
        <p className="text-sm text-(--text-tertiary) text-center py-8">{t("tagManager.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tagCounts.map(([tag, count]) => (
            <div key={tag} className="flex items-center gap-2 p-2.5 rounded-xl bg-(--bg-elevated)">
              <IconTag className="w-4 h-4 text-(--text-tertiary) shrink-0" />
              {editingTag === tag ? (
                <input
                  autoFocus
                  className="sv-input flex-1 py-1"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") {
                      e.stopPropagation(); // don't also close the modal
                      setEditingTag(null);
                    }
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="flex-1 text-sm text-(--text-primary) truncate">{tag}</span>
              )}
              <span className="text-xs text-(--text-tertiary) shrink-0">{count}</span>
              {confirmingDelete === tag ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-(--danger)">
                    {t("tagManager.confirmDelete", { tag, count })}
                  </span>
                  <button
                    onClick={() => {
                      deleteTagGlobally(tag);
                      setConfirmingDelete(null);
                    }}
                    className="text-xs text-(--danger) font-medium hover:underline"
                  >
                    {t("tagManager.yes")}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(null)}
                    className="text-xs text-(--text-tertiary) hover:underline"
                  >
                    {t("tagManager.no")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startRename(tag)}
                    aria-label={t("tagManager.rename", { tag })}
                    className="sv-icon-btn p-1"
                  >
                    <IconEdit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(tag)}
                    aria-label={t("tagManager.delete", { tag })}
                    className="sv-icon-btn p-1 hover:text-(--danger)"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
