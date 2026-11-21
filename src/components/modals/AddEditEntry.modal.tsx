/**
 * @file AddEditEntry.modal.tsx
 * Create / edit a vault entry. Shell only: form state lives here, the pure
 * logic is in components/vault/entry-form/entry-form.ts and each tab's fields
 * in entry-form/fields.tsx.
 */
import { useTranslation } from "react-i18next";
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

const TABS: EntryTab[] = ["login", "notes", "card", "fields"];

export function AddEditEntryModal({ entry, folderId, onClose }: Props) {
  const { t } = useTranslation();
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
      toastSuccess(t("entry.updated"), t("entry.updatedBody", { title: payload.title }));
    } else {
      addEntry(payload);
      toastSuccess(t("entry.added"), t("entry.addedBody", { title: payload.title }));
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} labelledBy={ids.heading} onSubmit={submit}>
      <div className="flex items-center justify-between mb-6">
        <h2 id={ids.heading} className="text-lg font-semibold text-(--text-primary)">
          {isEdit ? t("entry.edit") : t("entry.add")}
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`p-1.5 rounded-lg transition-colors ${s.favorite ? "text-amber-400" : "text-(--text-tertiary) hover:text-amber-400"}`}
            onClick={() => set("favorite", !s.favorite)}
            aria-label={s.favorite ? t("entry.favoriteRemove") : t("entry.favoriteAdd")}
            aria-pressed={s.favorite}
          >
            <IconStar className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-(--text-tertiary) hover:text-(--text-primary) p-1 rounded-lg transition-colors"
            aria-label={t("entry.close")}
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <label className="sv-label" htmlFor={ids.title}>
            {t("entry.title")} *
          </label>
          <input
            id={ids.title}
            ref={titleRef}
            className="sv-input w-full"
            value={s.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("entry.titlePlaceholder")}
            aria-invalid={!!errors.title}
            aria-required="true"
          />
          {errors.title && <p className="sv-error">{t(errors.title)}</p>}
        </div>
        <div className="w-36">
          <label className="sv-label" htmlFor={ids.category}>
            {t("entry.category")}
          </label>
          <select
            id={ids.category}
            className="sv-input w-full"
            value={s.category}
            onChange={(e) => set("category", e.target.value as CategoryType)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {t(`entry.categories.${c.value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("entry.sections")}
        className="flex gap-1 mb-5 border-b border-(--border-subtle)"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${ids.panel}-${id}`}
            aria-selected={tab === id}
            aria-controls={ids.panel}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
              tab === id
                ? "text-(--accent) border-(--accent)"
                : "text-(--text-tertiary) border-transparent hover:text-(--text-secondary)"
            }`}
            onClick={() => setTab(id)}
          >
            {t(`entry.tabs.${id}`)}
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
          {t("entry.cancel")}
        </button>
        <button type="submit" className="sv-btn-primary px-5">
          {isEdit ? t("entry.save") : t("entry.add")}
        </button>
      </div>
    </Modal>
  );
}
