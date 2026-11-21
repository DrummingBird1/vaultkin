import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClipboardService } from "./clipboard.service";

let board = "";
beforeEach(() => {
  board = "";
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (t: string) => void (board = t)),
      readText: vi.fn(async () => board),
    },
  });
});
afterEach(() => {
  ClipboardService.cancelClear();
  vi.useRealTimers();
  delete (window as { electron?: unknown }).electron;
});

describe("ClipboardService (browser)", () => {
  it("clears after 30 s only if the clipboard still holds our copy", async () => {
    await ClipboardService.copy("s3cret");
    expect(board).toBe("s3cret");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe("");

    await ClipboardService.copy("s3cret");
    board = "user's own text";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board).toBe("user's own text");
  });

  it("clearNow wipes on lock", async () => {
    await ClipboardService.copy("s3cret");
    await ClipboardService.clearNow();
    expect(board).toBe("");
  });
});

describe("ClipboardService (desktop)", () => {
  it("routes through the main process and asks it to clear", async () => {
    const writeSecret = vi.fn(async () => ({ ok: true, excluded: true }));
    const clearSecret = vi.fn(async () => true);
    (window as { electron?: unknown }).electron = { clipboard: { writeSecret, clearSecret } };
    expect(await ClipboardService.copy("s3cret")).toBe(true);
    expect(writeSecret).toHaveBeenCalledWith("s3cret");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(clearSecret).toHaveBeenCalledOnce();
  });
});
