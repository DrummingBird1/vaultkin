import { describe, it, expect } from "vitest";
import { createShare, openShare, ShareExpiredError, ShareInvalidError } from "./share";
import type { VaultEntry } from "../vault/schema";

const entry: VaultEntry = {
  id: "e1",
  type: "login",
  title: "Wi-Fi router",
  username: "admin",
  password: "router-pw-123",
  url: "http://192.168.1.1",
  notes: "closet",
  totpSecret: "JBSWY3DPEHPK3PXP",
  category: "custom",
  folderId: "f1",
  tags: ["home"],
  favorite: true,
  customFields: [
    { id: "c1", label: "PIN", value: "4321", type: "password", protected: true },
    { id: "c2", label: "Model", value: "AX6000", type: "text", protected: false },
  ],
  ssh: { publicKey: "x", privateKey: "PRIVATE", fingerprint: "y" },
};
const DAY = 86_400_000;
const all = {
  includePassword: true,
  includeTotp: true,
  includeNotes: true,
  expiresInMs: DAY,
  from: "Idan",
};

describe("secure sharing", () => {
  it("round-trips only the chosen fields, and the file holds no plaintext", async () => {
    const { file, code } = await createShare(entry, {
      ...all,
      includeTotp: false,
      includeNotes: false,
    });
    expect(file).not.toMatch(/router-pw|admin|Wi-Fi|PRIVATE/);
    expect(code).toMatch(/^svk1-[A-Za-z0-9_-]{43}$/);
    const { entry: got, from } = await openShare(file, code);
    expect(from).toBe("Idan");
    expect(got).toMatchObject({
      title: "Wi-Fi router",
      username: "admin",
      password: "router-pw-123",
    });
    expect(got.totpSecret).toBeUndefined();
    expect(got.notes).toBeUndefined();
    expect(JSON.stringify(got)).not.toMatch(/PRIVATE|folderId|f1/);
  });

  it("without the password, protected custom fields are left out too", async () => {
    const { file, code } = await createShare(entry, { ...all, includePassword: false });
    const { entry: got } = await openShare(file, code);
    expect(got.password).toBeUndefined();
    expect(got.customFields.map((f) => f.label)).toEqual(["Model"]);
  });

  it("refuses a wrong code, an edited expiry, and an expired share", async () => {
    const now = Date.now();
    const { file, code } = await createShare(entry, all, now);
    const other = await createShare(entry, all, now);
    await expect(openShare(file, other.code)).rejects.toBeInstanceOf(ShareInvalidError);
    const f = JSON.parse(file);
    f.expiresAt = new Date(now + 365 * DAY).toISOString();
    await expect(openShare(JSON.stringify(f), code)).rejects.toBeInstanceOf(ShareInvalidError);
    await expect(openShare(file, code, now + 2 * DAY)).rejects.toBeInstanceOf(ShareExpiredError);
    await expect(openShare("garbage", code)).rejects.toBeInstanceOf(ShareInvalidError);
    await expect(openShare(file, "nope")).rejects.toBeInstanceOf(ShareInvalidError);
  });
});
