/**
 * @file src/core/ssh/ssh-key.ts
 * Ed25519 SSH keys: generate, import/export OpenSSH formats, fingerprint, sign.
 * Pure WebCrypto + byte handling (no DOM, no Node), so it runs in the app,
 * the Electron main process and the CLI alike.
 *
 * Formats:
 *  - public:  "ssh-ed25519 <base64(string "ssh-ed25519" || string pub32)> comment"
 *  - private: PEM "OPENSSH PRIVATE KEY" (openssh-key-v1), unencrypted inside;
 *             the vault's own encryption protects it at rest. Passphrase-
 *             protected keys are rejected on import (we'd need bcrypt-pbkdf).
 */
import { bytesToBase64, base64ToBytes, utf8 } from "../crypto/encoding";

export const SSH_ED25519 = "ssh-ed25519";

export interface SshKeyMaterial {
  /** "ssh-ed25519 AAAA... comment" */
  publicKey: string;
  /** -----BEGIN OPENSSH PRIVATE KEY----- ... */
  privateKey: string;
  /** "SHA256:..." as printed by ssh-keygen -l */
  fingerprint: string;
  comment: string;
}

// ── SSH wire encoding ─────────────────────────────────────────────────────
export function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}
export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
export function sshString(b: Uint8Array | string): Uint8Array {
  const bytes = typeof b === "string" ? utf8(b) : b;
  return concat(u32(bytes.length), bytes);
}

/** Sequential reader over SSH wire data; throws on truncation. */
export class SshReader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  get remaining(): number {
    return this.b.length - this.o;
  }
  uint32(): number {
    if (this.remaining < 4) throw new Error("truncated");
    const v =
      ((this.b[this.o] << 24) |
        (this.b[this.o + 1] << 16) |
        (this.b[this.o + 2] << 8) |
        this.b[this.o + 3]) >>>
      0;
    this.o += 4;
    return v;
  }
  bytes(n: number): Uint8Array {
    if (n > this.remaining) throw new Error("truncated");
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  string(): Uint8Array {
    return this.bytes(this.uint32());
  }
  text(): string {
    return new TextDecoder().decode(this.string());
  }
}

// ── Key helpers ───────────────────────────────────────────────────────────
/** PKCS#8 prefix for a raw 32-byte Ed25519 seed (RFC 8410). */
const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

export function publicBlob(pub32: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat(sshString(SSH_ED25519), sshString(pub32));
}

export async function fingerprint(pub32: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", publicBlob(pub32)));
  return "SHA256:" + bytesToBase64(h).replace(/=+$/, "");
}

function wrapPem(b64: string): string {
  const lines = b64.match(/.{1,70}/g) ?? [];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join("\n")}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/** openssh-key-v1, cipher "none". */
function encodePrivate(seed: Uint8Array, pub32: Uint8Array, comment: string): string {
  const check = crypto.getRandomValues(new Uint8Array(4));
  let inner = concat(
    check,
    check,
    sshString(SSH_ED25519),
    sshString(pub32),
    sshString(concat(seed, pub32)), // OpenSSH stores seed || pub (64 bytes)
    sshString(comment),
  );
  const pad = (8 - (inner.length % 8)) % 8;
  inner = concat(
    inner,
    Uint8Array.from({ length: pad }, (_, i) => i + 1),
  );
  const body = concat(
    utf8("openssh-key-v1\0"),
    sshString("none"),
    sshString("none"),
    sshString(new Uint8Array(0)),
    u32(1),
    sshString(publicBlob(pub32)),
    sshString(inner),
  );
  return wrapPem(bytesToBase64(body));
}

/** Parse an unencrypted OpenSSH Ed25519 private key. */
export function parsePrivateKey(pem: string): {
  seed: Uint8Array;
  pub32: Uint8Array;
  comment: string;
} {
  const m = pem.match(
    /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END OPENSSH PRIVATE KEY-----/,
  );
  if (!m) throw new Error("Not an OpenSSH private key");
  const bytes = base64ToBytes(m[1].replace(/\s+/g, ""));
  const magic = "openssh-key-v1\0";
  if (new TextDecoder().decode(bytes.subarray(0, magic.length)) !== magic)
    throw new Error("Not an OpenSSH private key");
  const r = new SshReader(bytes.subarray(magic.length));
  const cipher = r.text();
  const kdf = r.text();
  r.string(); // kdf options
  if (cipher !== "none" || kdf !== "none")
    throw new Error(
      "Passphrase-protected keys aren't supported; remove the passphrase first (ssh-keygen -p)",
    );
  if (r.uint32() !== 1) throw new Error("Multiple keys in one file aren't supported");
  r.string(); // public blob
  const inner = new SshReader(r.string());
  if (inner.uint32() !== inner.uint32()) throw new Error("Corrupt private key");
  const type = inner.text();
  if (type !== SSH_ED25519) throw new Error(`Only Ed25519 keys are supported (got ${type})`);
  const pub32 = inner.string();
  const priv = inner.string();
  if (pub32.length !== 32 || priv.length !== 64) throw new Error("Corrupt private key");
  return { seed: priv.slice(0, 32), pub32: pub32.slice(), comment: inner.text() };
}

export function formatPublicKey(pub32: Uint8Array, comment: string): string {
  return `${SSH_ED25519} ${bytesToBase64(publicBlob(pub32))}${comment ? " " + comment : ""}`;
}

async function material(
  seed: Uint8Array,
  pub32: Uint8Array,
  comment: string,
): Promise<SshKeyMaterial> {
  return {
    publicKey: formatPublicKey(pub32, comment),
    privateKey: encodePrivate(seed, pub32, comment),
    fingerprint: await fingerprint(pub32),
    comment,
  };
}

/** New Ed25519 key pair. */
export async function generateSshKey(comment = ""): Promise<SshKeyMaterial> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub32 = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const seed = pkcs8.slice(PKCS8_ED25519_PREFIX.length);
  try {
    return await material(seed, pub32, comment);
  } finally {
    seed.fill(0);
    pkcs8.fill(0);
  }
}

/** Import an existing unencrypted OpenSSH Ed25519 private key (re-encoded). */
export async function importSshKey(pem: string, comment?: string): Promise<SshKeyMaterial> {
  const k = parsePrivateKey(pem);
  // Check the seed really belongs to the public key.
  const signer = await signingKey(k.seed);
  const probe = utf8("securevault-ssh-import-check");
  const sig = await crypto.subtle.sign("Ed25519", signer, probe);
  const verifier = await crypto.subtle.importKey(
    "raw",
    k.pub32 as Uint8Array<ArrayBuffer>,
    "Ed25519",
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("Ed25519", verifier, sig, probe)))
    throw new Error("Private and public key don't match");
  return material(k.seed, k.pub32, comment ?? k.comment);
}

/** Non-extractable signing key from a 32-byte seed. */
export function signingKey(seed: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", concat(PKCS8_ED25519_PREFIX, seed), "Ed25519", false, [
    "sign",
  ]);
}

/** SSH signature blob: string "ssh-ed25519" || string sig64. */
export async function signSsh(privateKeyPem: string, data: Uint8Array): Promise<Uint8Array> {
  const { seed } = parsePrivateKey(privateKeyPem);
  const key = await signingKey(seed);
  seed.fill(0);
  const sig = new Uint8Array(
    await crypto.subtle.sign("Ed25519", key, data as Uint8Array<ArrayBuffer>),
  );
  return concat(sshString(SSH_ED25519), sshString(sig));
}

/** Public key blob (wire format) from an "ssh-ed25519 AAAA..." line. */
export function publicBlobFromLine(line: string): Uint8Array {
  const b64 = line.trim().split(/\s+/)[1];
  if (!b64) throw new Error("Not an SSH public key");
  return base64ToBytes(b64);
}
