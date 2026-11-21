import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Button } from "./Button";
import { Field } from "./Field";
import { Toaster } from "./Toaster";
import { useUIStore } from "../../store/ui.store";

afterEach(cleanup);

describe("<Button>", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>plain</Button>
      </form>,
    );
    fireEvent.click(screen.getByText("plain"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("busy disables, sets aria-busy and swaps the label", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" busy busyLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Saving…" });
    expect(b).toHaveProperty("disabled", true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.className).toContain("sv-btn-primary");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("<Field>", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field label="Email" hint="We never send mail" error="Required">
        {(p) => <input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Required", "We never send mail"]);
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });

  it("has no aria-invalid or describedby when clean", () => {
    render(<Field label="Name">{(p) => <input {...p} />}</Field>);
    const input = screen.getByLabelText("Name");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("<Toaster>", () => {
  it("renders toasts from the store; errors are alerts; dismiss removes", () => {
    useUIStore.setState({ toasts: [] });
    render(<Toaster />);
    act(() => {
      useUIStore.setState({
        toasts: [
          { id: "1", type: "success", title: "Saved" },
          { id: "2", type: "error", title: "Sync failed", message: "HTTP 500" },
        ],
      });
    });
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Sync failed");
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(useUIStore.getState().toasts.map((t) => t.id)).toEqual(["2"]);
  });
});
