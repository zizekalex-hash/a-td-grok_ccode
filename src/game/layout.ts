/**
 * Text layout for the battlefield. Nothing here cuts a word short: text is
 * either wrapped on whole words and shrunk until it fits, or split into flash
 * units made of whole words. Measuring is injected so this stays testable.
 */

export type Measure = (text: string, size: number) => number;

export interface Box {
  w: number;
  h: number;
}

export interface Fit {
  size: number;
  /** Wrapped rows, grouped by sector. */
  sectors: string[][];
  height: number;
}

/** Line height as a multiple of the font size. */
export const LEADING = 1.32;
/** Space between sectors, as a multiple of the font size. */
export const SECTOR_GAP = 0.7;

export function wordsOf(sector: string): string[] {
  return sector.split(/\s+/).filter(Boolean);
}

/**
 * Greedy word wrap at one size. Returns null when any single word is wider
 * than the box, because that word would have to be cut. A row's width is the
 * sum of its words and spaces, so each word is measured once rather than every
 * growing row being measured again.
 */
export function wrapWords(
  words: string[],
  maxW: number,
  size: number,
  measure: Measure,
): string[] | null {
  const rows: string[] = [];
  const space = measure(" ", size);
  let row = "";
  let rowW = 0;
  for (const word of words) {
    const wordW = measure(word, size);
    if (wordW > maxW) return null;
    if (!row) {
      row = word;
      rowW = wordW;
      continue;
    }
    const nextW = rowW + space + wordW;
    if (nextW <= maxW) {
      row = `${row} ${word}`;
      rowW = nextW;
      continue;
    }
    rows.push(row);
    row = word;
    rowW = wordW;
  }
  if (row) rows.push(row);
  return rows;
}

/** Lays out every sector at one size. Null if any word does not fit the width. */
export function layoutSectors(
  sectors: string[],
  box: Box,
  size: number,
  measure: Measure,
): { sectors: string[][]; height: number } | null {
  const grouped: string[][] = [];
  let rowCount = 0;
  for (const sector of sectors) {
    const words = wordsOf(sector);
    if (!words.length) continue;
    const rows = wrapWords(words, box.w, size, measure);
    if (!rows) return null;
    grouped.push(rows);
    rowCount += rows.length;
  }
  const height = rowCount * size * LEADING + Math.max(0, grouped.length - 1) * size * SECTOR_GAP;
  return { sectors: grouped, height };
}

/**
 * Largest size in [min, max] at which every sector fits the box. Returns null
 * when even the minimum size does not fit, which is the cue to flash instead.
 */
export function fitSectors(
  sectors: string[],
  box: Box,
  bounds: { min: number; max: number },
  measure: Measure,
): Fit | null {
  const atMin = layoutSectors(sectors, box, bounds.min, measure);
  if (!atMin || atMin.height > box.h) return null;
  let lo = bounds.min;
  let hi = bounds.max;
  let best = atMin;
  let bestSize = bounds.min;
  if (hi <= lo) return { size: lo, sectors: atMin.sectors, height: atMin.height };
  for (let i = 0; i < 14 && hi - lo > 0.25; i++) {
    const mid = (lo + hi) / 2;
    const lay = layoutSectors(sectors, box, mid, measure);
    if (lay && lay.height <= box.h) {
      lo = mid;
      best = lay;
      bestSize = mid;
    } else {
      hi = mid;
    }
  }
  return { size: bestSize, sectors: best.sectors, height: best.height };
}

/**
 * Splits sectors into flash units. Each unit is a run of whole words that fits
 * the box at the minimum size, so a unit is never cut. Units keep sector order
 * and the list is meant to be shown once in full, then repeated.
 *
 * The run is wrapped as it grows, the same greedy way wrapWords does, so each
 * word is placed once instead of the whole run being wrapped again per word.
 */
export function flashUnits(
  sectors: string[],
  box: Box,
  minSize: number,
  measure: Measure,
): string[] {
  const units: string[] = [];
  const space = measure(" ", minSize);
  const fitsRows = (rows: number) => rows * minSize * LEADING <= box.h;
  for (const sector of sectors) {
    let run: string[] = [];
    let rows = 0;
    let rowW = 0;
    for (const word of wordsOf(sector)) {
      const wordW = measure(word, minSize);
      const placeable = wordW <= box.w && fitsRows(1);
      if (placeable && run.length && rowW + space + wordW <= box.w) {
        run.push(word);
        rowW += space + wordW;
        continue;
      }
      if (placeable && run.length && fitsRows(rows + 1)) {
        run.push(word);
        rows += 1;
        rowW = wordW;
        continue;
      }
      if (run.length) units.push(run.join(" "));
      // A word that cannot be placed at all still gets its own unit, rather than being cut or lost.
      run = [word];
      rows = placeable ? 1 : Infinity;
      rowW = placeable ? wordW : Infinity;
    }
    if (run.length) units.push(run.join(" "));
  }
  return units;
}

/** Area where two axis-aligned boxes overlap (0 when they do not). */
export function overlapArea(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): number {
  const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/**
 * Moves a centered item of the given width so it lies fully inside [lo, hi].
 * An item wider than the span is centered in it.
 */
export function clampCenter(center: number, width: number, lo: number, hi: number): number {
  if (width >= hi - lo) return (lo + hi) / 2;
  return Math.min(hi - width / 2, Math.max(lo + width / 2, center));
}

/**
 * Next run of whole words from a sector, capped near maxChars. Always takes at
 * least one word, so a long word is never split.
 */
export function chunkWords(
  words: string[],
  start: number,
  maxChars: number,
): { text: string; next: number } {
  let out = "";
  let i = start;
  while (i < words.length) {
    const word = words[i] ?? "";
    const trial = out ? `${out} ${word}` : word;
    if (out && trial.length > maxChars) break;
    out = trial;
    i += 1;
  }
  return { text: out, next: i };
}

export interface PhraseFit {
  size: number;
  rows: string[];
  /** Widest row and total height, in px. */
  width: number;
  height: number;
}

/**
 * Lays out one whole phrase in a box: on one line at the largest size that fits,
 * otherwise wrapped onto as many lines as the box holds, shrinking toward `min`.
 * Nothing is cut. Past `min` the phrase may run taller than the box, and a single
 * word wider than the box shrinks further until it fits the width.
 */
export function fitPhrase(
  text: string,
  box: Box,
  sizes: { max: number; min: number },
  measure: Measure,
  leading = 1.25,
): PhraseFit {
  const words = wordsOf(text);
  if (!words.length) return { size: sizes.max, rows: [], width: 0, height: 0 };
  const done = (size: number, rows: string[]): PhraseFit => ({
    size,
    rows,
    width: Math.max(...rows.map((r) => measure(r, size))),
    height: rows.length * size * leading,
  });
  const min = Math.min(sizes.min, sizes.max);
  for (let size = sizes.max; size > min; size -= 0.5) {
    const rows = wrapWords(words, box.w, size, measure);
    if (rows && rows.length * size * leading <= box.h) return done(size, rows);
  }
  const rows = wrapWords(words, box.w, min, measure);
  if (rows) return done(min, rows);
  // A word wider than the box even at the smallest size: shrink until the widest word fits.
  const widest = Math.max(...words.map((w) => measure(w, min)));
  const size = (min * box.w) / widest;
  return done(size, wrapWords(words, box.w, size, measure) ?? words);
}
