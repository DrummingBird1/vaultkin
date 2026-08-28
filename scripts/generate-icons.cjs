/**
 * @file scripts/generate-icons.cjs
 * Generates the app/extension lock-glyph PNG icons with zero new
 * dependencies (hand-rolled PNG encoder over Node's built-in zlib) — pulling
 * in a native image library (sharp, canvas) just to rasterize a few static
 * icons isn't worth the install weight. Deterministic; safe to re-run.
 *
 * Usage: node scripts/generate-icons.cjs
 *
 * Produces:
 *   extension/icons/icon-{16,32,48,128}.png  (toolbar / manifest icons)
 *   build/icon.png                            (1024x1024 — electron-builder
 *                                               auto-generates .ico/.icns from
 *                                               a single square PNG this size)
 *   public/icons/icon-{32,192,512}.png        (PWA manifest — index.html
 *                                               links + vite-plugin-pwa both
 *                                               expect these to exist; used
 *                                               as combined "any maskable"
 *                                               purpose since the glyph
 *                                               already sits well inside a
 *                                               maskable safe zone)
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ─── Minimal PNG encoder (8-bit RGBA, no interlace, no filtering) ────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** rgba: Buffer of length width*height*4. */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 6;   // color type: RGBA
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // Each scanline prefixed with filter-type byte 0 (None).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = chunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ─── Lock-glyph rasterizer ─────────────────────────────────────────────────
// Solid brand-purple square with a white padlock silhouette. Simple analytic
// shapes (no anti-aliasing) so it stays crisp and unambiguous even at 16px.

const BG = [0x63, 0x66, 0xf1, 0xff];      // #6366F1 — app accent (Indigo)
const FG = [0xff, 0xff, 0xff, 0xff];      // white glyph

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function renderLockIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;

  // Shackle: rounded arc over the top half, continuing as two straight legs
  // down into the body — i.e. a padlock's "staple".
  const shackleROuter = size * 0.17;
  const shackleThick = size * 0.065;
  const shackleArcCenterY = size * 0.36;
  const shackleLegBottomY = size * 0.53;

  // Body: rounded rect in the lower half.
  const bodyX0 = size * 0.26, bodyX1 = size * 0.74;
  const bodyY0 = size * 0.50, bodyY1 = size * 0.82;
  const bodyR = size * 0.07;

  // Keyhole cut back to background color.
  const keyholeCx = size * 0.5, keyholeCy = size * 0.615;
  const keyholeR = size * 0.045;
  const keyholeSlotX0 = size * 0.478, keyholeSlotX1 = size * 0.522;
  const keyholeSlotY0 = keyholeCy, keyholeSlotY1 = size * 0.73;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px + 0.5, y = py + 0.5;
      let color = BG;

      // Shackle
      const dx = x - cx, dy = y - shackleArcCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let isShackle = false;
      if (y <= shackleArcCenterY) {
        isShackle = dist >= shackleROuter - shackleThick && dist <= shackleROuter;
      } else if (y <= shackleLegBottomY) {
        const adx = Math.abs(dx);
        isShackle = adx >= shackleROuter - shackleThick && adx <= shackleROuter;
      }
      if (isShackle) color = FG;

      // Body (overrides shackle where they overlap, e.g. legs entering the body)
      if (inRoundedRect(x, y, bodyX0, bodyY0, bodyX1, bodyY1, bodyR)) {
        color = FG;
        // Keyhole: circle + slot, cut back to background.
        const kdx = x - keyholeCx, kdy = y - keyholeCy;
        const inCircle = kdx * kdx + kdy * kdy <= keyholeR * keyholeR;
        const inSlot = x >= keyholeSlotX0 && x <= keyholeSlotX1 && y >= keyholeSlotY0 && y <= keyholeSlotY1;
        if (inCircle || inSlot) color = BG;
      }

      const i = (py * size + px) * 4;
      buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = color[3];
    }
  }
  return buf;
}

function writeIcon(size, outPath) {
  const rgba = renderLockIcon(size);
  const png = encodePNG(size, size, rgba);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${size}x${size}, ${png.length} bytes)`);
}

const root = path.resolve(__dirname, "..");
for (const size of [16, 32, 48, 128]) {
  writeIcon(size, path.join(root, "extension", "icons", `icon-${size}.png`));
}
writeIcon(1024, path.join(root, "build", "icon.png"));
for (const size of [32, 192, 512]) {
  writeIcon(size, path.join(root, "public", "icons", `icon-${size}.png`));
}
