import { describe, it, expect } from "vitest";
import {
  encryptAttachment,
  decryptAttachment,
  AttachmentCorruptError,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "./attachment";

const file = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

describe("attachments", () => {
  it("round-trips and keeps no plaintext in the blob", async () => {
    const { attachment, blob } = await encryptAttachment(file("passport scan bytes"), {
      name: "passport.pdf",
      type: "application/pdf",
    });
    expect(attachment).toMatchObject({ name: "passport.pdf", size: 19, type: "application/pdf" });
    expect(new TextDecoder().decode(blob)).not.toContain("passport");
    expect(new TextDecoder().decode(await decryptAttachment(attachment, blob))).toBe(
      "passport scan bytes",
    );
  });

  it("each file gets its own key; a blob can't be opened as another attachment", async () => {
    const a = await encryptAttachment(file("A"), { name: "a", type: "" });
    const b = await encryptAttachment(file("B"), { name: "b", type: "" });
    expect(a.attachment.key).not.toBe(b.attachment.key);
    // Same key, other id (AAD) → refused.
    await expect(
      decryptAttachment({ ...a.attachment, id: b.attachment.id }, a.blob),
    ).rejects.toBeInstanceOf(AttachmentCorruptError);
    const tampered = a.blob.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(decryptAttachment(a.attachment, tampered)).rejects.toBeInstanceOf(
      AttachmentCorruptError,
    );
  });

  it("refuses files over the limit", async () => {
    await expect(
      encryptAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES + 1), { name: "big", type: "" }),
    ).rejects.toBeInstanceOf(AttachmentTooLargeError);
  });
});
