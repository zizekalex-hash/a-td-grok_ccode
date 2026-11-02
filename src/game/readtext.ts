/**
 * The Read tab of the Recitation drill: a whole text, phrase by phrase in
 * order, each read a few passes, word by word (like the Court's recite screen).
 * Its settings (speed, passes, sizes, font, auto) and your place in each text
 * are kept on the device (READER_KEY). Pure, with relative imports, so the tests
 * can load it. Tuned in reader in config.json.
 */
import { CONFIG } from "./config.ts";
import { phrasesOf } from "./court/rules.ts";

const R = CONFIG.reader;

export const READER_KEY = "azshara-reader-v1";

export type ReaderFont = "display" | "plain" | "mono";
export const FONTS: ReaderFont[] = ["display", "plain", "mono"];

export interface ReaderState {
  wordMs: number;
  passes: number;
  wordSize: number;
  phraseSize: number;
  /** Overall playback speed, on top of wordMs (2 = twice as fast), and the most redraws a second. */
  speed: number;
  fps: number;
  font: ReaderFont;
  auto: boolean;
  /** The size, speed and font controls shown (they fold away). */
  controls: boolean;
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
    speed: clampSpeed(R.speed),
    fps: clampFps(R.fps),
    font: FONTS.includes(R.font as ReaderFont) ? (R.font as ReaderFont) : "display",
    auto: R.auto === true,
    controls: true,
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
  return clamp(Math.round(rem * 10) / 10, 0.8, 12);
}

/** Playback speed, a twentieth at a time, from a quarter to four times. */
export function clampSpeed(x: number): number {
  return clamp(Math.round(x * 20) / 20, 0.25, 4);
}

/** Most redraws a second, from 1 to 60. */
export function clampFps(n: number): number {
  return clamp(Math.round(n), 1, 60);
}

/** Time each word is lit, with the playback speed (ms). */
export function wordTime(s: ReaderState): number {
  return Math.max(20, s.wordMs / s.speed);
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
  s.speed = clampSpeed(num(d.speed, s.speed));
  s.fps = clampFps(num(d.fps, s.fps));
  if (FONTS.includes(d.font as ReaderFont)) s.font = d.font as ReaderFont;
  if (typeof d.auto === "boolean") s.auto = d.auto;
  if (typeof d.controls === "boolean") s.controls = d.controls;
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

/** A phrase of a text, and the line it came from (to write a correction back). */
export interface Unit {
  text: string;
  line: number;
}

/**
 * A text's phrases, in order, every one (a sentence said twice is read twice):
 * whole sentences, a short one joined to the next until it has minWords, a
 * short last one joined to the one before. Never across lines.
 */
export function readUnits(lines: string[], min = R.minWords): Unit[] {
  const out: Unit[] = [];
  lines.forEach((sector, line) => {
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
    for (const u of units) out.push({ text: u.join(" "), line });
  });
  return out;
}

/** The phrases alone. */
export function phrasesOfText(lines: string[]): string[] {
  return readUnits(lines).map((u) => u.text);
}

/**
 * A phrase rewritten: its line in the text gets the new words in its place
 * (spaces folded to one). Empty text takes the phrase out; a line left empty
 * goes. The other lines stay as they were.
 */
export function editPhrase(lines: string[], unit: Unit, text: string): string[] {
  const fold = (t: string) => t.replace(/\s+/g, " ").trim();
  const line = fold(lines[unit.line] ?? "");
  const old = fold(unit.text);
  const at = line.indexOf(old);
  if (at < 0) return lines;
  const next = fold(`${line.slice(0, at)} ${fold(text)} ${line.slice(at + old.length)}`);
  const out = [...lines];
  if (next) out[unit.line] = next;
  else out.splice(unit.line, 1);
  return out;
}

/** A text's key for your place in it: its name (an edited text keeps its place). */
export function textKey(name: string): string {
  return name;
}

/** The phrase to start at (the next one, or the first after the end). */
export function placeOf(s: ReaderState, key: string, count: number): number {
  // Places kept before (by name and contents) still count.
  const old = Object.keys(s.at).find((k) => k.startsWith(`${key}|`));
  const at = s.at[key] ?? (old ? s.at[old] : 0) ?? 0;
  return at >= 0 && at < count ? at : 0;
}

/** How far through a text, in percent, to one decimal: phrases done of all. */
export function percentDone(index: number, total: number): string {
  return total > 0 ? ((Math.min(index, total) / total) * 100).toFixed(1) : "0.0";
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
