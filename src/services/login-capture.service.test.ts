import { describe, it, expect } from "vitest";
import { loginStatus } from "./login-capture.service";
import type { VaultEntry } from "../core/vault/schema";

const login = (url: string, username: string, password: string): VaultEntry => ({
  id: `${url}|${username}`,
  type: "login",
  title: url,
  url,
  username,
  password,
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
});

describe("loginStatus", () => {
  const vault = [
    login("https://github.com", "octo", "old-pw"),
    login("https://gist.github.com", "octo", "gist-pw"),
  ];

  it("new account on a known site, new site, changed and same password", () => {
    expect(loginStatus(vault, "https://github.com/session", "other", "x")).toBe("new");
    expect(loginStatus(vault, "https://gitlab.com/login", "octo", "old-pw")).toBe("new");
    expect(loginStatus(vault, "https://github.com/session", "octo", "new-pw")).toBe("changed");
    expect(loginStatus(vault, "https://www.github.com/session", "octo", "old-pw")).toBe("same");
  });

  it("matches the exact host only (subdomains and look-alikes are separate)", () => {
    expect(loginStatus(vault, "https://gist.github.com/", "octo", "gist-pw")).toBe("same");
    expect(loginStatus(vault, "https://github.com.evil.example/", "octo", "old-pw")).toBe("new");
  });
});
