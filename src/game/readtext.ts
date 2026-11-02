/**
 * The Read tab of the Recitation drill: a whole text, phrase by phrase in
 * order, each read a few passes, word by word (like the Court's recite screen).
 * Its settings (speed, passes, sizes, font, auto) and your place in each text
 * are kept on the device (READER_KEY). Pure, with relative imports, so the tests
 * can load it. Tuned in reader in config.json.
 */
import { CONFIG } from "./config.ts";
import { hashOf, phraseUnits } from "./court/bag.ts";

const R = CONFIG.reader;

export const READER_KEY = "azshara-reader-v1";

export type ReaderFont = "display" | "plain" | "mono";
export const FONTS: ReaderFont[] = ["display", "plain", "mono"];

export interface ReaderState {
  wordMs: number;
  passes: number;
  wordSize: number;
  phraseSize: number;
  font: ReaderFont;
  auto: boolean;
  /** Where you are in each text: the phrase to read next, by the text's key. */
  at: Record<string, number>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function newReader(): ReaderState {
  return {
    wordMs: clampWordMs(R.wordMs),
    passes: clampPasses(R.passes),
    wordSize: clampWordSize(R.wordSize),
    phraseSize: clampPhraseSize(R.phraseSize),
    font: FONTS.includes(R.font as ReaderFont) ? (R.font as ReaderFont) : "display",
    auto: R.auto === true,
    at: {},
  };
}

/** Time a word is lit, in whole steps of 50 ms. */
export function clampWordMs(ms: number): number {
  return clamp(Math.round(ms / 50) * 50, R.wordMsMin, R.wordMsMax);
}

export function clampPasses(n: number): number {
  return clamp(Math.round(n), 1, Math.max(1, R.maxPasses));
}

/** The lit word's size, in rem, a tenth at a time. */
export function clampWordSize(rem: number): number {
  return clamp(Math.round(rem * 10) / 10, 1, 6);
}

/** The whole phrase's size, in rem, a twentieth at a time. */
export function clampPhraseSize(rem: number): number {
  return clamp(Math.round(rem * 20) / 20, 0.6, 3);
}

/** Settings and places from a save, each checked. */
export function loadReader(data: unknown): ReaderState {
  const s = newReader();
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  s.wordMs = clampWordMs(num(d.wordMs, s.wordMs));
  s.passes = clampPasses(num(d.passes, s.passes));
  s.wordSize = clampWordSize(num(d.wordSize, s.wordSize));
  s.phraseSize = clampPhraseSize(num(d.phraseSize, s.phraseSize));
  if (FONTS.includes(d.font as ReaderFont)) s.font = d.font as ReaderFont;
  if (typeof d.auto === "boolean") s.auto = d.auto;
  const at = d.at && typeof d.at === "object" ? (d.at as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(at))
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) s.at[k] = Math.floor(v);
  return s;
}

export function readReader(): ReaderState {
  try {
    const raw = localStorage.getItem(READER_KEY);
    return loadReader(raw ? JSON.parse(raw) : null);
  } catch {
    return newReader();
  }
}

export function writeReader(s: ReaderState) {
  try {
    localStorage.setItem(READER_KEY, JSON.stringify(s));
  } catch {
    /* private mode or full */
  }
}

/** A text's phrases, in order: whole sentences, a short one joined to the next. */
export function phrasesOfText(lines: string[]): string[] {
  return phraseUnits([lines], R.minWords);
}

/** A text's key for its place: its name and what it holds, so an edited text starts over. */
export function textKey(name: string, lines: string[]): string {
  return `${name}|${hashOf(lines.join("\n"))}`;
}

/** The phrase to start at (the next one, or the first after the end). */
export function placeOf(s: ReaderState, key: string, count: number): number {
  const at = s.at[key] ?? 0;
  return at >= 0 && at < count ? at : 0;
}

/** Keeps your place in a text. */
export function setPlace(s: ReaderState, key: string, at: number): ReaderState {
  return { ...s, at: { ...s.at, [key]: Math.max(0, Math.floor(at)) } };
}

/** Where a pass is at a time after it began: the lit word, and whether its words have all been lit. */
export function passAt(
  words: number,
  wordMs: number,
  elapsed: number,
): { word: number; over: boolean; progress: number } {
  const n = Math.max(1, words);
  const total = n * wordMs;
  const t = Math.max(0, elapsed);
  return {
    word: Math.min(n - 1, Math.floor(t / wordMs)),
    over: t >= total,
    progress: Math.min(1, t / total),
  };
}
