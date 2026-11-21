import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { analyzeVault, cardExpiryEnd, DAY_MS } from "./watchtower";
import type { VaultEntry } from "../vault/schema";

const NOW = Date.UTC(2026, 10, 21); // 2026-11-21
const STRONG = "Zq8#vL2!mT9@wR4$kP7^";
let n = 0;
const login = (over: Partial<VaultEntry> = {}): VaultEntry => ({
  id: `e${++n}`,
  type: "login",
  title: "x",
  password: STRONG + n,
  url: "https://example.com",
  totpSecret: "JBSWY3DP",
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  updatedAt: new Date(NOW - DAY_MS).toISOString(),
  ...over,
});
const types = (
  entries: VaultEntry[],
  breaches?: Map<string, { count: number; isPwned: boolean }>,
) =>
  analyzeVault(entries, { now: NOW, breaches })
    .issues.map((i) => i.type)
    .sort();

describe("analyzeVault", () => {
  it("a clean vault scores 100 with no issues", () => {
    const r = analyzeVault([login(), login()], { now: NOW });
    expect(r.issues).toEqual([]);
    expect(r.score).toBe(100);
  });

  it("finds weak, reused (grouped), pwned, old, missing and insecure", () => {
    const a = login({ password: "hunter2" });
    const b = login({ password: "hunter2" });
    const c = login({ password: undefined });
    const d = login({ url: "http://shop.example.com" });
    const e = login({ updatedAt: new Date(NOW - 400 * DAY_MS).toISOString() });
    const r = analyzeVault([a, b, c, d, e], {
      now: NOW,
      breaches: new Map([["hunter2", { count: 17000, isPwned: true }]]),
    });
    expect(r.byType.pwned.map((i) => i.entryId)).toEqual([a.id, b.id]);
    expect(r.byType.weak.map((i) => i.entryId).sort()).toEqual([a.id, b.id].sort());
    expect(r.reusedGroups).toEqual([[a.id, b.id]]);
    expect(r.byType.reused.every((i) => i.group === "g1" && i.params?.count === 2)).toBe(true);
    expect(r.byType["missing-password"].map((i) => i.entryId)).toEqual([c.id]);
    expect(r.byType["insecure-url"].map((i) => i.entryId)).toEqual([d.id]);
    expect(r.byType.old[0]).toMatchObject({
      entryId: e.id,
      severity: "medium",
      params: { count: 400 },
    });
    expect(r.issues[0].severity).toBe("critical"); // sorted most severe first
    expect(r.score).toBeLessThan(100);
  });

  it("does not flag local http addresses (routers, NAS, dev servers)", () => {
    for (const url of [
      "http://192.168.1.1",
      "http://localhost:8080",
      "http://nas.local",
      "http://10.0.0.5/admin",
    ])
      expect(types([login({ url })])).not.toContain("insecure-url");
  });

  it("flags expired and soon-expiring cards", () => {
    const expired = {
      type: "card" as const,
      title: "old card",
      cardNumber: "4242",
      cardExpiry: "09/26",
      password: undefined,
      url: undefined,
    };
    const soon = {
      type: "card" as const,
      title: "soon",
      cardNumber: "4242",
      cardExpiry: "12/26",
      password: undefined,
      url: undefined,
    };
    const fine = {
      type: "card" as const,
      title: "fine",
      cardNumber: "4242",
      cardExpiry: "12/2030",
      password: undefined,
      url: undefined,
    };
    expect(types([login(expired), login(soon), login(fine)])).toEqual([
      "expired-card",
      "expiring-card",
    ]);
  });

  it("no-2fa is informational and costs no score", () => {
    const r = analyzeVault([login({ totpSecret: undefined })], { now: NOW });
    expect(r.byType["no-2fa"]).toHaveLength(1);
    expect(r.score).toBe(100);
  });

  it("score stays within 0–100 for any vault", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ pw: fc.option(fc.string(), { nil: undefined }), http: fc.boolean() }),
          { maxLength: 30 },
        ),
        (rows) => {
          const r = analyzeVault(
            rows.map((x) =>
              login({ password: x.pw, url: x.http ? "http://a.example" : "https://a.example" }),
            ),
            { now: NOW },
          );
          return r.score >= 0 && r.score <= 100 && Number.isInteger(r.score);
        },
      ),
    );
  });
});

describe("cardExpiryEnd", () => {
  it("parses MM/YY and MM/YYYY to the end of that month", () => {
    expect(new Date(cardExpiryEnd("02/28")!).toISOString()).toBe("2028-02-29T23:59:59.999Z");
    expect(new Date(cardExpiryEnd(" 12 / 2030 ")!).toISOString()).toBe("2030-12-31T23:59:59.999Z");
    expect(cardExpiryEnd("13/26")).toBeNull();
    expect(cardExpiryEnd("soon")).toBeNull();
    expect(cardExpiryEnd(undefined)).toBeNull();
  });
});
