/**
 * @file TagManager.modal.tsx
 * Lists every tag in use across the vault with its entry count, and lets
 * the user rename or delete a tag globally (vault.store.ts's
 * renameTagGlobally/deleteTagGlobally — applies to every entry at once,
 * not one at a time).
 */
import React, { useMemo, useState } from "react";
import { useVaultStore } from "../../store/vault.store";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { IconClose, IconEdit, IconTrash, IconTag } from "../icons";

export function TagManagerModal({ onClose }: { onClose: () => void }) {
  const containerRef = useFocusTrap<HTMLDivElement>(true);
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
    <div className="sv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={containerRef}
        className="sv-modal max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label="Manage tags"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="sv-modal-title">Manage tags</h2>
          <button onClick={onClose} aria-label="Close" className="sv-icon-btn">
            <IconClose />
          </button>
        </div>

        {tagCounts.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
            No tags yet — add some from an entry's edit form.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tagCounts.map(([tag, count]) => (
              <div
                key={tag}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)]"
              >
                <IconTag className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                {editingTag === tag ? (
                  <input
                    autoFocus
                    className="sv-input flex-1 py-1"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setEditingTag(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{tag}</span>
                )}
                <span className="text-xs text-[var(--text-tertiary)] flex-shrink-0">{count}</span>
                {confirmingDelete === tag ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-[var(--danger)]">
                      Delete "{tag}" from {count} entries?
                    </span>
                    <button
                      onClick={() => {
                        deleteTagGlobally(tag);
                        setConfirmingDelete(null);
                      }}
                      className="text-xs text-[var(--danger)] font-medium hover:underline"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="text-xs text-[var(--text-tertiary)] hover:underline"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startRename(tag)}
                      aria-label={`Rename ${tag}`}
                      className="sv-icon-btn p-1"
                    >
                      <IconEdit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(tag)}
                      aria-label={`Delete ${tag}`}
                      className="sv-icon-btn p-1 hover:text-[var(--danger)]"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
