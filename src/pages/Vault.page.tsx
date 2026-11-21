/**
 * @file Vault.page.tsx
 * Orchestrates the vault view: toolbar, folder sidebar, the active view
 * (components/vault/views/: grid, list, service), detail panel, bulk
 * selection and the dialogs they open. Views own their own virtualization
 * and scroll-into-view; this file owns which dialog is open.
 */
import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import { ImportExportService } from "../services/import-export.service";
import { AddEditEntryModal } from "../components/modals/AddEditEntry.modal";
import { ImportVaultModal } from "../components/modals/ImportVault.modal";
import { OpenShareModal } from "../components/modals/OpenShare.modal";
import { ConfirmDeleteModal } from "../components/modals/ConfirmDelete.modal";
import { PlaintextExportWarningModal } from "../components/modals/PlaintextExportWarning.modal";
import { TagManagerModal } from "../components/modals/TagManager.modal";
import { FolderSidebar } from "../components/vault/FolderSidebar";
import { EntryDetail } from "../components/vault/EntryDetail";
import { BulkActionBar } from "../components/vault/BulkActionBar";
import { VaultToolbar } from "../components/vault/VaultToolbar";
import { GridView } from "../components/vault/views/GridView";
import { ListView } from "../components/vault/views/ListView";
import { ServiceView } from "../components/vault/views/ServiceView";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useSlashToSearch } from "../hooks/useKeyboardShortcuts";
import { useArrowNavigation } from "../hooks/useArrowNavigation";
import { groupByService } from "../core/vault/grouping";
import { downloadText } from "../lib/download";
import { IconEmptyVault, IconPlus } from "../components/icons";
import type { VaultEntry } from "../core/vault/schema";

type Dialog =
  | { kind: "edit"; entry: VaultEntry | null }
  | { kind: "import" }
  | { kind: "openShare" }
  | { kind: "export" }
  | { kind: "tags" }
  | { kind: "delete"; entry: VaultEntry }
  | null;

export function VaultPage() {
  const { t } = useTranslation();
  const {
    filteredEntries,
    selectedEntryId,
    vault,
    selectEntry,
    deleteEntry,
    toggleFavorite,
    searchQuery,
    setSearchQuery,
    reorderEntries,
  } = useVaultStore();
  const { viewMode, toastSuccess, toastError } = useUIStore();
  const editEntryId = useUIStore((s) => s.editEntryId);
  const consumeEditEntry = useUIStore((s) => s.consumeEditEntry);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const bulk = useBulkSelection();
  const close = useCallback(() => setDialog(null), []);

  const selectedEntry = selectedEntryId
    ? (vault?.entries.find((e) => e.id === selectedEntryId) ?? null)
    : null;
  const query = (searchQuery.text ?? "").trim();

  const groups = useMemo(
    () => (viewMode === "service" ? groupByService(filteredEntries) : []),
    [viewMode, filteredEntries],
  );
  // What arrow keys walk: the on-screen order of the active view.
  const order = useMemo(
    () => (viewMode === "service" ? groups.flatMap((g) => g.entries) : filteredEntries),
    [viewMode, groups, filteredEntries],
  );

  const toggleGroup = useCallback(
    (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  useArrowNavigation(order, selectedEntryId, (entry) => {
    if (viewMode === "service") {
      const g = groups.find((gr) => gr.entries.some((e) => e.id === entry.id));
      if (g) setExpanded((prev) => (prev.has(g.key) ? prev : new Set(prev).add(g.key)));
    }
    selectEntry(entry.id);
  });

  const add = useCallback(() => setDialog({ kind: "edit", entry: null }), []);
  useSlashToSearch(() => searchRef.current?.focus());

  // Palette / Ctrl+N ask for a new entry via a counter in ui.store.
  const newEntryRequest = useUIStore((s) => s.newEntryRequest);
  const seenRequest = useRef(newEntryRequest);
  useEffect(() => {
    if (newEntryRequest === seenRequest.current) return;
    seenRequest.current = newEntryRequest;
    add();
  }, [newEntryRequest, add]);

  // "Fix" from the Health dashboard: it sets editEntryId and switches here.
  useEffect(() => {
    if (!editEntryId) return;
    const id = consumeEditEntry();
    const entry = vault?.entries.find((e) => e.id === id);
    if (entry) setDialog({ kind: "edit", entry });
  }, [editEntryId, consumeEditEntry, vault]);

  const toggleSelect = (id: string) => selectEntry(id === selectedEntryId ? null : id);

  const confirmDelete = (entry: VaultEntry) => {
    deleteEntry(entry.id);
    selectEntry(null);
    close();
    toastSuccess(t("vault.deleted"), t("vault.deletedBody", { title: entry.title }));
  };

  const bulkDelete = () => {
    if (bulk.count === 0) return;
    if (!window.confirm(t("vault.bulkConfirm", { count: bulk.count }))) return;
    for (const id of bulk.selected) deleteEntry(id);
    toastSuccess(t("vault.bulkDeleted", { count: bulk.count }), "");
    bulk.clear();
  };

  const exportCsv = () => {
    if (!vault?.entries.length)
      return toastError(t("vault.exportEmpty"), t("vault.exportEmptyBody"));
    downloadText(
      `securevault-export-${Date.now()}.csv`,
      ImportExportService.exportCSV(vault.entries),
      "text/csv;charset=utf-8",
    );
    toastSuccess(t("vault.exportReady"), t("vault.exportReadyBody"));
    close();
  };

  const viewProps = {
    entries: filteredEntries,
    selectedId: selectedEntryId,
    query,
    onSelect: toggleSelect,
    onFavorite: toggleFavorite,
  };
  const isEmptyVault = vault?.entries.length === 0;

  return (
    <>
      {dialog?.kind === "edit" && (
        // New entries land in the folder being viewed; edits keep their own.
        <AddEditEntryModal entry={dialog.entry} folderId={searchQuery.folderId} onClose={close} />
      )}
      {dialog?.kind === "import" && <ImportVaultModal onClose={close} />}
      {dialog?.kind === "openShare" && <OpenShareModal onClose={close} />}
      {dialog?.kind === "export" && (
        <PlaintextExportWarningModal onConfirm={exportCsv} onCancel={close} />
      )}
      {dialog?.kind === "tags" && <TagManagerModal onClose={close} />}
      {dialog?.kind === "delete" && (
        <ConfirmDeleteModal
          title={dialog.entry.title}
          description={t("vault.deleteDescription")}
          onConfirm={() => confirmDelete(dialog.entry)}
          onCancel={close}
        />
      )}

      <div className="flex flex-1 overflow-hidden h-full">
        <FolderSidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <VaultToolbar
            searchRef={searchRef}
            search={searchQuery.text ?? ""}
            onSearch={(text) => setSearchQuery({ text })}
            onTags={() => setDialog({ kind: "tags" })}
            onImport={() => setDialog({ kind: "import" })}
            onOpenShare={() => setDialog({ kind: "openShare" })}
            onExport={() => setDialog({ kind: "export" })}
            onAdd={add}
          />

          <div className="flex-1 overflow-hidden p-5">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <IconEmptyVault className="w-14 h-14 text-(--text-tertiary)" />
                <div>
                  <p className="font-semibold text-(--text-primary)">
                    {isEmptyVault ? t("vault.empty.title") : t("vault.empty.noResults")}
                  </p>
                  <p className="text-sm text-(--text-tertiary) mt-1">
                    {isEmptyVault ? t("vault.empty.body") : t("vault.empty.tryAnother")}
                  </p>
                </div>
                {isEmptyVault && (
                  <button
                    onClick={add}
                    className="flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-xl bg-(--accent-solid) text-white hover:opacity-90 transition-opacity"
                  >
                    <IconPlus className="w-4 h-4" /> {t("vault.addEntry")}
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <GridView {...viewProps} />
            ) : viewMode === "list" ? (
              <ListView {...viewProps} onReorder={reorderEntries} />
            ) : (
              <ServiceView
                {...viewProps}
                groups={groups}
                expanded={expanded}
                onToggleGroup={toggleGroup}
              />
            )}
          </div>
        </div>

        {/* `key` gives each entry a fresh panel so reveal state doesn't leak across entries. */}
        {selectedEntry && (
          <EntryDetail
            key={selectedEntry.id}
            entry={selectedEntry}
            onEdit={() => setDialog({ kind: "edit", entry: selectedEntry })}
            onDelete={() => setDialog({ kind: "delete", entry: selectedEntry })}
            onClose={() => selectEntry(null)}
          />
        )}
      </div>

      <BulkActionBar count={bulk.count} onDelete={bulkDelete} onClear={bulk.clear} />
    </>
  );
}
