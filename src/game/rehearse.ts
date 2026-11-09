/**
 * The Rehearse tab: your phrases (a word is a phrase of one), a tap a rep. Each
 * phrase keeps its own count, and a count can be reset while the phrase stays.
 *
 * A tap can also sound the phrase and show it. The sound is the phrase itself:
 * its UTF-8 bytes as raw 8-bit samples, played at rawRate samples a second,
 * centred (the bytes' average taken off) and raised so the loudest point is amp
 * (a leveler: the whole wave goes up together). It is fitted to signalMs: a
 * phrase shorter than that repeats until it fills it (0.1 s of bytes plays 9
 * times in 0.9 s); a longer one is sped up, pitch and pace together like tape
 * (1.8 s of bytes plays twice as fast). The picture is the phrase's bytes in the
 * Read tab's three layers. Pure, with relative imports, so the tests can load it.
 */
import { phraseKey, phrasesFromText } from "./reps.ts";
import { BYTES_MODES, readUnits, textKey, type BytesMode } from "./readtext.ts";

export const REHEARSE_KEY = "azshara-rehearse-v1";
/** The most phrases kept. */
export const MAX_PHRASES = 5000;
/** The longest a phrase is kept (letters): a long sentence whole. */
export const MAX_PHRASE_CHARS = 2000;
/** The most texts whose place is kept. */
export const MAX_PROGRESS = 2000;

export interface RehearsePhrase {
  id: string;
  text: string;
  /** Reps counted, and when the last one was (ms since 1970; 0 for none). */
  count: number;
  last: number;
  /** When it was added. */
  at: number;
}

/** How long a tap's sound and picture last: as long as it is pressed, or at least the whole signal. */
export type EmitMode = "press" | "full";

/**
 * The sound's shape: steady (the phrase fitted to the length, over and over),
 * or a rising cycle (plays of that length, each faster and higher than the one
 * before, from x1 to topSpeed, each raised to the peak; then round again).
 */
export type SoundMode = "steady" | "cycle";

export interface RehearseSettings {
  /** The phrase's sound on a tap. */
  sound: boolean;
  /** The length the sound is fitted to (ms). */
  signalMs: number;
  /** The loudest point of the sound, 0 to 1. */
  amp: number;
  /** Raw samples a second: how long the bytes naturally last. */
  rawRate: number;
  /** Steady or a rising cycle, its plays and its top speed. */
  mode: SoundMode;
  plays: number;
  topSpeed: number;
  /** The phrase's sound all the time while Rehearse is open, not only on a tap. */
  nonstop: boolean;
  /** Reps one tap counts; above 1 a tap counts only once batch x repSeconds have passed since the last. */
  batch: number;
  repSeconds: number;
  /** The phrase's own .wav (made outside, next to its .txt in azs-folder/input_perphrase) looped as it is, at this gain. */
  wavLoop: boolean;
  wavVolume: number;
  /** How the .wav is played (its loudness only, the sound itself as it is): see WavStyle. */
  wavShape: WavShape;
  wavFadeIn: number;
  wavFadeOut: number;
  wavCycles: number;
  wavDepth: number;
  wavLevels: number[];
  /** Locked: the tap counts and the settings cannot change; unlocked, the other way round. */
  locked: boolean;
  /** Keeps going away from the tab (other tabs, the game, other apps): its sound, and the floating window's taps counted at once. */
  background: boolean;
  /** The phrase's byte picture on a tap, and each layer's opacity. */
  picture: boolean;
  layers: Record<BytesMode, number>;
  /** The whole picture's opacity, over black. */
  pictureOpacity: number;
  emit: EmitMode;
  /** The tap area's height, in % of the screen. */
  tapHeight: number;
  /** The phrase's letters in the tap area (px, apart from the screen's size): smaller still if a long phrase needs it. */
  phraseSize: number;
}

/** Single phrases, or whole texts (the Read tab's) phrase after phrase. */
export type RehearseView = "phrases" | "texts";

/** Where you are in a text, and what it has had. */
export interface TextProgress {
  /** The phrase it is at (0 for the first). */
  at: number;
  /** Times through the whole text. */
  passes: number;
  /** Reps counted on its phrases, and when the last was (ms since 1970; 0 for none). */
  reps: number;
  last: number;
}

export interface RehearseState {
  items: RehearsePhrase[];
  /** The phrase being repped ("" for the first). */
  current: string;
  settings: RehearseSettings;
  /** When the last tap counted (ms since 1970; 0 for none): a batch waits from there. */
  lastTap: number;
  view: RehearseView;
  /** The text being repped, by its key (readtext textKey; "" for the first). */
  text: string;
  /** Each text's place and counts, by its key. */
  progress: Record<string, TextProgress>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const clampSignalMs = (v: number) => clamp(Math.round(v), 1, 60_000);
export const clampAmp = (v: number) => clamp(Math.round(v * 100) / 100, 0, 1);
export const clampRawRate = (v: number) => clamp(Math.round(v), 1, 1_000_000);
export const clampPlays = (v: number) => clamp(Math.round(v), 2, 99);
export const clampBatch = (v: number) => clamp(Math.round(v), 1, 1000);
export const clampRepSeconds = (v: number) => clamp(Math.round(v * 100) / 100, 0, 60);
export const clampTopSpeed = (v: number) => clamp(Math.round(v * 100) / 100, 1, 10_000);
/** The longest a whole cycle lasts (ms): its plays are shortened to fit. */
export const MAX_CYCLE_MS = 60_000;
export const clampLayer = (v: number) => clamp(Math.round(v * 100) / 100, 0, 1);
export const clampTapHeight = (v: number) => clamp(Math.round(v), 15, 80);
export const clampPhraseSize = (v: number) => clamp(Math.round(v), 8, 96);

export function defaultSettings(): RehearseSettings {
  return {
    sound: true,
    signalMs: 900,
    amp: 0.9,
    rawRate: 8000,
    mode: "steady",
    plays: 9,
    topSpeed: 9,
    nonstop: false,
    batch: 1,
    repSeconds: 0.99,
    wavLoop: true,
    wavVolume: 1,
    wavShape: "flat",
    wavFadeIn: 0.11,
    wavFadeOut: 0.1,
    wavCycles: 1,
    wavDepth: 1,
    wavLevels: [1],
    locked: true,
    background: true,
    picture: true,
    layers: { rgb: 0.36, gray: 0.36, bits: 0.36 },
    pictureOpacity: 1,
    emit: "press",
    tapHeight: 32,
    phraseSize: 18,
  };
}

export function newRehearse(): RehearseState {
  return {
    items: [],
    current: "",
    settings: defaultSettings(),
    lastTap: 0,
    view: "phrases",
    text: "",
    progress: {},
  };
}

/** A saved state, each value checked. */
export function loadRehearse(data: unknown): RehearseState {
  const d = obj(data);
  const s = newRehearse();
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : []) {
    const r = obj(raw);
    const text =
      typeof r.text === "string"
        ? r.text.replace(/\s+/g, " ").trim().slice(0, MAX_PHRASE_CHARS)
        : "";
    const id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : "";
    if (!text || !id || seen.has(id) || s.items.length >= MAX_PHRASES) continue;
    seen.add(id);
    s.items.push({
      id,
      text,
      count: Math.max(0, Math.floor(num(r.count, 0))),
      last: Math.max(0, num(r.last, 0)),
      at: Math.max(0, num(r.at, 0)),
    });
  }
  if (typeof d.current === "string" && seen.has(d.current)) s.current = d.current;
  s.lastTap = Math.max(0, num(d.lastTap, 0));
  if (d.view === "phrases" || d.view === "texts") s.view = d.view;
  if (typeof d.text === "string") s.text = d.text.slice(0, 400);
  for (const [key, raw] of Object.entries(obj(d.progress)).slice(0, MAX_PROGRESS)) {
    const r = obj(raw);
    if (!key || key.length > 400) continue;
    s.progress[key] = {
      at: Math.max(0, Math.floor(num(r.at, 0))),
      passes: Math.max(0, Math.floor(num(r.passes, 0))),
      reps: Math.max(0, Math.floor(num(r.reps, 0))),
      last: Math.max(0, num(r.last, 0)),
    };
  }
  const t = obj(d.settings);
  const u = s.settings;
  if (typeof t.sound === "boolean") u.sound = t.sound;
  u.signalMs = clampSignalMs(num(t.signalMs, u.signalMs));
  u.amp = clampAmp(num(t.amp, u.amp));
  u.rawRate = clampRawRate(num(t.rawRate, u.rawRate));
  if (t.mode === "steady" || t.mode === "cycle") u.mode = t.mode;
  u.plays = clampPlays(num(t.plays, u.plays));
  u.topSpeed = clampTopSpeed(num(t.topSpeed, u.topSpeed));
  if (typeof t.nonstop === "boolean") u.nonstop = t.nonstop;
  u.batch = clampBatch(num(t.batch, u.batch));
  u.repSeconds = clampRepSeconds(num(t.repSeconds, u.repSeconds));
  if (typeof t.wavLoop === "boolean") u.wavLoop = t.wavLoop;
  u.wavVolume = clampAmp(num(t.wavVolume, u.wavVolume));
  if (WAV_SHAPES.includes(t.wavShape as WavShape)) u.wavShape = t.wavShape as WavShape;
  u.wavFadeIn = clampFade(num(t.wavFadeIn, u.wavFadeIn));
  u.wavFadeOut = clampFade(num(t.wavFadeOut, u.wavFadeOut));
  u.wavCycles = clampCycles(num(t.wavCycles, u.wavCycles));
  u.wavDepth = clampFade(num(t.wavDepth, u.wavDepth));
  if (Array.isArray(t.wavLevels)) {
    const levels = t.wavLevels
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .slice(0, MAX_LEVELS)
      .map(clampLevel);
    if (levels.length) u.wavLevels = levels;
  }
  if (typeof t.locked === "boolean") u.locked = t.locked;
  if (typeof t.background === "boolean") u.background = t.background;
  if (typeof t.picture === "boolean") u.picture = t.picture;
  const layers = obj(t.layers);
  for (const m of BYTES_MODES) u.layers[m] = clampLayer(num(layers[m], u.layers[m]));
  u.pictureOpacity = Math.max(0.05, clampLayer(num(t.pictureOpacity, u.pictureOpacity)));
  if (t.emit === "press" || t.emit === "full") u.emit = t.emit;
  u.tapHeight = clampTapHeight(num(t.tapHeight, u.tapHeight));
  u.phraseSize = clampPhraseSize(num(t.phraseSize, u.phraseSize));
  return s;
}

/** The phrase being repped: the current one, or the first. */
export function currentPhrase(s: RehearseState): RehearsePhrase | undefined {
  return s.items.find((i) => i.id === s.current) ?? s.items[0];
}

/** Reps counted over all the phrases. */
export function totalReps(s: RehearseState): number {
  return s.items.reduce((n, i) => n + i.count, 0);
}

/**
 * Adds phrases at the end, each once (one already there, in any case or spacing,
 * is skipped). The first added becomes the current one if there was none.
 */
export function addPhrases(
  s: RehearseState,
  texts: string[],
  now: number,
  makeId = (i: number) =>
    `h${now.toString(36)}${i.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
): { state: RehearseState; added: number } {
  const keys = new Set(s.items.map((i) => phraseKey(i.text)));
  const added: RehearsePhrase[] = [];
  for (const raw of texts) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_PHRASE_CHARS);
    const key = phraseKey(text);
    if (!text || keys.has(key)) continue;
    if (s.items.length + added.length >= MAX_PHRASES) break;
    keys.add(key);
    added.push({ id: makeId(added.length), text, count: 0, last: 0, at: now });
  }
  if (!added.length) return { state: s, added: 0 };
  const items = [...s.items, ...added];
  const current = currentPhrase(s) ? s.current : added[0]!.id;
  return { state: { ...s, items, current }, added: added.length };
}

/** The phrases of a pasted or loaded text: its lines (or each sentence of them), list marks off. */
export function phrasesOf(text: string, bySentence = true): string[] {
  return phrasesFromText(text, MAX_PHRASES, bySentence, MAX_PHRASE_CHARS);
}

/** One rep for a phrase. */
export function countRep(s: RehearseState, id: string, now: number, n = 1): RehearseState {
  const add = Math.max(1, Math.floor(n));
  return {
    ...s,
    lastTap: now,
    items: s.items.map((i) => (i.id === id ? { ...i, count: i.count + add, last: now } : i)),
  };
}

/** How long a batch takes (ms): batch x repSeconds, or none for one rep a tap. */
export function batchWaitMs(settings: Pick<RehearseSettings, "batch" | "repSeconds">): number {
  return settings.batch > 1 ? Math.round(settings.batch * settings.repSeconds * 1000) : 0;
}

/** Whether a tap now counts its batch, and how long until it would (ms). */
export function tapReady(s: RehearseState, now: number): { ready: boolean; leftMs: number } {
  const wait = batchWaitMs(s.settings);
  const left = s.lastTap > 0 ? Math.max(0, s.lastTap + wait - now) : 0;
  return { ready: left <= 0, leftMs: left };
}

/** A phrase's count back to 0; the phrase stays. */
export function resetCount(s: RehearseState, id: string): RehearseState {
  return { ...s, items: s.items.map((i) => (i.id === id ? { ...i, count: 0, last: 0 } : i)) };
}

/** Every count back to 0; the phrases stay. */
export function resetCounts(s: RehearseState): RehearseState {
  return { ...s, items: s.items.map((i) => ({ ...i, count: 0, last: 0 })) };
}

/** Takes a phrase off; the current one moves to the next if it was this. */
export function removePhrase(s: RehearseState, id: string): RehearseState {
  const at = s.items.findIndex((i) => i.id === id);
  if (at < 0) return s;
  const items = s.items.filter((i) => i.id !== id);
  const current =
    currentPhrase(s)?.id === id ? (items[Math.min(at, items.length - 1)]?.id ?? "") : s.current;
  return { ...s, items, current };
}

/** The phrase before or after the current one, round the list. */
export function step(s: RehearseState, dir: 1 | -1): RehearseState {
  if (!s.items.length) return s;
  const at = Math.max(
    0,
    s.items.findIndex((i) => i.id === currentPhrase(s)?.id),
  );
  const next = s.items[(at + dir + s.items.length) % s.items.length];
  return next ? { ...s, current: next.id } : s;
}

export function select(s: RehearseState, id: string): RehearseState {
  return s.items.some((i) => i.id === id) ? { ...s, current: id } : s;
}

// ---- The phrase as sound ----

/** The phrase's bytes (UTF-8), "·" for an empty one. */
export function phraseBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text.trim() || "·");
}

/**
 * The bytes as raw samples, -1 to 1, around their own middle (their average
 * taken off, so the wave swings both ways). Bytes all the same would be silence:
 * then their bits are used (each bit one sample, 1 up and 0 down).
 */
export function rawSamples(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const same = bytes.every((b) => b === bytes[0]);
  let raw: Float32Array<ArrayBuffer>;
  if (!same) {
    raw = new Float32Array(bytes.length);
    bytes.forEach((b, i) => (raw[i] = (b - 128) / 128));
  } else {
    raw = new Float32Array(bytes.length * 8);
    bytes.forEach((b, i) => {
      for (let k = 0; k < 8; k++) raw[i * 8 + k] = (b >> (7 - k)) & 1 ? 1 : -1;
    });
  }
  const mean = raw.reduce((n, v) => n + v, 0) / Math.max(1, raw.length);
  for (let i = 0; i < raw.length; i++) raw[i] = raw[i]! - mean;
  return raw;
}

/**
 * How the raw sound is fitted to signalMs: its own length (ms, at rawRate), the
 * speed it plays at (1 as it is, above 1 sped up), and how many times it plays
 * in that time.
 */
export function signalFit(
  samples: number,
  rawRate: number,
  signalMs: number,
): { naturalMs: number; speed: number; plays: number } {
  const naturalMs = (Math.max(1, samples) / Math.max(1, rawRate)) * 1000;
  const speed = naturalMs > signalMs ? naturalMs / signalMs : 1;
  return { naturalMs, speed, plays: (signalMs * speed) / naturalMs };
}

/**
 * The phrase's sound at a sample rate, signalMs long: its raw samples, repeated
 * or sped up to fit (and `faster` times faster again, pitch and pace together),
 * then raised (or lowered) so the loudest point is amp. Past half the sample
 * rate a sound cannot go higher: faster still folds back down (aliasing).
 */
export function phraseSignal(
  text: string,
  rate: number,
  opts: Pick<RehearseSettings, "signalMs" | "amp" | "rawRate">,
  faster = 1,
): Float32Array<ArrayBuffer> {
  const raw = rawSamples(phraseBytes(text));
  const len = raw.length;
  const { speed } = signalFit(len, opts.rawRate, opts.signalMs);
  const out = new Float32Array(Math.max(1, Math.round((rate * opts.signalMs) / 1000)));
  // Raw samples a sample of the output: past the end it starts the phrase again.
  const stride = (opts.rawRate * speed * Math.max(1e-6, faster)) / rate;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i * stride;
    const k = Math.floor(p);
    const f = p - k;
    const a = raw[k % len] ?? 0;
    const b = raw[(k + 1) % len] ?? 0;
    const v = a + (b - a) * f;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const gain = peak > 0 ? opts.amp / peak : 0;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * gain;
  return out;
}

/** A rising cycle's speeds: plays of them, evenly from x1 to topSpeed. */
export function cycleSpeeds(plays: number, topSpeed: number): number[] {
  const n = clampPlays(plays);
  const top = clampTopSpeed(topSpeed);
  return Array.from({ length: n }, (_, k) => 1 + ((top - 1) * k) / (n - 1));
}

/**
 * A rising cycle: the phrase's sound played `plays` times, each signalMs long
 * (shortened so the whole cycle keeps within MAX_CYCLE_MS) and faster and
 * higher than the one before, from x1 to topSpeed, each raised to the peak.
 */
export function cycleSignal(
  text: string,
  rate: number,
  opts: Pick<RehearseSettings, "signalMs" | "amp" | "rawRate" | "plays" | "topSpeed">,
): Float32Array<ArrayBuffer> {
  const speeds = cycleSpeeds(opts.plays, opts.topSpeed);
  const each = Math.max(1, Math.min(opts.signalMs, MAX_CYCLE_MS / speeds.length));
  const parts = speeds.map((v) => phraseSignal(text, rate, { ...opts, signalMs: each }, v));
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The phrase's sound as the settings shape it: steady, or the rising cycle. */
export function soundOf(
  text: string,
  rate: number,
  opts: Pick<RehearseSettings, "signalMs" | "amp" | "rawRate" | "mode" | "plays" | "topSpeed">,
): Float32Array<ArrayBuffer> {
  return opts.mode === "cycle" ? cycleSignal(text, rate, opts) : phraseSignal(text, rate, opts);
}

// ---- Files: a phrase's .txt and .wav in azs-folder/input_perphrase ----

/** The folder (inside azs-folder) where each phrase is a .txt, and its .wav goes next to it. */
export const PHRASE_FOLDER = "input_perphrase";

/** A phrase as a file name (no extension): characters files cannot have made "-", spaces single, at most 80 long. */
export function fileBase(text: string): string {
  const clean = text
    .replace(/[\p{Cc}]+/gu, "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 80)
    .replace(/[\s.]+$/g, "");
  return clean || "phrase";
}

/** Names made unique, in order (any case): the same name twice gets " (2)", " (3)"… */
function uniqueNames(bases: string[]): string[] {
  const used = new Map<string, number>();
  return bases.map((base) => {
    const key = base.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Each phrase's file name (no extension), in order: the same name twice gets " (2)", " (3)"… */
export function phraseFileNames(texts: string[]): string[] {
  return uniqueNames(texts.map(fileBase));
}

/** The folder (inside azs-folder) where each whole text is a .txt, and its .wav goes next to it. */
export const TEXT_FOLDER = "input_pertext";

/** A text's file name (no extension): its name (".txt" off), after its folder's for a text from a .zip. */
export function textFileBase(name: string, folder?: string): string {
  const n = name.replace(/\.txt$/i, "");
  return fileBase(folder ? `${folder} - ${n}` : n);
}

/** Each text's file name (no extension), in order, each once. */
export function textFileNames(texts: { name: string; folder?: string }[]): string[] {
  return uniqueNames(texts.map((t) => textFileBase(t.name, t.folder)));
}

/** A .wav file's sample rate, from its header (null if it is not a .wav). */
export function wavSampleRate(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let p = 12;
  while (p + 8 <= bytes.length) {
    const size = v.getUint32(p + 4, true);
    if (tag(p) === "fmt " && p + 16 <= bytes.length) return v.getUint32(p + 12, true) || null;
    p += 8 + size + (size & 1);
  }
  return null;
}

// ---- Texts: a whole text, phrase after phrase ----

/** A text of the Read tab's (its own, or one from a .zip folder), with its key. */
export interface LibText {
  name: string;
  lines: string[];
  folder?: string;
  key: string;
  /** The text the app comes with (not saved as a file). */
  builtIn?: boolean;
}

/** The Read tab's texts, in its order: your own (or the built-in one), then each .zip folder's. */
export function libraryOf(
  texts: { name: string; lines: string[] }[],
  custom: boolean,
  lines: string[],
  folders: { name: string; texts: { name: string; lines: string[] }[] }[],
): LibText[] {
  return [
    ...(custom && texts.length
      ? texts.map((t) => ({ name: t.name, lines: t.lines, key: textKey(t.name) }))
      : [{ name: "Built-in text", lines, key: textKey("Built-in text"), builtIn: true }]),
    ...folders.flatMap((f) =>
      f.texts.map((t) => ({
        name: t.name,
        lines: t.lines,
        folder: f.name,
        key: textKey(t.name, f.name),
      })),
    ),
  ];
}

/**
 * What is being repped now and its file: the current phrase (Single phrases), or
 * the current text's phrase it is at (Whole texts), with the folder and name
 * (no extension) of its .txt and .wav in azs-folder.
 */
export function activeOf(
  s: RehearseState,
  library: LibText[],
): { text: string; dir: string; name: string } {
  if (s.view === "texts") {
    const t = currentText(s, library);
    if (!t) return { text: "", dir: TEXT_FOLDER, name: "" };
    const units = readUnits(t.lines);
    const at = textAt(s, t.key, units.length);
    const name = textFileNames(library)[library.indexOf(t)] ?? "";
    return { text: units[at]?.text ?? "", dir: TEXT_FOLDER, name };
  }
  const it = currentPhrase(s);
  if (!it) return { text: "", dir: PHRASE_FOLDER, name: "" };
  const name = phraseFileNames(s.items.map((i) => i.text))[s.items.indexOf(it)] ?? "";
  return { text: it.text, dir: PHRASE_FOLDER, name };
}

/** The text being repped: the current one, or the first. */
export function currentText(s: RehearseState, library: LibText[]): LibText | undefined {
  return library.find((t) => t.key === s.text) ?? library[0];
}

const noProgress = (): TextProgress => ({ at: 0, passes: 0, reps: 0, last: 0 });

/** A text's place and counts (none yet: at the first phrase). */
export function textProgress(s: RehearseState, key: string): TextProgress {
  return s.progress[key] ?? noProgress();
}

/** The phrase a text is at, within its phrases now (it may have been edited shorter). */
export function textAt(s: RehearseState, key: string, total: number): number {
  const at = textProgress(s, key).at;
  return total > 0 && at < total ? at : 0;
}

const withProgress = (s: RehearseState, key: string, p: TextProgress): RehearseState => ({
  ...s,
  progress: { ...s.progress, [key]: p },
});

/**
 * A tap on a text: its phrase (the one it is at, or `at`) done, n reps of it,
 * and on to the next; after the last phrase it starts again from the first and
 * counts a pass through the whole text.
 */
export function textTap(
  s: RehearseState,
  key: string,
  total: number,
  now: number,
  n = 1,
  at = textAt(s, key, total),
): RehearseState {
  if (total <= 0) return s;
  const p = textProgress(s, key);
  const here = Math.max(0, Math.min(total - 1, Math.floor(at)));
  const wrap = here + 1 >= total;
  return {
    ...withProgress(s, key, {
      at: wrap ? 0 : here + 1,
      passes: p.passes + (wrap ? 1 : 0),
      reps: p.reps + Math.max(1, Math.floor(n)),
      last: now,
    }),
    lastTap: now,
  };
}

/** The phrase before or after in a text (round it), nothing counted. */
export function textStep(s: RehearseState, key: string, total: number, dir: 1 | -1): RehearseState {
  if (total <= 0) return s;
  const at = (textAt(s, key, total) + dir + total) % total;
  return withProgress(s, key, { ...textProgress(s, key), at });
}

/** Goes to a phrase of a text, nothing counted. */
export function textGo(s: RehearseState, key: string, at: number, total: number): RehearseState {
  if (total <= 0) return s;
  const to = Math.max(0, Math.min(total - 1, Math.floor(at)));
  return withProgress(s, key, { ...textProgress(s, key), at: to });
}

// ---- The floating window (repBubble): its reps and the phrase it shows ----

/** A floating-window id for a text's phrase: its place, then the text's key. */
export const bubbleId = (at: number, key: string) => `T${at}:${key}`;

export function fromBubbleId(id: string): { at: number; key: string } | null {
  const m = /^T(\d+):([\s\S]*)$/.exec(id);
  return m ? { at: Number(m[1]), key: m[2]! } : null;
}

export interface BubbleTake {
  reps: { id: string; n: number; at: number }[];
  current: string;
  shown: boolean;
}

/**
 * The floating window's reps and the phrase it shows, into the state. Each rep
 * counts (a text's phrase done there moves on, as a tap here does), and gives
 * back what earns XP. The phrase it shows is followed only while it is open and
 * only if it moved there: not the one this side sent it (`sent`), and never what
 * a closed window showed last (that put a text back at its start).
 */
export function applyBubble(
  s: RehearseState,
  take: BubbleTake,
  library: LibText[],
  sent: string,
): { state: RehearseState; xp: { text: string; n: number }[] } {
  let state = s;
  const xp: { text: string; n: number }[] = [];
  for (const t of take.reps) {
    const tid = fromBubbleId(t.id);
    if (tid) {
      const tx = library.find((x) => x.key === tid.key);
      const us = tx ? readUnits(tx.lines) : [];
      const u = us[tid.at];
      if (!tx || !u) continue;
      xp.push({ text: u.text, n: t.n });
      state = textTap(state, tx.key, us.length, t.at, t.n, tid.at);
      continue;
    }
    const it = state.items.find((i) => i.id === t.id);
    if (!it) continue;
    xp.push({ text: it.text, n: t.n });
    state = countRep(state, t.id, t.at, t.n);
  }
  if (take.shown && take.current && take.current !== sent) {
    const cur = fromBubbleId(take.current);
    if (cur) {
      const tx = library.find((x) => x.key === cur.key);
      if (tx) state = textGo(state, tx.key, cur.at, readUnits(tx.lines).length);
    } else state = select(state, take.current);
  }
  return { state, xp };
}

/** A text's place and counts back to the start; the text stays. */
export function resetText(s: RehearseState, key: string): RehearseState {
  if (!s.progress[key]) return s;
  const progress = { ...s.progress };
  delete progress[key];
  return { ...s, progress };
}

// ---- How the .wav plays: its loudness shaped, the sound itself as it is ----

/**
 * The shape of the loudness within each loop of the file: flat (as it is), a
 * fade in, middle and fade out, or a sine, saw or square wave of it (each
 * `cycles` times a loop, `depth` deep: 1 down to silence, 0.5 down to half).
 */
export type WavShape = "flat" | "fade" | "sine" | "saw" | "square";
export const WAV_SHAPES: WavShape[] = ["flat", "fade", "sine", "saw", "square"];

export interface WavStyle {
  shape: WavShape;
  /** The fade in and out, as shares of a cycle (the middle is the rest). */
  fadeIn: number;
  fadeOut: number;
  cycles: number;
  depth: number;
  /** Each loop's level in turn, round again (1, 1, 1… as it is; 0.5, 0.5, 2, 1…). */
  levels: number[];
}

/** The most levels in turn. */
export const MAX_LEVELS = 32;
export const clampFade = (v: number) => clamp(Math.round(v * 1000) / 1000, 0, 1);
export const clampCycles = (v: number) => clamp(Math.round(v), 1, 64);
export const clampLevel = (v: number) => clamp(Math.round(v * 100) / 100, 0, 4);

export function wavStyleOf(
  s: Pick<
    RehearseSettings,
    "wavShape" | "wavFadeIn" | "wavFadeOut" | "wavCycles" | "wavDepth" | "wavLevels"
  >,
): WavStyle {
  return {
    shape: s.wavShape,
    fadeIn: s.wavFadeIn,
    fadeOut: s.wavFadeOut,
    cycles: s.wavCycles,
    depth: s.wavDepth,
    levels: s.wavLevels,
  };
}

/** The settings for a style. */
export function wavSettingsOf(style: WavStyle): Partial<RehearseSettings> {
  return {
    wavShape: style.shape,
    wavFadeIn: style.fadeIn,
    wavFadeOut: style.fadeOut,
    wavCycles: style.cycles,
    wavDepth: style.depth,
    wavLevels: [...style.levels],
  };
}

/** Levels typed as numbers apart ("0.5, 0.5, 2, 1"): null if there are none. */
export function parseLevels(text: string): number[] | null {
  const levels = text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => Number(t))
    .filter((v) => Number.isFinite(v))
    .slice(0, MAX_LEVELS)
    .map(clampLevel);
  return levels.length ? levels : null;
}

export function levelsText(levels: number[]): string {
  return levels.join(", ");
}

/** The shape alone at a point of a cycle (0 to 1 through it): 0 to 1. */
function shapeAt(style: WavStyle, phase: number): number {
  const p = Math.min(1, Math.max(0, phase));
  switch (style.shape) {
    case "flat":
      return 1;
    case "fade": {
      let fi = clampFade(style.fadeIn);
      let fo = clampFade(style.fadeOut);
      if (fi + fo > 1) {
        const k = 1 / (fi + fo);
        fi *= k;
        fo *= k;
      }
      if (fi > 0 && p < fi) return p / fi;
      if (fo > 0 && p > 1 - fo) return (1 - p) / fo;
      return 1;
    }
    case "sine":
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
    case "saw":
      return p;
    case "square":
      return p < 0.5 ? 1 : 0;
  }
}

/** The loudness at a point of a loop (0 to 1 through it), before its level: the shape, `depth` deep. */
export function wavGainAt(style: WavStyle, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const c = clampCycles(style.cycles);
  // The loop's very end is its last cycle's end, not a new one's start.
  const phase = u >= 1 ? 1 : (u * c) % 1;
  const depth = clampFade(style.depth);
  return 1 - depth * (1 - shapeAt(style, phase));
}

/** How many points a loop's loudness curve takes: enough for its cycles, fewer for a short loop. */
export function curvePoints(style: WavStyle, loopSeconds: number): number {
  if (style.shape === "flat" || style.depth <= 0) return 2;
  const c = clampCycles(style.cycles);
  const want = Math.min(c * 128 + 1, Math.ceil(Math.max(0, loopSeconds) * 4000) + 1);
  return Math.min(4097, Math.max(c * 8 + 1, want));
}

/** One loop's loudness curve (evenly over it, its first point at its start and its last at its end), at a level. */
export function wavCurve(style: WavStyle, points: number, level = 1): Float32Array<ArrayBuffer> {
  const n = Math.max(2, Math.floor(points));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = wavGainAt(style, i / (n - 1)) * level;
  return out;
}

/** A loop's level: the levels in turn, round again. */
export function levelOf(style: WavStyle, loop: number): number {
  const l = style.levels.length ? style.levels : [1];
  return l[((Math.floor(loop) % l.length) + l.length) % l.length] ?? 1;
}

/** The loudness of a style that does not change (flat, one level): that, or null. */
export function steadyGain(style: WavStyle): number | null {
  const flat = style.shape === "flat" || style.depth <= 0;
  const l = style.levels.length ? style.levels : [1];
  return flat && l.every((v) => v === l[0]) ? (l[0] ?? 1) : null;
}

export interface WavPreset {
  id: string;
  name: string;
  style: WavStyle;
}

const preset = (id: string, name: string, style: Partial<WavStyle>): WavPreset => ({
  id,
  name,
  style: { shape: "flat", fadeIn: 0.11, fadeOut: 0.1, cycles: 1, depth: 1, levels: [1], ...style },
});

export const WAV_PRESETS: WavPreset[] = [
  preset("flat", "Flat: as it is", {}),
  preset("fade", "Fade 0.11 · 0.8 · 0.1", { shape: "fade" }),
  preset("soft", "Soft fade 0.25 · 0.5 · 0.25", { shape: "fade", fadeIn: 0.25, fadeOut: 0.25 }),
  preset("sine", "Sine swell", { shape: "sine" }),
  preset("saw", "Saw rise", { shape: "saw" }),
  preset("square", "Square pulse ×4", { shape: "square", cycles: 4 }),
  preset("tremolo", "Sine tremolo ×8, half deep", { shape: "sine", cycles: 8, depth: 0.5 }),
  preset("steps", "Steps 0.1 · 0.2 · 0.3 · 0.4 · 0.5", { levels: [0.1, 0.2, 0.3, 0.4, 0.5] }),
  preset("waves", "Loops 0.5 · 0.5 · 2 · 1", { levels: [0.5, 0.5, 2, 1] }),
];

/** Whether two styles play the same (what a flat shape does not use is not compared). */
export function sameStyle(a: WavStyle, b: WavStyle): boolean {
  const key = (s: WavStyle) => {
    const flat = s.shape === "flat" || s.depth <= 0;
    return JSON.stringify([
      flat ? "flat" : s.shape,
      !flat && s.shape === "fade" ? [s.fadeIn, s.fadeOut] : 0,
      flat ? 0 : [s.cycles, s.depth],
      s.levels,
    ]);
  };
  return key(a) === key(b);
}

/** The preset a style is, or "custom". */
export function presetOf(style: WavStyle): string {
  return WAV_PRESETS.find((p) => sameStyle(p.style, style))?.id ?? "custom";
}
