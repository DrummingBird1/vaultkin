/**
 * @file src/core/vault/merge.ts
 * Three-way-free merge of two decrypted vaults (schema v2), used when a WebDAV
 * pull finds a remote copy that diverged from the open one.
 *
 *  - Entries: union by id; when both sides have one, the newer `updatedAt` wins
 *    (ties keep local).
 *  - Tombstones: union by id, newest `deletedAt` wins. An entry is dropped when
 *    a tombstone is newer than the entry's `updatedAt` on the side that still
 *    has it, so a delete on one device isn't undone by the other's stale copy,
 *    while an edit made after the delete keeps the entry.
 *  - Folders: union by id, local wins on conflict (folders carry no timestamp).
 *  - Settings and meta.createdAt come from local (they're device preferences).
 */
import type { VaultData, VaultEntry, VaultTombstone } from "./schema";

const ts = (iso?: string) => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function mergeVaults(local: VaultData, remote: VaultData, now = new Date()): VaultData {
  const tombs = new Map<string, VaultTombstone>();
  for (const t of [...(local.tombstones ?? []), ...(remote.tombstones ?? [])]) {
    const prev = tombs.get(t.id);
    if (!prev || ts(t.deletedAt) > ts(prev.deletedAt)) tombs.set(t.id, t);
  }

  const entries = new Map<string, VaultEntry>();
  for (const e of local.entries) entries.set(e.id, e);
  for (const e of remote.entries) {
    const prev = entries.get(e.id);
    if (!prev || ts(e.updatedAt) > ts(prev.updatedAt)) entries.set(e.id, e);
  }

  for (const [id, e] of entries) {
    const t = tombs.get(id);
    if (t && ts(t.deletedAt) >= ts(e.updatedAt)) entries.delete(id);
  }
  // A surviving entry means its tombstone is obsolete (edited after delete).
  for (const id of entries.keys()) tombs.delete(id);

  const folders = new Map(local.folders.map((f) => [f.id, f]));
  for (const f of remote.folders) if (!folders.has(f.id)) folders.set(f.id, f);

  const merged = [...entries.values()];
  return {
    ...local,
    entries: merged,
    folders: [...folders.values()],
    tombstones: [...tombs.values()],
    meta: { ...local.meta, lastModifiedAt: now.toISOString(), entryCount: merged.length },
  };
}
