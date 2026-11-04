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
import { BYTES_MODES, type BytesMode } from "./readtext.ts";

export const REHEARSE_KEY = "azshara-rehearse-v1";
/** The most phrases kept. */
export const MAX_PHRASES = 5000;

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

export interface RehearseSettings {
  /** The phrase's sound on a tap. */
  sound: boolean;
  /** The length the sound is fitted to (ms). */
  signalMs: number;
  /** The loudest point of the sound, 0 to 1. */
  amp: number;
  /** Raw samples a second: how long the bytes naturally last. */
  rawRate: number;
  /** The phrase's byte picture on a tap, and each layer's opacity. */
  picture: boolean;
  layers: Record<BytesMode, number>;
  /** The whole picture's opacity, over black. */
  pictureOpacity: number;
  emit: EmitMode;
  /** The tap area's height, in % of the screen. */
  tapHeight: number;
}

export interface RehearseState {
  items: RehearsePhrase[];
  /** The phrase being repped ("" for the first). */
  current: string;
  settings: RehearseSettings;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const clampSignalMs = (v: number) => clamp(Math.round(v), 50, 10_000);
export const clampAmp = (v: number) => clamp(Math.round(v * 100) / 100, 0, 1);
export const clampRawRate = (v: number) => clamp(Math.round(v), 1000, 48_000);
export const clampLayer = (v: number) => clamp(Math.round(v * 100) / 100, 0, 1);
export const clampTapHeight = (v: number) => clamp(Math.round(v), 15, 80);

export function defaultSettings(): RehearseSettings {
  return {
    sound: true,
    signalMs: 900,
    amp: 0.9,
    rawRate: 8000,
    picture: true,
    layers: { rgb: 0.36, gray: 0.36, bits: 0.36 },
    pictureOpacity: 1,
    emit: "press",
    tapHeight: 32,
  };
}

export function newRehearse(): RehearseState {
  return { items: [], current: "", settings: defaultSettings() };
}

/** A saved state, each value checked. */
export function loadRehearse(data: unknown): RehearseState {
  const d = obj(data);
  const s = newRehearse();
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : []) {
    const r = obj(raw);
    const text = typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim().slice(0, 300) : "";
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
  const t = obj(d.settings);
  const u = s.settings;
  if (typeof t.sound === "boolean") u.sound = t.sound;
  u.signalMs = clampSignalMs(num(t.signalMs, u.signalMs));
  u.amp = clampAmp(num(t.amp, u.amp));
  u.rawRate = clampRawRate(num(t.rawRate, u.rawRate));
  if (typeof t.picture === "boolean") u.picture = t.picture;
  const layers = obj(t.layers);
  for (const m of BYTES_MODES) u.layers[m] = clampLayer(num(layers[m], u.layers[m]));
  u.pictureOpacity = Math.max(0.05, clampLayer(num(t.pictureOpacity, u.pictureOpacity)));
  if (t.emit === "press" || t.emit === "full") u.emit = t.emit;
  u.tapHeight = clampTapHeight(num(t.tapHeight, u.tapHeight));
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
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 300);
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
  return phrasesFromText(text, MAX_PHRASES, bySentence);
}

/** One rep for a phrase. */
export function countRep(s: RehearseState, id: string, now: number): RehearseState {
  return {
    ...s,
    items: s.items.map((i) => (i.id === id ? { ...i, count: i.count + 1, last: now } : i)),
  };
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
 * or sped up to fit, then raised (or lowered) so the loudest point is amp.
 */
export function phraseSignal(
  text: string,
  rate: number,
  opts: Pick<RehearseSettings, "signalMs" | "amp" | "rawRate">,
): Float32Array<ArrayBuffer> {
  const raw = rawSamples(phraseBytes(text));
  const len = raw.length;
  const { speed } = signalFit(len, opts.rawRate, opts.signalMs);
  const out = new Float32Array(Math.max(1, Math.round((rate * opts.signalMs) / 1000)));
  // Raw samples a sample of the output: past the end it starts the phrase again.
  const stride = (opts.rawRate * speed) / rate;
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
