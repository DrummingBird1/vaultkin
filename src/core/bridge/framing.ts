/**
 * @file src/core/bridge/framing.ts
 * Native-messaging wire format: 4-byte little-endian length + UTF-8 JSON.
 * Used by the relay (browser stdio ⇄ local socket) on both legs.
 */
/** Chrome's limit for messages *to* the browser is 1 MiB; we cap both ways. */
export const MAX_FRAME_BYTES = 1024 * 1024;

export function encodeFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.length > MAX_FRAME_BYTES) throw new Error("Frame too large");
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, true);
  out.set(body, 4);
  return out;
}

/**
 * Incremental decoder: feed arbitrary chunks, get whole messages out.
 * Throws (and should end the connection) on an oversized or non-JSON frame.
 */
export class FrameDecoder {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: unknown[] = [];
    for (;;) {
      if (this.buf.length < 4) break;
      const len = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true);
      if (len > MAX_FRAME_BYTES) throw new Error("Frame too large");
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      out.push(JSON.parse(new TextDecoder().decode(body)));
      this.buf = this.buf.slice(4 + len);
    }
    return out;
  }
}
