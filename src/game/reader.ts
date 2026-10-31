import { chunkWords, wordsOf } from "./layout.ts";

/** Position in the loaded text: which sector, and which word inside it. */
export interface Cursor {
  line: number;
  word: number;
}

/**
 * Next run of whole words from the text, moving through the sectors in order and
 * wrapping at the end. Never splits a word.
 */
export function readChunk(lines: string[], cur: Cursor, maxChars: number): string {
  if (!lines.length) return "WAKE";
  const words = wordsOf(lines[cur.line % lines.length] ?? "");
  if (!words.length) {
    cur.line = (cur.line + 1) % lines.length;
    cur.word = 0;
    return "WAKE";
  }
  const start = cur.word >= words.length ? 0 : cur.word;
  const chunk = chunkWords(words, start, maxChars);
  if (chunk.next >= words.length) {
    cur.line = (cur.line + 1) % lines.length;
    cur.word = 0;
  } else {
    cur.word = chunk.next;
  }
  return chunk.text;
}

/** A word that closes a phrase: it ends in . ! or ?, possibly followed by a closing quote or bracket. */
const PHRASE_END = /[.!?]["'”’)\]]*$/;

/**
 * Next whole phrase from the text: words up to and including the one that ends
 * a sentence (. ! or ?), or to the end of the sector if it has no such word.
 * Moves through the sectors in order and wraps at the end. A phrase is only
 * split if it runs past maxWords, which keeps a sector with no punctuation at all
 * from becoming one enormous shot.
 */
export function readPhrase(lines: string[], cur: Cursor, maxWords = 60): string {
  if (!lines.length) return "WAKE";
  const words = wordsOf(lines[cur.line % lines.length] ?? "");
  if (!words.length) {
    cur.line = (cur.line + 1) % lines.length;
    cur.word = 0;
    return "WAKE";
  }
  const start = cur.word >= words.length ? 0 : cur.word;
  let end = start;
  while (end < words.length && end - start < maxWords) {
    end += 1;
    if (PHRASE_END.test(words[end - 1] ?? "")) break;
  }
  if (end >= words.length) {
    cur.line = (cur.line + 1) % lines.length;
    cur.word = 0;
  } else {
    cur.word = end;
  }
  return words.slice(start, end).join(" ");
}

/** All words of one sector, for drills. */
export function sectorWords(lines: string[], index: number): string[] {
  if (!lines.length) return [];
  return wordsOf(lines[((index % lines.length) + lines.length) % lines.length] ?? "");
}

/**
 * True when a read took the cursor past the text's last sector and back to the
 * start: the whole text has been read through. `before` is the cursor as it was.
 */
export function wrapped(before: Cursor, after: Cursor, count: number): boolean {
  return count > 0 && before.line % count === count - 1 && after.line === 0 && after.word === 0;
}

/** Natural order for file names, so 2.txt comes before 10.txt. */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** When the next phrase may come: after a text's closing pause (until), and a least gap after the last one. */
export interface PhraseGate {
  until: number;
  last: number;
}

export function gateOpen(g: PhraseGate, now: number, gapMs: number): boolean {
  return now >= g.until && now - g.last >= gapMs;
}
