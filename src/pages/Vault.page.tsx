/**
 * @file Vault.page.tsx
 * Orchestrates the vault view: toolbar, folder sidebar, grid/list/service
 * views (virtualized via @tanstack/react-virtual for grid/list), entry
 * detail panel, bulk selection, drag-reorder (list view only), and keyboard
 * navigation across whichever view is active.
 *
 * NOTE on grid-view live resize: column count is driven by a ResizeObserver
 * on the scroll container (see gridContainerRef below), recomputed on
 * mount and on resize. This uses a callback ref (useState + useCallback),
 * not a plain useRef + mount-only useLayoutEffect — the container is
 * conditionally rendered (only when viewMode === "grid" and there are
 * entries), so a mount-only effect can miss it entirely if the ref wasn't
 * attached yet on first render.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import { ImportExportService } from "../services/import-export.service";
import { AddEditEntryModal } from "../components/modals/AddEditEntry.modal";
import { ImportVaultModal } from "../components/modals/ImportVault.modal";
import { ConfirmDeleteModal } from "../components/modals/ConfirmDelete.modal";
import { PlaintextExportWarningModal } from "../components/modals/PlaintextExportWarning.modal";
import { TagManagerModal } from "../components/modals/TagManager.modal";
import { FolderSidebar } from "../components/vault/FolderSidebar";
import { EntryCard } from "../components/vault/EntryCard";
import { EntryRow } from "../components/vault/EntryRow";
import { EntryDetail } from "../components/vault/EntryDetail";
import { EntryFavicon } from "../components/vault/EntryFavicon";
import { BulkActionBar } from "../components/vault/BulkActionBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useDragReorder } from "../hooks/useDragReorder";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { groupByService, type ServiceGroup } from "../core/vault/grouping";
import { IconEmptyVault, IconChevronDown, IconChevronRight, IconTag } from "../components/icons";
import type { VaultEntry } from "../core/vault/schema";

const GRID_MIN_COLUMN_PX = 220;
const GRID_GAP_PX = 12;
const GRID_ROW_HEIGHT_PX = 132;
const LIST_ROW_HEIGHT_PX = 60;

export function VaultPage() {
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
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VaultEntry | null>(null);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bulk = useBulkSelection();

  const selectedEntry = selectedEntryId
    ? (vault?.entries.find((e) => e.id === selectedEntryId) ?? null)
    : null;

  const highlightQuery = useMemo(() => (searchQuery.text ?? "").trim(), [searchQuery.text]);

  // ── Grid column count (ResizeObserver) ────────────────────────────────────
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const gridContainerRef = useCallback((node: HTMLDivElement | null) => setGridEl(node), []);
  const [gridColumnCount, setGridColumnCount] = useState(4);

  useEffect(() => {
    if (!gridEl || viewMode !== "grid") return;
    const compute = () => {
      const cols = Math.max(
        1,
        Math.floor((gridEl.clientWidth + GRID_GAP_PX) / (GRID_MIN_COLUMN_PX + GRID_GAP_PX)),
      );
      setGridColumnCount(cols);
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl, viewMode]);

  // ── Service grouping ───────────────────────────────────────────────────────
  const serviceGroups: ServiceGroup[] = useMemo(
    () => (viewMode === "service" ? groupByService(filteredEntries) : []),
    [viewMode, filteredEntries],
  );

  const toggleServiceGroup = useCallback((key: string) => {
    setExpandedServices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Visual navigation order — what arrow keys should walk through, matching
  // whatever's actually on screen for the active view.
  const navigationOrder = useMemo(() => {
    if (viewMode === "service") return serviceGroups.flatMap((g) => g.entries);
    return filteredEntries;
  }, [viewMode, serviceGroups, filteredEntries]);

  // ── Virtualizers (grid/list only — service view is grouped+collapsible,
  // not virtualized; typical vaults don't have enough entries per group to
  // need it) ─────────────────────────────────────────────────────────────────
  const gridRowCount = Math.ceil(filteredEntries.length / gridColumnCount);
  const gridVirtualizer = useVirtualizer({
    count: viewMode === "grid" ? gridRowCount : 0,
    getScrollElement: () => gridEl,
    estimateSize: () => GRID_ROW_HEIGHT_PX,
    overscan: 4,
  });

  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const listContainerRef = useCallback((node: HTMLDivElement | null) => setListEl(node), []);
  const listVirtualizer = useVirtualizer({
    count: viewMode === "list" ? filteredEntries.length : 0,
    getScrollElement: () => listEl,
    estimateSize: () => LIST_ROW_HEIGHT_PX,
    overscan: 8,
  });

  // Scroll the selected entry into view when it changes via keyboard nav.
  useEffect(() => {
    if (!selectedEntryId) return;
    if (viewMode === "grid") {
      const idx = filteredEntries.findIndex((e) => e.id === selectedEntryId);
      if (idx >= 0)
        gridVirtualizer.scrollToIndex(Math.floor(idx / gridColumnCount), { align: "auto" });
    } else if (viewMode === "list") {
      const idx = filteredEntries.findIndex((e) => e.id === selectedEntryId);
      if (idx >= 0) listVirtualizer.scrollToIndex(idx, { align: "auto" });
    } else {
      document
        .querySelector(`[data-entry-id="${selectedEntryId}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer instances aren't stable deps
  }, [selectedEntryId, viewMode, gridColumnCount]);

  const dragReorder = useDragReorder({
    disabled: viewMode !== "list" || !!highlightQuery,
    onReorder: reorderEntries,
  });

  const handleAdd = useCallback(() => {
    setEditingEntry(null);
    setShowAddEdit(true);
  }, []);

  const handleEdit = useCallback((entry: VaultEntry) => {
    setEditingEntry(entry);
    setShowAddEdit(true);
  }, []);

  // Cross-page "Fix" requests from the Health dashboard land here: it sets
  // editEntryId in the ui store and switches to this page. Consume it once and
  // open the edit modal for that entry.
  useEffect(() => {
    if (!editEntryId) return;
    const id = consumeEditEntry();
    const entry = vault?.entries.find((e) => e.id === id);
    if (entry) {
      setEditingEntry(entry);
      setShowAddEdit(true);
    }
  }, [editEntryId, consumeEditEntry, vault]);

  const handleDeleteConfirm = useCallback(() => {
    if (!confirmDelete) return;
    deleteEntry(confirmDelete.id);
    selectEntry(null);
    setConfirmDelete(null);
    toastSuccess("Entry deleted", `"${confirmDelete.title}" permanently removed.`);
  }, [confirmDelete, deleteEntry, selectEntry, toastSuccess]);

  const handleBulkDelete = useCallback(() => {
    if (bulk.count === 0) return;
    if (!window.confirm(`Delete ${bulk.count} entries? This cannot be undone.`)) return;
    for (const id of bulk.selected) deleteEntry(id);
    toastSuccess(`${bulk.count} entries deleted`, "");
    bulk.clear();
  }, [bulk, deleteEntry, toastSuccess]);

  const doExportCSV = useCallback(() => {
    if (!vault?.entries.length) {
      toastError("Nothing to export", "Vault is empty.");
      return;
    }
    const csv = ImportExportService.exportCSV(vault.entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `securevault-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastSuccess("Export ready", "CSV file saved.");
    setShowExportWarning(false);
  }, [vault?.entries, toastSuccess, toastError]);

  // ── Keyboard navigation (arrow keys walk navigationOrder; auto-expands a
  // collapsed service group when the target entry lands inside one) ────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (navigationOrder.length === 0) return;
      e.preventDefault();
      const currentIdx = navigationOrder.findIndex((en) => en.id === selectedEntryId);
      const nextIdx =
        e.key === "ArrowDown"
          ? Math.min(navigationOrder.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
      const nextEntry = navigationOrder[nextIdx];
      if (!nextEntry) return;
      if (viewMode === "service") {
        const group = serviceGroups.find((g) => g.entries.some((en) => en.id === nextEntry.id));
        if (group && !expandedServices.has(group.key)) {
          setExpandedServices((prev) => new Set(prev).add(group.key));
        }
      }
      selectEntry(nextEntry.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigationOrder, selectedEntryId, viewMode, serviceGroups, expandedServices, selectEntry]);

  useKeyboardShortcuts({
    onNewEntry: handleAdd,
    onFocusSearch: () => searchInputRef.current?.focus(),
  });

  return (
    <>
      {showAddEdit && (
        <AddEditEntryModal
          entry={editingEntry}
          onClose={() => {
            setShowAddEdit(false);
            setEditingEntry(null);
          }}
        />
      )}
      {showImport && <ImportVaultModal onClose={() => setShowImport(false)} />}
      {showExportWarning && (
        <PlaintextExportWarningModal
          onConfirm={doExportCSV}
          onCancel={() => setShowExportWarning(false)}
        />
      )}
      {showTagManager && <TagManagerModal onClose={() => setShowTagManager(false)} />}
      {confirmDelete && (
        <ConfirmDeleteModal
          title={confirmDelete.title}
          description="All passwords, TOTP secrets, and custom fields will be lost."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="flex flex-1 overflow-hidden h-full">
        <FolderSidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)]">
            <input
              ref={searchInputRef}
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="Search entries…"
              value={searchQuery.text ?? ""}
              onChange={(e) => setSearchQuery({ text: e.target.value })}
            />
            <button
              onClick={() => setShowTagManager(true)}
              className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
            >
              <IconTag className="w-3.5 h-3.5" /> Tags
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => setShowExportWarning(true)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
            >
              Export
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            >
              + Add Entry
            </button>
          </div>

          {/* Entry grid/list/service */}
          <div className="flex-1 overflow-hidden p-5">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <IconEmptyVault className="w-14 h-14 text-[var(--text-tertiary)]" />
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {vault?.entries.length === 0 ? "Your vault is empty" : "No results found"}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    {vault?.entries.length === 0
                      ? "Add your first entry to get started"
                      : "Try a different search term"}
                  </p>
                </div>
                {vault?.entries.length === 0 && (
                  <button
                    onClick={handleAdd}
                    className="text-sm font-medium px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                  >
                    + Add Entry
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <div ref={gridContainerRef} className="h-full overflow-y-auto">
                <div style={{ height: gridVirtualizer.getTotalSize(), position: "relative" }}>
                  {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowEntries = filteredEntries.slice(
                      virtualRow.index * gridColumnCount,
                      virtualRow.index * gridColumnCount + gridColumnCount,
                    );
                    return (
                      <div
                        key={virtualRow.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                          display: "grid",
                          gridTemplateColumns: `repeat(${gridColumnCount}, 1fr)`,
                          gap: GRID_GAP_PX,
                          paddingBottom: GRID_GAP_PX,
                        }}
                      >
                        {rowEntries.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            selected={entry.id === selectedEntryId}
                            query={highlightQuery}
                            onClick={() =>
                              selectEntry(entry.id === selectedEntryId ? null : entry.id)
                            }
                            onFavorite={() => toggleFavorite(entry.id)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === "list" ? (
              <div ref={listContainerRef} className="h-full overflow-y-auto">
                <div style={{ height: listVirtualizer.getTotalSize(), position: "relative" }}>
                  {listVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = filteredEntries[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.key}
                        draggable={!highlightQuery}
                        onDragStart={dragReorder.onDragStart(entry.id)}
                        onDragOver={dragReorder.onDragOver(entry.id)}
                        onDrop={dragReorder.onDrop(entry.id)}
                        onDragEnd={dragReorder.onDragEnd}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: 4,
                          opacity: dragReorder.overId === entry.id ? 0.5 : 1,
                        }}
                      >
                        <EntryRow
                          entry={entry}
                          selected={entry.id === selectedEntryId}
                          query={highlightQuery}
                          onClick={() =>
                            selectEntry(entry.id === selectedEntryId ? null : entry.id)
                          }
                          onFavorite={() => toggleFavorite(entry.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              // Service view — grouped, collapsible, not virtualized.
              <div className="h-full overflow-y-auto flex flex-col gap-2">
                {serviceGroups.map((group) => {
                  const expanded = expandedServices.has(group.key);
                  return (
                    <div
                      key={group.key}
                      className="rounded-2xl border border-[var(--border-default)] overflow-hidden"
                    >
                      <button
                        onClick={() => toggleServiceGroup(group.key)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors text-left"
                      >
                        {expanded ? (
                          <IconChevronDown className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                        ) : (
                          <IconChevronRight className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                        )}
                        <EntryFavicon
                          title={group.key}
                          url={group.key !== "(no domain)" ? group.key : undefined}
                          className="w-6 h-6 rounded-lg bg-[var(--bg-elevated)] text-xs flex-shrink-0"
                        />
                        <span className="text-sm font-medium text-[var(--text-primary)] flex-1">
                          {group.key}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {group.entries.length} account{group.entries.length === 1 ? "" : "s"}
                        </span>
                      </button>
                      {expanded && (
                        <div className="flex flex-col gap-1 p-2 bg-[var(--bg-base)]">
                          {group.entries.map((entry) => (
                            <div key={entry.id} data-entry-id={entry.id}>
                              <EntryRow
                                entry={entry}
                                selected={entry.id === selectedEntryId}
                                query={highlightQuery}
                                onClick={() =>
                                  selectEntry(entry.id === selectedEntryId ? null : entry.id)
                                }
                                onFavorite={() => toggleFavorite(entry.id)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — `key` forces a fresh instance per entry so internal
            UI state (e.g. showPw) does not leak across entries. */}
        {selectedEntry && (
          <EntryDetail
            key={selectedEntry.id}
            entry={selectedEntry}
            onEdit={() => handleEdit(selectedEntry)}
            onDelete={() => setConfirmDelete(selectedEntry)}
            onClose={() => selectEntry(null)}
          />
        )}
      </div>

      <BulkActionBar count={bulk.count} onDelete={handleBulkDelete} onClear={bulk.clear} />
    </>
  );
}
