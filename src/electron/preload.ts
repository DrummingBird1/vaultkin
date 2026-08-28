/**
 * @file src/electron/preload.ts
 * Empty preload — MVP uses the renderer's own IndexedDB via IPCService, no
 * main-process bridge needed. Kept as a hook for future IPC channels.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  version:  process.versions.electron,
});
