/**
 * What the tower-defense game writes on screen, made of the loaded text: its
 * messages, banners and spoken lines are phrases of the player's own text, never
 * words of the game's. The text is cut into whole phrases (a sentence; a long one
 * in pieces at its commas, none longer than a few words), shuffled, and dealt one
 * at a time: every phrase of the text comes once before any comes again, then it
 * is shuffled again. Pure: randomness is passed in, no path aliases (tests).
 */

/** A word that closes a phrase: it ends in . ! or ?, possibly followed by a closing quote or bracket. */
const PHRASE_END = /[.!?]["'”’)\]]*$/;
/** A word after which a long phrase may be broken. */
const CLAUSE_END = /[,;:—–-]["'”’)\]]*$/;

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * A phrase in pieces of at most `max` words, none cut inside a word: as few as
 * will do, of nearly one size, each broken after a comma (or the like) when one
 * is near. The pieces, joined, are the phrase.
 */
export function chunkPhrase(phrase: string, max: number): string[] {
  const words = wordsOf(phrase);
  const limit = Math.max(1, Math.floor(max));
  if (words.length <= limit) return words.length ? [words.join(" ")] : [];
  const parts = Math.ceil(words.length / limit);
  const out: string[] = [];
  let at = 0;
  for (let p = 0; p < parts; p++) {
    const left = parts - p;
    if (left === 1) {
      out.push(words.slice(at).join(" "));
      break;
    }
    // Near an even share, within the limit; a clause end close by is where it breaks.
    const share = Math.min(limit, Math.ceil((words.length - at) / left));
    let end = at + share;
    for (let k = end; k > at + Math.max(1, Math.floor(share / 2)); k--) {
      if (CLAUSE_END.test(words[k - 1] ?? "")) {
        end = k;
        break;
      }
    }
    // The rest must still fit in the pieces left.
    end = Math.max(end, words.length - (left - 1) * limit);
    out.push(words.slice(at, end).join(" "));
    at = end;
  }
  return out;
}

/**
 * Every phrase of a text, in order, each of at most `max` words: sentences
 * (a sector's words up to one that ends in . ! or ?), the very short ones
 * (under `min` words) joined to the next, the long ones chunked.
 */
export function writingOf(lines: string[], max: number, min = 3): string[] {
  const sentences: string[] = [];
  for (const line of lines) {
    let cur: string[] = [];
    for (const w of wordsOf(line)) {
      cur.push(w);
      if (PHRASE_END.test(w)) {
        sentences.push(cur.join(" "));
        cur = [];
      }
    }
    if (cur.length) sentences.push(cur.join(" "));
  }
  const out: string[] = [];
  let carry = "";
  for (const s of sentences) {
    const joined = carry ? `${carry} ${s}` : s;
    if (wordsOf(joined).length < min) {
      carry = joined;
      continue;
    }
    carry = "";
    out.push(...chunkPhrase(joined, max));
  }
  if (carry) out.push(...chunkPhrase(carry, max));
  return out;
}

/** What identifies a text, cheaply: another one is dealt afresh. */
export function textKey(lines: string[]): string {
  let chars = 0;
  for (const l of lines) chars += l.length;
  return `${lines.length}|${chars}|${lines[0]?.slice(0, 24) ?? ""}|${lines[lines.length - 1]?.slice(-24) ?? ""}`;
}

/** Phrases dealt in a shuffled round: all of them before any comes again. */
export class WriteDeck {
  private key = "";
  private phrases: string[] = [];
  private order: number[] = [];
  private at = 0;
  private last = -1;

  /**
   * The next phrase of the text (at most `max` words), or null when it has none.
   * Another text, or another size, starts a new round.
   */
  next(lines: string[], max: number, rand: () => number = Math.random): string | null {
    const key = `${max}|${textKey(lines)}`;
    if (key !== this.key) {
      this.key = key;
      this.phrases = writingOf(lines, max);
      this.order = [];
      this.at = 0;
      this.last = -1;
    }
    const n = this.phrases.length;
    if (!n) return null;
    if (this.at >= this.order.length) this.shuffle(n, rand);
    const i = this.order[this.at++]!;
    this.last = i;
    return this.phrases[i] ?? null;
  }

  /** How many phrases are left in this round. */
  left(): number {
    return Math.max(0, this.order.length - this.at);
  }

  private shuffle(n: number, rand: () => number) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rand() * (i + 1)));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    // The last phrase of the old round does not open the new one.
    if (n > 1 && order[0] === this.last) [order[0], order[n - 1]] = [order[n - 1]!, order[0]!];
    this.order = order;
    this.at = 0;
  }
}
