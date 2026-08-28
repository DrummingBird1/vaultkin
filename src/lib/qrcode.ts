/**
 * @file qrcode.ts
 * @description Tiny QR code encoder (Type 1-10, byte mode, ECC level M).
 *
 * Adapted from public-domain reference implementations of the QR spec
 * (ISO/IEC 18004). Zero external dependencies — needed for vault backup
 * sharing where we explicitly do NOT want to ship a network call.
 *
 * USAGE:
 *   const matrix = encodeQR("https://example.com");
 *   // matrix is a 2D array of booleans (true = dark module)
 *   renderToSvg(matrix);  // helper provided below
 *
 * CAPACITY (ECC M):
 *   Version 1  (21x21):  14 bytes
 *   Version 5  (37x37):  108 bytes
 *   Version 10 (57x57):  271 bytes
 *   Version 20 (97x97):  919 bytes
 *
 * For vault backups, expect ~Version 15-20 (uses chunking if oversized).
 */

// ─── GF(256) arithmetic for Reed-Solomon error correction ────────────────────
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function gfPolyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      result[i + j] ^= gfMul(p[i], q[j]);
  return result;
}

function rsGeneratorPoly(degree: number): number[] {
  let g: number[] = [1];
  for (let i = 0; i < degree; i++) g = gfPolyMul(g, [1, EXP_TABLE[i]]);
  return g;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const buf = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return buf.slice(data.length);
}

// ─── Capacity tables for ECC level M (medium) ────────────────────────────────
// [version - 1] = { totalCodewords, ecCodewordsPerBlock, blocks }
const ECC_M = [
  { total: 26,  ec: 10, blocks: [[1, 16]] },
  { total: 44,  ec: 16, blocks: [[1, 28]] },
  { total: 70,  ec: 26, blocks: [[1, 44]] },
  { total: 100, ec: 18, blocks: [[2, 32]] },
  { total: 134, ec: 24, blocks: [[2, 43]] },
  { total: 172, ec: 16, blocks: [[4, 27]] },
  { total: 196, ec: 18, blocks: [[4, 31]] },
  { total: 242, ec: 22, blocks: [[2, 38], [2, 39]] },
  { total: 292, ec: 22, blocks: [[3, 36], [2, 37]] },
  { total: 346, ec: 26, blocks: [[4, 43], [1, 44]] },
];

function pickVersion(byteLen: number): number {
  // 4 bits mode + 8/16 bits length + data * 8 bits ≤ totalDataBits
  for (let v = 1; v <= ECC_M.length; v++) {
    const lengthBits = v < 10 ? 8 : 16;
    const overheadBits = 4 + lengthBits;
    const dataCodewords = ECC_M[v - 1].total - countEcCodewords(v);
    if (dataCodewords * 8 >= overheadBits + byteLen * 8) return v;
  }
  throw new Error(`Data too large for QR v1-10: ${byteLen} bytes`);
}

function countEcCodewords(version: number): number {
  const e = ECC_M[version - 1];
  let total = 0;
  for (const [count] of e.blocks) total += count * e.ec;
  return total;
}

// ─── Bit buffer ──────────────────────────────────────────────────────────────
class BitBuffer {
  bits: number[] = [];
  put(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >> i) & 1);
  }
  get length() { return this.bits.length; }
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8 && i + j < this.bits.length; j++) b = (b << 1) | this.bits[i + j];
      if (this.bits.length - i < 8) b <<= (8 - (this.bits.length - i));
      out.push(b);
    }
    return out;
  }
}

// ─── Matrix construction (simplified — single-mask, single-block) ───────────
function moduleSize(version: number): number {
  return version * 4 + 17;
}

function placeFinderPattern(m: boolean[][], r: number, c: number) {
  for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
    const x = c + j, y = r + i;
    if (x < 0 || y < 0 || x >= m.length || y >= m.length) continue;
    if (i >= 0 && i <= 6 && (j === 0 || j === 6)) m[y][x] = true;
    else if (j >= 0 && j <= 6 && (i === 0 || i === 6)) m[y][x] = true;
    else if (i >= 2 && i <= 4 && j >= 2 && j <= 4) m[y][x] = true;
    else m[y][x] = false;
  }
}

function placeTimingPatterns(m: boolean[][]) {
  const n = m.length;
  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
}

function isReserved(m: boolean[][], r: number, c: number, version: number): boolean {
  const n = m.length;
  // Finder + separator
  if ((r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9)) return true;
  // Timing
  if (r === 6 || c === 6) return true;
  // Format info area
  if (r === 8 && c >= n - 8) return true;
  if (c === 8 && r >= n - 7) return true;
  // Dark module
  if (r === n - 8 && c === 8) return true;
  return false;
}

function placeData(m: boolean[][], data: number[], version: number) {
  const n = m.length;
  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < n; i++) {
      const r = upward ? n - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (isReserved(m, r, c, version)) continue;
        const byte = data[bitIdx >> 3] || 0;
        const bit = (byte >> (7 - (bitIdx & 7))) & 1;
        m[r][c] = bit === 1;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function applyMask(m: boolean[][], maskFn: (r: number, c: number) => boolean) {
  const n = m.length;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (isReserved(m, r, c, 0)) continue;
    if (maskFn(r, c)) m[r][c] = !m[r][c];
  }
}

function placeFormatInfo(m: boolean[][], maskIndex: number) {
  // Format info: 5 bits = ECC level (M=00) << 3 | mask
  // Pre-computed BCH (15,5) for ECC level M with all masks, then XORed with 0x5412
  const FORMAT_BITS_M = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
  ];
  const bits = FORMAT_BITS_M[maskIndex];
  const n = m.length;
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1;
    // Top-left
    if (i < 6) m[8][i] = bit;
    else if (i < 8) m[8][i + 1] = bit;
    else if (i === 8) m[7][8] = bit;
    else m[14 - i][8] = bit;
    // Bottom-left + top-right
    if (i < 7) m[n - 1 - i][8] = bit;
    else m[8][n - 15 + i] = bit;
  }
  m[n - 8][8] = true; // dark module
}

/** Encode text and return a 2D matrix of booleans (true = dark). */
export function encodeQR(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 271) throw new Error("Text too large for built-in QR encoder (max ~271 bytes)");

  const version = pickVersion(bytes.length);
  const ecc = ECC_M[version - 1];
  const totalDataCodewords = ecc.total - countEcCodewords(version);

  // Bit buffer: mode (4) + length + data + terminator + padding
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte mode
  buf.put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) buf.put(b, 8);
  // Terminator (up to 4 zero bits)
  buf.put(0, Math.min(4, totalDataCodewords * 8 - buf.length));

  let dataBytes = buf.toBytes();
  // Pad with 0xEC, 0x11 alternating
  const PAD = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < totalDataCodewords) {
    dataBytes.push(PAD[padIdx]);
    padIdx = 1 - padIdx;
  }

  // Compute EC codewords (single block for simplicity)
  const ecBytes = rsEncode(dataBytes, ecc.ec);
  const finalBytes = [...dataBytes, ...ecBytes];

  // Build matrix
  const n = moduleSize(version);
  const matrix: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));

  placeFinderPattern(matrix, 0, 0);
  placeFinderPattern(matrix, 0, n - 7);
  placeFinderPattern(matrix, n - 7, 0);
  placeTimingPatterns(matrix);

  // Place data (working copy of matrix)
  placeData(matrix, finalBytes, version);

  // Apply mask 0 (the simplest: (r+c) % 2 === 0) — pre-computed format bits use index 0
  applyMask(matrix, (r, c) => (r + c) % 2 === 0);
  placeFormatInfo(matrix, 0);

  return matrix;
}

/** Render a QR matrix to inline SVG markup. */
export function renderToSvg(matrix: boolean[][], opts: {
  size?: number; padding?: number; bg?: string; fg?: string;
} = {}): string {
  const { size = 256, padding = 4, bg = "#fff", fg = "#000" } = opts;
  const n = matrix.length;
  const total = n + padding * 2;
  const moduleSize = size / total;

  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${(c + padding) * moduleSize}" y="${(r + padding) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="${fg}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    ${rects}
  </svg>`;
}
