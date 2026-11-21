import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);

const esc = () => fireEvent.keyDown(window, { key: "Escape" });

describe("<Modal>", () => {
  it("renders an accessible dialog", () => {
    render(<Modal label="Test dialog">body</Modal>);
    const d = screen.getByRole("dialog", { name: "Test dialog" });
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.className).toContain("sv-modal");
  });

  it("supports alertdialog and labelledBy", () => {
    render(
      <Modal role="alertdialog" labelledBy="t">
        <h2 id="t">Delete it?</h2>
      </Modal>,
    );
    expect(screen.getByRole("alertdialog", { name: "Delete it?" })).toBeTruthy();
  });

  it("closes on Escape and backdrop mousedown, not on panel mousedown", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} label="x">
        <button>inside</button>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Escape closes only the topmost modal", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal onClose={outer} label="outer">
          o
        </Modal>
        <Modal onClose={inner} label="inner">
          i
        </Modal>
      </>,
    );
    esc();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("is not dismissable when dismissable=false", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} dismissable={false} label="busy">
        b
      </Modal>,
    );
    esc();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders a form panel when onSubmit is given", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <Modal onSubmit={onSubmit} label="f">
        <button type="submit">go</button>
      </Modal>,
    );
    fireEvent.click(screen.getByText("go"));
    expect(onSubmit).toHaveBeenCalled();
    expect(screen.getByRole("dialog").tagName).toBe("FORM");
  });

  it("locks body scroll while open and restores it after", () => {
    const { unmount } = render(<Modal label="s">s</Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
