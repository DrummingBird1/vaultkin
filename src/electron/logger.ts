/**
 * @file src/electron/logger.ts
 * Minimal local-only rotating file logger for the Electron main process.
 *
 * Hand-rolled rather than pulling in `electron-log` — this project already
 * favors zero-dependency solutions for bounded problems (see
 * scripts/generate-icons.cjs's header comment), and a rotating JSON-lines
 * writer is a small, well-understood problem. Logs never leave the device —
 * consistent with invariant #1 (no telemetry, ever) — they exist purely so
 * a user following docs/TROUBLESHOOTING.md has something concrete to look
 * at or attach when reporting a bug, not for any kind of remote monitoring.
 */
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB before rotating
const MAX_ROTATED_FILES = 3;

let logDir: string | null = null;
let logFile: string | null = null;

function ensureLogFile(): string {
  if (logFile) return logFile;
  logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  logFile = path.join(logDir, "main.log");
  return logFile;
}

function rotateIfNeeded(file: string): void {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return; // doesn't exist yet — nothing to rotate
  }
  if (size < MAX_LOG_BYTES) return;

  for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
    const src = `${file}.${i}`;
    const dst = `${file}.${i + 1}`;
    if (fs.existsSync(src)) {
      if (i + 1 > MAX_ROTATED_FILES) fs.rmSync(src, { force: true });
      else fs.renameSync(src, dst);
    }
  }
  fs.renameSync(file, `${file}.1`);
}

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  try {
    const file = ensureLogFile();
    rotateIfNeeded(file);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {}),
    });
    fs.appendFileSync(file, line + "\n");
  } catch {
    // Logging must never crash the app it's trying to help debug — best
    // effort only. If the write fails (disk full, permissions), there's
    // nothing more useful to do than silently drop the line.
  }
}

export const mainLog = {
  info:  (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn:  (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
  /** Absolute path to the current log file, for a "Show logs" menu item / support instructions. */
  filePath: (): string => ensureLogFile(),
};
