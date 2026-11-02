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

/** The colour of the controls and the lit word, on a black panel. */
export const ACCENTS = {
  purple: "#a855f7",
  cyan: "#00ffff",
  gold: "#e8c872",
  pink: "#ff5fd2",
  white: "#f4f7ff",
  green: "#4dff9a",
  red: "#ff4d6d",
} as const;
export type Accent = keyof typeof ACCENTS;
export const ACCENT_NAMES = Object.keys(ACCENTS) as Accent[];

/** How the text's bytes become pixels: three a pixel, one a pixel, or a bit a pixel. */
export type BytesMode = "rgb" | "gray" | "bits";
export const BYTES_MODES: BytesMode[] = ["rgb", "gray", "bits"];

/** The settings panel's tabs. */
export type PanelTab = "play" | "look" | "bytes" | "flash";
export const PANEL_TABS: PanelTab[] = ["play", "look", "bytes", "flash"];

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
  /** The size, speed and font controls shown (they fold away), and which tab. */
  controls: boolean;
  tab: PanelTab;
  accent: Accent;
  /** The panel's see-through: 1 solid, 0.1 nearly gone. */
  panelOpacity: number;
  /** The big word and the whole phrase stay where they are (unlock to drag them). */
  locked: boolean;
  /** Their centres, as fractions of the screen. */
  wordX: number;
  wordY: number;
  phraseX: number;
  phraseY: number;
  /** The whole text's bytes as a picture behind it all. */
  bytes: boolean;
  bytesOpacity: number;
  bytesMode: BytesMode;
  bytesSharp: boolean;
  /** The whole text flashed, a screen at a time: every flashEvery s, for flashMs ms, at flashSize px. */
  flash: boolean;
  flashEvery: number;
  flashMs: number;
  flashSize: number;
  flashOpacity: number;
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
    tab: "play",
    accent: R.accent in ACCENTS ? (R.accent as Accent) : "purple",
    panelOpacity: clampPanelOpacity(R.panelOpacity),
    locked: true,
    wordX: clampPlace(R.wordX),
    wordY: clampPlace(R.wordY),
    phraseX: clampPlace(R.phraseX),
    phraseY: clampPlace(R.phraseY),
    bytes: R.bytes !== false,
    bytesOpacity: clampOpacity(R.bytesOpacity),
    bytesMode: BYTES_MODES.includes(R.bytesMode as BytesMode) ? (R.bytesMode as BytesMode) : "rgb",
    bytesSharp: R.bytesSharp !== false,
    flash: R.flash === true,
    flashEvery: clampFlashEvery(R.flashEvery),
    flashMs: clampFlashMs(R.flashMs),
    flashSize: clampFlashSize(R.flashSize),
    flashOpacity: clampOpacity(R.flashOpacity),
    at: {},
  };
}

/** An opacity, to a hundredth, from 0 to 1. */
export function clampOpacity(v: number): number {
  return clamp(Math.round(v * 100) / 100, 0, 1);
}

/** The panel's opacity: never quite gone (its buttons must be found). */
export function clampPanelOpacity(v: number): number {
  return clamp(clampOpacity(v), 0.1, 1);
}

/** A place on the screen, as a fraction, kept on it. */
export function clampPlace(v: number): number {
  return clamp(Math.round(v * 1000) / 1000, 0.02, 0.98);
}

/** Seconds between flashes, a tenth at a time, from half a second to ten minutes. */
export function clampFlashEvery(s: number): number {
  return clamp(Math.round(s * 10) / 10, 0.5, 600);
}

/** How long a flash shows, in ms, a tenth at a time (at least one frame is drawn). */
export function clampFlashMs(ms: number): number {
  return clamp(Math.round(ms * 10) / 10, 1, 5000);
}

/** The flash's text size, in px, half a pixel at a time. */
export function clampFlashSize(px: number): number {
  return clamp(Math.round(px * 2) / 2, 3, 48);
}

/**
 * One step up or down, the step set by where the value is: bands of
 * [below, step], e.g. [[10, 0.1], [Infinity, 1]] steps by a tenth under 10 and
 * by one from there. Going down from a band's edge takes the smaller step.
 */
export function nudge(v: number, dir: 1 | -1, bands: [number, number][]): number {
  const ref = dir > 0 ? v : v - 1e-9;
  const step = (bands.find(([below]) => ref < below) ?? bands[bands.length - 1] ?? [0, 1])[1];
  return Math.round((v + dir * step) * 1e6) / 1e6;
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
  if (PANEL_TABS.includes(d.tab as PanelTab)) s.tab = d.tab as PanelTab;
  if (typeof d.accent === "string" && d.accent in ACCENTS) s.accent = d.accent as Accent;
  s.panelOpacity = clampPanelOpacity(num(d.panelOpacity, s.panelOpacity));
  if (typeof d.locked === "boolean") s.locked = d.locked;
  s.wordX = clampPlace(num(d.wordX, s.wordX));
  s.wordY = clampPlace(num(d.wordY, s.wordY));
  s.phraseX = clampPlace(num(d.phraseX, s.phraseX));
  s.phraseY = clampPlace(num(d.phraseY, s.phraseY));
  if (typeof d.bytes === "boolean") s.bytes = d.bytes;
  s.bytesOpacity = clampOpacity(num(d.bytesOpacity, s.bytesOpacity));
  if (BYTES_MODES.includes(d.bytesMode as BytesMode)) s.bytesMode = d.bytesMode as BytesMode;
  if (typeof d.bytesSharp === "boolean") s.bytesSharp = d.bytesSharp;
  if (typeof d.flash === "boolean") s.flash = d.flash;
  s.flashEvery = clampFlashEvery(num(d.flashEvery, s.flashEvery));
  s.flashMs = clampFlashMs(num(d.flashMs, s.flashMs));
  s.flashSize = clampFlashSize(num(d.flashSize, s.flashSize));
  s.flashOpacity = clampOpacity(num(d.flashOpacity, s.flashOpacity));
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
