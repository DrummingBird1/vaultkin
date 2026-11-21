import { describe, it, expect, beforeEach } from "vitest";
import { formatHash, parseHash } from "./route";
import { useUIStore } from "../store/ui.store";

describe("hash routes", () => {
  it("parses pages and sections", () => {
    expect(parseHash("#/settings/sync")).toEqual({ page: "settings", section: "sync" });
    expect(parseHash("#/health")).toEqual({ page: "health" });
    expect(parseHash("#settings")).toEqual({ page: "settings" });
  });

  it("rejects unknown pages and drops malformed sections", () => {
    expect(parseHash("")).toBeNull();
    expect(parseHash("#/admin")).toBeNull();
    expect(parseHash("#/settings/<script>")).toEqual({ page: "settings" });
    expect(parseHash("#/settings/" + "a".repeat(40))).toEqual({ page: "settings" });
  });

  it("round-trips", () => {
    for (const h of ["#/vault", "#/settings/danger", "#/generator"])
      expect(formatHash(parseHash(h)!)).toBe(h);
  });
});

describe("ui.store navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/vault");
    useUIStore.setState({ activePage: "vault", activeSection: null });
  });

  it("setActivePage updates state and pushes a hash entry", () => {
    const before = window.history.length;
    useUIStore.getState().setActivePage("settings", "security");
    expect(useUIStore.getState()).toMatchObject({
      activePage: "settings",
      activeSection: "security",
    });
    expect(window.location.hash).toBe("#/settings/security");
    expect(window.history.length).toBe(before + 1);
  });

  it("applyRoute updates state without touching history", () => {
    const before = window.history.length;
    useUIStore.getState().applyRoute("health");
    expect(useUIStore.getState().activePage).toBe("health");
    expect(window.history.length).toBe(before);
  });
});
