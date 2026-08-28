/**
 * @file src/services/storage.service.ts
 * IndexedDB persistence for the encrypted vault blob. Single key/value store,
 * key = "vault", value = the JSON string from serializer.saveVault.
 */

const DB_NAME = "securevault";
const STORE   = "vault";
const KEY     = "vault";
const DB_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export const StorageService = {
  async load(): Promise<string | null> {
    const db = await open();
    const tx = db.transaction(STORE, "readonly");
    const val = await reqToPromise<string | undefined>(tx.objectStore(STORE).get(KEY));
    db.close();
    return val ?? null;
  },
  async save(payload: string): Promise<void> {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    await reqToPromise(tx.objectStore(STORE).put(payload, KEY));
    db.close();
  },
  async delete(): Promise<void> {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    await reqToPromise(tx.objectStore(STORE).delete(KEY));
    db.close();
  },
};
