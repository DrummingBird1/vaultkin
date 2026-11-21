import { describe, it, expect } from "vitest";
import { mergeVaults } from "./merge";
import type { VaultData, VaultEntry } from "./schema";

const entry = (id: string, updatedAt: string, title = id): VaultEntry => ({
  id,
  type: "login",
  title,
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});

const vault = (
  entries: VaultEntry[],
  tombstones: VaultData["tombstones"] = [],
  folders: VaultData["folders"] = [],
): VaultData => ({
  schemaVersion: 2,
  entries,
  folders,
  tombstones,
  settings: {
    autoLockMs: 1,
    defaultCategory: "websites",
    theme: "dark",
    accentColor: "#000",
    viewMode: "grid",
  },
  meta: { createdAt: "2026-01-01T00:00:00.000Z", lastModifiedAt: "2026-01-01T00:00:00.000Z" },
});

const T = (d: number) => new Date(Date.UTC(2026, 0, d)).toISOString();
const titles = (v: VaultData) => v.entries.map((e) => `${e.id}:${e.title}`).sort();

describe("mergeVaults", () => {
  it("unions entries and keeps the newer edit", () => {
    const m = mergeVaults(
      vault([entry("a", T(2), "local-a"), entry("b", T(5), "local-b")]),
      vault([entry("a", T(3), "remote-a"), entry("c", T(1))]),
    );
    expect(titles(m)).toEqual(["a:remote-a", "b:local-b", "c:c"]);
    expect(m.meta.entryCount).toBe(3);
  });

  it("ties keep the local version", () => {
    const m = mergeVaults(vault([entry("a", T(2), "L")]), vault([entry("a", T(2), "R")]));
    expect(titles(m)).toEqual(["a:L"]);
  });

  it("a delete on one side is not resurrected by the other side's older copy", () => {
    const m = mergeVaults(vault([], [{ id: "a", deletedAt: T(4) }]), vault([entry("a", T(3))]));
    expect(m.entries).toEqual([]);
    expect(m.tombstones).toEqual([{ id: "a", deletedAt: T(4) }]);
  });

  it("an edit made after the delete wins and drops the tombstone", () => {
    const m = mergeVaults(
      vault([], [{ id: "a", deletedAt: T(4) }]),
      vault([entry("a", T(6), "edited")]),
    );
    expect(titles(m)).toEqual(["a:edited"]);
    expect(m.tombstones).toEqual([]);
  });

  it("is symmetric in which entries survive", () => {
    const L = vault([entry("a", T(2)), entry("b", T(9))], [{ id: "c", deletedAt: T(5) }]);
    const R = vault([entry("c", T(3)), entry("d", T(1))], [{ id: "b", deletedAt: T(4) }]);
    expect(titles(mergeVaults(L, R))).toEqual(titles(mergeVaults(R, L)));
  });

  it("unions folders, local wins on the same id", () => {
    const m = mergeVaults(
      vault([], [], [{ id: "f", name: "Local" }]),
      vault(
        [],
        [],
        [
          { id: "f", name: "Remote" },
          { id: "g", name: "G" },
        ],
      ),
    );
    expect(m.folders.map((f) => f.name).sort()).toEqual(["G", "Local"]);
  });
});
