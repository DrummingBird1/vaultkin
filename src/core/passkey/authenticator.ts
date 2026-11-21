/**
 * @file src/core/passkey/authenticator.ts
 * A software WebAuthn authenticator (passkeys stored in the vault).
 * Pure WebCrypto; no DOM. Implements what a platform/synced authenticator
 * returns for navigator.credentials.create() / .get():
 *
 *   - ES256 (P-256 ECDSA / SHA-256) key pairs, COSE_Key public keys
 *   - authenticatorData: rpIdHash ‖ flags ‖ signCount ‖ [attestedCredentialData]
 *   - attestation "none" (attestationObject = CBOR {fmt, attStmt, authData})
 *   - assertion signature = ECDSA(authData ‖ SHA-256(clientDataJSON)), DER-encoded
 *
 * Flags: UP always, UV when the user verified in the app, BE+BS because these
 * passkeys are synced with the vault. signCount stays 0 (normal for synced
 * passkeys; relying parties must not reject 0).
 */
export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_BE = 0x08;
export const FLAG_BS = 0x10;
export const FLAG_AT = 0x40;

/** All-zero AAGUID: "no specific authenticator model" (allowed with attestation none). */
const AAGUID = new Uint8Array(16);

export interface StoredPasskey {
  credentialId: string; // base64url
  rpId: string;
  userHandle: string; // base64url, as given by the RP
  userName: string;
  userDisplayName?: string;
  privateJwk: JsonWebKey;
  publicKeyCose: string; // base64url
  createdAt: string;
}

// ── base64url ──────────────────────────────────────────────────────────────
export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

// ── Minimal CBOR encoder (what WebAuthn needs) ─────────────────────────────
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor> | { [k: string]: Cbor };

function head(major: number, n: number): Uint8Array {
  if (n < 24) return new Uint8Array([(major << 5) | n]);
  if (n < 0x100) return new Uint8Array([(major << 5) | 24, n]);
  if (n < 0x10000) return new Uint8Array([(major << 5) | 25, n >> 8, n & 0xff]);
  return new Uint8Array([
    (major << 5) | 26,
    (n >>> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff,
  ]);
}

export function cbor(v: Cbor): Uint8Array<ArrayBuffer> {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new Error("CBOR: integers only");
    return v >= 0 ? concat(head(0, v)) : concat(head(1, -1 - v));
  }
  if (typeof v === "string") {
    const b = new TextEncoder().encode(v);
    return concat(head(3, b.length), b);
  }
  if (v instanceof Uint8Array) return concat(head(2, v.length), v);
  const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return concat(head(5, entries.length), ...entries.flatMap(([k, val]) => [cbor(k), cbor(val)]));
}

// ── Keys ─────────────────────────────────────────────────────────────────
/** COSE_Key for an EC2 P-256 ES256 public key. */
export async function coseFromPublicKey(pub: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pub)); // 0x04 ‖ x ‖ y
  return cbor(
    new Map<Cbor, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, raw.slice(1, 33)],
      [-3, raw.slice(33, 65)],
    ]),
  );
}

/** Raw ECDSA (r‖s, 64 bytes) → ASN.1 DER, as WebAuthn requires. */
export function rawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32, 64)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export async function authenticatorData(
  rpId: string,
  flags: number,
  attested?: { credentialId: Uint8Array; cosePublicKey: Uint8Array },
): Promise<Uint8Array<ArrayBuffer>> {
  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const signCount = new Uint8Array(4); // 0
  if (!attested) return concat(rpIdHash, new Uint8Array([flags]), signCount);
  const len = new Uint8Array([
    attested.credentialId.length >> 8,
    attested.credentialId.length & 0xff,
  ]);
  return concat(
    rpIdHash,
    new Uint8Array([flags | FLAG_AT]),
    signCount,
    AAGUID,
    len,
    attested.credentialId,
    attested.cosePublicKey,
  );
}

export interface CreateResult {
  passkey: StoredPasskey;
  attestationObject: string; // base64url
  authenticatorData: string; // base64url
  publicKeySpki: string; // base64url, for PublicKeyCredential.response.getPublicKey()
}

/** navigator.credentials.create(): new ES256 key pair and an attestation-"none" response. */
export async function createPasskey(opts: {
  rpId: string;
  userHandle: string;
  userName: string;
  userDisplayName?: string;
  userVerified: boolean;
}): Promise<CreateResult> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const cosePublicKey = await coseFromPublicKey(pair.publicKey);
  const flags = FLAG_UP | (opts.userVerified ? FLAG_UV : 0) | FLAG_BE | FLAG_BS;
  const authData = await authenticatorData(opts.rpId, flags, { credentialId, cosePublicKey });
  const attestationObject = cbor({ fmt: "none", attStmt: {}, authData });
  return {
    passkey: {
      credentialId: b64u(credentialId),
      rpId: opts.rpId,
      userHandle: opts.userHandle,
      userName: opts.userName,
      userDisplayName: opts.userDisplayName,
      privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
      publicKeyCose: b64u(cosePublicKey),
      createdAt: new Date().toISOString(),
    },
    attestationObject: b64u(attestationObject),
    authenticatorData: b64u(authData),
    publicKeySpki: b64u(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
  };
}

export interface AssertionResult {
  credentialId: string;
  authenticatorData: string;
  signature: string; // DER, base64url
  userHandle: string;
}

/** navigator.credentials.get(): sign authenticatorData ‖ SHA-256(clientDataJSON). */
export async function signAssertion(
  passkey: StoredPasskey,
  clientDataJSON: Uint8Array<ArrayBuffer>,
  userVerified: boolean,
): Promise<AssertionResult> {
  const key = await crypto.subtle.importKey(
    "jwk",
    passkey.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const authData = await authenticatorData(
    passkey.rpId,
    FLAG_UP | (userVerified ? FLAG_UV : 0) | FLAG_BE | FLAG_BS,
  );
  const signed = concat(authData, await sha256(clientDataJSON));
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signed),
  );
  return {
    credentialId: passkey.credentialId,
    authenticatorData: b64u(authData),
    signature: b64u(rawToDer(raw)),
    userHandle: passkey.userHandle,
  };
}

/**
 * WebAuthn RP ID rule: the RP ID must equal the caller's effective domain or
 * be a registrable suffix of it (e.g. page login.example.com may use
 * "example.com", never "com" or "other.com"). Only https (or localhost) pages.
 */
export function rpIdAllowed(
  rpId: string,
  pageOrigin: string,
  isPublicSuffix: (d: string) => boolean,
): boolean {
  let u: URL;
  try {
    u = new URL(pageOrigin);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const id = rpId.toLowerCase();
  if (u.protocol !== "https:" && !(u.protocol === "http:" && host === "localhost")) return false;
  if (id === "localhost") return host === "localhost"; // allowed by WebAuthn for development
  if (!id || isPublicSuffix(id)) return false;
  return host === id || host.endsWith(`.${id}`);
}
