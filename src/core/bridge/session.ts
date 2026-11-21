/**
 * @file src/core/bridge/session.ts
 * End-to-end crypto for the extension ⇄ app bridge (ADR 0007). Pure WebCrypto,
 * runs unchanged in the app renderer, the extension service worker and tests.
 *
 *  - Identity: ECDH P-256 key pair per side.
 *  - Pairing code: 6 digits from SHA-256(sorted public keys ‖ origin), shown on
 *    both sides for the user to compare (numeric comparison).
 *  - Session key: ECDH → HKDF-SHA-256(salt = sorted public keys,
 *    info = "securevault-bridge-v1") → AES-256-GCM.
 *  - Messages: random 96-bit IV, AAD = "sv1|<direction>|<counter>". The
 *    receiver requires counter > last seen counter for that direction, so
 *    replayed, reordered or reflected messages are rejected.
 */
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding";

const INFO = new TextEncoder().encode("securevault-bridge-v1");
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export type Direction = "to-app" | "to-ext";

export interface SealedMessage {
  v: 1;
  dir: Direction;
  n: number;
  iv: string;
  ct: string;
}

export async function generateIdentity(): Promise<CryptoKeyPair> {
  // Private key non-extractable: it can be stored in IndexedDB but never read out.
  return crypto.subtle.generateKey(ECDH, false, ["deriveBits"]) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("Invalid public key");
  return crypto.subtle.importKey("raw", raw, ECDH, true, []);
}

function sortedConcat(a: string, b: string): Uint8Array<ArrayBuffer> {
  const [x, y] = [base64ToBytes(a), base64ToBytes(b)].sort((p, q) => {
    for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return p[i] - q[i];
    return p.length - q.length;
  });
  const out = new Uint8Array(x.length + y.length);
  out.set(x);
  out.set(y, x.length);
  return out;
}

/** Same 6 digits on both sides iff both saw the same two public keys and origin. */
export async function pairingCode(pubA: string, pubB: string, origin: string): Promise<string> {
  const keys = sortedConcat(pubA, pubB);
  const o = new TextEncoder().encode(origin);
  const data = new Uint8Array(keys.length + o.length);
  data.set(keys);
  data.set(o, keys.length);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const n = new DataView(h.buffer).getUint32(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export class BridgeSession {
  private sendCounter = 0;
  private lastRecv = 0;

  private constructor(
    private readonly key: CryptoKey,
    private readonly sendDir: Direction,
  ) {}

  /** `role` is which endpoint this is; it fixes the send/receive directions. */
  static async establish(
    own: CryptoKeyPair,
    ownPublicB64: string,
    peerPublicB64: string,
    role: "app" | "extension",
  ): Promise<BridgeSession> {
    const peer = await importPublicKey(peerPublicB64);
    const bits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer },
      own.privateKey,
      256,
    );
    const hkdfKey = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: sortedConcat(ownPublicB64, peerPublicB64),
        info: INFO,
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return new BridgeSession(key, role === "app" ? "to-ext" : "to-app");
  }

  private aad(dir: Direction, n: number): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(`sv1|${dir}|${n}`);
  }

  async seal(payload: unknown): Promise<SealedMessage> {
    const n = ++this.sendCounter;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.aad(this.sendDir, n) },
      this.key,
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    return {
      v: 1,
      dir: this.sendDir,
      n,
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(ct)),
    };
  }

  /** Throws on tampering, wrong direction, or a counter that isn't fresh. */
  async open(msg: SealedMessage): Promise<unknown> {
    const recvDir: Direction = this.sendDir === "to-ext" ? "to-app" : "to-ext";
    if (!msg || msg.v !== 1 || msg.dir !== recvDir) throw new Error("Bad message");
    if (!Number.isSafeInteger(msg.n) || msg.n <= this.lastRecv) throw new Error("Replayed message");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(msg.iv), additionalData: this.aad(msg.dir, msg.n) },
      this.key,
      base64ToBytes(msg.ct),
    );
    this.lastRecv = msg.n;
    return JSON.parse(new TextDecoder().decode(plain));
  }
}
