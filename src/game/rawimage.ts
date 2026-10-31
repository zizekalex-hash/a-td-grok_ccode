/**
 * The loaded text as a raw image: every three bytes of the UTF-8 text become one
 * RGB pixel, row by row, in the smallest square that holds them. No path aliases,
 * so the tests can load it directly.
 */

/** Largest side the image is allowed to take, in pixels. */
export const MAX_SIDE = 512;

/** Side of the square that holds this many bytes as RGB pixels. */
export function rawSide(byteCount: number): number {
  const pixels = Math.ceil(Math.max(0, byteCount) / 3);
  return Math.max(1, Math.min(MAX_SIDE, Math.ceil(Math.sqrt(pixels))));
}

/** RGBA pixels for a side by side image. Bytes past the square are dropped; pixels past the text are black. */
export function rawPixels(bytes: Uint8Array, side: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const o = i * 4;
    const b = i * 3;
    out[o] = bytes[b] ?? 0;
    out[o + 1] = bytes[b + 1] ?? 0;
    out[o + 2] = bytes[b + 2] ?? 0;
    out[o + 3] = 255;
  }
  return out;
}
