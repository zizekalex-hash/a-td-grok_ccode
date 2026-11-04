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

/** How the text's bytes become pixels: three a pixel, one a pixel, or a bit a pixel (the three layers). */
export type BytesMode = "rgb" | "gray" | "bits";
export const BYTES_MODES: BytesMode[] = ["rgb", "gray", "bits"];

/** The flash's reversed round after each forward one: none, phrases backwards, words backwards, letters backwards. */
export type FlashReverse = "off" | "phrases" | "words" | "letters";
export const FLASH_REVERSE: FlashReverse[] = ["off", "phrases", "words", "letters"];

/** Where the stream's copies stand: above the word, below the phrase, or at the sides; stacked or in a row. */
export type StreamPlace = "above" | "below" | "sides";
export const STREAM_PLACES: StreamPlace[] = ["above", "below", "sides"];
export type StreamFlow = "stacked" | "row";
/** Phrases in the text's order, or shuffled (each once, then shuffled again). */
export type Order = "order" | "random";
export const STREAM_FLOWS: StreamFlow[] = ["stacked", "row"];

/** The settings panel's tabs. */
export type PanelTab = "play" | "look" | "bytes" | "flash" | "stream";
export const PANEL_TABS: PanelTab[] = ["play", "look", "bytes", "flash", "stream"];

export interface ReaderState {
  wordMs: number;
  passes: number;
  /** Seconds of silence (Auto) after a pass, and after a phrase's last pass. */
  silence: number;
  phraseSilence: number;
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
  /**
   * Where they are, as fractions of the room between the header and the panel:
   * across, their middles; down, the word's foot and the phrase's top.
   */
  wordX: number;
  wordY: number;
  phraseX: number;
  phraseY: number;
  /** Which way places are kept (2: in the room, as above); older places are left behind. */
  placesV: number;
  /** The most characters on a line of the whole phrase. */
  phraseChars: number;
  /** The word and the phrase stay in the middle across (dragging moves them up and down). */
  centered: boolean;
  /** Android: into the mini window (picture in picture) when you leave the app while reading. */
  miniAuto: boolean;
  /** The whole text's bytes as a picture behind it all: three layers, each at its own opacity, and one over all. */
  bytes: boolean;
  bytesOpacity: number;
  layers: Record<BytesMode, number>;
  bytesSharp: boolean;
  /** The whole text flashed, a screen at a time: every flashEvery s, for flashMs ms, at flashSize px. */
  flash: boolean;
  flashEvery: number;
  flashMs: number;
  flashSize: number;
  flashOpacity: number;
  flashColor: Accent;
  /** The most characters on a flash's line (0: the whole width). */
  flashChars: number;
  /** Clear of the header and the panel while they show. */
  flashAvoid: boolean;
  flashReverse: FlashReverse;
  /** Words the big word shows at a time (each hit lasts wordMs). */
  perHit: number;
  /** The stream: a fast word looper over the whole text, next to the big word. */
  stream: boolean;
  streamMs: number;
  streamPerHit: number;
  streamCopies: number;
  /** Where the copies stand: any of above the word, below the phrase, at both sides. */
  streamPlaces: Record<StreamPlace, boolean>;
  /** Space between copies (em of the stream's size). */
  streamGap: number;
  streamOrder: Order;
  flashOrder: Order;
  streamFlow: StreamFlow;
  streamSize: number;
  streamOpacity: number;
  streamColor: Accent;
  /** Where you are in each text: the phrase to read next, by the text's key. */
  at: Record<string, number>;
  /** Texts read through and confirmed as written right: when, and the text's fingerprint then. */
  checked: Record<string, { at: number; sum: string }>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function newReader(): ReaderState {
  return {
    wordMs: clampWordMs(R.wordMs),
    passes: clampPasses(R.passes),
    silence: clampSilence(R.silence),
    phraseSilence: clampSilence(R.phraseSilence),
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
    placesV: 2,
    phraseChars: clampPhraseChars(R.phraseChars),
    centered: R.centered !== false,
    miniAuto: R.miniAuto === true,
    bytes: R.bytes !== false,
    bytesOpacity: clampOpacity(R.bytesOpacity),
    layers: {
      rgb: clampOpacity(R.bytesRgb),
      gray: clampOpacity(R.bytesGray),
      bits: clampOpacity(R.bytesBits),
    },
    bytesSharp: R.bytesSharp !== false,
    flash: R.flash === true,
    flashEvery: clampFlashEvery(R.flashEvery),
    flashMs: clampFlashMs(R.flashMs),
    flashSize: clampFlashSize(R.flashSize),
    flashOpacity: clampOpacity(R.flashOpacity),
    flashColor: R.flashColor in ACCENTS ? (R.flashColor as Accent) : "white",
    flashChars: clampFlashChars(R.flashChars),
    flashAvoid: R.flashAvoid !== false,
    flashReverse: FLASH_REVERSE.includes(R.flashReverse as FlashReverse)
      ? (R.flashReverse as FlashReverse)
      : "off",
    perHit: clampPerHit(R.perHit),
    stream: R.stream === true,
    streamMs: clampStreamMs(R.streamMs),
    streamPerHit: clampPerHit(R.streamPerHit),
    streamCopies: clampCopies(R.streamCopies),
    streamPlaces: {
      above: R.streamAbove !== false,
      below: R.streamBelow === true,
      sides: R.streamSides === true,
    },
    streamGap: clampGap(R.streamGap),
    streamOrder: R.streamOrder === "random" ? "random" : "order",
    flashOrder: R.flashOrder === "random" ? "random" : "order",
    streamFlow: R.streamFlow === "row" ? "row" : "stacked",
    streamSize: clampStreamSize(R.streamSize),
    streamOpacity: clampOpacity(R.streamOpacity),
    streamColor: R.streamColor in ACCENTS ? (R.streamColor as Accent) : "white",
    at: {},
    checked: {},
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

/** Words a hit: 1 to 5. */
export function clampPerHit(n: number): number {
  return clamp(Math.round(n), 1, 5);
}

/** The stream's time a hit (ms): from 16 (a frame) to 2000. */
export function clampStreamMs(ms: number): number {
  return clamp(Math.round(ms), 16, 2000);
}

/** The stream's copies: 1 to 12. */
export function clampCopies(n: number): number {
  return clamp(Math.round(n), 1, 12);
}

/** Space between the stream's copies, in em, to a twentieth: 0 to 6. */
export function clampGap(em: number): number {
  return clamp(Math.round(em * 20) / 20, 0, 6);
}

/** The stream's size, in rem, to a twentieth. */
export function clampStreamSize(rem: number): number {
  return clamp(Math.round(rem * 20) / 20, 0.4, 6);
}

/** Seconds of silence, to the millisecond, up to a minute. */
export function clampSilence(s: number): number {
  return clamp(Math.round(s * 1000) / 1000, 0, 60);
}

/** Characters on a flash's line: 0 (the whole width), or 10 to 400. */
export function clampFlashChars(n: number): number {
  const v = Math.round(n);
  return v < 10 ? 0 : Math.min(400, v);
}

/** Characters on a line of the whole phrase: from 10 to 200. */
export function clampPhraseChars(n: number): number {
  return clamp(Math.round(n), 10, 200);
}

/** Seconds between flashes, to a hundredth, from half a second to ten minutes. */
export function clampFlashEvery(s: number): number {
  return clamp(Math.round(s * 100) / 100, 0.5, 600);
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

/** Time a word is lit, to 10 ms. */
export function clampWordMs(ms: number): number {
  return clamp(Math.round(ms / 10) * 10, R.wordMsMin, R.wordMsMax);
}

export function clampPasses(n: number): number {
  return clamp(Math.round(n), 1, Math.max(1, R.maxPasses));
}

/** The lit word's size, in rem, to a twentieth. */
export function clampWordSize(rem: number): number {
  return clamp(Math.round(rem * 20) / 20, 0.8, 12);
}

/** Playback speed, to a hundredth, from a quarter to four times. */
export function clampSpeed(x: number): number {
  return clamp(Math.round(x * 100) / 100, 0.25, 4);
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
  s.silence = clampSilence(num(d.silence, s.silence));
  s.phraseSilence = clampSilence(num(d.phraseSilence, s.phraseSilence));
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
  // Places kept the old way (centres on the whole screen) start again from the defaults.
  if (d.placesV === 2) {
    s.wordX = clampPlace(num(d.wordX, s.wordX));
    s.wordY = clampPlace(num(d.wordY, s.wordY));
    s.phraseX = clampPlace(num(d.phraseX, s.phraseX));
    s.phraseY = clampPlace(num(d.phraseY, s.phraseY));
  }
  if (typeof d.bytes === "boolean") s.bytes = d.bytes;
  s.phraseChars = clampPhraseChars(num(d.phraseChars, s.phraseChars));
  if (typeof d.centered === "boolean") s.centered = d.centered;
  if (typeof d.miniAuto === "boolean") s.miniAuto = d.miniAuto;
  s.bytesOpacity = clampOpacity(num(d.bytesOpacity, s.bytesOpacity));
  const layers = (d.layers && typeof d.layers === "object" ? d.layers : {}) as Record<
    string,
    unknown
  >;
  for (const m of BYTES_MODES) s.layers[m] = clampOpacity(num(layers[m], s.layers[m]));
  if (typeof d.bytesSharp === "boolean") s.bytesSharp = d.bytesSharp;
  if (typeof d.flash === "boolean") s.flash = d.flash;
  s.flashEvery = clampFlashEvery(num(d.flashEvery, s.flashEvery));
  s.flashMs = clampFlashMs(num(d.flashMs, s.flashMs));
  s.flashSize = clampFlashSize(num(d.flashSize, s.flashSize));
  s.flashOpacity = clampOpacity(num(d.flashOpacity, s.flashOpacity));
  if (typeof d.flashColor === "string" && d.flashColor in ACCENTS)
    s.flashColor = d.flashColor as Accent;
  s.flashChars = clampFlashChars(num(d.flashChars, s.flashChars));
  if (typeof d.flashAvoid === "boolean") s.flashAvoid = d.flashAvoid;
  if (FLASH_REVERSE.includes(d.flashReverse as FlashReverse))
    s.flashReverse = d.flashReverse as FlashReverse;
  s.perHit = clampPerHit(num(d.perHit, s.perHit));
  if (typeof d.stream === "boolean") s.stream = d.stream;
  s.streamMs = clampStreamMs(num(d.streamMs, s.streamMs));
  s.streamPerHit = clampPerHit(num(d.streamPerHit, s.streamPerHit));
  s.streamCopies = clampCopies(num(d.streamCopies, s.streamCopies));
  const places =
    d.streamPlaces && typeof d.streamPlaces === "object"
      ? (d.streamPlaces as Record<string, unknown>)
      : null;
  if (places) {
    for (const p of STREAM_PLACES)
      if (typeof places[p] === "boolean") s.streamPlaces[p] = places[p] as boolean;
  } else if (STREAM_PLACES.includes(d.streamPlace as StreamPlace)) {
    // A save from before places could be mixed: just the one it had.
    for (const p of STREAM_PLACES) s.streamPlaces[p] = p === d.streamPlace;
  }
  s.streamGap = clampGap(num(d.streamGap, s.streamGap));
  if (d.streamOrder === "order" || d.streamOrder === "random") s.streamOrder = d.streamOrder;
  if (d.flashOrder === "order" || d.flashOrder === "random") s.flashOrder = d.flashOrder;
  if (STREAM_FLOWS.includes(d.streamFlow as StreamFlow)) s.streamFlow = d.streamFlow as StreamFlow;
  s.streamSize = clampStreamSize(num(d.streamSize, s.streamSize));
  s.streamOpacity = clampOpacity(num(d.streamOpacity, s.streamOpacity));
  if (typeof d.streamColor === "string" && d.streamColor in ACCENTS)
    s.streamColor = d.streamColor as Accent;
  const at = d.at && typeof d.at === "object" ? (d.at as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(at))
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) s.at[k] = Math.floor(v);
  const checked =
    d.checked && typeof d.checked === "object" ? (d.checked as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(checked)) {
    const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    if (typeof c.sum === "string" && typeof c.at === "number" && Number.isFinite(c.at))
      s.checked[k] = { at: c.at, sum: c.sum };
  }
  return s;
}

/**
 * A text's fingerprint (FNV-1a over its lines, and its length), so a text
 * edited after it was checked shows as changed.
 */
export function textSum(lines: string[]): string {
  const t = lines.join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${t.length.toString(36)}`;
}

/** A text checked (and not changed since), changed since it was checked, or not checked. */
export type CheckState = "checked" | "changed" | "unchecked";

export function checkState(
  s: ReaderState,
  name: string,
  lines: string[],
  folder?: string,
): CheckState {
  const c = s.checked[textKey(name, folder)];
  if (!c) return "unchecked";
  return c.sum === textSum(lines) ? "checked" : "changed";
}

/** Marks a text checked, as it is now. */
export function markChecked(
  s: ReaderState,
  name: string,
  lines: string[],
  now: number,
  folder?: string,
): ReaderState {
  return {
    ...s,
    checked: { ...s.checked, [textKey(name, folder)]: { at: now, sum: textSum(lines) } },
  };
}

/** Takes the check off a text. */
export function unmarkChecked(s: ReaderState, name: string, folder?: string): ReaderState {
  const checked = { ...s.checked };
  delete checked[textKey(name, folder)];
  return { ...s, checked };
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

/**
 * A text's key for your place in it and its check: its name (an edited text
 * keeps its place), with its folder in front for a text from a .zip folder.
 */
export function textKey(name: string, folder?: string): string {
  return folder ? `${folder}/${name}` : name;
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
