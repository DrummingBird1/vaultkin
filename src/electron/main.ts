/**
 * @file src/electron/main.ts
 * Electron main process. Minimal: hardened BrowserWindow loads either the
 * Vite dev server (development) or the built bundle (production).
 */
import { app, BrowserWindow, Menu, shell } from "electron";
import * as path from "path";

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;

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

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
    win.loadURL(url);
    win.webContents.openDevTools({ mode: "right" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
