/**
 * @file src/electron/app-protocol.ts
 * Serves the built renderer from app://securevault/ instead of file://.
 *
 * Why: the GrantFileProtocolExtraPrivileges fuse is off (electron-builder.ts),
 * which stops file:// pages from loading out of app.asar: a packaged build
 * showed a blank window. A custom standard + secure scheme also gives the
 * renderer a real, stable origin and lets us send a real CSP response header.
 *
 * Only files under dist/renderer are served (no path traversal); anything
 * without an extension falls back to index.html (hash routing needs none, but
 * it's harmless).
 */
import { protocol } from "electron";
import * as fs from "fs";
import * as path from "path";

export const APP_ORIGIN = "app://securevault";
export const APP_URL = `${APP_ORIGIN}/index.html`;

/** Same policy as the build-time meta tag (config/vite.config.ts → CSP). */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** Must run before app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Resolve a request path to a file inside rendererDir, or null. Exported for tests. */
export function resolveAppPath(rendererDir: string, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "app:" || u.host !== "securevault") return null;
  let p = decodeURIComponent(u.pathname);
  if (p === "/" || !path.extname(p)) p = "/index.html";
  const root = path.resolve(rendererDir);
  const file = path.resolve(root, "." + p);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

/** Call once the app is ready. */
export function handleAppProtocol(rendererDir: string): void {
  protocol.handle("app", async (req) => {
    const file = resolveAppPath(rendererDir, req.url);
    if (!file) return new Response("Not found", { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      const headers: Record<string, string> = {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      };
      if (file.endsWith(".html")) headers["Content-Security-Policy"] = CSP;
      return new Response(body, { status: 200, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
