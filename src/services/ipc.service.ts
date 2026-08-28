/**
 * @file src/services/ipc.service.ts
 * Thin façade over storage. In the browser / Electron renderer, vault load/save
 * goes through IndexedDB. In a future hardened Electron build, the main process
 * would expose a contextBridge-protected fs API; the call sites here would
 * not need to change.
 */
import { StorageService } from "./storage.service";

export const IPCService = {
  vault: {
    load:   () => StorageService.load(),
    save:   (payload: string) => StorageService.save(payload),
    delete: () => StorageService.delete(),
    /** No-op placeholder. Real CSV/JSON export happens via Blob download in the
     *  page that builds the file content. */
    export: async (_filename: string, _content?: string) => { /* see Vault.page handleExportCSV */ },
  },
};
