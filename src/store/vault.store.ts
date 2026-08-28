/**
 * @file src/store/vault.store.ts
 * Decrypted vault data + CRUD operations + search. Cleared on lock.
 */
import { create } from "zustand";
import type { VaultData, VaultEntry, SearchQuery } from "../core/vault/schema";
import { HistoryService } from "../services/history.service";

interface VaultState {
  vault: VaultData | null;
  selectedEntryId: string | null;
  searchQuery: SearchQuery;
  isDirty: boolean;

  // Selectors / derived state (kept as fields for selector access by tests).
  entries: VaultEntry[];
  filteredEntries: VaultEntry[];

  setVault:        (v: VaultData | null) => void;
  addEntry:        (e: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => VaultEntry;
  updateEntry:     (id: string, patch: Partial<VaultEntry>) => void;
  deleteEntry:     (id: string) => void;
  toggleFavorite:  (id: string) => void;
  selectEntry:     (id: string | null) => void;
  setSearchQuery:  (q: Partial<SearchQuery>) => void;
  clearSearch:     () => void;
  reorderEntries:  (fromId: string, toId: string) => void;
  markClean:       () => void;
}

function recomputeFiltered(entries: VaultEntry[], q: SearchQuery): VaultEntry[] {
  let out = entries;
  if (q.text && q.text.trim()) {
    const needle = q.text.toLowerCase().trim();
    out = out.filter(e =>
      e.title.toLowerCase().includes(needle) ||
      (e.username ?? "").toLowerCase().includes(needle) ||
      (e.url      ?? "").toLowerCase().includes(needle) ||
      (e.notes    ?? "").toLowerCase().includes(needle) ||
      e.tags.some(t => t.toLowerCase().includes(needle))
    );
  }
  if (q.category) out = out.filter(e => e.category === q.category);
  if (q.tag)      out = out.filter(e => e.tags.includes(q.tag!));
  if (q.folderId) out = out.filter(e => e.folderId === q.folderId);
  if (q.favoritesOnly) out = out.filter(e => e.favorite);
  return out;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  selectedEntryId: null,
  searchQuery: {},
  isDirty: false,
  entries: [],
  filteredEntries: [],

  setVault: (v) => set({
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
    const prior = vault.entries.find(e => e.id === id);
    if (prior) HistoryService.push(prior);
    const newEntries = vault.entries.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
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
    const newEntries = vault.entries.filter(e => e.id !== id);
    set({
      vault: { ...vault, entries: newEntries },
      entries: newEntries,
      filteredEntries: recomputeFiltered(newEntries, searchQuery),
      isDirty: true,
      selectedEntryId: selectedEntryId === id ? null : selectedEntryId,
    });
  },

  toggleFavorite: (id) => {
    const { vault, searchQuery } = get();
    if (!vault) return;
    const newEntries = vault.entries.map(e =>
      e.id === id ? { ...e, favorite: !e.favorite, updatedAt: new Date().toISOString() } : e
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
    const fromIdx = arr.findIndex(e => e.id === fromId);
    const toIdx   = arr.findIndex(e => e.id === toId);
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
}));
