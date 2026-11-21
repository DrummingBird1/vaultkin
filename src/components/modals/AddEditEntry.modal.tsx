/**
 * @file AddEditEntry.modal.tsx
 * Create / edit a vault entry. Shell only: form state lives here, the pure
 * logic is in components/vault/entry-form/entry-form.ts and each tab's fields
 * in entry-form/fields.tsx.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import type { CategoryType, VaultEntry } from "../../core/vault/schema";
import { Modal } from "../ui/Modal";
import { IconClose, IconStar } from "../icons";
import {
  CATEGORIES,
  buildPayload,
  initialState,
  initialTab,
  normalizeUrl,
  validate,
  type EntryFormState,
  type EntryTab,
  type ValidationErrors,
} from "../vault/entry-form/entry-form";
import { CardTab, CustomFieldsTab, LoginTab, NotesTab } from "../vault/entry-form/fields";

interface Props {
  entry?: VaultEntry | null; // null/undefined = create mode
  folderId?: string;
  onClose: () => void;
}

const TABS: Array<{ id: EntryTab; label: string }> = [
  { id: "login", label: "Login" },
  { id: "notes", label: "Notes" },
  { id: "card", label: "Card" },
  { id: "fields", label: "Custom" },
];

export function AddEditEntryModal({ entry, folderId, onClose }: Props) {
  const isEdit = !!entry;
  const { vault, addEntry, updateEntry } = useVaultStore();
  const { toastSuccess } = useUIStore();
  const titleRef = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), category: useId(), heading: useId(), panel: useId() };

  const [s, setState] = useState<EntryFormState>(() => initialState(entry));
  const [tab, setTab] = useState<EntryTab>(() => initialTab(entry));
  const [errors, setErrors] = useState<ValidationErrors>({});

  const set = useCallback(
    <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) =>
      setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const e of vault?.entries ?? []) for (const t of e.tags) tags.add(t);
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [vault?.entries]);

  useEffect(() => titleRef.current?.focus(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(s);
    setErrors(errs);
    set("url", normalizeUrl(s.url));
    if (Object.keys(errs).length) {
      if (errs.url || errs.totp) setTab("login");
      return;
    }
    const payload = buildPayload(s, { existing: entry, folderId });
    if (entry) {
      updateEntry(entry.id, payload);
      toastSuccess("Entry updated", `"${payload.title}" saved.`);
    } else {
      addEntry(payload);
      toastSuccess("Entry added", `"${payload.title}" added to vault.`);
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} labelledBy={ids.heading} onSubmit={submit}>
      <div className="flex items-center justify-between mb-6">
        <h2 id={ids.heading} className="text-lg font-semibold text-(--text-primary)">
          {isEdit ? "Edit Entry" : "Add Entry"}
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`p-1.5 rounded-lg transition-colors ${s.favorite ? "text-amber-400" : "text-(--text-tertiary) hover:text-amber-400"}`}
            onClick={() => set("favorite", !s.favorite)}
            aria-label={s.favorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={s.favorite}
          >
            <IconStar className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-(--text-tertiary) hover:text-(--text-primary) p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <label className="sv-label" htmlFor={ids.title}>
            Title *
          </label>
          <input
            id={ids.title}
            ref={titleRef}
            className="sv-input w-full"
            value={s.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. GitHub Work"
            aria-invalid={!!errors.title}
            aria-required="true"
          />
          {errors.title && <p className="sv-error">{errors.title}</p>}
        </div>
        <div className="w-36">
          <label className="sv-label" htmlFor={ids.category}>
            Category
          </label>
          <select
            id={ids.category}
            className="sv-input w-full"
            value={s.category}
            onChange={(e) => set("category", e.target.value as CategoryType)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Entry sections"
        className="flex gap-1 mb-5 border-b border-(--border-subtle)"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${ids.panel}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={ids.panel}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? "text-(--accent) border-(--accent)"
                : "text-(--text-tertiary) border-transparent hover:text-(--text-secondary)"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id={ids.panel}
        role="tabpanel"
        aria-labelledby={`${ids.panel}-${tab}`}
        className="flex flex-col gap-4"
      >
        {tab === "login" && <LoginTab s={s} set={set} errors={errors} allTags={allTags} />}
        {tab === "notes" && <NotesTab s={s} set={set} />}
        {tab === "card" && <CardTab s={s} set={set} />}
        {tab === "fields" && <CustomFieldsTab s={s} set={set} />}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-(--border-subtle)">
        <button type="button" onClick={onClose} className="sv-btn-secondary px-5">
          Cancel
        </button>
        <button type="submit" className="sv-btn-primary px-5">
          {isEdit ? "Save Changes" : "Add Entry"}
        </button>
      </div>
    </Modal>
  );
}
