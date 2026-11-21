/**
 * @file src/electron/bridge-install.ts
 * Registers the native-messaging host so the browser can launch the relay.
 * Explicit user action only (Settings → Browser extension → Connect), and
 * writes only to the current user's profile:
 *   - the host manifest JSON under userData;
 *   - Windows: HKCU\Software\<browser>\NativeMessagingHosts\com.securevault.bridge
 *   - macOS/Linux: the browser's per-user NativeMessagingHosts directory.
 */
import { app } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { HOST_NAME } from "./bridge-transport";

const EXTENSION_ID = /^[a-p]{32}$/;

const WIN_KEYS = [
  "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
  "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
  "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts",
  "HKCU\\Software\\Chromium\\NativeMessagingHosts",
];

function unixDirs(): string[] {
  const h = os.homedir();
  return process.platform === "darwin"
    ? [
        "Library/Application Support/Google/Chrome/NativeMessagingHosts",
        "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
        "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
        "Library/Application Support/Chromium/NativeMessagingHosts",
      ].map((d) => path.join(h, d))
    : [
        ".config/google-chrome/NativeMessagingHosts",
        ".config/microsoft-edge/NativeMessagingHosts",
        ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
        ".config/chromium/NativeMessagingHosts",
      ].map((d) => path.join(h, d));
}

/**
 * The command the browser runs: a wrapper that starts bridge-host.js with this
 * app's Electron binary in Node mode (the plain app binary writes a CRLF to
 * stdout on Windows, which breaks native messaging). Requires the RunAsNode
 * fuse to stay enabled; when it is turned off in hardening, ship a standalone
 * host binary instead.
 */
function hostCommand(dir: string): string {
  const hostJs = path.join(__dirname, "bridge-host.js");
  if (process.platform === "win32") {
    const cmd = path.join(dir, "securevault-host.cmd");
    fs.writeFileSync(
      cmd,
      `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${hostJs}" %*\r\n`,
    );
    return cmd;
  }
  const sh = path.join(dir, "securevault-host.sh");
  fs.writeFileSync(
    sh,
    `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${hostJs}" "$@"\n`,
    {
      mode: 0o700,
    },
  );
  return sh;
}

function regAdd(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(
      "reg",
      ["add", `${key}\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", value, "/f"],
      (err) => (err ? reject(err) : resolve()),
    ),
  );
}

export async function installNativeHost(
  extensionIds: string[],
): Promise<{ manifest: string; registered: number }> {
  const ids = extensionIds.filter((id) => EXTENSION_ID.test(id));
  if (ids.length === 0) throw new Error("No valid extension id");
  const dir = path.join(app.getPath("userData"), "native-messaging");
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    name: HOST_NAME,
    description: "SecureVault browser bridge",
    path: hostCommand(dir),
    type: "stdio",
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
  };
  const file = path.join(dir, `${HOST_NAME}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

  let registered = 0;
  if (process.platform === "win32") {
    for (const k of WIN_KEYS) {
      try {
        await regAdd(k, file);
        registered++;
      } catch {
        /* that browser isn't installed or key is locked */
      }
    }
  } else {
    for (const d of unixDirs()) {
      try {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2));
        registered++;
      } catch {
        /* skip */
      }
    }
  }
  return { manifest: file, registered };
}
