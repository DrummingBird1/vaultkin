import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useSessionStore } from "../store/session.store";

afterEach(cleanup);

/** Re-renders on EVERY keydown, like the auto-lock activity tracker does. */
function NoisyHarness({ onNew }: { onNew: () => void }) {
  const [, setN] = useState(0);
  React.useEffect(() => {
    const bump = () => setN((n) => n + 1);
    window.addEventListener("keydown", bump, true);
    return () => window.removeEventListener("keydown", bump, true);
  }, []);
  useKeyboardShortcuts({ onNewEntry: () => onNew() }); // new handler object every render
  return null;
}

describe("useKeyboardShortcuts", () => {
  it("still fires when the component re-renders during the keydown (regression)", () => {
    const onNew = vi.fn();
    render(<NoisyHarness onNew={onNew} />);
    act(() => {
      fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    });
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while a dialog is open, except lock", () => {
    const onNew = vi.fn();
    const lock = vi.spyOn(useSessionStore.getState(), "lock");
    render(
      <>
        <NoisyHarness onNew={onNew} />
        <div aria-modal="true" />
      </>,
    );
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(onNew).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "L", ctrlKey: true });
    expect(lock).toHaveBeenCalled();
  });
});
