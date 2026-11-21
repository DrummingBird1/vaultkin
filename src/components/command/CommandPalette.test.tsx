import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import { ClipboardService } from "../../services/clipboard.service";
import "../../i18n";
import type { VaultData, VaultEntry } from "../../core/vault/schema";

// cmdk measures items; jsdom lacks these.
beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const entry = (over: Partial<VaultEntry>): VaultEntry => ({
  id: "e1",
  type: "login",
  title: "GitHub",
  username: "octo",
  password: "zebra-unique-secret",
  notes: "notes-only-word",
  category: "websites",
  tags: [],
  favorite: false,
  customFields: [],
  ...over,
});

function seed(entries: VaultEntry[]) {
  useVaultStore.setState({
    vault: {
      schemaVersion: 2,
      entries,
      folders: [],
      tombstones: [],
      settings: {
        autoLockMs: 1,
        defaultCategory: "websites",
        theme: "dark",
        accentColor: "#000",
        viewMode: "grid",
      },
      meta: { createdAt: "", lastModifiedAt: "" },
    } as VaultData,
  });
}

const items = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("<CommandPalette>", () => {
  it("finds entries by title/username but never by password or notes", async () => {
    seed([entry({})]);
    render(<CommandPalette onClose={() => {}} onNewEntry={() => {}} />);
    const input = screen.getByRole("combobox");

    await act(async () => void fireEvent.change(input, { target: { value: "octo" } }));
    expect(items().some((t) => t?.includes("GitHub"))).toBe(true);

    for (const secret of ["zebra-unique-secret", "notes-only-word"]) {
      await act(async () => void fireEvent.change(input, { target: { value: secret } }));
      expect(items().some((t) => t?.includes("GitHub"))).toBe(false);
    }
  });

  it("copies a password through the auto-clearing clipboard service and closes", async () => {
    seed([entry({})]);
    const copy = vi.spyOn(ClipboardService, "copy").mockResolvedValue(true);
    const onClose = vi.fn();
    render(<CommandPalette onClose={onClose} onNewEntry={() => {}} />);
    await act(async () => void fireEvent.click(screen.getByText("GitHub")));
    await act(async () => void fireEvent.click(screen.getByText("Copy password")));
    expect(copy).toHaveBeenCalledWith("zebra-unique-secret", "Password");
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to a settings section", async () => {
    seed([]);
    useUIStore.setState({ activePage: "vault", activeSection: null });
    render(<CommandPalette onClose={() => {}} onNewEntry={() => {}} />);
    await act(async () => void fireEvent.click(screen.getByText(/WebDAV backup/)));
    expect(useUIStore.getState()).toMatchObject({ activePage: "settings", activeSection: "sync" });
  });
});
