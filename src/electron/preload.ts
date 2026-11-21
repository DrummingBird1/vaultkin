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
  bridge: {
    /** Frames from browser-extension connections (relayed, see ADR 0007). */
    onFrame: (cb: (f: { connId: number; origin: string; msg: unknown }) => void): (() => void) => {
      const l = (
        _e: Electron.IpcRendererEvent,
        f: { connId: number; origin: string; msg: unknown },
      ) => cb(f);
      ipcRenderer.on("sv-bridge-frame", l);
      return () => ipcRenderer.removeListener("sv-bridge-frame", l);
    },
    onClosed: (cb: (connId: number) => void): (() => void) => {
      const l = (_e: Electron.IpcRendererEvent, f: { connId: number }) => cb(f.connId);
      ipcRenderer.on("sv-bridge-closed", l);
      return () => ipcRenderer.removeListener("sv-bridge-closed", l);
    },
    send: (connId: number, msg: object): Promise<boolean> =>
      ipcRenderer.invoke("sv-bridge-send", connId, msg),
    close: (connId: number): Promise<void> => ipcRenderer.invoke("sv-bridge-close", connId),
    installHost: (extensionIds: string[]): Promise<{ manifest: string; registered: number }> =>
      ipcRenderer.invoke("sv-bridge-install", extensionIds),
  },
  /** SSH agent: requests from ssh arrive here; keys never leave this process. */
  sshAgent: {
    setEnabled: (on: boolean): Promise<string | null> =>
      ipcRenderer.invoke("sv-ssh-agent-enable", on),
    onRequest: (
      cb: (r: {
        id: number;
        req: { kind: "list" } | { kind: "sign"; keyBlob: string; data: string; flags: number };
      }) => void,
    ): (() => void) => {
      const l = (_e: Electron.IpcRendererEvent, r: Parameters<typeof cb>[0]) => cb(r);
      ipcRenderer.on("sv-ssh-agent-request", l);
      return () => ipcRenderer.removeListener("sv-ssh-agent-request", l);
    },
    reply: (id: number, value: unknown): Promise<void> =>
      ipcRenderer.invoke("sv-ssh-agent-reply", id, value),
  },
  /** Copy a secret (kept out of Windows Clipboard History) / clear it again. */
  clipboard: {
    writeSecret: (text: string): Promise<{ ok: boolean; excluded: boolean }> =>
      ipcRenderer.invoke("sv-clipboard-write-secret", text),
    clearSecret: (): Promise<boolean> => ipcRenderer.invoke("sv-clipboard-clear-secret"),
  },
  /** Remember this device: vault key kept in the OS keystore (main process). */
  deviceUnlock: {
    status: () => ipcRenderer.invoke("sv-device-unlock-status"),
    save: (salt: string, rawB64: string): Promise<boolean> =>
      ipcRenderer.invoke("sv-device-unlock-save", salt, rawB64),
    refresh: (salt: string): Promise<boolean> =>
      ipcRenderer.invoke("sv-device-unlock-refresh", salt),
    load: (salt: string): Promise<string | null> =>
      ipcRenderer.invoke("sv-device-unlock-load", salt),
    clear: (): Promise<void> => ipcRenderer.invoke("sv-device-unlock-clear"),
  },
  window: {
    /** Recolor the native window controls (Windows/Linux) to match the theme. */
    setTitleBarTheme: (colors: { color: string; symbolColor: string }): Promise<void> =>
      ipcRenderer.invoke("sv-set-titlebar-theme", colors),
    /** Global Quick Access hotkey pressed; returns an unsubscribe function. */
    onQuickAccess: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("sv-quick-access", listener);
      return () => ipcRenderer.removeListener("sv-quick-access", listener);
    },
    /** Machine is going to sleep / OS session locked; returns an unsubscribe function. */
    onSystemLock: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("sv-system-lock", listener);
      return () => ipcRenderer.removeListener("sv-system-lock", listener);
    },
  },
  updates: {
    check: (): Promise<void> => ipcRenderer.invoke("sv-check-for-updates"),
    download: (): Promise<void> => ipcRenderer.invoke("sv-download-update"),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke("sv-quit-and-install"),
    /** Returns an unsubscribe function. */
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) =>
        callback(status);
      ipcRenderer.on("sv-update-status", listener);
      return () => ipcRenderer.removeListener("sv-update-status", listener);
    },
  },
});
