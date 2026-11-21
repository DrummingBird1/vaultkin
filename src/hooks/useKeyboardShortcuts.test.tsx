import React, { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useKeyboardShortcuts, useSlashToSearch } from "./useKeyboardShortcuts";
import { useSessionStore } from "../store/session.store";
import { useUIStore } from "../store/ui.store";

afterEach(cleanup);
beforeEach(() =>
  useUIStore.setState({ paletteOpen: false, newEntryRequest: 0, activePage: "health" }),
);

/** Re-renders on EVERY keydown, like the auto-lock activity tracker does. */
function Noisy({ children }: { children?: React.ReactNode }) {
  const [, setN] = useState(0);
  React.useEffect(() => {
    const bump = () => setN((n) => n + 1);
    window.addEventListener("keydown", bump, true);
    return () => window.removeEventListener("keydown", bump, true);
  }, []);
  useKeyboardShortcuts();
  return <>{children}</>;
}

const ctrl = (key: string) => act(() => void fireEvent.keyDown(window, { key, ctrlKey: true }));

describe("useKeyboardShortcuts", () => {
  it("still fires when the tree re-renders during the keydown (regression)", () => {
    render(<Noisy />);
    ctrl("n");
    expect(useUIStore.getState().newEntryRequest).toBe(1);
    expect(useUIStore.getState().activePage).toBe("vault");
  });

  it("Ctrl+K toggles the command palette", () => {
    render(<Noisy />);
    ctrl("k");
    expect(useUIStore.getState().paletteOpen).toBe(true);
    ctrl("k");
    expect(useUIStore.getState().paletteOpen).toBe(false);
  });

  it("ignores shortcuts while a dialog is open, except lock", () => {
    const lock = vi.spyOn(useSessionStore.getState(), "lock");
    render(
      <Noisy>
        <div aria-modal="true" />
      </Noisy>,
    );
    ctrl("n");
    ctrl("k");
    expect(useUIStore.getState().newEntryRequest).toBe(0);
    expect(useUIStore.getState().paletteOpen).toBe(false);
    ctrl("L");
    expect(lock).toHaveBeenCalled();
  });
});

describe("useSlashToSearch", () => {
  function Slash({ onFocus }: { onFocus: () => void }) {
    useSlashToSearch(onFocus);
    return <input aria-label="field" />;
  }

  it("focuses search on '/', but not while typing", () => {
    const onFocus = vi.fn();
    const { getByLabelText } = render(<Slash onFocus={onFocus} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(onFocus).toHaveBeenCalledTimes(1);
    getByLabelText("field").focus();
    fireEvent.keyDown(getByLabelText("field"), { key: "/" });
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
