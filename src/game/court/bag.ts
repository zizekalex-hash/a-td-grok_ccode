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
