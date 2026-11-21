/**
 * @file src/electron/folder-sync.ts
 * Sync v2: keep a copy of the *encrypted* vault in a folder the user picks
 * (Syncthing, OneDrive, Dropbox, a NAS share…). The folder only ever holds
 * ciphertext.
 *
 * Never overwrites blindly: the hash of the file as last read or written is
 * remembered. If the file on disk differs (another device wrote it), the
 * write is refused as a conflict and the user pulls + merges first.
 */
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

export const FILE_NAME = "Vaultkin.svault";
const MAX_BYTES = 64 * 1024 * 1024;

interface Config {
  dir: string;
  /** sha256 of the file content as we last saw it (null = never). */
  lastHash: string | null;
}

const configFile = () => path.join(app.getPath("userData"), "folder-sync.json");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function readConfig(): Config | null {
  try {
    const c = JSON.parse(fs.readFileSync(configFile(), "utf8")) as Config;
    return typeof c.dir === "string" ? c : null;
  } catch {
    return null;
  }
}
function writeConfig(c: Config | null): void {
  if (c) fs.writeFileSync(configFile(), JSON.stringify(c), { mode: 0o600 });
  else fs.rmSync(configFile(), { force: true });
}

export function status(): { dir: string; file: string } | null {
  const c = readConfig();
  return c ? { dir: c.dir, file: path.join(c.dir, FILE_NAME) } : null;
}

export function setDir(dir: string | null): void {
  if (!dir) return writeConfig(null);
  if (!path.isAbsolute(dir) || !fs.statSync(dir).isDirectory()) throw new Error("Not a folder");
  writeConfig({ dir, lastHash: null });
}

/** Read the folder copy; remembers its hash (it's now "seen"). */
export function read(): string | null {
  const c = readConfig();
  if (!c) return null;
  const f = path.join(c.dir, FILE_NAME);
  if (!fs.existsSync(f)) return null;
  const text = fs.readFileSync(f, "utf8");
  writeConfig({ ...c, lastHash: sha(text) });
  return text;
}

export type WriteResult = "written" | "conflict" | "off" | "error";

/** Write the encrypted payload unless someone else changed the file. */
export function write(payload: string, force = false): WriteResult {
  const c = readConfig();
  if (!c) return "off";
  if (payload.length > MAX_BYTES) return "error";
  try {
    const p = JSON.parse(payload) as { version?: unknown; data?: unknown };
    if (p.version !== 1 || typeof p.data !== "string") return "error"; // only vault ciphertext
  } catch {
    return "error";
  }
  const f = path.join(c.dir, FILE_NAME);
  try {
    if (!force && fs.existsSync(f)) {
      const current = sha(fs.readFileSync(f, "utf8"));
      if (current !== c.lastHash && current !== sha(payload)) return "conflict";
    }
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, f);
    writeConfig({ ...c, lastHash: sha(payload) });
    return "written";
  } catch {
    return "error";
  }
}
