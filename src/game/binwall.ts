/**
 * A still wall of a phrase in raw binary: its letters as bytes, eight 0s and 1s
 * each, repeated in whole copies to cover the screen evenly, like the binary
 * rain but standing still. It is laid out here, and drawn once (BinaryWall).
 *
 * The font is the largest from maxFont down to minFont at which whole copies
 * fill at least `fill` of the screen; if no size there fits even one copy, the
 * fallback size, then smaller again until it fits. The lines share the text
 * evenly and are spread over the whole width and height, so nothing is cut off
 * at an edge. No path aliases, so the tests can load it.
 */

export interface WallSpec {
  /** The font sizes to choose from, in px. */
  minFont: number;
  maxFont: number;
  /** Tried when even minFont is too big for one copy (then smaller, until it fits). */
  fallbackFont: number;
  /** How much of the screen whole copies should cover (0 to 1) before a smaller size is tried. */
  fill: number;
}

export interface Wall {
  font: number;
  /** Each line's 0s and 1s, top to bottom; together, `copies` whole copies of the phrase's bits. */
  lines: string[];
  copies: number;
  /** Width of one character's cell and the distance between lines (px), at least the font's own. */
  cellW: number;
  pitch: number;
  /** Centre of the first character of the first line (px). */
  left: number;
  top: number;
}

/** A monospace character's width, and a line's height, for each px of font. */
export const CHAR_W = 0.6;
export const LINE_H = 1.15;
/** Step between the sizes tried, in px. */
const STEP = 0.25;
/** Below this the wall gives up (a text of millions of characters). */
const SMALLEST = 0.3;

/** The phrase as raw binary: each byte of its UTF-8 letters as eight 0s and 1s, spaces folded to one. */
export function toBits(text: string): string {
  const bytes = new TextEncoder().encode(text.replace(/\s+/g, " ").trim());
  let out = "";
  for (const b of bytes) out += b.toString(2).padStart(8, "0");
  return out;
}

function grid(len: number, width: number, height: number, font: number) {
  const cols = Math.floor(width / (font * CHAR_W));
  const rows = Math.floor(height / (font * LINE_H));
  const cap = cols * rows;
  const copies = cols > 0 && rows > 0 ? Math.floor(cap / len) : 0;
  return { font, cols, copies, filled: copies > 0 ? (copies * len) / cap : 0 };
}

/** The wall for a phrase on a screen of width by height px, or null when there is nothing to show. */
export function binWall(text: string, width: number, height: number, spec: WallSpec): Wall | null {
  const bits = toBits(text);
  if (!bits || !(width > 0) || !(height > 0)) return null;
  const len = bits.length;
  const top = Math.max(spec.minFont, spec.maxFont);
  const low = Math.min(spec.minFont, spec.maxFont);
  let pick: ReturnType<typeof grid> | null = null;
  // Largest first: the first size whose copies fill enough wins; else the best filled.
  for (let f = top; f >= low - 1e-9; f = Math.round((f - STEP) * 100) / 100) {
    const g = grid(len, width, height, f);
    if (!g.copies) continue;
    if (g.filled >= spec.fill) {
      pick = g;
      break;
    }
    if (!pick || g.filled > pick.filled + 1e-9) pick = g;
  }
  // Too long for even the smallest size: the fallback, then a tenth smaller each time.
  for (let f = spec.fallbackFont; !pick && f >= SMALLEST; f = Math.round(f * 0.9 * 1000) / 1000) {
    const g = grid(len, width, height, f);
    if (g.copies) pick = g;
  }
  if (!pick) return null;

  // The copies, shared out over as few lines as the columns allow, each line within one character of the others.
  const all = bits.repeat(pick.copies);
  const count = Math.ceil(all.length / pick.cols);
  const base = Math.floor(all.length / count);
  const extra = all.length % count;
  const lines: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const n = base + (i < extra ? 1 : 0);
    lines.push(all.slice(at, at + n));
    at += n;
  }
  const longest = base + (extra ? 1 : 0);
  const cellW = width / longest;
  const pitch = height / count;
  return {
    font: pick.font,
    lines,
    copies: pick.copies,
    cellW,
    pitch,
    left: cellW / 2,
    top: pitch / 2,
  };
}
