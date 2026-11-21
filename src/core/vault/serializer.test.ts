/**
 * @file src/core/vault/serializer.test.ts
 * Unit tests for the public façade (createVault/openVault/saveVault/
 * reEncryptVault/changeMasterPassword) — focused on serializer-level
 * behavior (payload validation, KDF selection, password change) rather
 * than the full app-lifecycle flow already covered by
 * tests/integration/vault-lifecycle.test.ts.
 */
import { CURRENT_SCHEMA_VERSION } from "./migrations";
import { describe, it, expect } from "vitest";
import {
  createVault,
  openVault,
  saveVault,
  reEncryptVault,
  changeMasterPassword,
  exportDeviceKey,
  openVaultWithDeviceKey,
  payloadSalt,
} from "./serializer";
import { deriveKeys, encryptVault, DEFAULT_KDF, PBKDF2_FALLBACK } from "./engine";
import { VaultCorruptError, WrongPasswordError } from "../errors";
import { createDefaultVaultData } from "./vault-types";
import { bytesToBase64 } from "../crypto/encoding";

const PASSWORD = "correct-horse-battery-staple-77!";

describe("createVault", () => {
  it("derives Argon2id keys by default for new vaults", async () => {
    const { sessionKeys } = await createVault(PASSWORD, createDefaultVaultData());
    expect(sessionKeys.kdf).toEqual(DEFAULT_KDF);
  });

  it("stamps the current schemaVersion onto the vault data", async () => {
    const { vault } = await createVault(PASSWORD, createDefaultVaultData());
    expect(vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe("openVault — happy path", () => {
  it("opens a vault created moments ago with the same password", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    const { vault } = await openVault(encryptedPayload, PASSWORD);
    expect(vault.entries).toEqual([]);
  });

  it("opens a legacy PBKDF2-SHA256 vault (backward compatibility)", async () => {
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const keys = await deriveKeys(PASSWORD, salt, PBKDF2_FALLBACK);
    const vaultData = { schemaVersion: 1, ...createDefaultVaultData() };
    const payload = await encryptVault(JSON.stringify(vaultData), keys, vaultData.meta.createdAt);
    const { vault, sessionKeys } = await openVault(JSON.stringify(payload), PASSWORD);
    expect(vault.entries).toEqual([]);
    expect(sessionKeys.kdf.name).toBe("PBKDF2-SHA256");
  });
});

describe("openVault — malformed payload handling", () => {
  it("throws VaultCorruptError on invalid JSON", async () => {
    await expect(openVault("not json at all", PASSWORD)).rejects.toThrow(VaultCorruptError);
  });

  it("throws VaultCorruptError on an unsupported version", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    const outer = JSON.parse(encryptedPayload);
    outer.version = 99;
    await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
  });

  it("throws VaultCorruptError on an unknown KDF name", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    const outer = JSON.parse(encryptedPayload);
    outer.kdf.name = "MD5-lol";
    await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
  });

  it.each([NaN, Infinity, -1, 0, "not-a-number"])(
    "throws VaultCorruptError on an invalid iteration count (%p)",
    async (bad) => {
      const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
      const outer = JSON.parse(encryptedPayload);
      outer.kdf.iterations = bad;
      await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
    },
  );

  it.each(["salt", "iv", "data", "mac"] as const)(
    "throws VaultCorruptError when %s is missing",
    async (field) => {
      const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
      const outer = JSON.parse(encryptedPayload);
      delete outer[field];
      await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
    },
  );

  it.each(["salt", "iv", "data", "mac"] as const)(
    "throws VaultCorruptError when %s is not valid base64",
    async (field) => {
      const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
      const outer = JSON.parse(encryptedPayload);
      outer[field] = "!!!not-base64!!!";
      await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
    },
  );

  it("throws VaultCorruptError when the salt decodes shorter than 8 bytes", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    const outer = JSON.parse(encryptedPayload);
    outer.salt = bytesToBase64(new Uint8Array([1, 2, 3])); // 3 bytes, under the 8-byte floor
    await expect(openVault(JSON.stringify(outer), PASSWORD)).rejects.toThrow(VaultCorruptError);
  });

  it("throws WrongPasswordError (not VaultCorruptError) for a well-formed payload opened with the wrong password", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    await expect(openVault(encryptedPayload, "wrong password entirely")).rejects.toThrow(
      WrongPasswordError,
    );
  });
});

describe("saveVault / reEncryptVault", () => {
  it("saveVault updates lastModifiedAt and entryCount", async () => {
    const { vault, sessionKeys } = await createVault(PASSWORD, createDefaultVaultData());
    const before = vault.meta.lastModifiedAt;
    vault.entries.push({
      id: "e1",
      type: "login",
      title: "Test",
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
    });
    await new Promise((r) => setTimeout(r, 5));
    await saveVault(vault, sessionKeys);
    expect(vault.meta.entryCount).toBe(1);
    expect(vault.meta.lastModifiedAt).not.toBe(before);
  });

  it("saveVault produces a payload re-openable with the same password", async () => {
    const { vault, sessionKeys } = await createVault(PASSWORD, createDefaultVaultData());
    const reEncrypted = await saveVault(vault, sessionKeys);
    const { vault: reopened } = await openVault(reEncrypted, PASSWORD);
    expect(reopened.entries).toEqual([]);
  });

  it("reEncryptVault preserves the original createdAt from the existing payload", async () => {
    const { encryptedPayload, vault, sessionKeys } = await createVault(
      PASSWORD,
      createDefaultVaultData(),
    );
    const originalCreatedAt = JSON.parse(encryptedPayload).createdAt;
    vault.meta.createdAt = "2099-01-01T00:00:00.000Z"; // simulate drift, shouldn't be used
    const reEncrypted = await reEncryptVault(vault, sessionKeys, encryptedPayload);
    expect(JSON.parse(reEncrypted).createdAt).toBe(originalCreatedAt);
  });

  it("reEncryptVault falls back to vault.meta.createdAt if the existing payload JSON is unparseable", async () => {
    const { vault, sessionKeys } = await createVault(PASSWORD, createDefaultVaultData());
    const reEncrypted = await reEncryptVault(vault, sessionKeys, "not json");
    expect(JSON.parse(reEncrypted).createdAt).toBe(vault.meta.createdAt);
  });
});

describe("changeMasterPassword", () => {
  it("re-encrypts under a fresh salt with the new password", async () => {
    const { vault, sessionKeys } = await createVault(PASSWORD, createDefaultVaultData());
    const NEW_PASSWORD = "a-brand-new-master-password-99!";
    const { encryptedPayload, sessionKeys: newKeys } = await changeMasterPassword(
      vault,
      NEW_PASSWORD,
    );
    expect(newKeys.salt).not.toBe(sessionKeys.salt);
    // Old password should no longer open it.
    await expect(openVault(encryptedPayload, PASSWORD)).rejects.toThrow(WrongPasswordError);
    // New password should.
    const { vault: reopened } = await openVault(encryptedPayload, NEW_PASSWORD);
    expect(reopened.entries).toEqual([]);
  });

  it("always derives the new keys with Argon2id, even upgrading from a PBKDF2 vault", async () => {
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const oldKeys = await deriveKeys(PASSWORD, salt, PBKDF2_FALLBACK);
    const vaultData = { schemaVersion: 1, ...createDefaultVaultData() };
    await encryptVault(JSON.stringify(vaultData), oldKeys, vaultData.meta.createdAt);

    const { sessionKeys: newKeys } = await changeMasterPassword(vaultData, PASSWORD);
    expect(newKeys.kdf.name).toBe("Argon2id");
  });
});

describe("device key (remember this device)", () => {
  it("exports the key only for the right password, and it opens the vault", async () => {
    const { encryptedPayload } = await createVault(PASSWORD, createDefaultVaultData());
    await expect(exportDeviceKey(encryptedPayload, "wrong-password")).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
    const raw = await exportDeviceKey(encryptedPayload, PASSWORD);
    expect(raw.length).toBe(64);
    const copy = raw.slice();
    const { vault } = await openVaultWithDeviceKey(encryptedPayload, raw);
    expect(vault.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(raw.every((b) => b === 0)).toBe(true); // wiped after use
    expect(payloadSalt(encryptedPayload)).toBe(JSON.parse(encryptedPayload).salt);
    // A remembered key stops working once the master password changes.
    const { vault: v2 } = await openVault(encryptedPayload, PASSWORD);
    const { encryptedPayload: changed } = await changeMasterPassword(v2, "a-new-master-pw-88!");
    await expect(openVaultWithDeviceKey(changed, copy)).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
