/**
 * @file src/electron/preload.ts
 * Vault load/save still goes through the renderer's own IndexedDB (see
 * src/services/ipc.service.ts) — no bridge needed for that. This exposes
 * the first real main-process IPC channel: manual update checking
 * (src/electron/update.service.ts), invoked only when the user clicks
 * "Check for updates" in Settings — never automatically.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { UpdateStatus } from "./update.service";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  version: process.versions.electron,
  updates: {
    check: (): Promise<void> => ipcRenderer.invoke("sv-check-for-updates"),
    download: (): Promise<void> => ipcRenderer.invoke("sv-download-update"),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke("sv-quit-and-install"),
    /** Returns an unsubscribe function. */
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
      ipcRenderer.on("sv-update-status", listener);
      return () => ipcRenderer.removeListener("sv-update-status", listener);
    },
  },
});
