import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { migrateVault, CURRENT_SCHEMA_VERSION } from "./migrations";
import { createVault, openVault } from "./serializer";
import { encryptVault, deriveKeys, DEFAULT_KDF } from "./engine";
import { VaultCorruptError } from "../errors";
import { bytesToBase64 } from "../crypto/encoding";

const v1Doc = () => ({
  schemaVersion: 1,
  entries: [
    {
      id: "a",
      type: "login",
      title: "A",
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
    },
    {
      id: "b",
      type: "login",
      title: "B",
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ],
  folders: [],
  settings: {
    autoLockMs: 1,
    defaultCategory: "websites",
    theme: "dark",
    accentColor: "#000",
    viewMode: "grid",
  },
  meta: { createdAt: "2026-01-01T00:00:00.000Z", lastModifiedAt: "2026-01-01T00:00:00.000Z" },
});

describe("migrateVault", () => {
  it("upgrades v1 to the current schema with tombstones and entry timestamps", () => {
    const { vault, migrated } = migrateVault(v1Doc());
    expect(migrated).toBe(true);
    expect(vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(vault.tombstones).toEqual([]);
    expect(vault.entries[0]).toMatchObject({
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(vault.entries[1]).toMatchObject({
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("treats a document without schemaVersion as v1", () => {
    const doc: Record<string, unknown> = v1Doc();
    delete doc.schemaVersion;
    expect(migrateVault(doc).vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("is a no-op on a current document", () => {
    const once = migrateVault(v1Doc()).vault;
    const again = migrateVault(structuredClone(once));
    expect(again.migrated).toBe(false);
    expect(again.vault).toEqual(once);
  });

  it("refuses documents from a newer app version", () => {
    expect(() => migrateVault({ ...v1Doc(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(
      VaultCorruptError,
    );
  });

  it("never throws anything but VaultCorruptError on arbitrary input", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        try {
          migrateVault(x);
        } catch (e) {
          expect(e).toBeInstanceOf(VaultCorruptError);
        }
      }),
    );
  });
});

describe("openVault + migrations", () => {
  it("opens a v1 vault fixture and reports it as migrated", async () => {
    const pw = "migration-fixture-password-1!";
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const keys = await deriveKeys(pw, salt, DEFAULT_KDF);
    const payload = await encryptVault(JSON.stringify(v1Doc()), keys, "2026-01-01T00:00:00.000Z");
    const { vault, migrated } = await openVault(JSON.stringify(payload), pw);
    expect(migrated).toBe(true);
    expect(vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(vault.entries.map((e) => e.title)).toEqual(["A", "B"]);
  });

  it("new vaults are created at the current schema and open unmigrated", async () => {
    const pw = "fresh-vault-password-2!";
    const created = await createVault(pw, {
      entries: [],
      folders: [],
      tombstones: [],
      settings: v1Doc().settings as never,
      meta: v1Doc().meta,
    });
    expect(created.vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const opened = await openVault(created.encryptedPayload, pw);
    expect(opened.migrated).toBe(false);
  });
});
