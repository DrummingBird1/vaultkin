/**
 * @file src/services/history.service.ts
 * Per-entry version history (in-memory, cleared on lock).
 * Stores up to N most recent versions of each entry.
 */
import type { VaultEntry } from "../core/vault/schema";

const MAX_VERSIONS = 10;

const versions = new Map<string, VaultEntry[]>();

export const HistoryService = {
  push(entry: VaultEntry): void {
    const list = versions.get(entry.id) ?? [];
    list.unshift(structuredClone(entry));
    while (list.length > MAX_VERSIONS) list.pop();
    versions.set(entry.id, list);
  },
  get(entryId: string): VaultEntry[] {
    return versions.get(entryId) ?? [];
  },
  clear(): void {
    versions.clear();
  },
};
