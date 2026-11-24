import { describe, it, expect } from "vitest";
import { splitBackup, joinBackup, IncompleteBackupError } from "./backup-text";
import { createVault, openVault } from "../core/vault/serializer";
import { createDefaultVaultData } from "../core/vault/vault-types";

const payload = JSON.stringify({ data: "QUJD+/=".repeat(400) });

describe("backup text", () => {
  it("rejoins QR parts in any order, with line breaks and repeats", () => {
    const parts = splitBackup(payload);
    expect(parts.length).toBeGreaterThan(2);
    expect(joinBackup([...parts].reverse().join("\r\n") + "\n" + parts[0])).toBe(payload);
    expect(joinBackup(parts.join(""))).toBe(payload);
  });

  it("passes a raw backup file through", () => {
    expect(joinBackup(`\n${payload}\n`)).toBe(payload);
  });

  it("names the missing parts and rejects mixed series", () => {
    const parts = splitBackup(payload);
    try {
      joinBackup([parts[0], ...parts.slice(2)].join("\n"));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IncompleteBackupError);
      expect((e as IncompleteBackupError).missing).toEqual([2]);
    }
    expect(() => joinBackup(parts.join("\n") + "\nSVQR:1/99:x")).toThrow(IncompleteBackupError);
    expect(() => joinBackup(parts.join("\n") + "\n" + parts[0].slice(0, -1) + "!")).toThrow(
      IncompleteBackupError,
    );
  });

  it("round-trips a real encrypted vault through QR parts", async () => {
    const { encryptedPayload } = await createVault("recovery words 1", createDefaultVaultData());
    const back = joinBackup(splitBackup(encryptedPayload).join("\n"));
    expect(back).toBe(encryptedPayload);
    expect((await openVault(back, "recovery words 1")).vault.entries).toEqual([]);
  }, 30_000);
});
