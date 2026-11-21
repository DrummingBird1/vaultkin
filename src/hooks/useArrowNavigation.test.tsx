import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useArrowNavigation } from "./useArrowNavigation";
import type { VaultEntry } from "../core/vault/schema";

afterEach(cleanup);

const e = (id: string) =>
  ({
    id,
    type: "login",
    title: id,
    category: "websites",
    tags: [],
    favorite: false,
    customFields: [],
  }) as VaultEntry;
const order = [e("a"), e("b"), e("c")];

function Harness({
  selected,
  onSelect,
  children,
}: {
  selected: string | null;
  onSelect: (x: VaultEntry) => void;
  children?: React.ReactNode;
}) {
  useArrowNavigation(order, selected, onSelect);
  return <>{children}</>;
}

const down = () => fireEvent.keyDown(window, { key: "ArrowDown" });
const up = () => fireEvent.keyDown(window, { key: "ArrowUp" });

describe("useArrowNavigation", () => {
  it("walks the order and clamps at both ends", () => {
    const sel = vi.fn();
    const { rerender } = render(<Harness selected={null} onSelect={sel} />);
    down();
    expect(sel).toHaveBeenLastCalledWith(order[0]);
    rerender(<Harness selected="c" onSelect={sel} />);
    down();
    expect(sel).toHaveBeenLastCalledWith(order[2]);
    rerender(<Harness selected="a" onSelect={sel} />);
    up();
    expect(sel).toHaveBeenLastCalledWith(order[0]);
  });

  it("does nothing while a modal is open (regression)", () => {
    const sel = vi.fn();
    render(
      <Harness selected="a" onSelect={sel}>
        <div aria-modal="true" />
      </Harness>,
    );
    down();
    expect(sel).not.toHaveBeenCalled();
  });

  it("does nothing while typing in a field", () => {
    const sel = vi.fn();
    const { getByRole } = render(
      <Harness selected="a" onSelect={sel}>
        <input />
      </Harness>,
    );
    getByRole("textbox").focus();
    down();
    expect(sel).not.toHaveBeenCalled();
  });
});
