/**
 * @file src/services/attachment-store.ts
 * IndexedDB store for attachment ciphertext (key = attachment id). Holds only
 * encrypted bytes; keys live in the vault (core/vault/attachment.ts).
 * A separate database from the vault blob, so neither needs a schema bump.
 */
const DB_NAME = "securevault-attachments";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const AttachmentStore = {
  put: (id: string, blob: Uint8Array) => run("readwrite", (s) => s.put(blob, id)).then(() => {}),

  async get(id: string): Promise<Uint8Array | null> {
    const v = await run<unknown>("readonly", (s) => s.get(id));
    // isView rather than instanceof: structured clones can come from another realm.
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (Object.prototype.toString.call(v) === "[object ArrayBuffer]")
      return new Uint8Array(v as ArrayBuffer);
    return null;
  },

  delete: (id: string) => run("readwrite", (s) => s.delete(id)).then(() => {}),

  keys: () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((k) => k.map(String)),

  /** Wipe everything (vault deleted, duress). */
  clear: () => run("readwrite", (s) => s.clear()).then(() => {}),

  /** Remove blobs no entry references any more. Returns how many. */
  async collectGarbage(referenced: Set<string>): Promise<number> {
    let n = 0;
    for (const id of await this.keys()) {
      if (!referenced.has(id)) {
        await this.delete(id);
        n++;
      }
    }
    return n;
  },
};
