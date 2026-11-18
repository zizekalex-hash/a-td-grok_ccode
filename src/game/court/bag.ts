/**
 * The Court's phrases come like cards from a shuffled deck: every phrase of the
 * loaded texts once, in random order, and only when all have come does the deck
 * start again. Which have come is kept (as short hashes), so it carries on
 * across sessions and restarts, and a text loaded or removed in between only
 * adds or takes away its own phrases. Pure (storage aside: the game keeps
 * `used`). No path aliases (tests).
 */
import { phrasesOf } from "./rules.ts";

/**
 * Every phrase of the texts, in order, each once: whole sentences, a short one
 * joined to the next until it has `min` words, a short last one joined to the
 * one before. Never cut, so a long sentence comes whole.
 */
export function phraseUnits(texts: string[][], min: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sector of texts.flat()) {
    const sentences = phrasesOf(sector);
    const units: string[][] = [];
    for (let i = 0; i < sentences.length;) {
      const words = [...(sentences[i] ?? [])];
      let j = i + 1;
      for (; words.length < min && j < sentences.length; j++) words.push(...(sentences[j] ?? []));
      if (words.length < min && units.length) units[units.length - 1]!.push(...words);
      else if (words.length) units.push(words);
      i = j;
    }
    for (const u of units) {
      const text = u.join(" ");
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}

/** A short, steady name for a phrase (FNV-1a, base 36). */
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The next phrase: one at random of those not come yet. When all have come, a
 * new round of the deck begins (not with the phrase that came last, when there
 * is another). `used` is changed in place. Null with no phrases at all.
 */
export function drawPhrase(
  units: readonly string[],
  used: Set<string>,
  rand: () => number,
  last = "",
): { phrase: string; cycled: boolean } | null {
  if (!units.length) return null;
  let left = units.filter((u) => !used.has(hashOf(u)));
  let cycled = false;
  if (!left.length) {
    used.clear();
    cycled = true;
    left = units.length > 1 ? units.filter((u) => u !== last) : [...units];
  }
  const phrase = left[Math.min(left.length - 1, Math.floor(rand() * left.length))]!;
  used.add(hashOf(phrase));
  return { phrase, cycled };
}

/** How far through the deck: phrases come so far in this round, of all. */
export function progressOf(
  units: readonly string[],
  used: Set<string>,
): { done: number; total: number } {
  let done = 0;
  for (const u of units) if (used.has(hashOf(u))) done += 1;
  return { done, total: units.length };
}

// ---- Texts recited through: counted phrase by phrase, confirmed when every one is done ----

/** A text of the library, with its phrases and how many of them have been recited this round. */
export interface DeckText {
  key: string;
  name: string;
  folder?: string;
  units: string[];
  /** The short names of its phrases (a phrase is counted by its name). */
  hashes: Set<string>;
  /** Phrases of it recited so far this round. */
  done: number;
}

/** How many of a text's phrases are in `done`. */
export function countDone(t: Pick<DeckText, "hashes">, done: ReadonlySet<string>): number {
  let n = 0;
  for (const h of t.hashes) if (done.has(h)) n += 1;
  return n;
}

/** Each text's phrases, and how many are done already (a round carried over from before counts). */
export function deckTexts(
  texts: readonly { key: string; name: string; folder?: string; lines: string[] }[],
  min: number,
  done: ReadonlySet<string>,
): DeckText[] {
  return texts.map((t) => {
    const units = phraseUnits([t.lines], min);
    const hashes = new Set(units.map(hashOf));
    const one: DeckText = { key: t.key, name: t.name, units, hashes, done: 0 };
    if (t.folder) one.folder = t.folder;
    one.done = countDone(one, done);
    return one;
  });
}

/**
 * A phrase recited all through: counted (in `done`, changed in place) towards every
 * text it is in. A text whose every phrase is now done is finished: it is
 * returned, and cleared from `done` so a fresh round of it begins.
 */
export function reciteDone(texts: DeckText[], done: Set<string>, phrase: string): DeckText[] {
  const h = hashOf(phrase);
  const had = done.has(h);
  done.add(h);
  const finished: DeckText[] = [];
  for (const t of texts) {
    if (!t.hashes.has(h)) continue;
    if (!had) t.done += 1;
    if (t.hashes.size > 0 && t.done >= t.hashes.size) finished.push(t);
  }
  if (finished.length) clearTexts(texts, done, finished);
  return finished;
}

/** Takes the given texts' phrases out of `done` (a fresh round of them), and counts the others again. */
export function clearTexts(texts: DeckText[], done: Set<string>, cleared: readonly DeckText[]) {
  for (const t of cleared) for (const h of t.hashes) done.delete(h);
  // A phrase two texts share is cleared for both: their counts are worked out again.
  for (const t of texts) t.done = countDone(t, done);
}

/**
 * The next phrase to recite: at random among those not done yet, and (while
 * others remain) not one of `avoid`, the last few that came (a skipped one does
 * not come straight back). Null with no phrases at all.
 */
export function pickFresh(
  units: readonly string[],
  done: ReadonlySet<string>,
  rand: () => number,
  avoid: readonly string[] = [],
): string | null {
  const left = units.filter((u) => !done.has(hashOf(u)));
  const pool = left.length ? left : [...units];
  if (!pool.length) return null;
  const fresh = pool.filter((u) => !avoid.includes(u));
  const from = fresh.length ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))]!;
}

/** Percent done, whole numbers, never 100 until it is. */
export function percentOf(done: number, total: number): number {
  if (total <= 0) return 0;
  const p = Math.floor((done / total) * 100);
  return done >= total ? 100 : Math.min(99, p);
}
