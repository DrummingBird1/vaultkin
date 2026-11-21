import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { AttachmentStore } from "./attachment-store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("AttachmentStore", () => {
  it("stores, reads, garbage-collects and clears blobs", async () => {
    await AttachmentStore.put("keep", new Uint8Array([1, 2, 3]));
    await AttachmentStore.put("orphan", new Uint8Array([4]));
    expect(Array.from((await AttachmentStore.get("keep"))!)).toEqual([1, 2, 3]);
    expect(await AttachmentStore.collectGarbage(new Set(["keep"]))).toBe(1);
    expect(await AttachmentStore.get("orphan")).toBeNull();
    await AttachmentStore.clear();
    expect(await AttachmentStore.keys()).toEqual([]);
  });
});
