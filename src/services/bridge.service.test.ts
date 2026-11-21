import { describe, it, expect } from "vitest";
import { credentialsForUrl } from "./bridge.service";
import type { VaultEntry } from "../core/vault/schema";

let n = 0;
const login = (url: string | undefined, over: Partial<VaultEntry> = {}): VaultEntry => ({
  id: `e${++n}`,
  type: "login",
  title: url ?? "none",
  url,
  username: "u",
  password: "p",
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  ...over,
});

describe("credentialsForUrl", () => {
  const vault = [
    login("https://github.com"),
    login("https://gist.github.com"),
    login("github.com"), // stored without scheme
    login("https://github.com.evil.example"),
    login("https://notgithub.com"),
    login(undefined),
    login("https://github.com", { type: "note" }),
    login("https://bbc.co.uk"),
    login("https://news.bbc.co.uk"),
    login("https://other.co.uk"),
  ];

  it("returns same-site logins, exact host first, never look-alikes", () => {
    const r = credentialsForUrl(vault, "https://github.com/login");
    expect(r.map((c) => [c.url, c.exactHost])).toEqual([
      ["https://github.com", true],
      ["github.com", true],
      ["https://gist.github.com", false],
    ]);
  });

  it("respects multi-part public suffixes", () => {
    const r = credentialsForUrl(vault, "https://www.bbc.co.uk/");
    expect(r.map((c) => c.url).sort()).toEqual(["https://bbc.co.uk", "https://news.bbc.co.uk"]);
  });

  it("only exposes the invariant-9 fields", () => {
    const [c] = credentialsForUrl(
      [login("https://a.example", { notes: "secret", cardCVV: "123", totpSecret: "JBSW" })],
      "https://a.example",
    );
    expect(Object.keys(c).sort()).toEqual([
      "exactHost",
      "hasTotp",
      "id",
      "password",
      "title",
      "url",
      "username",
    ]);
    expect(c.hasTotp).toBe(true);
  });

  it("refuses non-web pages", () => {
    for (const u of ["file:///etc/passwd", "chrome://settings", "javascript:alert(1)", "not a url"])
      expect(credentialsForUrl(vault, u)).toEqual([]);
  });
});
