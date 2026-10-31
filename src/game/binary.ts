/**
 * The background binary is the uploaded text's own bytes, read bit by bit, so
 * the rain is your words rather than random noise.
 */

const MAX_BYTES = 200_000;

export function textBytes(lines: string[]): Uint8Array {
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return bytes.length > MAX_BYTES ? bytes.subarray(0, MAX_BYTES) : bytes;
}

/** Bit at index i, reading each byte most significant bit first, wrapping at the end. */
export function bitAt(bytes: Uint8Array, i: number): number {
  const total = bytes.length * 8;
  if (total === 0) return 0;
  const k = ((i % total) + total) % total;
  const byte = bytes[k >> 3] ?? 0;
  return (byte >> (7 - (k & 7))) & 1;
}
