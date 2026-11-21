/**
 * @file src/core/vault/attachment.ts
 * Per-file encryption for attachments. Each file gets its own random
 * AES-256-GCM key, kept in the entry (so inside the encrypted vault); the
 * ciphertext is stored outside the vault blob (services/attachment-store.ts)
 * so the vault doesn't grow or get re-encrypted with every file.
 * The attachment id is bound as AAD, so blobs can't be swapped between
 * attachments.
 */
import { bytesToBase64, base64ToBytes, bytesToHex, utf8 } from "../crypto/encoding";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface VaultAttachment {
  id: string;
  name: string;
  /** Plaintext size in bytes. */
  size: number;
  /** MIME type as reported by the file picker (may be ""). */
  type: string;
  /** AES-256 key (raw, base64). Secret: only ever inside the vault. */
  key: string;
  /** SHA-256 of the plaintext (hex), checked after decryption. */
  sha256: string;
  addedAt: string;
}

export class AttachmentTooLargeError extends Error {}
export class AttachmentCorruptError extends Error {}

const IV = 12;

export async function encryptAttachment(
  bytes: Uint8Array<ArrayBuffer>,
  meta: { name: string; type: string },
): Promise<{ attachment: VaultAttachment; blob: Uint8Array<ArrayBuffer> }> {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentTooLargeError("File is too large");
  const id = crypto.randomUUID();
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(id) }, key, bytes),
  );
  const blob = new Uint8Array(IV + ct.length);
  blob.set(iv);
  blob.set(ct, IV);
  const sha = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const attachment: VaultAttachment = {
    id,
    name: meta.name.slice(0, 255),
    size: bytes.length,
    type: meta.type.slice(0, 127),
    key: bytesToBase64(raw),
    sha256: sha,
    addedAt: new Date().toISOString(),
  };
  raw.fill(0);
  return { attachment, blob };
}

export async function decryptAttachment(
  a: VaultAttachment,
  blob: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.length <= IV) throw new AttachmentCorruptError("Attachment data is damaged");
  const raw = base64ToBytes(a.key);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  raw.fill(0);
  let plain: Uint8Array<ArrayBuffer>;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: blob.slice(0, IV), additionalData: utf8(a.id) },
        key,
        blob.slice(IV),
      ),
    );
  } catch {
    throw new AttachmentCorruptError("Attachment data is damaged");
  }
  const sha = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", plain)));
  if (sha !== a.sha256) throw new AttachmentCorruptError("Attachment data is damaged");
  return plain;
}
