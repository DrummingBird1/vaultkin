/**
 * @file src/store/vault.store.ts
 * Decrypted vault data + CRUD operations + search. Cleared on lock.
 */
import { create } from "zustand";
import type { VaultData, VaultEntry, VaultFolder, SearchQuery } from "../core/vault/schema";
import { HistoryService } from "../services/history.service";

interface VaultState {
  vault: VaultData | null;
  selectedEntryId: string | null;
  searchQuery: SearchQuery;
  isDirty: boolean;

  // Selectors / derived state (kept as fields for selector access by tests).
  entries: VaultEntry[];
  filteredEntries: VaultEntry[];

  setVault: (v: VaultData | null) => void;
  addEntry: (e: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => VaultEntry;
  updateEntry: (id: string, patch: Partial<VaultEntry>) => void;
  deleteEntry: (id: string) => void;
  toggleFavorite: (id: string) => void;
  selectEntry: (id: string | null) => void;
  setSearchQuery: (q: Partial<SearchQuery>) => void;
  clearSearch: () => void;
  reorderEntries: (fromId: string, toId: string) => void;
  markClean: () => void;

  addFolder: (name: string, color?: string, parentId?: string) => VaultFolder;
  deleteFolder: (id: string) => void;
  renameTagGlobally: (oldTag: string, newTag: string) => void;
  deleteTagGlobally: (tag: string) => void;
}

function recomputeFiltered(entries: VaultEntry[], q: SearchQuery): VaultEntry[] {
  let out = entries;
  if (q.text && q.text.trim()) {
    const needle = q.text.toLowerCase().trim();
    out = out.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        (e.username ?? "").toLowerCase().includes(needle) ||
        (e.url ?? "").toLowerCase().includes(needle) ||
        (e.notes ?? "").toLowerCase().includes(needle) ||
        e.tags.some((t) => t.toLowerCase().includes(needle)) ||
        // Custom field labels are always searched. Values are only searched
        // for non-password field types — a "password" custom field's value
        // is a secret, and matching search text against it would let the
        // search box leak whether a hidden password contains a given
        // substring, defeating the point of it being hidden.
        e.customFields.some(
          (f) =>
            f.label.toLowerCase().includes(needle) ||
            (f.type !== "password" && f.value.toLowerCase().includes(needle)),
        ),
    );
  }
  if (q.category) out = out.filter((e) => e.category === q.category);
  if (q.tag) out = out.filter((e) => e.tags.includes(q.tag!));
  if (q.folderId) out = out.filter((e) => e.folderId === q.folderId);
  if (q.favoritesOnly) out = out.filter((e) => e.favorite);
  return out;
}

/** All descendant folder ids of `rootId` (not including rootId itself),
 *  cycle-guarded in case folders ever end up with a corrupted parentId loop. */
function collectDescendantIds(folders: VaultFolder[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = byParent.get(f.parentId) ?? [];
    list.push(f.id);
    byParent.set(f.parentId, list);
  }
  const visited = new Set<string>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return visited;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  selectedEntryId: null,
  searchQuery: {},
  isDirty: false,
  entries: [],
  filteredEntries: [],

  setVault: (v) =>
    set({
      vault: v,
      entries: v?.entries ?? [],
      // A freshly opened (or cleared) vault starts with no active search filter —
      // otherwise a stale query from a previous session would hide entries.
      searchQuery: {},
      filteredEntries: v?.entries ?? [],
      isDirty: false,
      selectedEntryId: null,
    }),

  addEntry: (partial) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const entry: VaultEntry = {
      id,
      type: partial.type ?? "login",
      title: partial.title ?? "",
      username: partial.username,
      password: partial.password,
      url: partial.url,
      notes: partial.notes,
      totpSecret: partial.totpSecret,
      totpAlgorithm: partial.totpAlgorithm,
      totpDigits: partial.totpDigits,
      totpPeriod: partial.totpPeriod,
      category: partial.category ?? "websites",
      folderId: partial.folderId,
      tags: partial.tags ?? [],
      favorite: partial.favorite ?? false,
      customFields: partial.customFields ?? [],
      cardNumber: partial.cardNumber,
      cardHolder: partial.cardHolder,
      cardExpiry: partial.cardExpiry,
      cardCVV: partial.cardCVV,
      createdAt: now,
      updatedAt: now,
    };
    const { vault, searchQuery } = get();
    if (!vault) return entry;
    const newEntries = [...vault.entries, entry];
    const newVault = { ...vault, entries: newEntries };
    set({
      vault: newVault,
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
    });
    return entry;
  },

  updateEntry: (id, patch) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    // Snapshot the pre-edit version into in-memory history (cleared on lock)
    // so the entry detail panel can offer a restore.
    const prior = vault.entries.find((e) => e.id === id);
    if (prior) HistoryService.push(prior);
    const newEntries = vault.entries.map((e) =>
      e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
    );
    set({
      vault: { ...vault, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
    });
  },

  deleteEntry: (id) => {
    const { vault, searchQuery, selectedEntryId } = get();
    if (!vault) return;
    const newEntries = vault.entries.filter((e) => e.id !== id);
    // Tombstone (schema v2) so a later sync merge doesn't resurrect the entry.
    const tombstones = [
      ...(vault.tombstones ?? []).filter((t) => t.id !== id),
      { id, deletedAt: new Date().toISOString() },
    ];
    set({
      vault: { ...vault, entries: newEntries, tombstones },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
      selectedEntryId: selectedEntryId === id ? null : selectedEntryId,
    });
  },

  toggleFavorite: (id) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    const newEntries = vault.entries.map((e) =>
      e.id === id ? { ...e, favorite: !e.favorite, updatedAt: new Date().toISOString() } : e,
    );
    set({
      vault: { ...vault, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
    });
  },

  selectEntry: (id) => set({ selectedEntryId: id }),

  setSearchQuery: (q) => {
    const merged = { ...get().searchQuery, ...q };
    const { vault } = get();
    set({
      searchQuery: merged,
      filteredEntries: vault ? recomputeFiltered(vault.entries, merged) : [],
    });
  },

  clearSearch: () => {
    const { vault } = get();
    set({
      searchQuery: {},
      filteredEntries: vault?.entries ?? [],
    });
  },

  reorderEntries: (fromId, toId) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    const arr = [...vault.entries];
    const fromIdx = arr.findIndex((e) => e.id === fromId);
    const toIdx = arr.findIndex((e) => e.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    set({
      vault: { ...vault, entries: arr },
      entries: arr,
      filteredEntries: recomputeFiltered(arr, searchQuery),
      isDirty: true,
    });
  },

  markClean: () => set({ isDirty: false }),

  addFolder: (name, color, parentId) => {
    const folder: VaultFolder = { id: crypto.randomUUID(), name, color, parentId };
    const { vault } = get();
    if (!vault) return folder;
    set({
      vault: { ...vault, folders: [...vault.folders, folder] },
      isDirty: true,
    });
    return folder;
  },

  // Deletes a folder AND all its descendant subfolders (recursively), but
  // never deletes entries — any entry filed in one of the deleted folders is
  // just unfiled (folderId cleared), not removed. Losing a folder shouldn't
  // ever be able to silently take vault entries down with it.
  deleteFolder: (id) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    const toDelete = collectDescendantIds(vault.folders, id);
    toDelete.add(id);
    const newFolders = vault.folders.filter((f) => !toDelete.has(f.id));
    const newEntries = vault.entries.map((e) =>
      e.folderId && toDelete.has(e.folderId) ? { ...e, folderId: undefined } : e,
    );
    set({
      vault: { ...vault, folders: newFolders, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
      searchQuery:
        searchQuery.folderId && toDelete.has(searchQuery.folderId)
          ? { ...searchQuery, folderId: undefined }
          : searchQuery,
    });
  },

  renameTagGlobally: (oldTag, newTag) => {
    const trimmed = newTag.trim();
    if (!trimmed || trimmed === oldTag) return;
    const { vault, searchQuery } = get();
    if (!vault) return;
    const newEntries = vault.entries.map((e) => {
      if (!e.tags.includes(oldTag)) return e;
      // De-dupe in case the entry already has both the old and new tag name.
      const tags = [...new Set(e.tags.map((t) => (t === oldTag ? trimmed : t)))];
      return { ...e, tags, updatedAt: new Date().toISOString() };
    });
    set({
      vault: { ...vault, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
      searchQuery: searchQuery.tag === oldTag ? { ...searchQuery, tag: trimmed } : searchQuery,
    });
  },

  deleteTagGlobally: (tag) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    const newEntries = vault.entries.map((e) =>
      e.tags.includes(tag)
        ? { ...e, tags: e.tags.filter((t) => t !== tag), updatedAt: new Date().toISOString() }
        : e,
    );
    const nextQuery = searchQuery.tag === tag ? { ...searchQuery, tag: undefined } : searchQuery;
    set({
      vault: { ...vault, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, nextQuery),
      isDirty: true,
      searchQuery: nextQuery,
    });
  },
}));
