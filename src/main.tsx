/**
 * @file src/main.tsx
 * React + Vite entry point. Mounts <App/> inside the ErrorBoundary so any
 * crash falls through to a recoverable UI instead of a blank screen.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useUIStore } from "./store/ui.store";
import "./i18n"; // side-effect: initializes i18next before any component renders
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// PWA service worker — browser tab only. Registering one inside the Electron
// renderer would be pointless (no install/offline concept applies there) and
// untested, so this is skipped entirely when the Electron preload bridge is
// present (see src/electron/preload.ts's contextBridge.exposeInMainWorld).
//
// registerType is "prompt" (config/vite.config.ts), so a new SW never force-
// reloads the page on its own — it only ever informs the user here. Forcing
// a reload mid-session is the same failure shape as the lockApplication/
// autosave race documented in CLAUDE.md invariant #12 (state getting wiped
// out from under an in-progress edit), so this deliberately never calls the
// updateSW() callback automatically.
if (!("electron" in window) && "serviceWorker" in navigator) {
  registerSW({
    onNeedRefresh() {
      useUIStore
        .getState()
        .toastInfo(
          "Update available",
          "SecureVault will use the new version next time you fully restart it.",
        );
    },
    onOfflineReady() {
      useUIStore
        .getState()
        .toastInfo(
          "Ready for offline use",
          "SecureVault can now open without an internet connection.",
        );
    },
  });
}
