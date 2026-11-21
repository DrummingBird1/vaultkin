// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "path";
import { resolveAppPath } from "./app-protocol";

const root = path.resolve("/srv/renderer");

describe("app:// path resolution", () => {
  it("serves files under the renderer dir; extensionless paths get index.html", () => {
    expect(resolveAppPath(root, "app://securevault/assets/a.js")).toBe(
      path.join(root, "assets", "a.js"),
    );
    expect(resolveAppPath(root, "app://securevault/")).toBe(path.join(root, "index.html"));
    expect(resolveAppPath(root, "app://securevault/vault")).toBe(path.join(root, "index.html"));
  });

  it("refuses traversal, other hosts and other schemes", () => {
    expect(resolveAppPath(root, "app://securevault/..%2F..%2Fsecret.txt")).toBeNull();
    // Dot segments are normalized by the URL parser; whatever comes out stays inside root.
    for (const u of [
      "app://securevault/%2e%2e/%2e%2e/etc/passwd",
      "app://securevault/../../x.js",
    ]) {
      const r = resolveAppPath(root, u);
      expect(r === null || r.startsWith(root + path.sep)).toBe(true);
    }
    expect(resolveAppPath(root, "app://evil/index.html")).toBeNull();
    expect(resolveAppPath(root, "file:///etc/passwd")).toBeNull();
  });
});
