/**
 * @file src/store/vault.store.folders-tags.test.ts
 * addFolder/deleteFolder/renameTagGlobally/deleteTagGlobally — the vault
 * store methods added for nested folders and global tag management, not
 * already covered by tests/integration/vault-lifecycle.test.ts (which
 * focuses on the create/unlock/CRUD/lock crypto lifecycle).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useVaultStore } from "./vault.store";
import { createDefaultVaultData } from "../core/vault/vault-types";
import type { VaultData } from "../core/vault/schema";

function freshVault(): VaultData {
  return { schemaVersion: 1, ...createDefaultVaultData() };
}

beforeEach(() => {
  useVaultStore.getState().setVault(freshVault());
});

describe("addFolder", () => {
  it("adds a top-level folder", () => {
    const folder = useVaultStore.getState().addFolder("Work");
    expect(folder.name).toBe("Work");
    expect(folder.parentId).toBeUndefined();
    expect(useVaultStore.getState().vault?.folders).toHaveLength(1);
  });

  it("adds a nested folder with a parentId", () => {
    const parent = useVaultStore.getState().addFolder("Work");
    const child = useVaultStore.getState().addFolder("Projects", undefined, parent.id);
    expect(child.parentId).toBe(parent.id);
  });

  it("marks the vault dirty", () => {
    useVaultStore.getState().addFolder("Work");
    expect(useVaultStore.getState().isDirty).toBe(true);
  });
});

describe("deleteFolder", () => {
  it("removes the folder itself", () => {
    const { addFolder, deleteFolder } = useVaultStore.getState();
    const folder = addFolder("Work");
    deleteFolder(folder.id);
    expect(useVaultStore.getState().vault?.folders).toHaveLength(0);
  });

  it("cascade-deletes descendant subfolders", () => {
    const store = useVaultStore.getState();
    const root = store.addFolder("Root");
    const child = useVaultStore.getState().addFolder("Child", undefined, root.id);
    useVaultStore.getState().addFolder("Grandchild", undefined, child.id);
    expect(useVaultStore.getState().vault?.folders).toHaveLength(3);

    useVaultStore.getState().deleteFolder(root.id);
    expect(useVaultStore.getState().vault?.folders).toHaveLength(0);
  });

  it("does NOT delete entries filed in the deleted folder — only unfiles them", () => {
    const store = useVaultStore.getState();
    const folder = store.addFolder("Work");
    const entry = useVaultStore.getState().addEntry({
      type: "login",
      title: "Entry",
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
      folderId: folder.id,
    });

    useVaultStore.getState().deleteFolder(folder.id);

    const remaining = useVaultStore.getState().vault?.entries.find((e) => e.id === entry.id);
    expect(remaining).toBeDefined();
    expect(remaining?.folderId).toBeUndefined();
  });

  it("unfiles entries in a cascade-deleted descendant folder too", () => {
    const store = useVaultStore.getState();
    const root = store.addFolder("Root");
    const child = useVaultStore.getState().addFolder("Child", undefined, root.id);
    const entry = useVaultStore.getState().addEntry({
      type: "login",
      title: "Entry",
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
      folderId: child.id,
    });

    useVaultStore.getState().deleteFolder(root.id);

    const remaining = useVaultStore.getState().vault?.entries.find((e) => e.id === entry.id);
    expect(remaining?.folderId).toBeUndefined();
  });

  it("clears an active folderId search filter that pointed at the deleted folder", () => {
    const store = useVaultStore.getState();
    const folder = store.addFolder("Work");
    useVaultStore.getState().setSearchQuery({ folderId: folder.id });
    expect(useVaultStore.getState().searchQuery.folderId).toBe(folder.id);

    useVaultStore.getState().deleteFolder(folder.id);
    expect(useVaultStore.getState().searchQuery.folderId).toBeUndefined();
  });

  it("is a no-op for an unknown folder id", () => {
    useVaultStore.getState().addFolder("Work");
    useVaultStore.getState().deleteFolder("does-not-exist");
    expect(useVaultStore.getState().vault?.folders).toHaveLength(1);
  });
});

describe("renameTagGlobally", () => {
  function addTaggedEntry(tags: string[]) {
    return useVaultStore.getState().addEntry({
      type: "login",
      title: "Entry",
      category: "websites",
      tags,
      favorite: false,
      customFields: [],
    });
  }

  it("renames the tag on every entry that has it", () => {
    addTaggedEntry(["work", "urgent"]);
    addTaggedEntry(["personal"]);
    useVaultStore.getState().renameTagGlobally("work", "job");
    const tags = useVaultStore.getState().vault!.entries.map((e) => e.tags);
    expect(tags).toContainEqual(["job", "urgent"]);
    expect(tags).toContainEqual(["personal"]);
  });

  it("de-dupes if the entry already has both the old and new tag name", () => {
    addTaggedEntry(["work", "job"]);
    useVaultStore.getState().renameTagGlobally("work", "job");
    expect(useVaultStore.getState().vault!.entries[0].tags).toEqual(["job"]);
  });

  it("is a no-op when the new name is blank", () => {
    addTaggedEntry(["work"]);
    useVaultStore.getState().renameTagGlobally("work", "   ");
    expect(useVaultStore.getState().vault!.entries[0].tags).toEqual(["work"]);
  });

  it("is a no-op when the new name equals the old name", () => {
    addTaggedEntry(["work"]);
    const before = useVaultStore.getState().isDirty;
    useVaultStore.getState().renameTagGlobally("work", "work");
    expect(useVaultStore.getState().isDirty).toBe(before);
  });

  it("updates an active tag search filter that matches the renamed tag", () => {
    addTaggedEntry(["work"]);
    useVaultStore.getState().setSearchQuery({ tag: "work" });
    useVaultStore.getState().renameTagGlobally("work", "job");
    expect(useVaultStore.getState().searchQuery.tag).toBe("job");
  });

  it("trims whitespace from the new tag name", () => {
    addTaggedEntry(["work"]);
    useVaultStore.getState().renameTagGlobally("work", "  job  ");
    expect(useVaultStore.getState().vault!.entries[0].tags).toEqual(["job"]);
  });
});

describe("deleteTagGlobally", () => {
  function addTaggedEntry(tags: string[]) {
    return useVaultStore.getState().addEntry({
      type: "login",
      title: "Entry",
      category: "websites",
      tags,
      favorite: false,
      customFields: [],
    });
  }

  it("removes the tag from every entry that has it, leaving others untouched", () => {
    addTaggedEntry(["work", "urgent"]);
    addTaggedEntry(["personal"]);
    useVaultStore.getState().deleteTagGlobally("work");
    const tags = useVaultStore.getState().vault!.entries.map((e) => e.tags);
    expect(tags).toContainEqual(["urgent"]);
    expect(tags).toContainEqual(["personal"]);
  });

  it("clears an active tag search filter that matches the deleted tag", () => {
    addTaggedEntry(["work"]);
    useVaultStore.getState().setSearchQuery({ tag: "work" });
    useVaultStore.getState().deleteTagGlobally("work");
    expect(useVaultStore.getState().searchQuery.tag).toBeUndefined();
    // The entry should no longer be filtered out now that the filter is gone.
    expect(useVaultStore.getState().filteredEntries).toHaveLength(1);
  });

  it("is harmless for a tag no entry has", () => {
    addTaggedEntry(["work"]);
    useVaultStore.getState().deleteTagGlobally("nonexistent");
    expect(useVaultStore.getState().vault!.entries[0].tags).toEqual(["work"]);
  });
});
