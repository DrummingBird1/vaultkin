import { describe, it, expect } from "vitest";
import {
  buildPayload,
  cleanTotpSecret,
  inferType,
  initialState,
  initialTab,
  isValidWebUrl,
  normalizeUrl,
  validate,
} from "./entry-form";
import type { VaultEntry } from "../../../core/vault/schema";

const base = (over: Partial<VaultEntry> = {}): VaultEntry => ({
  id: "e1",
  type: "login",
  title: "T",
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  ...over,
});

describe("entry-form", () => {
  it("normalizes and validates URLs", () => {
    expect(normalizeUrl(" example.com ")).toBe("https://example.com");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b");
    expect(normalizeUrl("")).toBe("");
    expect(isValidWebUrl("https://a.b")).toBe(true);
    expect(isValidWebUrl("javascript:alert(1)")).toBe(false);
    expect(isValidWebUrl("ftp://a.b")).toBe(false);
  });

  it("cleans TOTP secrets", () => {
    expect(cleanTotpSecret(" jbsw y3dp ")).toBe("JBSWY3DP");
  });

  it("validates title, URL and TOTP", () => {
    const s = { ...initialState(), url: "javascript:x", totpSecret: "!!" };
    expect(validate(s)).toEqual({
      title: "entry.errors.title",
      url: "entry.errors.url",
      totp: "entry.errors.totp",
    });
    expect(validate({ ...initialState(), title: "ok", url: "example.com" })).toEqual({});
  });

  it("keeps an existing entry's type (regression: every save forced 'login')", () => {
    const card = base({ type: "card", cardNumber: "4242" });
    const s = { ...initialState(card), title: "Visa" };
    expect(buildPayload(s, { existing: card }).type).toBe("card");
    expect(initialTab(card)).toBe("card");
    expect(initialTab(base({ type: "note" }))).toBe("notes");
  });

  it("infers type for new entries from their content", () => {
    const empty = initialState();
    expect(inferType({ ...empty, cardNumber: "4242" })).toBe("card");
    expect(inferType({ ...empty, notes: "secret" })).toBe("note");
    expect(inferType({ ...empty, notes: "n", password: "p" })).toBe("login");
    expect(inferType(empty)).toBe("login");
  });

  it("editing keeps the entry's folder and TOTP params (regression: folder reset to the current view)", () => {
    const e = base({
      folderId: "f-original",
      totpSecret: "JBSWY3DP",
      totpDigits: 8,
      totpPeriod: 60,
      totpAlgorithm: "SHA256",
    });
    const p = buildPayload(initialState(e), { existing: e, folderId: "f-current-view" });
    expect(p.folderId).toBe("f-original");
    expect(p).toMatchObject({ totpDigits: 8, totpPeriod: 60, totpAlgorithm: "SHA256" });
    expect(buildPayload({ ...initialState(), title: "n" }, { folderId: "f-new" }).folderId).toBe(
      "f-new",
    );
  });

  it("trims and drops empty optional fields", () => {
    const p = buildPayload({ ...initialState(), title: "  X  ", url: "a.b", notes: "  " }, {});
    expect(p.title).toBe("X");
    expect(p.url).toBe("https://a.b");
    expect(p.notes).toBeUndefined();
    expect(p.cardNumber).toBeUndefined();
  });

  it("an entry holding only an SSH key is an ssh entry, and keeps its key", () => {
    const ssh = { publicKey: "ssh-ed25519 AAAA x", privateKey: "PEM", fingerprint: "SHA256:x" };
    const st = { ...initialState(), title: "server", ssh };
    expect(inferType(st)).toBe("ssh");
    expect(buildPayload(st, {}).ssh).toEqual(ssh);
    expect(initialTab(base({ type: "ssh", ssh }))).toBe("ssh");
    expect(initialState(base({ type: "ssh", ssh })).ssh).toEqual(ssh);
  });
});
