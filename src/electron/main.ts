/**
 * @file src/electron/main.ts
 * Electron main process. Minimal: hardened BrowserWindow loads either the
 * Vite dev server (development) or the built bundle (production).
 */
import { app, BrowserWindow, Menu, shell, crashReporter, ipcMain } from "electron";
import * as path from "path";
import { mainLog } from "./logger";
import { wireUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from "./update.service";

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;

// Local-only crash capture — uploadToServer: false means dumps are written
// to app.getPath("crashDumps") and NEVER transmitted anywhere. This is not
// telemetry (invariant #1 in CLAUDE.md: no telemetry, ever); it exists so a
// user who hits a native crash has something concrete to attach when
// reporting it themselves, the same way mainLog exists for JS-level errors.
crashReporter.start({
  productName: "SecureVault",
  companyName: "SecureVault",
  uploadToServer: false,
  compress: true,
});

process.on("uncaughtException", (err) => {
  mainLog.error("uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  mainLog.error("unhandledRejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0D0D12",
    title: "SecureVault",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Disable menu in production (keeps DevTools available via Ctrl+Shift+I)
  if (!isDev) Menu.setApplicationMenu(null);

  // External links open in the user's default browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    mainLog.error("render-process-gone", { reason: details.reason, exitCode: details.exitCode });
  });

  wireUpdater(win);

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
    win.loadURL(url);
    win.webContents.openDevTools({ mode: "right" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// Renderer-invoked only (see update.service.ts's header comment) — nothing
// here runs unless Settings' "Check for updates" button calls it first.
ipcMain.handle("sv-check-for-updates", () => checkForUpdates());
ipcMain.handle("sv-download-update", () => downloadUpdate());
ipcMain.handle("sv-quit-and-install", () => quitAndInstall());

app.whenReady().then(() => {
  mainLog.info("app ready", { version: app.getVersion(), electron: process.versions.electron, logFile: mainLog.filePath() });
  createWindow();
});
app.on("window-all-closed", () => {
  mainLog.info("window-all-closed");
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
