/**
 * @file vault-lifecycle.test.ts
 * @description End-to-end integration tests: create → unlock → CRUD → lock → re-unlock.
 *
 * These tests exercise the FULL crypto pipeline:
 *   createVault() → encrypted blob → openVault() → decrypted vault
 *   addEntry() → isDirty → re-encrypt → openVault() → entries preserved
 *
 * They use real WebCrypto (AES-256-GCM + HMAC-SHA256 + PBKDF2/Argon2id fallback)
 * since Node 18+ exposes globalThis.crypto.subtle.
 *
 * No mocking of crypto primitives — this tests the actual security layer.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createVault, openVault, saveVault } from "../../src/core/vault/serializer";
import { useVaultStore }    from "../../src/store/vault.store";
import { useSessionStore }  from "../../src/store/session.store";
import { onVaultUnlocked, lockApplication } from "../../src/store";
import type { VaultData }   from "../../src/core/vault/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MASTER_PW = "correct-horse-battery-staple-77!";
const WRONG_PW  = "incorrect-password-attempt-xyz!!";

const MINIMAL_VAULT: Omit<VaultData, "schemaVersion"> = {
  entries: [],
  folders: [],
  settings: {
    autoLockMs: 900_000,
    defaultCategory: "websites",
    theme: "dark",
    accentColor: "#6366F1",
    viewMode: "grid",
  },
  meta: {
    createdAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
  },
};

// ─── Vault Creation ───────────────────────────────────────────────────────────

describe("Vault creation", () => {
  it("creates an encrypted vault payload", async () => {
    const { encryptedPayload } = await createVault(MASTER_PW, MINIMAL_VAULT);
    expect(typeof encryptedPayload).toBe("string");
    expect(encryptedPayload.length).toBeGreaterThan(100);
  });

  it("produces a valid JSON payload with required outer fields", async () => {
    const { encryptedPayload } = await createVault(MASTER_PW, MINIMAL_VAULT);
    const outer = JSON.parse(encryptedPayload);
    expect(outer).toHaveProperty("version");
    expect(outer).toHaveProperty("kdf");
    expect(outer).toHaveProperty("salt");
    expect(outer).toHaveProperty("iv");
    expect(outer).toHaveProperty("data");
    expect(outer).toHaveProperty("mac");
  });

  it("produces different ciphertexts for same password (random salt/IV)", async () => {
    const { encryptedPayload: p1 } = await createVault(MASTER_PW, MINIMAL_VAULT);
    const { encryptedPayload: p2 } = await createVault(MASTER_PW, MINIMAL_VAULT);
    expect(p1).not.toBe(p2);
  });

  it("returns session keys with encKey and macKey", async () => {
    const { sessionKeys } = await createVault(MASTER_PW, MINIMAL_VAULT);
    expect(sessionKeys).toBeDefined();
    expect(sessionKeys.encKey).toBeDefined();
    expect(sessionKeys.macKey).toBeDefined();
  });
});

// ─── Vault Unlock ─────────────────────────────────────────────────────────────

describe("Vault unlock", () => {
  let encryptedPayload: string;

  beforeEach(async () => {
    const result = await createVault(MASTER_PW, MINIMAL_VAULT);
    encryptedPayload = result.encryptedPayload;
  });

  it("unlocks successfully with correct password", async () => {
    const { vault } = await openVault(encryptedPayload, MASTER_PW);
    expect(vault).toBeDefined();
    expect(vault.entries).toEqual([]);
    expect(vault.folders).toEqual([]);
  });

  it("returns session keys on successful unlock", async () => {
    const { sessionKeys } = await openVault(encryptedPayload, MASTER_PW);
    expect(sessionKeys.encKey).toBeDefined();
    expect(sessionKeys.macKey).toBeDefined();
  });

  it("rejects incorrect password with specific error", async () => {
    await expect(openVault(encryptedPayload, WRONG_PW)).rejects.toThrow(
      /master password|integrity|decrypt/i
    );
  });

  it("rejects empty password", async () => {
    await expect(openVault(encryptedPayload, "")).rejects.toThrow();
  });

  it("rejects tampered ciphertext (MAC verification failure)", async () => {
    const outer = JSON.parse(encryptedPayload);
    // Flip a byte in the ciphertext
    const data = Buffer.from(outer.data, "base64");
    data[10] ^= 0xFF;
    outer.data = data.toString("base64");
    const tampered = JSON.stringify(outer);
    await expect(openVault(tampered, MASTER_PW)).rejects.toThrow(
      /integrity|master password|decrypt/i
    );
  });

  it("rejects tampered IV", async () => {
    const outer = JSON.parse(encryptedPayload);
    const iv = Buffer.from(outer.iv, "base64");
    iv[0] ^= 0xFF;
    outer.iv = iv.toString("base64");
    const tampered = JSON.stringify(outer);
    await expect(openVault(tampered, MASTER_PW)).rejects.toThrow();
  });
});

// ─── Vault CRUD ───────────────────────────────────────────────────────────────

describe("Vault CRUD operations", () => {
  let encryptedPayload: string;

  beforeEach(async () => {
    const result = await createVault(MASTER_PW, MINIMAL_VAULT);
    encryptedPayload = result.encryptedPayload;
    const { vault } = await openVault(encryptedPayload, MASTER_PW);
    onVaultUnlocked(vault);
  });

  afterEach(() => {
    lockApplication();
  });

  it("adds an entry and marks vault as dirty", () => {
    const store = useVaultStore.getState();
    expect(store.isDirty).toBe(false);

    store.addEntry({
      type: "login", title: "GitHub", username: "dev@example.com",
      password: "secret123", url: "https://github.com",
      category: "websites", tags: [], favorite: false, customFields: [],
    } as any);

    const updated = useVaultStore.getState();
    expect(updated.vault?.entries.length).toBe(1);
    expect(updated.isDirty).toBe(true);
    expect(updated.vault?.entries[0]?.title).toBe("GitHub");
  });

  it("updates an existing entry", () => {
    const store = useVaultStore.getState();
    const entry = store.addEntry({
      type: "login", title: "GitHub", username: "user@example.com",
      password: "old_pass", url: "https://github.com",
      category: "websites", tags: [], favorite: false, customFields: [],
    } as any);

    store.updateEntry(entry.id, { password: "new_pass" });
    const updated = useVaultStore.getState().vault?.entries.find(e => e.id === entry.id);
    expect(updated?.password).toBe("new_pass");
  });

  it("deletes an entry", () => {
    const store = useVaultStore.getState();
    const entry = store.addEntry({
      type: "login", title: "ToDelete", username: "u",
      password: "p", category: "websites", tags: [], favorite: false, customFields: [],
    } as any);

    expect(useVaultStore.getState().vault?.entries.length).toBe(1);
    store.deleteEntry(entry.id);
    expect(useVaultStore.getState().vault?.entries.length).toBe(0);
  });

  it("toggles favorite", () => {
    const store = useVaultStore.getState();
    const entry = store.addEntry({
      type: "login", title: "GitHub", username: "u",
      password: "p", category: "websites", tags: [], favorite: false, customFields: [],
    } as any);

    expect(useVaultStore.getState().vault?.entries[0]?.favorite).toBe(false);
    store.toggleFavorite(entry.id);
    expect(useVaultStore.getState().vault?.entries[0]?.favorite).toBe(true);
    store.toggleFavorite(entry.id);
    expect(useVaultStore.getState().vault?.entries[0]?.favorite).toBe(false);
  });
});

// ─── Re-encryption (save → re-open) ──────────────────────────────────────────

describe("Vault re-encryption and persistence", () => {
  it("re-encrypts vault after entry addition and re-opens successfully", async () => {
    // 1. Create vault
    const { encryptedPayload: original, vault: v1, sessionKeys } =
      await createVault(MASTER_PW, MINIMAL_VAULT);

    // 2. Unlock and populate store
    onVaultUnlocked(v1);

    // 3. Add entry (mutates store, marks dirty)
    const { addEntry, vault } = useVaultStore.getState();
    addEntry({
      type: "login", title: "Test Entry", username: "user@test.com",
      password: "super_secret_pass!", url: "https://test.com",
      category: "websites", tags: ["test"], favorite: false, customFields: [],
    } as any);

    // 4. Re-encrypt with new in-memory vault data
    const currentVault = useVaultStore.getState().vault!;
    const reEncrypted  = await saveVault(currentVault, sessionKeys);

    // 5. Open the re-encrypted vault
    const { vault: reopened } = await openVault(reEncrypted, MASTER_PW);

    expect(reopened.entries.length).toBe(1);
    expect(reopened.entries[0]?.title).toBe("Test Entry");
    expect(reopened.entries[0]?.username).toBe("user@test.com");
    expect(reopened.entries[0]?.password).toBe("super_secret_pass!");

    lockApplication();
  });

  it("preserves all entry fields across encrypt/decrypt cycle", async () => {
    const { encryptedPayload, vault: v1, sessionKeys } = await createVault(MASTER_PW, MINIMAL_VAULT);
    onVaultUnlocked(v1);

    const entry = useVaultStore.getState().addEntry({
      type: "login",
      title: "Full Entry",
      username: "full@test.com",
      password: "P@ssw0rd!$%",
      url: "https://full.test.com",
      notes: "This is a secure note with unicode: 日本語 🔒",
      totpSecret: "JBSWY3DPEHPK3PXP",
      totpAlgorithm: "SHA1",
      totpDigits: 6,
      totpPeriod: 30,
      category: "finance",
      tags: ["work", "finance"],
      favorite: true,
      customFields: [
        { id: "cf1", label: "API Key", value: "sk-1234567890abcdef", type: "password", protected: true },
      ],
    } as any);

    const currentVault = useVaultStore.getState().vault!;
    const reEncrypted  = await saveVault(currentVault, sessionKeys);
    const { vault: reopened } = await openVault(reEncrypted, MASTER_PW);

    const saved = reopened.entries.find(e => e.id === entry.id)!;
    expect(saved).toBeDefined();
    expect(saved.title).toBe("Full Entry");
    expect(saved.notes).toBe("This is a secure note with unicode: 日本語 🔒");
    expect(saved.totpSecret).toBe("JBSWY3DPEHPK3PXP");
    expect(saved.tags).toEqual(["work", "finance"]);
    expect(saved.favorite).toBe(true);
    expect(saved.customFields[0]?.value).toBe("sk-1234567890abcdef");

    lockApplication();
  });
});

// ─── Lock / Unlock Cycle ──────────────────────────────────────────────────────

describe("Lock / Unlock cycle", () => {
  it("clears vault and session keys on lock", async () => {
    const { encryptedPayload, vault, sessionKeys } = await createVault(MASTER_PW, MINIMAL_VAULT);
    onVaultUnlocked(vault);

    const sessionStore = useSessionStore.getState();
    sessionStore.unlock(sessionKeys, 900_000);
    expect(useSessionStore.getState().isUnlocked).toBe(true);
    expect(useVaultStore.getState().vault).not.toBeNull();

    lockApplication("manual");

    expect(useSessionStore.getState().isUnlocked).toBe(false);
    expect(useSessionStore.getState().sessionKeys).toBeNull();
    expect(useVaultStore.getState().vault).toBeNull();
  });

  it("re-unlocks successfully after lock", async () => {
    const { encryptedPayload } = await createVault(MASTER_PW, MINIMAL_VAULT);
    lockApplication("manual");

    // Re-unlock
    const { vault, sessionKeys } = await openVault(encryptedPayload, MASTER_PW);
    onVaultUnlocked(vault);
    useSessionStore.getState().unlock(sessionKeys, 900_000);

    expect(useSessionStore.getState().isUnlocked).toBe(true);
    expect(useVaultStore.getState().vault?.entries).toEqual([]);

    lockApplication();
  });
});

// ─── Search & Filter ──────────────────────────────────────────────────────────

describe("Vault search and filtering", () => {
  beforeEach(async () => {
    const { vault } = await createVault(MASTER_PW, MINIMAL_VAULT);
    onVaultUnlocked(vault);

    const store = useVaultStore.getState();
    store.addEntry({ type:"login", title:"GitHub",  username:"dev@gh.com",   password:"p1", category:"websites", tags:["dev"],     favorite:false, customFields:[] } as any);
    store.addEntry({ type:"login", title:"Google",  username:"u@gmail.com",  password:"p2", category:"websites", tags:["personal"], favorite:true,  customFields:[] } as any);
    store.addEntry({ type:"login", title:"AWS",     username:"admin@aws.com",password:"p3", category:"servers",  tags:["dev","work"],favorite:false, customFields:[] } as any);
    store.addEntry({ type:"login", title:"Binance", username:"crypto@user",  password:"p4", category:"finance",  tags:["finance"],  favorite:false, customFields:[] } as any);
  });

  afterEach(() => lockApplication());

  it("returns all entries when no query", () => {
    const { filteredEntries } = useVaultStore.getState();
    expect(filteredEntries.length).toBe(4);
  });

  it("filters by text (case-insensitive title match)", () => {
    useVaultStore.getState().setSearchQuery({ text: "git" });
    const { filteredEntries } = useVaultStore.getState();
    expect(filteredEntries.length).toBe(1);
    expect(filteredEntries[0]?.title).toBe("GitHub");
  });

  it("filters by username", () => {
    useVaultStore.getState().setSearchQuery({ text: "gmail.com" });
    const { filteredEntries } = useVaultStore.getState();
    expect(filteredEntries.length).toBe(1);
    expect(filteredEntries[0]?.title).toBe("Google");
  });

  it("filters by category", () => {
    useVaultStore.getState().setSearchQuery({ category: "finance" } as any);
    const { filteredEntries } = useVaultStore.getState();
    expect(filteredEntries.length).toBe(1);
    expect(filteredEntries[0]?.title).toBe("Binance");
  });

  it("filters favorites only", () => {
    useVaultStore.getState().setSearchQuery({ favoritesOnly: true } as any);
    const { filteredEntries } = useVaultStore.getState();
    expect(filteredEntries.length).toBe(1);
    expect(filteredEntries[0]?.title).toBe("Google");
  });

  it("clears search and shows all entries", () => {
    useVaultStore.getState().setSearchQuery({ text: "github" });
    expect(useVaultStore.getState().filteredEntries.length).toBe(1);
    useVaultStore.getState().clearSearch();
    expect(useVaultStore.getState().filteredEntries.length).toBe(4);
  });
});
