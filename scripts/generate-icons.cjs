/**
 * @file scripts/generate-icons.cjs
 * Rasterizes the Vaultkin logo (assets/logo.svg, the single source of truth)
 * into every PNG the app, PWA and extension need. Uses the Chromium that
 * Playwright already installs for the E2E suite, so no image library is
 * added. Below 48px a simplified mark (no bolts, heavier strokes) is used so
 * the glyph stays legible in a 16px toolbar.
 *
 * Usage: node scripts/generate-icons.cjs   (needs `pnpm exec playwright install chromium`)
 *
 * Produces:
 *   extension/icons/icon-{16,32,48,128}.png
 *   build/icon.png                  (1024x1024; electron-builder derives .ico/.icns)
 *   public/icons/icon-{32,192,512}.png
 *   public/favicon.svg              (copy of the small mark)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const full = fs.readFileSync(path.join(root, "assets", "logo.svg"), "utf8");

// Small-size variant: same mark, bolts dropped, strokes thickened.
const small = full
  .replace(/<!-- four locking bolts[\s\S]*?<\/g>/, "")
  .replace(
    'r="156" fill="none" stroke="#fff" stroke-width="30"',
    'r="176" fill="none" stroke="#fff" stroke-width="44"',
  )
  .replace('stroke-width="40"', 'stroke-width="58"')
  .replace('r="17" fill="#fff"', 'r="26" fill="#fff"');

const targets = [
  ...[16, 32, 48, 128].map((s) => [s, `extension/icons/icon-${s}.png`]),
  [1024, "build/icon.png"],
  ...[32, 192, 512].map((s) => [s, `public/icons/icon-${s}.png`]),
];

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [size, rel] of targets) {
      const svg = size < 48 ? small : full;
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      const out = path.join(root, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, omitBackground: true });
      console.log(`wrote ${rel} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(root, "public", "favicon.svg"), small);
  console.log("wrote public/favicon.svg");
})();
