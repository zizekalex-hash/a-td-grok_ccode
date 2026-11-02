/**
 * The timed set's alarm: the phrase itself as sound. Its bytes (UTF-8) become
 * bits, and each bit a short tone, high for 1 and low for 0, quiet (amp 0.09),
 * played a few times over. It is scheduled on the audio clock for the moment the
 * timer ends, so it sounds on time even if the page's timers are held back.
 * Tuned in reps.alarm in config.json. The sound itself is pure (alarmSamples),
 * so the tests can load it; playing it needs a page.
 */
import { CONFIG } from "./config.ts";

export interface AlarmSpec {
  /** Loudness, 0 to 1. */
  amp: number;
  /** Each bit's tone (ms), and its two pitches (Hz). */
  bitMs: number;
  hiHz: number;
  loHz: number;
  /** Times played, and the silence between (ms). */
  repeats: number;
  gapMs: number;
  /** The most bits of the phrase used (the rest is left off, so it stays short). */
  maxBits: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** The alarm as set in config.json, each number kept sensible. */
export function alarmSpec(): AlarmSpec {
  const A = CONFIG.reps.alarm;
  return {
    amp: clamp(A.amp, 0, 1),
    bitMs: clamp(A.bitMs, 5, 500),
    hiHz: clamp(A.hiHz, 40, 8000),
    loHz: clamp(A.loHz, 40, 8000),
    repeats: Math.round(clamp(A.repeats, 1, 20)),
    gapMs: clamp(A.gapMs, 0, 5000),
    maxBits: Math.round(clamp(A.maxBits, 8, 4096)),
  };
}

/** The phrase's bits, byte by byte, highest bit first (at most max). */
export function alarmBits(text: string, max: number): number[] {
  const bytes = new TextEncoder().encode(text.trim() || "done");
  const bits: number[] = [];
  for (const b of bytes) {
    for (let k = 7; k >= 0; k--) {
      if (bits.length >= max) return bits;
      bits.push((b >> k) & 1);
    }
  }
  return bits;
}

/**
 * The alarm's samples at a sample rate: each bit a tone (a sine, faded in and
 * out over a couple of ms so it does not click), the whole played `repeats`
 * times with `gapMs` of silence between. Never louder than amp.
 */
export function alarmSamples(
  text: string,
  rate: number,
  spec: AlarmSpec,
): Float32Array<ArrayBuffer> {
  const bits = alarmBits(text, spec.maxBits);
  const per = Math.max(1, Math.round((rate * spec.bitMs) / 1000));
  const gap = Math.round((rate * spec.gapMs) / 1000);
  const once = bits.length * per;
  const out = new Float32Array(spec.repeats * once + (spec.repeats - 1) * gap);
  const fade = Math.max(1, Math.min(Math.floor(per / 4), Math.round(rate * 0.002)));
  for (let r = 0; r < spec.repeats; r++) {
    const base = r * (once + gap);
    bits.forEach((bit, i) => {
      const hz = bit ? spec.hiHz : spec.loHz;
      const from = base + i * per;
      for (let n = 0; n < per; n++) {
        const edge = Math.min(1, n / fade, (per - 1 - n) / fade);
        out[from + n] = spec.amp * edge * Math.sin((2 * Math.PI * hz * n) / rate);
      }
    });
  }
  return out;
}

// ---- Playing it (a page only) ----

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!audio) {
      const AC =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/**
 * Plays the alarm for a phrase at a moment (ms, like Date.now()), on the audio
 * clock; gives back what stops it (if it has not played yet, it never will).
 */
export function scheduleAlarm(text: string, atMs: number, spec = alarmSpec()): () => void {
  const ctx = context();
  if (!ctx || spec.amp <= 0) return () => {};
  try {
    const data = alarmSamples(text, ctx.sampleRate, spec);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(ctx.currentTime + Math.max(0, (atMs - Date.now()) / 1000));
    return () => {
      try {
        src.stop();
      } catch {
        /* already over */
      }
      src.disconnect();
    };
  } catch {
    return () => {};
  }
}
