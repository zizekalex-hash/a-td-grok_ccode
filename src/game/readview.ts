/**
 * What the Read tab shows around the words: the whole text as a picture of its
 * raw bytes (the background), and the whole text cut into screens of whole
 * phrases (the flash). Pure, with relative imports, so the tests can load it.
 */
import type { BytesMode } from "./readtext.ts";

/** The most pixels a picture gets (a longer text shows from its start). */
export const MAX_PIXELS = 2_000_000;

export interface BytesPicture {
  width: number;
  height: number;
  /** RGBA, four values a pixel, ready for an ImageData. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** How many pixels the bytes make: three bytes a pixel, one, or eight pixels a byte. */
export function pixelCount(bytes: number, mode: BytesMode): number {
  if (bytes <= 0) return 0;
  return mode === "rgb" ? Math.ceil(bytes / 3) : mode === "gray" ? bytes : bytes * 8;
}

/**
 * The bytes as pixels, in a picture shaped like the screen (aspect = width /
 * height), filled row by row. The cells left after the last byte start the
 * bytes again, so the picture has no empty corner.
 */
export function bytesPicture(
  bytes: Uint8Array,
  mode: BytesMode,
  aspect: number,
  maxPixels = MAX_PIXELS,
): BytesPicture {
  const n = Math.min(Math.max(1, pixelCount(bytes.length, mode)), Math.max(1, maxPixels));
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = Math.max(1, Math.round(Math.sqrt(n * a)));
  const height = Math.max(1, Math.ceil(n / width));
  const data = new Uint8ClampedArray(width * height * 4);
  const len = bytes.length;
  const at = (i: number) => (len ? (bytes[i % len] ?? 0) : 0);
  for (let p = 0; p < width * height; p++) {
    const k = p % n;
    let r: number;
    let g: number;
    let b: number;
    if (mode === "rgb") {
      r = at(k * 3);
      g = at(k * 3 + 1);
      b = at(k * 3 + 2);
    } else if (mode === "gray") {
      r = g = b = at(k);
    } else {
      const bit = (at(k >> 3) >> (7 - (k & 7))) & 1;
      r = g = b = bit ? 255 : 0;
    }
    const o = p * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { width, height, data };
}

/**
 * The whole text cut into screens for the flash: as many whole phrases as fit
 * (fits says whether a screen's text fits), never a phrase cut in two. A phrase
 * too long for a screen of its own gets one anyway. Every phrase is on exactly
 * one screen, in order.
 */
export function flashPages(phrases: string[], fits: (text: string) => boolean): string[] {
  const list = phrases.map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  const page = (from: number, to: number) => list.slice(from, to + 1).join(" ");
  let i = 0;
  while (i < list.length) {
    if (!fits(page(i, i))) {
      pages.push(page(i, i));
      i += 1;
      continue;
    }
    // The last phrase that still fits: grow by doubling, then halve the gap.
    let good = i;
    let step = 1;
    let bad = list.length;
    while (good + step < list.length && fits(page(i, good + step))) {
      good += step;
      step *= 2;
    }
    if (good + step < list.length) bad = good + step;
    while (bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (fits(page(i, mid))) good = mid;
      else bad = mid;
    }
    pages.push(page(i, good));
    i = good + 1;
  }
  return pages;
}
