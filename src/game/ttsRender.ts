/**
 * The robot voice made into one sound, a .tts.wav: each layer's copies laid out
 * in time (ttsPlan), then mixed at the rate asked for (ttsMixer), a piece at a
 * time, with the robot ring as it plays live (phraseSound.ts voiceGraph). One
 * channel all the way (no layer's turning: that is live only); two only at the
 * very end, from the finished file (stereoFrom: the same both sides, or bridged,
 * and turned left-right if asked). Values above 1 are kept: the file is
 * float32. Each phrase is said once per voice and that one saying is played as
 * often as the copies need (never said again). Pure: no page.
 */
import { voiceSpeeds, type StereoKind, type VoiceShape } from "./rehearse.ts";

export type { StereoKind };

/** A layer as it is made into the file. */
export interface TtsLayer {
  shape: VoiceShape;
  /** It reads the whole text through (its copies drift apart over it), not each phrase in turn. */
  whole: boolean;
}

/** One saying of one phrase: a copy of a layer, from t0 (s) at its speed, cut off at tEnd. */
export interface TtsPlay {
  layer: number;
  phrase: number;
  t0: number;
  speed: number;
  gain: number;
  tEnd: number;
}

export interface TtsPlan {
  /** Every saying, by when it starts. */
  plays: TtsPlay[];
  /** Its length (s). */
  total: number;
  /** Copies left out: faster than MAX_TTS_SPEED (or slower than its 1 / it). */
  skipped: number;
}

/**
 * Copies faster than this are left out (each saying would be a click, and there
 * would be millions of them), and those slower than 1 / this (hours long).
 */
export const MAX_TTS_SPEED = 256;
/** At most this many sayings in one file. */
export const MAX_TTS_PLAYS = 2_000_000;

interface Copy {
  /** When it starts after its layer (s). */
  at: number;
  speed: number;
  gain: number;
}

function copiesOf(shape: VoiceShape): { copies: Copy[]; skipped: number } {
  const copies: Copy[] = [];
  let skipped = 0;
  voiceSpeeds(shape).forEach((speed, k) => {
    if (!(speed >= 1 / MAX_TTS_SPEED && speed <= MAX_TTS_SPEED)) {
      skipped += 1;
      return;
    }
    copies.push({
      at: (k * shape.voiceSpreadMs) / 1000,
      speed,
      gain: Math.max(0, k === 0 ? shape.voiceVolume : shape.voiceCopiesVolume),
    });
  });
  return { copies, skipped };
}

/** Till every copy has said it once (s); span: the saying and its gap. */
function roundOf(copies: Copy[], span: number): number {
  let r = 0;
  for (const c of copies) r = Math.max(r, c.at + span / c.speed);
  return r;
}

const EPS = 1e-9;

/**
 * The sayings, in time. lens[layer][phrase]: each phrase's said length (s), as
 * that layer's voice says it. text false: one phrase, every layer says it.
 * text true: the layers that say the phrase take the phrases in turn (a
 * phrase's turn lasts till every one of them has said it, all its copies, and
 * its gap), and those that say the whole text read it through, each copy at its
 * speed. A layer that loops says it again till the turn (or its slowest copy's
 * read) is over; one that does not, once. Every saying has its gap after it.
 */
export function ttsPlan(layers: TtsLayer[], lens: number[][], text: boolean): TtsPlan {
  const n = lens[0]?.length ?? 0;
  const plays: TtsPlay[] = [];
  let skipped = 0;
  const each = layers.map((l, li) => {
    const c = copiesOf(l.shape);
    skipped += c.skipped;
    return { li, shape: l.shape, whole: text && l.whole, copies: c.copies };
  });
  const push = (p: TtsPlay) => {
    if (p.gain <= 0) return;
    plays.push(p);
    if (plays.length > MAX_TTS_PLAYS)
      throw new Error(
        `Over ${MAX_TTS_PLAYS.toLocaleString()} sayings: fewer copies, or a smaller speed-up`,
      );
  };
  const gapOf = (s: VoiceShape) => s.voiceGapMs / 1000;
  const lenOf = (li: number, i: number) => Math.max(0, lens[li]?.[i] ?? 0);

  // The phrases in turn.
  const turns = each.filter((l) => !l.whole);
  let t = 0;
  for (let i = 0; i < n; i++) {
    let slot = 0;
    for (const l of turns)
      slot = Math.max(slot, roundOf(l.copies, lenOf(l.li, i) + gapOf(l.shape)));
    const end = t + slot;
    for (const l of turns) {
      const span = lenOf(l.li, i) + gapOf(l.shape);
      for (const c of l.copies) {
        const period = span / c.speed;
        for (let m = 0; ; m++) {
          const t0 = t + c.at + m * period;
          if (t0 >= end - EPS) break;
          push({ layer: l.li, phrase: i, t0, speed: c.speed, gain: c.gain, tEnd: end });
          if (!l.shape.voiceLoop || period <= EPS) break;
        }
      }
    }
    t = end;
  }
  let total = t;

  // The whole text read through by each copy (from the top again, if it loops), till the slowest is through.
  for (const l of each.filter((x) => x.whole)) {
    const spans = Array.from({ length: n }, (_, i) => lenOf(l.li, i) + gapOf(l.shape));
    const starts: number[] = [];
    let L = 0;
    for (const s of spans) {
      starts.push(L);
      L += s;
    }
    const R = roundOf(l.copies, L);
    for (const c of l.copies) {
      for (let m = 0; ; m++) {
        const base = c.at + (m * L) / c.speed;
        if (base >= R - EPS) break;
        for (let i = 0; i < n; i++) {
          const t0 = base + starts[i]! / c.speed;
          if (t0 >= R - EPS) break;
          push({ layer: l.li, phrase: i, t0, speed: c.speed, gain: c.gain, tEnd: R });
        }
        if (!l.shape.voiceLoop || L <= EPS) break;
      }
    }
    total = Math.max(total, R);
  }
  plays.sort((a, b) => a.t0 - b.t0);
  return { plays, total, skipped };
}

/** A phrase as said: its samples (one channel) at its rate. */
export interface TtsSource {
  /** The samples with one 0 before and three after (room for the curve between them). */
  data: Float32Array;
  /** How many samples (without that room). */
  length: number;
  rate: number;
}

export function ttsSource(samples: Float32Array, rate: number): TtsSource {
  const data = new Float32Array(samples.length + 4);
  data.set(samples, 1);
  return { data, length: samples.length, rate };
}

export interface TtsMixer {
  /** Frames in all (one channel). */
  frames: number;
  /** Frames made so far. */
  at(): number;
  /** The next frames (at most max). Empty when done. */
  next(max: number): Float32Array;
}

/** A sine of hz at rate, from frame `from`: its value now (s), turned on a step at a time. */
function tone(hz: number, rate: number, from: number) {
  const w = (2 * Math.PI * hz) / rate;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const o = { s: Math.sin(w * from), c: Math.cos(w * from), step() {} };
  o.step = () => {
    const s2 = o.s * cw + o.c * sw;
    o.c = o.c * cw - o.s * sw;
    o.s = s2;
  };
  return o;
}

interface Live {
  layer: number;
  src: TtsSource;
  gain: number;
  /** Its first frame and the frame after its last. */
  js: number;
  je: number;
  /** Its position in its samples at frame j: j * step + p0. */
  step: number;
  p0: number;
}

/**
 * Mixes the plan at rate (Hz) from its start, a piece at a time.
 * source(layer, phrase): that layer's saying of that phrase (null: none).
 * The sayings are resampled by a cubic curve through their samples (sped up
 * past half the rate, their highs fold back, as they do live).
 */
export function ttsMixer(
  plan: TtsPlan,
  layers: TtsLayer[],
  source: (layer: number, phrase: number) => TtsSource | null,
  rate: number,
): TtsMixer {
  const frames = Math.max(0, Math.ceil(plan.total * rate - 1e-6));
  const frameAt = (t: number) => Math.ceil(t * rate - EPS);
  const live: Live[] = [];
  let at = 0;
  let next = 0;
  return {
    frames,
    at: () => at,
    next(max) {
      const a = at;
      const b = Math.min(frames, a + Math.max(1, Math.floor(max)));
      const n = b - a;
      if (n <= 0) return new Float32Array(0);
      // The sayings that start before this piece ends.
      while (next < plan.plays.length) {
        const p = plan.plays[next]!;
        const js = Math.max(0, frameAt(p.t0));
        if (js >= b) break;
        next += 1;
        const src = source(p.layer, p.phrase);
        if (!src || !src.length || src.rate <= 0) continue;
        const k = p.speed * src.rate;
        const je = Math.min(frames, frameAt(Math.min(p.tEnd, p.t0 + src.length / k)));
        if (je <= js) continue;
        live.push({ layer: p.layer, src, gain: p.gain, js, je, step: k / rate, p0: -p.t0 * k });
      }
      // Each layer's copies added up.
      const sums: (Float32Array | undefined)[] = [];
      for (let q = live.length - 1; q >= 0; q--) {
        const v = live[q]!;
        const j0 = Math.max(v.js, a);
        const j1 = Math.min(v.je, b);
        if (j1 > j0) {
          const acc = (sums[v.layer] ??= new Float32Array(n));
          const d = v.src.data;
          const last = v.src.length;
          const g = v.gain;
          const base = j0 * v.step + v.p0;
          for (let m = 0, w = j0 - a; w < j1 - a; m++, w++) {
            const pos = base + m * v.step;
            let i = Math.floor(pos);
            if (i < 0) i = 0;
            else if (i > last) i = last;
            const f = pos - i;
            // Catmull-Rom through the samples around (data is one further on).
            const x0 = d[i]!;
            const x1 = d[i + 1]!;
            const x2 = d[i + 2]!;
            const x3 = d[i + 3]!;
            const c1 = 0.5 * (x2 - x0);
            const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
            const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
            acc[w] = acc[w]! + g * (((c3 * f + c2) * f + c1) * f + x1);
          }
        }
        if (v.je <= b) {
          live[q] = live[live.length - 1]!;
          live.pop();
        }
      }
      // Each layer's robot ring, into the piece (its tone turned step by step from
      // where it is at the piece's start: no sine worked out each sample).
      const out = new Float32Array(n);
      for (let l = 0; l < sums.length; l++) {
        const x = sums[l];
        if (!x) continue;
        const r = layers[l]!.shape.voiceRobot;
        if (r <= 0) {
          for (let m = 0; m < n; m++) out[m] = out[m]! + x[m]!;
          continue;
        }
        const ring = tone(layers[l]!.shape.voiceRobotHz, rate, a);
        for (let m = 0; m < n; m++) {
          out[m] = out[m]! + x[m]! * (1 - r + r * ring.s);
          ring.step();
        }
      }
      at = b;
      return out;
    },
  };
}

// ---- Two channels, at the very end ----

/**
 * The finished one-channel sound made two (left, right interleaved), frames
 * from `from` on: the same both sides (or the right flipped), and, turnHz above
 * 0, turned left to right and back that many times a second (equal power, as a
 * stereo panner: in the middle 0.707 each side; still, 1 each side).
 * The phone does this to the whole file (AzsFolderPlugin.stereoMake, the same sums).
 */
export function stereoFrom(
  mono: Float32Array,
  from: number,
  rate: number,
  kind: StereoKind,
  turnHz: number,
): Float32Array {
  const out = new Float32Array(mono.length * 2);
  const sign = kind === "bridged" ? -1 : 1;
  const w = (2 * Math.PI * turnHz) / rate;
  for (let m = 0; m < mono.length; m++) {
    const x = mono[m]!;
    let l = 1;
    let r = 1;
    if (turnHz > 0) {
      const th = ((Math.sin(w * (from + m)) + 1) * Math.PI) / 4;
      l = Math.cos(th);
      r = Math.sin(th);
    }
    out[2 * m] = x * l;
    out[2 * m + 1] = sign * x * r;
  }
  return out;
}

// ---- The .wav ----

/** A float32 .wav's header: 58 bytes (IEEE float format, with its fact chunk). */
export const FLOAT_WAV_HEADER = 58;

/** The most a .wav can hold (its sizes are 32 bits). */
export const MAX_WAV_BYTES = 0xffff_ffff;

/** A float32 .wav's size in bytes, header and all. */
export function floatWavBytes(frames: number, channels: number): number {
  return FLOAT_WAV_HEADER + frames * channels * 4;
}

export function floatWavHeader(frames: number, channels: number, rate: number): Uint8Array {
  const data = frames * channels * 4;
  if (data + FLOAT_WAV_HEADER - 8 > MAX_WAV_BYTES) throw new Error("Too long for one .wav (4 GB)");
  const h = new Uint8Array(FLOAT_WAV_HEADER);
  const v = new DataView(h.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) h[at + i] = s.charCodeAt(i);
  };
  tag(0, "RIFF");
  v.setUint32(4, FLOAT_WAV_HEADER - 8 + data, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 18, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 4, true);
  v.setUint16(32, channels * 4, true);
  v.setUint16(34, 32, true);
  v.setUint16(36, 0, true);
  tag(38, "fact");
  v.setUint32(42, 4, true);
  v.setUint32(46, frames, true);
  tag(50, "data");
  v.setUint32(54, data, true);
  return h;
}

/**
 * A .wav's sound as one channel of floats (its channels averaged) and its rate:
 * 8, 16, 24 or 32-bit whole numbers, or 32 or 64-bit floats. Null if it is not
 * a .wav this reads.
 */
export function wavMono(bytes: Uint8Array): { samples: Float32Array; rate: number } | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let p = 12;
  while (p + 8 <= bytes.length) {
    const id = tag(p);
    const size = v.getUint32(p + 4, true);
    const body = p + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
      // Extensible: the format is the first two bytes of its sub-format.
      if (format === 0xfffe && size >= 26 && body + 26 <= bytes.length)
        format = v.getUint16(body + 24, true);
    } else if (id === "data") {
      if (!channels || !rate || !bits) return null;
      const width = bits / 8;
      const isFloat = format === 3 && (bits === 32 || bits === 64);
      const isInt = format === 1 && [8, 16, 24, 32].includes(bits);
      if (!isFloat && !isInt) return null;
      // A size of 0 (or past the end): what is there.
      const room = bytes.length - body;
      const len = size === 0 || size > room ? room : size;
      const count = Math.floor(len / (width * channels));
      const out = new Float32Array(count);
      const read = (at: number): number => {
        if (isFloat) return bits === 32 ? v.getFloat32(at, true) : v.getFloat64(at, true);
        if (bits === 8) return (bytes[at]! - 128) / 128;
        if (bits === 16) return v.getInt16(at, true) / 32768;
        if (bits === 24) {
          const x = bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
          return ((x << 8) >> 8) / 8388608;
        }
        return v.getInt32(at, true) / 2147483648;
      };
      for (let f = 0; f < count; f++) {
        let s = 0;
        const at = body + f * width * channels;
        for (let c = 0; c < channels; c++) s += read(at + c * width);
        // NaN -> 0, past the guard (Inf) -> the guard: 96 % of float32's largest.
        const x = s / channels;
        out[f] = x !== x ? 0 : Math.max(-3.2667e38, Math.min(3.2667e38, x));
      }
      return { samples: out, rate };
    }
    p = body + size + (size & 1);
  }
  return null;
}
