/**
 * @file src/electron/update.service.ts
 * Manual-trigger-only update checking via electron-updater.
 *
 * `autoDownload = false` and `autoInstallOnAppQuit = false` are the whole
 * point: nothing here ever runs on a timer or on app launch. The renderer
 * (Settings page) has to explicitly ask via IPC before this does anything —
 * an unattended background update check is itself a form of phone-home
 * behavior this project deliberately avoids everywhere else (see invariant
 * #1 in CLAUDE.md: no telemetry, ever). Checking GitHub Releases for a
 * newer version number isn't vault-content telemetry, but it's still a
 * network call the user didn't explicitly make in that moment if it fires
 * automatically, so it doesn't.
 */
import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import { mainLog } from "./logger";

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

export type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

/** Wires autoUpdater's events to push status to the renderer over IPC. Call once per window. */
export function wireUpdater(win: BrowserWindow): void {
  const send = (payload: UpdateStatus) => {
    if (!win.isDestroyed()) win.webContents.send("sv-update-status", payload);
  };

  autoUpdater.on("checking-for-update", () => send({ status: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send({ status: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => send({ status: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    send({ status: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    send({ status: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) => {
    mainLog.error("autoUpdater error", { message: err.message, stack: err.stack });
    send({ status: "error", message: err.message });
  });
}

export async function checkForUpdates(): Promise<void> {
  mainLog.info("update check requested");
  await autoUpdater.checkForUpdates();
}

export async function downloadUpdate(): Promise<void> {
  mainLog.info("update download requested");
  await autoUpdater.downloadUpdate();
}

/** Quits and installs the already-downloaded update. Only meaningful after an "update-downloaded" event. */
export function quitAndInstall(): void {
  mainLog.info("quit-and-install requested");
  autoUpdater.quitAndInstall();
}
