/**
 * @file src/core/vault/grouping.test.ts
 * registrableDomain / getServiceKey / groupByService — the Service view's
 * grouping heuristic. See docs/adr/0003-no-psl-dependency.md: this is a
 * curated last-two-(or-three)-labels heuristic, not a full PSL
 * implementation, so tests stick to cases the heuristic is meant to cover.
 */
import { describe, it, expect } from "vitest";
import { registrableDomain, getServiceKey, groupByService } from "./grouping";
import type { VaultEntry } from "./schema";

function entry(overrides: Partial<VaultEntry>): VaultEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: "login",
    title: "Entry",
    category: "websites",
    tags: [],
    favorite: false,
    customFields: [],
    ...overrides,
  };
}

describe("registrableDomain", () => {
  it("returns a simple two-label domain as-is", () => {
    expect(registrableDomain("github.com")).toBe("github.com");
  });

  it("strips a leading www.", () => {
    expect(registrableDomain("www.github.com")).toBe("github.com");
  });

  it("collapses a subdomain to its registrable domain", () => {
    expect(registrableDomain("accounts.google.com")).toBe("google.com");
  });

  it("extends to three labels for a known multi-part TLD", () => {
    expect(registrableDomain("example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("mail.example.co.uk")).toBe("example.co.uk");
  });

  it("does not over-extend an unknown two-label suffix", () => {
    expect(registrableDomain("sub.example.com")).toBe("example.com");
  });

  it("lower-cases the result", () => {
    expect(registrableDomain("GitHub.COM")).toBe("github.com");
  });

  it("handles a bare single-label host", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
  });
});

describe("getServiceKey", () => {
  it("extracts the registrable domain from a full https URL", () => {
    expect(getServiceKey(entry({ url: "https://accounts.google.com/signin" }))).toBe("google.com");
  });

  it("tolerates a URL without a protocol", () => {
    expect(getServiceKey(entry({ url: "github.com/login" }))).toBe("github.com");
  });

  it("falls back to '(no domain)' when there's no URL", () => {
    expect(getServiceKey(entry({ url: undefined }))).toBe("(no domain)");
  });

  it("falls back to '(no domain)' for an unparseable URL", () => {
    expect(getServiceKey(entry({ url: "not a url at all :://" }))).toBe("(no domain)");
  });
});

describe("groupByService", () => {
  it("groups entries sharing a registrable domain together", () => {
    const entries = [
      entry({ title: "GitHub work", url: "https://github.com/a" }),
      entry({ title: "GitHub personal", url: "https://www.github.com/b" }),
      entry({ title: "GitLab", url: "https://gitlab.com" }),
    ];
    const groups = groupByService(entries);
    const github = groups.find((g) => g.key === "github.com");
    expect(github?.entries).toHaveLength(2);
  });

  it("sorts groups by size descending, then alphabetically for ties", () => {
    const entries = [
      entry({ title: "Z1", url: "https://zeta.com" }),
      entry({ title: "A1", url: "https://alpha.com" }),
      entry({ title: "B1", url: "https://beta.com" }),
      entry({ title: "B2", url: "https://beta.com" }),
    ];
    const groups = groupByService(entries);
    expect(groups[0].key).toBe("beta.com"); // size 2, largest first
    expect(groups[1].key).toBe("alpha.com"); // tie-break: alphabetical
    expect(groups[2].key).toBe("zeta.com");
  });

  it("buckets entries with no domain into a single '(no domain)' group", () => {
    const entries = [entry({ title: "Note 1" }), entry({ title: "Note 2" })];
    const groups = groupByService(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("(no domain)");
    expect(groups[0].entries).toHaveLength(2);
  });

  it("returns an empty array for no entries", () => {
    expect(groupByService([])).toEqual([]);
  });
});
