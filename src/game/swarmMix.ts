/**
 * The background voices mixed into one sound, a piece at a time (the swarm):
 * every voice of every background layer, each saying its phrase (over and
 * over) or reading the whole text by itself, at its own speed from its own
 * start, its sayings resampled by a cubic curve and added into its layer; each
 * layer then rung (its robot) and turned left-right (its turning), and all of
 * them added into two channels. Pure: no page, so a worker runs it (or a test).
 *
 * A voice whose saying is not here yet waits (silent) and starts it as soon as
 * it is: the mix never stops for one.
 */
import type { TtsSource } from "./ttsRender.ts";

/** A layer of background voices as the swarm mixes it. */
export interface SwarmLayer {
  /** Its voices: when each starts after the layer (s), its speed and its loudness. */
  voices: { at: number; speed: number; gain: number }[];
  /** Says the phrase it is given, or reads the whole text by itself from its first phrase. */
  mode: "phrase" | "text";
  /** Over and over (else once: the phrase once, or the text once through). */
  loop: boolean;
  /** The silence after each saying (s, at its own speed: a faster voice's is shorter). */
  gapSec: number;
  /** Each saying mixed half and half with itself played backwards. */
  reverse: boolean;
  /** Its loudness rung against a tone (0 none, 1 all), and that tone's Hz. */
  robot: number;
  robotHz: number;
  /** Turned left-right this many times a second (0: still, the same both sides). */
  panHz: number;
  /** Which voice says it (layers with the same voice share their sayings). */
  voice: number;
}

/** A saying wanted: which voice, which phrase, and the frame it is wanted at. */
export interface SwarmNeed {
  voice: number;
  phrase: number;
  at: number;
}

export interface SwarmPiece {
  left: Float32Array;
  right: Float32Array;
  /** Its loudest sample (either side). */
  peak: number;
}

export interface Swarm {
  /** The frame the next piece starts at. */
  at(): number;
  /** The next frames; source(voice, phrase): that saying, or null (not here yet: the voice waits). */
  mix(frames: number, source: (voice: number, phrase: number) => TtsSource | null): SwarmPiece;
  /** The phrase-saying voices start again on this phrase, from this frame (their starts after it). */
  restart(frame: number, phrase: number): void;
  /** The sayings wanted and not here, soonest first (as of the last piece). */
  wanted(): SwarmNeed[];
  /** Voices in all, and how many wait for a saying. */
  stats(): { voices: number; waiting: number };
}

interface Voice {
  layer: number;
  speed: number;
  gain: number;
  /** Frames after the start it begins (its spread). */
  offset: number;
  /** The phrase it says next, or is saying. */
  phrase: number;
  /** Its next saying starts at this frame (it waits from there if its saying is not here). */
  start: number;
  /** Saying now: its sound, the frame it began and the frame after its last. */
  src: TtsSource | null;
  began: number;
  end: number;
  /** Through (said once, not over and over). */
  done: boolean;
  waiting: boolean;
  /** Its last saying (played again meanwhile while the next is not made yet: it never waits). */
  last: TtsSource | null;
  /** Saying a stand-in now: when it is over, it is still on the same phrase. */
  filler: boolean;
}

/** A sine of hz at rate from frame `from`, turned on a step at a time. */
function tone(hz: number, rate: number, from: number) {
  const w = (2 * Math.PI * hz) / rate;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  let s = Math.sin(w * from);
  let c = Math.cos(w * from);
  return {
    get s() {
      return s;
    },
    step() {
      const s2 = s * cw + c * sw;
      c = c * cw - s * sw;
      s = s2;
    },
  };
}

/** A saying and its backwards self, half and half (kept: made once per saying). */
const reversed = new WeakMap<TtsSource, TtsSource>();
function reverseOf(src: TtsSource): TtsSource {
  let r = reversed.get(src);
  if (!r) {
    const n = src.length;
    const data = new Float32Array(n + 4);
    for (let i = 0; i < n; i++) data[i + 1] = 0.5 * src.data[i + 1]! + 0.5 * src.data[n - i]!;
    r = { data, length: n, rate: src.rate };
    reversed.set(src, r);
  }
  return r;
}

/**
 * A swarm of layers at rate (Hz), its frames counted from `from`; phrases: how
 * many the text has (its voices read 0..phrases-1); phrase: the one the
 * phrase-saying voices say.
 */
export function createSwarm(
  layers: SwarmLayer[],
  phrases: number,
  rate: number,
  from = 0,
  phrase = 0,
): Swarm {
  let at = from;
  let wants: SwarmNeed[] = [];
  /** Each voice's last saying, for its copies that have none yet. */
  const lastOf = new Map<number, TtsSource>();
  const voices: Voice[] = [];
  layers.forEach((l, li) => {
    for (const v of l.voices) {
      if (!(v.speed > 0) || !(v.gain > 0)) continue;
      const offset = Math.max(0, Math.round(v.at * rate));
      voices.push({
        layer: li,
        speed: v.speed,
        gain: v.gain,
        offset,
        phrase: l.mode === "text" ? 0 : phrase,
        start: from + offset,
        src: null,
        began: 0,
        end: 0,
        done: phrases <= 0,
        waiting: false,
        last: null,
        filler: false,
      });
    }
  });

  /** After a saying: its silence, then the next phrase (the text's next, or the same again). */
  const next = (v: Voice) => {
    const l = layers[v.layer]!;
    v.start = v.end + Math.max(0, Math.round((l.gapSec * rate) / v.speed));
    v.src = null;
    if (v.filler) {
      v.filler = false;
      return;
    }
    if (l.mode === "text") {
      v.phrase += 1;
      if (v.phrase >= phrases) {
        if (l.loop) v.phrase = 0;
        else v.done = true;
      }
    } else if (!l.loop) v.done = true;
  };

  return {
    at: () => at,
    mix(frames, source) {
      const a = at;
      const n = Math.max(0, Math.floor(frames));
      const b = a + n;
      const sums: (Float32Array | undefined)[] = [];
      const need = new Map<string, SwarmNeed>();
      for (const v of voices) {
        let j = a;
        let guard = 0;
        while (!v.done && j < b && guard++ < 100_000) {
          if (!v.src) {
            if (v.start >= b) break;
            if (v.start > j) j = v.start;
            const l = layers[v.layer]!;
            let s = source(l.voice, v.phrase);
            v.filler = false;
            if (!s || !s.length || !(s.rate > 0)) {
              // Not made yet: asked for, and meanwhile it never waits: it says again what it
              // (or a voice like it) said last, and comes to this phrase as soon as it is made.
              const k = `${l.voice}|${v.phrase}`;
              const w = need.get(k);
              if (!w || j < w.at) need.set(k, { voice: l.voice, phrase: v.phrase, at: j });
              const stand = v.last ?? lastOf.get(l.voice) ?? null;
              if (!stand) {
                // Nothing said at all yet (the very start): from the next piece.
                v.waiting = true;
                v.start = b;
                break;
              }
              s = stand;
              v.filler = true;
            } else {
              v.last = s;
              lastOf.set(l.voice, s);
            }
            v.waiting = false;
            v.src = l.reverse ? reverseOf(s) : s;
            v.began = j;
            v.end = j + Math.max(1, Math.ceil(s.length / ((s.rate * v.speed) / rate)));
          }
          const src = v.src;
          const j1 = Math.min(v.end, b);
          if (j1 > j) {
            const acc = (sums[v.layer] ??= new Float32Array(n));
            const d = src.data;
            const last = src.length;
            const step = (src.rate * v.speed) / rate;
            const g = v.gain;
            let pos = (j - v.began) * step;
            for (let w = j - a; w < j1 - a; w++, pos += step) {
              let i = Math.floor(pos);
              if (i > last) i = last;
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
          j = j1;
          if (j1 >= v.end) next(v);
        }
      }
      wants = [...need.values()].sort((x, y) => x.at - y.at);
      // Each layer: its robot ring, its turning, into the two sides.
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      sums.forEach((x, li) => {
        if (!x) return;
        const l = layers[li]!;
        const r = l.robot;
        const ring = r > 0 ? tone(l.robotHz, rate, a) : null;
        const turn = l.panHz > 0 ? tone(l.panHz, rate, a) : null;
        for (let m = 0; m < n; m++) {
          let s = x[m]!;
          if (ring) {
            s *= 1 - r + r * ring.s;
            ring.step();
          }
          if (turn) {
            // Equal power, as a stereo panner: 0.707 each side in the middle.
            const ang = (Math.PI / 4) * (1 + turn.s);
            left[m] = left[m]! + s * Math.cos(ang);
            right[m] = right[m]! + s * Math.sin(ang);
            turn.step();
          } else {
            left[m] = left[m]! + s;
            right[m] = right[m]! + s;
          }
        }
      });
      let peak = 0;
      for (let m = 0; m < n; m++) {
        const p = Math.max(Math.abs(left[m]!), Math.abs(right[m]!));
        if (p > peak) peak = p;
      }
      at = b;
      return { left, right, peak };
    },
    restart(frame, p) {
      at = frame;
      for (const v of voices) {
        const l = layers[v.layer]!;
        if (l.mode !== "phrase") continue;
        v.phrase = p;
        v.src = null;
        v.start = frame + v.offset;
        v.done = phrases <= 0;
        v.waiting = false;
      }
    },
    wanted: () => wants,
    stats: () => ({ voices: voices.length, waiting: voices.filter((v) => v.waiting).length }),
  };
}
