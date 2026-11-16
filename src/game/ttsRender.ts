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

/** A layer as it is made into the file: its shape, and its voices (stacked layers' multiplied; none given: its copies). */
export interface TtsLayer {
  shape: VoiceShape;
  voices?: { at: number; speed: number; gain: number }[];
  /** Its first voice is the main voice (layer 1's; false: every voice of it is background). */
  main?: boolean;
}

/** One saying of one phrase: a copy of a layer, from t0 (s) at its speed, cut off at tEnd. */
export interface TtsPlay {
  layer: number;
  phrase: number;
  t0: number;
  speed: number;
  gain: number;
  tEnd: number;
  /** The main voice (the first layer's first copy): never reversed. */
  main?: boolean;
}

export interface TtsPlan {
  /** Every saying, by when it starts. */
  plays: TtsPlay[];
  /** Its length (s). */
  total: number;
  /** Copies left out: faster than MAX_TTS_SPEED (or slower than its 1 / it). */
  skipped: number;
  /** When each phrase's turn starts (s): where the text is, at each moment. */
  turns: number[];
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

/** A copy reading a whole text by itself, live: its layer (among those heard), start (s), speed and loudness. */
export interface WholeCopy extends Copy {
  layer: number;
}

/**
 * Whole texts, live: the voices that read the whole text by themselves, each
 * at its own speed from its own start, never waiting for another: every voice
 * of each heard layer set to read the whole text, but the main voice (the
 * first heard layer's first voice), which reads phrase after phrase.
 */
export function wholeCopies(
  heard: { layer: { voiceWhole: boolean }; voices: Copy[] }[],
): WholeCopy[] {
  const out: WholeCopy[] = [];
  heard.forEach((h, layer) => {
    if (!h.layer.voiceWhole) return;
    h.voices.forEach((c, k) => {
      if ((layer === 0 && k === 0) || c.gain <= 0) return;
      out.push({ layer, at: c.at, speed: c.speed, gain: c.gain });
    });
  });
  return out;
}

/** Till every copy has said it once (s); span: the saying and its gap. */
function roundOf(copies: Copy[], span: number): number {
  let r = 0;
  for (const c of copies) r = Math.max(r, c.at + span / c.speed);
  return r;
}

const EPS = 1e-9;

/**
 * Which sayings a plan holds: all of them (the .tts.wav), the main voice alone
 * (a render's main track), or every other voice (a render's backing track).
 */
export type TtsPart = "all" | "main" | "others";

/**
 * The sayings, in time. lens[layer][phrase]: each phrase's said length (s), as
 * that layer's voice says it; layers: the ones heard, the first holding the
 * main voice (its first copy).
 *
 * text false: one phrase, every layer says it, once round: till the slowest
 * copy has said it (and its silence), the faster ones saying it again till
 * then if they loop.
 *
 * text true: the main voice reads the text phrase after phrase, each saying
 * and its silence (its turns: where each phrase starts); every other copy, of
 * every layer, reads the whole text by itself at its own speed, from its own
 * start, round and round if its layer loops (else once), never waiting for
 * another. It is as long as the longer of the main voice's read and the
 * slowest other copy's one read.
 */
export function ttsPlan(
  layers: TtsLayer[],
  lens: number[][],
  text: boolean,
  part: TtsPart = "all",
): TtsPlan {
  const n = lens[0]?.length ?? 0;
  const plays: TtsPlay[] = [];
  let skipped = 0;
  const each = layers.map((l, li) => {
    if (l.voices) return { li, shape: l.shape, copies: l.voices.map((v) => ({ ...v })) };
    const c = copiesOf(l.shape);
    skipped += c.skipped;
    return { li, shape: l.shape, copies: c.copies };
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
  // The main voice: the first layer's first copy (at its start, as it is said), if it holds it.
  const main = layers[0]?.main === false ? undefined : each[0];
  const isMain = (l: (typeof each)[number], k: number) => l === main && k === 0;

  if (!text) {
    // One phrase: every copy says it, till the slowest is through (and its silence).
    let total = 0;
    for (const l of each)
      total = Math.max(total, roundOf(l.copies, lenOf(l.li, 0) + gapOf(l.shape)));
    for (const l of each) {
      const span = lenOf(l.li, 0) + gapOf(l.shape);
      l.copies.forEach((c, k) => {
        const period = span / c.speed;
        for (let m = 0; ; m++) {
          const t0 = c.at + m * period;
          if (t0 >= total - EPS) break;
          push({
            layer: l.li,
            phrase: 0,
            t0,
            speed: c.speed,
            gain: c.gain,
            tEnd: total,
            main: isMain(l, k),
          });
          if (!l.shape.voiceLoop || period <= EPS) break;
        }
      });
    }
    plays.sort((a, b) => a.t0 - b.t0);
    return { plays, total, skipped, turns: n ? [0] : [] };
  }

  // The main voice's read: phrase after phrase, each saying and its silence.
  const turns: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    turns.push(t);
    if (main) t += lenOf(main.li, i) + gapOf(main.shape);
  }
  const mainEnd = t;
  // Every other copy's one read through the whole text: where each phrase starts in it.
  const reads = each.flatMap((l) => {
    const starts: number[] = [];
    let len = 0;
    for (let i = 0; i < n; i++) {
      starts.push(len);
      len += lenOf(l.li, i) + gapOf(l.shape);
    }
    return l.copies.filter((_, k) => !isMain(l, k)).map((c) => ({ l, c, starts, len }));
  });
  const othersEnd = reads.reduce((m, r) => Math.max(m, r.c.at + r.len / r.c.speed), 0);
  const end =
    part === "main" ? mainEnd : part === "others" ? othersEnd : Math.max(mainEnd, othersEnd);
  const mainCopy = main?.copies[0];
  if (part !== "others" && main && mainCopy)
    for (let i = 0; i < n; i++)
      push({
        layer: main.li,
        phrase: i,
        t0: turns[i]!,
        speed: mainCopy.speed,
        gain: mainCopy.gain,
        tEnd: end,
        main: true,
      });
  if (part !== "main")
    for (const r of reads) {
      for (let m = 0; ; m++) {
        const base = r.c.at + (m * r.len) / r.c.speed;
        if (base >= end - EPS) break;
        for (let i = 0; i < n; i++) {
          const t0 = base + r.starts[i]! / r.c.speed;
          if (t0 >= end - EPS) break;
          push({ layer: r.l.li, phrase: i, t0, speed: r.c.speed, gain: r.c.gain, tEnd: end });
        }
        if (!r.l.shape.voiceLoop || r.len <= EPS) break;
      }
    }
  plays.sort((a, b) => a.t0 - b.t0);
  return { plays, total: end, skipped, turns };
}

/** A phrase as said: its samples (one channel) at its rate. */
export interface TtsSource {
  /** The samples with one 0 before and three after (room for the curve between them). */
  data: Float32Array;
  /** How many samples (without that room). */
  length: number;
  rate: number;
}

/** A saying and its time-reversed copy, half and half (the same length). */
export function reverseMix(src: TtsSource): TtsSource {
  const n = src.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * src.data[i + 1]! + 0.5 * src.data[n - i]!;
  return ttsSource(out, src.rate);
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
  /** The sayings that next(max) starts, in order (their sources are asked for then). */
  ahead(max: number): TtsPlay[];
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
  source: (layer: number, phrase: number, main: boolean) => TtsSource | null,
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
    ahead(max) {
      const b = Math.min(frames, at + Math.max(1, Math.floor(max)));
      const out: TtsPlay[] = [];
      for (let q = next; q < plan.plays.length; q++) {
        const p = plan.plays[q]!;
        if (Math.max(0, frameAt(p.t0)) >= b) break;
        out.push(p);
      }
      return out;
    },
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
        const src = source(p.layer, p.phrase, !!p.main);
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
