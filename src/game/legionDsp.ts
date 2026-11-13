/**
 * The Legion engine's building blocks, ported from the user's legion9 (and
 * expand) Python engines, the same sums on Float64 arrays: the NaN / Inf guard,
 * hard_amp, remove_dc, the tanh cross-modulation (and its self, paired and
 * root-seed forms), the length rules (conform, repeat-then-compress, compress-
 * then-repeat), the tri-cycle, the phase-offset stack, the seed mash, the
 * folds (self-amplifying, seed-modulated, triangle, super fold), the cascades
 * and the spectral tilt. Every result passes the guard. Pure: no page.
 */

export type Arr = Float64Array<ArrayBuffer>;

/**
 * 96 % of float32's largest value. ±Inf (and anything past it) is held here and
 * NaN becomes 0: a NaN is never < or > anything, so a range check alone lets it
 * through; it is caught by itself (x !== x).
 */
export const GUARD = 3.2667e38;

export function guard(x: number): number {
  return x !== x ? 0 : x > GUARD ? GUARD : x < -GUARD ? -GUARD : x;
}

/** Every value guarded, in place. */
export function guardAll<T extends Float32Array | Float64Array>(a: T): T {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    if (!(x >= -GUARD && x <= GUARD)) a[i] = guard(x);
  }
  return a;
}

export function peakOf(a: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Math.abs(a[i]!);
    if (x > p) p = x;
  }
  return p;
}

function meanOf(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return a.length ? s / a.length : 0;
}

/** remove_dc: guarded, its mean taken off (a new array). */
export function removeDc(a: ArrayLike<number>): Arr {
  const out = guardAll(Float64Array.from(a));
  const m = meanOf(out);
  if (m !== 0) for (let i = 0; i < out.length; i++) out[i] = out[i]! - m;
  return out;
}

/**
 * hard_amp. Max-float (the engines' default): times amp, nothing normalised,
 * guarded (float64 room, never clipped below the guard). Otherwise (the old
 * way): DC off, then its peak brought to amp.
 */
export function hardAmp(a: ArrayLike<number>, amp: number, maxFloat = true): Arr {
  if (maxFloat) {
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = guard(a[i]! * amp);
    return out;
  }
  const out = removeDc(a);
  const p = peakOf(out);
  if (p < 1e-12) return new Float64Array(a.length);
  for (let i = 0; i < out.length; i++) out[i] = guard((out[i]! / p) * amp);
  return out;
}

// ---- Lengths ----

/**
 * exact_rule_conform: the same length, a copy; longer, compressed into n by
 * linear interpolation across the whole of it (nothing cut); shorter, repeated
 * end to end (np.resize).
 */
export function conform(src: ArrayLike<number>, n: number): Arr {
  n = Math.max(0, Math.floor(n));
  const out = new Float64Array(n);
  const len = src.length;
  if (!n || !len) return out;
  if (len === n) {
    for (let i = 0; i < n; i++) out[i] = guard(src[i]!);
    return out;
  }
  if (len > n) {
    const step = n > 1 ? (len - 1) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const pos = i === n - 1 && n > 1 ? len - 1 : i * step;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = src[i0]!;
      const b = src[Math.min(i0 + 1, len - 1)]!;
      out[i] = guard(a + (b - a) * f);
    }
    return out;
  }
  for (let at = 0; at < n; at += len) {
    const k = Math.min(len, n - at);
    for (let i = 0; i < k; i++) out[at + i] = guard(src[i]!);
  }
  return out;
}

/** np.roll(a, s): out[i] = a[(i - s) mod n]. */
export function roll(a: ArrayLike<number>, s: number): Arr {
  const n = a.length;
  const out = new Float64Array(n);
  if (!n) return out;
  const k = ((Math.round(s) % n) + n) % n;
  for (let i = 0; i < n; i++) out[i] = a[(i - k + n) % n]!;
  return out;
}

/**
 * rtc_chunked (repeat_then_compress): the signal repeated x factor, then
 * compressed back to n by linear interpolation (reverse: the time-reversed
 * signal, the same way).
 */
export function repeatThenCompress(
  x: ArrayLike<number>,
  factor: number,
  n: number,
  reverse = false,
): Arr {
  const len = x.length;
  const out = new Float64Array(Math.max(0, n));
  if (!len || n <= 0) return out;
  const ext = Math.max(1, Math.floor(len * factor));
  const step = n > 1 ? (ext - 1) / (n - 1) : 0;
  const at = (k: number) => (reverse ? x[len - 1 - k]! : x[k]!);
  for (let i = 0; i < n; i++) {
    const pos = i === n - 1 && n > 1 ? ext - 1 : i * step;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    const a = at(i0 % len);
    const b = i === n - 1 ? at((ext - 1) % len) : at((i0 + 1) % len);
    out[i] = guard(a * (1 - f) + b * f);
  }
  return out;
}

/** ctr_compress + repeat (compress_then_repeat): sped up x factor (linear), then repeated back to n. */
export function compressThenRepeat(
  x: ArrayLike<number>,
  factor: number,
  n: number,
  reverse = false,
): Arr {
  const len = x.length;
  if (!len || n <= 0) return new Float64Array(Math.max(0, n));
  const comp = Math.max(1, Math.floor(len / factor));
  const step = comp > 1 ? (len - 1) / (comp - 1) : 0;
  const c = new Float64Array(comp);
  const at = (k: number) => (reverse ? x[len - 1 - k]! : x[k]!);
  for (let i = 0; i < comp; i++) {
    const pos = i === comp - 1 && comp > 1 ? len - 1 : i * step;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    const a = at(i0);
    const b = at(Math.min(i0 + 1, len - 1));
    c[i] = a + (b - a) * f;
  }
  return conform(c, n);
}

// ---- Cross-modulation ----

/**
 * apply_crossmod: tanh(A x gain) x B (B brought to A's length), its DC taken off
 * after each pass.
 */
export function crossmod(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  gain: number,
  passes = 1,
): Arr {
  let cur = Float64Array.from(a);
  if (!cur.length) return cur;
  const other = b.length === cur.length ? b : conform(b, cur.length);
  const g = Number.isFinite(gain) ? gain : 0;
  for (let p = 0; p < Math.max(1, Math.floor(passes)); p++) {
    const mixed = new Float64Array(cur.length);
    for (let i = 0; i < cur.length; i++) mixed[i] = guard(Math.tanh(cur[i]! * g) * other[i]!);
    cur = removeDc(mixed);
  }
  return cur;
}

/**
 * Self cross-modulation (apply_root_seed_self_crossmod / CM6): tanh(x x gain) x
 * x shifted by `shift` samples, pass after pass; no DC taken off. A seed that
 * would go silent keeps its own values.
 */
export function selfCrossmod(
  seed: ArrayLike<number>,
  passes: number,
  gain: number,
  shift: number,
): Arr {
  const original = Float64Array.from(seed);
  let cur = Float64Array.from(seed);
  if (!cur.length) return cur;
  for (let p = 0; p < Math.max(1, Math.floor(passes)); p++) {
    const other = shift ? roll(cur, shift) : cur;
    const next = new Float64Array(cur.length);
    for (let i = 0; i < cur.length; i++) next[i] = guard(Math.tanh(cur[i]! * gain) * other[i]!);
    cur = next;
  }
  return peakOf(cur) <= 1e-8 ? original : cur;
}

/** Clean x clean weight + pre-modulated x its weight (silent: the clean one). */
export function blendCleanPre(clean: Arr, premod: Arr, cw: number, pw: number): Arr {
  const p = premod.length === clean.length ? premod : conform(premod, clean.length);
  const out = new Float64Array(clean.length);
  for (let i = 0; i < out.length; i++) out[i] = guard(clean[i]! * cw + p[i]! * pw);
  return peakOf(out) <= 1e-8 ? Float64Array.from(clean) : out;
}

/** clean -> pre (and pre -> clean, both ways), raw: tanh(a x gain) x b, pass after pass, summed. */
export function pairedCrossmod(
  clean: Arr,
  premod: Arr,
  gain: number,
  passes: number,
  both: boolean,
): Arr {
  const p = premod.length === clean.length ? premod : conform(premod, clean.length);
  let fwd = Float64Array.from(clean);
  let rev = Float64Array.from(p);
  for (let k = 0; k < Math.max(1, Math.floor(passes)); k++) {
    const f2 = new Float64Array(fwd.length);
    for (let i = 0; i < f2.length; i++) f2[i] = guard(Math.tanh(fwd[i]! * gain) * p[i]!);
    fwd = f2;
    if (both) {
      const r2 = new Float64Array(rev.length);
      for (let i = 0; i < r2.length; i++) r2[i] = guard(Math.tanh(rev[i]! * gain) * clean[i]!);
      rev = r2;
    }
  }
  const out = new Float64Array(fwd.length);
  for (let i = 0; i < out.length; i++) out[i] = guard(fwd[i]! + (both ? rev[i]! : 0));
  return out;
}

// ---- Companding ----

export function muLaw(x: number, mu = 255): number {
  const s = Math.tanh(x);
  return Math.sign(s) * (Math.log(1 + mu * Math.abs(s)) / Math.log(1 + mu));
}

export function aLaw(x: number, A = 87.6): number {
  const s = Math.tanh(x);
  const a = Math.abs(s);
  return a < 1 / A
    ? (Math.sign(s) * (A * a)) / (1 + Math.log(A))
    : (Math.sign(s) * (1 + Math.log(A * a))) / (1 + Math.log(A));
}

// ---- Filters (Butterworth, as scipy's butter + lfilter) ----

/** A Butterworth filter of order 1 to 3, cut-off wn (1 = half the rate), as cascaded sections [b0, b1, b2, a1, a2]. */
export function butter(order: number, wn: number, kind: "low" | "high"): number[][] {
  const K = Math.tan((Math.PI * Math.min(0.999, Math.max(1e-6, wn))) / 2);
  const sections: number[][] = [];
  const second = (q: number) => {
    // s^2 + s/q + 1 prewarped
    const d = 1 + K / q + K * K;
    const a1 = (2 * (K * K - 1)) / d;
    const a2 = (1 - K / q + K * K) / d;
    sections.push(
      kind === "low"
        ? [(K * K) / d, (2 * K * K) / d, (K * K) / d, a1, a2]
        : [1 / d, -2 / d, 1 / d, a1, a2],
    );
  };
  const first = () => {
    const d = 1 + K;
    const a1 = (K - 1) / d;
    sections.push(kind === "low" ? [K / d, K / d, 0, a1, 0] : [1 / d, -1 / d, 0, a1, 0]);
  };
  const o = Math.max(1, Math.min(3, Math.round(order)));
  if (o === 1) first();
  else if (o === 2) second(Math.SQRT1_2);
  else {
    first();
    second(1);
  }
  return sections;
}

/** lfilter through the sections (state from rest). */
export function filter(sections: number[][], x: ArrayLike<number>): Arr {
  let cur = Float64Array.from(x);
  for (const [b0, b1, b2, a1, a2] of sections) {
    const out = new Float64Array(cur.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < cur.length; i++) {
      const x0 = cur[i]!;
      const y0 = b0! * x0 + b1! * x1 + b2! * x2 - a1! * y1 - a2! * y2;
      out[i] = guard(y0);
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = guard(y0);
    }
    cur = out;
  }
  return cur;
}

// ---- FFT (radix 2), for the tilt ----

/** In place, n a power of two; inverse scales by 1/n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
}

export const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * apply_spectral_tilt: +dbPerKhz dB for every kHz (at `rate`), capped at maxDb,
 * by the FFT (exact per bin; the sound treated as one loop, so a repeated
 * matrix stays seamless). Its length must be a power of two.
 */
export function spectralTilt(x: Arr, rate: number, dbPerKhz: number, maxDb: number): Arr {
  const n = x.length;
  if (!n || dbPerKhz === 0 || !isPow2(n)) return Float64Array.from(x);
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  fft(re, im);
  for (let k = 0; k <= n / 2; k++) {
    const hz = (k * rate) / n;
    const db = Math.min((dbPerKhz * hz) / 1000, maxDb);
    const g = Math.pow(10, db / 20);
    re[k] = re[k]! * g;
    im[k] = im[k]! * g;
    if (k > 0 && k < n / 2) {
      re[n - k] = re[n - k]! * g;
      im[n - k] = im[n - k]! * g;
    }
  }
  fft(re, im, true);
  return guardAll(re);
}

// ---- The engine's settings these use ----

export interface DspCfg {
  maxFloat: boolean;
  processingAmp: number;
  crossmodGain: number;
  crossmodPasses: number;
  /** Tri-cycles: factors, weights, their sum x mixAmp, and the time-reversed duplicates too. */
  tricycle: boolean;
  triFactors: number[];
  triWeights: number[];
  triMixAmp: number;
  triReverse: boolean;
  fallbackSpeed: number;
  phaseStack: boolean;
  phaseOffsets: number[];
  phaseDrive: number;
  phaseMixAmp: number;
  mashFactor: number;
  currentWeight: number;
  initialWeight: number;
  cycleMixAmp: number;
  /** Folds. */
  foldIter: number;
  foldGain: number;
  foldDriveMult: number;
  foldSineMult: number;
  foldAccumBase: number;
  foldAccumRate: number;
  foldBlend: number;
  foldFeedback: number;
  warpPi: number;
  triangleFold: boolean;
  trianglePhase: number;
  seedModFold: boolean;
  seedModFactor: number;
  foldLowpassEvery: number;
  foldLowpassCutoff: number;
  perCycleFold: boolean;
  perCycleFoldIter: number;
  superFold: boolean;
  superFoldMult: number;
  superLow: number;
  superHigh: number;
  cleanMixWeight: number;
  dirtyMixWeight: number;
  pairCrossmodGain: number;
  pairMixAmp: number;
}

// ---- The cycle's steps ----

/** tricycle: duplicates each repeated + compressed by its factor back to the length (or compressed first, then repeated), each x its weight, summed, x the mix amp. */
export function tricycle(x: Arr, c: DspCfg, mode: "rtc" | "ctr"): Arr {
  const n = x.length;
  const acc = new Float64Array(n);
  for (const rev of c.triReverse ? [false, true] : [false]) {
    c.triFactors.forEach((f, k) => {
      const w = c.triWeights[k] ?? 1;
      const d =
        mode === "ctr" ? compressThenRepeat(x, f, n, rev) : repeatThenCompress(x, f, n, rev);
      for (let i = 0; i < n; i++) acc[i] = acc[i]! + d[i]! * w;
    });
  }
  for (let i = 0; i < n; i++) acc[i] = guard(acc[i]! * c.triMixAmp);
  return acc;
}

/** phase_offset_stack: the layer rolled by each offset, summed, x the mix amp, tanh-driven, DC off. */
export function phaseStack(layer: Arr, c: DspCfg): Arr {
  const n = layer.length;
  if (!n) return layer;
  const acc = new Float64Array(n);
  for (const o of c.phaseOffsets) {
    // np.roll(layer, o): out[i] = layer[(i - o) mod n], in two runs.
    const k = ((Math.round(o) % n) + n) % n;
    for (let i = 0; i < k; i++) acc[i] = acc[i]! + layer[n - k + i]!;
    for (let i = k; i < n; i++) acc[i] = acc[i]! + layer[i - k]!;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const y = Math.tanh(guard(acc[i]! * c.phaseMixAmp) * c.phaseDrive);
    acc[i] = y;
    mean += y;
  }
  mean /= n;
  for (let i = 0; i < n; i++) acc[i] = acc[i]! - mean;
  return acc;
}

/** mash_seed: signal x current weight + seed x factor + the DC-free tanh(signal x gain) x seed, then hard_amp. */
export function mashSeed(signal: Arr, seed: Arr | null, c: DspCfg, factor = c.mashFactor): Arr {
  if (!seed || !seed.length) return signal;
  const sd = seed.length === signal.length ? seed : conform(seed, signal.length);
  const n = signal.length;
  const out = new Float64Array(n);
  // The cross part first (its mean is taken off), then the straight mix added, then hard_amp.
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const x = guard(Math.tanh(signal[i]! * c.crossmodGain) * sd[i]!);
    out[i] = x;
    mean += x;
  }
  mean /= n || 1;
  for (let i = 0; i < n; i++) {
    const y = c.currentWeight * signal[i]! + factor * sd[i]! + (out[i]! - mean);
    out[i] = c.maxFloat ? guard(y * c.processingAmp) : y;
  }
  return c.maxFloat ? out : hardAmp(out, c.processingAmp, false);
}

/** powerful_self_amplifying_fold: driven, sine-folded (seed-modulated) and triangle-folded, blended, accumulated. */
export function fold(
  signal: Arr,
  seed: Arr | null,
  c: DspCfg,
  iterations = c.foldIter,
  gain = c.foldGain,
): Arr {
  const n = signal.length;
  if (!n) return signal;
  let cur = guardAll(Float64Array.from(signal));
  const mx = peakOf(cur) + 1e-10;
  for (let i = 0; i < n; i++) cur[i] = cur[i]! / mx;
  let mod: Arr | null = null;
  if (c.seedModFold && seed && seed.length) {
    const s = seed.length === n ? seed : conform(seed, n);
    const sp = peakOf(s) + 1e-10;
    mod = new Float64Array(n);
    for (let i = 0; i < n; i++) mod[i] = 1 + (s[i]! / sp) * c.seedModFactor;
  }
  const accum = new Float64Array(n);
  const iters = Math.max(1, Math.floor(iterations));
  const lp = butter(3, c.foldLowpassCutoff, "low");
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const m = mod ? mod[i]! : 1;
      const driven = Math.tanh(cur[i]! * gain) * c.foldDriveMult;
      let sine = Math.sin(driven * Math.PI * c.warpPi * m) * driven;
      sine = Math.sin(sine * Math.PI * c.foldBlend) * c.foldSineMult;
      let folded = sine;
      if (c.triangleFold) {
        // Python's % (always >= 0 for a positive modulus).
        const t = (((driven * c.warpPi * m + c.trianglePhase) % 4) + 4) % 4;
        const tri = Math.abs(t - 2) - 1;
        folded = sine * c.foldBlend + tri * c.foldBlend;
      }
      next[i] = c.foldBlend * cur[i]! + c.foldBlend * folded;
    }
    if (it > 0) next[0] = next[0]! + c.foldFeedback * accum[n - 1]!;
    const w = c.foldAccumBase + it * c.foldAccumRate;
    for (let i = 0; i < n; i++) accum[i] = accum[i]! + next[i]! * w;
    cur =
      iters > 1 && it % Math.max(1, Math.floor(c.foldLowpassEvery)) === 0 ? filter(lp, next) : next;
  }
  return guardAll(accum);
}

/** parallel_super_fold: lows folded longer, highs folded harder, mids kept, mixed with the clean signal. */
export function superFold(signal: Arr, seed: Arr | null, c: DspCfg): Arr {
  if (!c.superFold || !signal.length) return fold(signal, seed, c);
  const lows = filter(butter(2, c.superLow, "low"), signal);
  const highs = filter(butter(2, c.superHigh, "high"), signal);
  const n = signal.length;
  const fl = fold(lows, seed, c, c.foldIter * c.superFoldMult, c.foldGain);
  const fh = fold(highs, seed, c, c.foldIter, c.foldGain * c.superFoldMult);
  const mix = new Float64Array(n);
  for (let i = 0; i < n; i++) mix[i] = fl[i]! + (signal[i]! - lows[i]! - highs[i]!) + fh[i]!;
  const sup = hardAmp(mix, c.processingAmp, c.maxFloat);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = c.cleanMixWeight * signal[i]! + c.dirtyMixWeight * sup[i]!;
  return hardAmp(out, c.processingAmp, c.maxFloat);
}

/** One cycle's new copy of `working` at its length n. */
function cycleCopy(working: Arr, c: DspCfg, mode: "rtc" | "ctr"): Arr {
  if (c.tricycle) return tricycle(working, c, mode);
  if (mode === "rtc")
    return repeatThenCompress(working, c.triFactors[0] ?? c.fallbackSpeed, working.length);
  return compressThenRepeat(working, c.fallbackSpeed, working.length);
}

/**
 * core_phrase_cascade (natural length): mashed with its own seed, folded, then
 * cycles of copy -> phase stack -> mash -> accumulate; the cycles' sum x its
 * mix amp joins the cascade's start by the weights.
 */
export function coreCascade(
  seed: Arr,
  cascades: number,
  cycles: number,
  c: DspCfg,
  cycleMixAmp: number,
  mode: "rtc" | "ctr" = "rtc",
): Arr {
  if (!seed.length) return seed;
  let cur = hardAmp(seed, c.processingAmp, c.maxFloat);
  const initial = cur;
  for (let k = 0; k < Math.max(0, Math.floor(cascades)); k++) {
    cur = mashSeed(hardAmp(cur, c.processingAmp, c.maxFloat), seed, c);
    const start = cur;
    const mixed = new Float64Array(cur.length);
    for (let i = 0; i < mixed.length; i++)
      mixed[i] = c.currentWeight * cur[i]! + c.initialWeight * initial[i]!;
    let working = hardAmp(fold(mixed, seed, c), c.processingAmp, c.maxFloat);
    const accum = new Float64Array(cur.length);
    for (let y = 0; y < Math.max(1, Math.floor(cycles)); y++) {
      let r = cycleCopy(working, c, mode);
      if (c.phaseStack) r = phaseStack(r, c);
      r = hardAmp(mashSeed(r, seed, c), c.processingAmp, c.maxFloat);
      for (let i = 0; i < accum.length; i++) accum[i] = accum[i]! + r[i]!;
      working = r;
      if (c.perCycleFold)
        working = hardAmp(fold(working, seed, c, c.perCycleFoldIter), c.processingAmp, c.maxFloat);
    }
    const out = new Float64Array(cur.length);
    for (let i = 0; i < out.length; i++)
      out[i] = c.currentWeight * start[i]! + c.initialWeight * guard(accum[i]! * cycleMixAmp);
    cur = hardAmp(mashSeed(out, seed, c), c.processingAmp, c.maxFloat);
  }
  return cur;
}

/**
 * true_accumulative_cascade: each cascade mashed with the seed, folded, cycled
 * (copy -> phase stack -> mash -> accumulate), its cycles' sum joined by the
 * weights, super-folded and mashed; then every pair of cascades cross-modded
 * (their sum x its mix amp) and mixed in by the clean / dirty weights.
 */
export function accumulativeCascade(
  base: Arr,
  seed: Arr | null,
  cascades: number,
  cycles: number,
  c: DspCfg,
  mode: "rtc" | "ctr" = "rtc",
): Arr {
  let cur = hardAmp(seed ? mashSeed(base, seed, c) : base, c.processingAmp, c.maxFloat);
  const initial = cur;
  const outs: Arr[] = [];
  for (let k = 0; k < Math.max(0, Math.floor(cascades)); k++) {
    cur = hardAmp(cur, c.processingAmp, c.maxFloat);
    if (seed) cur = mashSeed(cur, seed, c);
    const start = cur;
    const mixed = new Float64Array(cur.length);
    for (let i = 0; i < mixed.length; i++)
      mixed[i] = c.currentWeight * cur[i]! + c.initialWeight * initial[i]!;
    let working = hardAmp(fold(mixed, seed, c), c.processingAmp, c.maxFloat);
    const accum = new Float64Array(cur.length);
    for (let y = 0; y < Math.max(1, Math.floor(cycles)); y++) {
      let r = cycleCopy(working, c, mode);
      if (c.phaseStack) r = phaseStack(r, c);
      if (seed) r = mashSeed(r, seed, c);
      r = hardAmp(r, c.processingAmp, c.maxFloat);
      for (let i = 0; i < accum.length; i++) accum[i] = accum[i]! + r[i]!;
      working = r;
      if (c.perCycleFold) {
        working = hardAmp(fold(working, seed, c, c.perCycleFoldIter), c.processingAmp, c.maxFloat);
        if (seed) working = mashSeed(working, seed, c);
      }
    }
    const next = new Float64Array(cur.length);
    for (let i = 0; i < next.length; i++)
      next[i] = c.currentWeight * start[i]! + c.initialWeight * guard(accum[i]! * c.cycleMixAmp);
    cur = superFold(next, seed, c);
    if (seed) cur = mashSeed(cur, seed, c);
    cur = hardAmp(cur, c.processingAmp, c.maxFloat);
    outs.push(cur);
  }
  if (outs.length > 1) {
    const acc = new Float64Array(cur.length);
    for (let i = 0; i < outs.length; i++)
      for (let j = i + 1; j < outs.length; j++) {
        const pair = removeDc(crossmod(outs[i]!, outs[j]!, c.pairCrossmodGain, c.crossmodPasses));
        for (let x = 0; x < acc.length; x++) acc[x] = acc[x]! + pair[x]!;
      }
    const dirty = hardAmp(
      Float64Array.from(acc, (v) => v * c.pairMixAmp),
      c.processingAmp,
      c.maxFloat,
    );
    const out = new Float64Array(cur.length);
    for (let i = 0; i < out.length; i++)
      out[i] = c.cleanMixWeight * cur[i]! + c.dirtyMixWeight * dirty[i]!;
    cur = out;
  }
  return hardAmp(cur, c.processingAmp, c.maxFloat);
}
