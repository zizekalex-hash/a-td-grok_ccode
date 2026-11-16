/**
 * A phrase's sound playing all the time: Rehearse's Nonstop and the Read tab's
 * phrase sound. The current phrase's sound as Rehearse shapes it (steady, or
 * the rising cycle; game/rehearse.ts soundOf), looped with no gap, on the
 * same phrase till it is given another (a tap): that one takes over at once,
 * fading in as the old fades out. Nothing is scheduled ahead.
 * Each player plays one phrase at a time. Needs a page.
 */
import {
  curvePoints,
  defaultSettings,
  levelOf,
  loadRehearse,
  REHEARSE_KEY,
  soundOf,
  soundRate,
  steadyGain,
  wavCurve,
  wavSampleRate,
  voiceSpeeds,
  type RehearseSettings,
  type VoiceShape,
  type WavStyle,
} from "./rehearse.ts";

export type LoopSound = Pick<
  RehearseSettings,
  "signalMs" | "amp" | "rawRate" | "mode" | "plays" | "topSpeed"
> &
  Partial<Pick<RehearseSettings, "encoding">>;

export interface PhraseLoop {
  /** Plays this phrase's sound over and over (the same phrase and settings again: nothing changes). */
  play(text: string, sound: LoopSound): void;
  stop(): void;
}

/** Rehearse's sound settings, as saved (its defaults if none). */
export function savedSound(): LoopSound {
  try {
    const raw = localStorage.getItem(REHEARSE_KEY);
    return loadRehearse(raw ? JSON.parse(raw) : null).settings;
  } catch {
    return defaultSettings();
  }
}

let audio: AudioContext | null = null;
/** The rate the live sound is made at: the app's sample rate. */
let liveRate = 48_000;
/** Changes with the rate: what was made at the rate before is made again. */
let gen = 0;

/**
 * The live sound's rate (48 to 384 kHz): a new one starts the player afresh at
 * it (what played stops; the app plays it again). Gives back whether it changed.
 */
export function setLiveRate(rate: number): boolean {
  if (!(rate > 0) || rate === liveRate) return false;
  liveRate = rate;
  gen += 1;
  const old = audio;
  audio = null;
  if (old) void old.close().catch(() => {});
  return true;
}

/** The rate the live sound is made at now (the phone may play it out at its own). */
export function liveSampleRate(): number {
  return audio?.sampleRate ?? liveRate;
}

/** Sound meant to be playing (Rehearse, in the background too): a paused player is woken at once. */
let holding = false;

function watch(c: AudioContext) {
  c.onstatechange = () => {
    if (holding && c.state !== "running" && c.state !== "closed") void c.resume().catch(() => {});
  };
}

/** Wakes every player the phone (or another app) paused, if its sound is meant to play. */
export function wakeAudio() {
  for (const c of [audio, ...atRate.values()]) {
    if (c && c.state !== "running" && c.state !== "closed") void c.resume().catch(() => {});
  }
}

/** Whether sound is meant to play now: then a paused player is woken as soon as it pauses. */
export function holdAudio(on: boolean) {
  holding = on;
  if (on) wakeAudio();
}

function context(): AudioContext | null {
  try {
    if (!audio) {
      const AC =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        audio = new AC({ sampleRate: liveRate });
      } catch {
        // Not at that rate here: the player's own.
        audio = new AC();
      }
      watch(audio);
    }
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Players at a file's own sample rate, so its sound is played as it is (not resampled). */
const atRate = new Map<number, AudioContext>();

function contextAt(rate: number | null): AudioContext | null {
  if (!rate) return context();
  try {
    let c = atRate.get(rate);
    if (!c) {
      const AC =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      c = new AC({ sampleRate: rate });
      watch(c);
      atRate.set(rate, c);
    }
    if (c.state === "suspended") void c.resume();
    return c;
  } catch {
    return context();
  }
}

/** The fade between two phrases (s). */
const FADE = 0.03;
/** Sounds kept made, newest last. */
const KEEP = 12;

export function phraseLoop(): PhraseLoop {
  let now: { src: AudioBufferSourceNode; gain: GainNode; key: string } | null = null;
  const made = new Map<string, AudioBuffer>();

  const fadeOut = (n: typeof now) => {
    if (!n) return;
    try {
      const t = n.gain.context.currentTime;
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(n.gain.gain.value, t);
      n.gain.gain.linearRampToValueAtTime(0, t + FADE);
      n.src.stop(t + FADE + 0.01);
    } catch {
      /* over already */
    }
  };

  return {
    play(text, sound) {
      const ctx = context();
      if (!ctx || !text.trim() || sound.amp <= 0) {
        fadeOut(now);
        now = null;
        return;
      }
      const key = JSON.stringify([
        text,
        sound.signalMs,
        sound.amp,
        sound.rawRate,
        sound.encoding ?? "u8",
        sound.mode,
        sound.plays,
        sound.topSpeed,
        ctx.sampleRate,
      ]);
      // The same phrase and settings: it goes on as it is.
      if (now?.key === key) return;
      let buf = made.get(key);
      if (!buf) {
        // A very long sound is made at a lower rate (the player turns it back to its own).
        const rate = soundRate(ctx.sampleRate, sound);
        const data = soundOf(text, rate, sound);
        buf = ctx.createBuffer(1, data.length, rate);
        buf.copyToChannel(data, 0);
        made.set(key, buf);
        if (made.size > KEEP) made.delete(made.keys().next().value!);
      }
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + FADE);
        src.connect(gain).connect(ctx.destination);
        src.start(t);
        fadeOut(now);
        now = { src, gain, key };
      } catch {
        /* no sound on this device */
      }
    },
    stop() {
      fadeOut(now);
      now = null;
    },
  };
}

/**
 * A sound file looping as it is (a phrase's or a text's own .wav): nothing cut
 * or changed, only its loudness. Its style (game/rehearse.ts WavStyle) shapes
 * that loudness within each loop and gives each loop its level in turn. The
 * file plays as one seamless loop; the shape runs on a gain of its own, each
 * loop's curve set to start right on that loop's start, some loops ahead.
 */
export interface FileLoop {
  /** Plays the file at this address over and over (the same address again: only the gain and style change). */
  play(url: string, gain: number, style?: WavStyle): Promise<boolean>;
  gain(gain: number): void;
  /** A new style: from the next loop if it starts soon, else the file starts again in it. */
  style(style: WavStyle): void;
  stop(): void;
}

/**
 * How far ahead the loops' curves are set (s), so a slow timer keeps up: in the
 * background a page's timers may run only once a minute.
 */
const AHEAD = 150;
/** The most loops set ahead at once (a very short file). */
const MAX_AHEAD_LOOPS = 4000;

interface Playing {
  src: AudioBufferSourceNode;
  /** The fade in and out and the volume. */
  vol: GainNode;
  /** The style's loudness, loop by loop. */
  shape: GainNode;
  url: string;
  ctx: AudioContext;
  /** The volume asked for. */
  level: number;
  /** When its first loop started (s, the context's time), and a loop's length. */
  t0: number;
  dur: number;
  style: WavStyle;
  /** The loop the style's levels start from, and the next loop not yet set. */
  from: number;
  next: number;
  timer: number;
}

const flat: WavStyle = {
  shape: "flat",
  fadeIn: 0,
  fadeOut: 0,
  cycles: 1,
  depth: 0,
  levels: [1],
};

/** Sets the style's curves for the loops up to AHEAD seconds from now. */
function fillAhead(n: Playing) {
  const steady = steadyGain(n.style);
  const p = n.shape.gain;
  if (steady !== null) {
    if (n.next >= 0) {
      try {
        p.setValueAtTime(steady, Math.max(n.ctx.currentTime, n.t0 + n.next * n.dur));
      } catch {
        p.value = steady;
      }
      // Set once: nothing more to set ahead.
      n.next = -1;
    }
    return;
  }
  if (n.next < 0) return;
  const until = n.ctx.currentTime + Math.max(AHEAD, 3 * n.dur);
  const points = curvePoints(n.style, n.dur);
  const base = wavCurve(n.style, points);
  let set = 0;
  while (n.t0 + n.next * n.dur < until && set < MAX_AHEAD_LOOPS) {
    const at = n.t0 + n.next * n.dur;
    const end = n.t0 + (n.next + 1) * n.dur;
    if (end > n.ctx.currentTime) {
      const level = levelOf(n.style, n.next - n.from);
      const curve = level === 1 ? base : base.map((v) => v * level);
      try {
        // Just short of the next loop's start, so two curves never meet.
        p.setValueCurveAtTime(
          curve,
          Math.max(at, n.ctx.currentTime),
          (end - Math.max(at, n.ctx.currentTime)) * 0.999999,
        );
      } catch {
        /* that loop keeps the loudness before it */
      }
    }
    n.next++;
    set++;
  }
}

export function fileLoop(): FileLoop {
  let now: Playing | null = null;
  const made = new Map<string, { buf: AudioBuffer; ctx: AudioContext }>();
  let asked = "";

  const fadeOut = (n: Playing | null) => {
    if (!n) return;
    window.clearInterval(n.timer);
    try {
      const t = n.ctx.currentTime;
      n.vol.gain.cancelScheduledValues(t);
      n.vol.gain.setValueAtTime(n.vol.gain.value, t);
      n.vol.gain.linearRampToValueAtTime(0, t + FADE);
      n.src.stop(t + FADE + 0.01);
    } catch {
      /* over already */
    }
  };

  const start = (
    url: string,
    buf: AudioBuffer,
    ctx: AudioContext,
    gain: number,
    style: WavStyle,
  ) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const shape = ctx.createGain();
    const vol = ctx.createGain();
    const t = ctx.currentTime;
    vol.gain.setValueAtTime(0, t);
    vol.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, gain)), t + FADE);
    src.connect(shape).connect(vol).connect(ctx.destination);
    src.start(t);
    const n: Playing = {
      src,
      vol,
      shape,
      url,
      ctx,
      level: Math.max(0, Math.min(1, gain)),
      t0: t,
      dur: Math.max(1e-4, buf.length / buf.sampleRate),
      style,
      from: 0,
      next: 0,
      timer: 0,
    };
    fillAhead(n);
    n.timer = window.setInterval(() => fillAhead(n), 1000);
    fadeOut(now);
    now = n;
  };

  const restyle = (style: WavStyle) => {
    const n = now;
    if (!n) return;
    if (JSON.stringify(n.style) === JSON.stringify(style)) return;
    const t = n.ctx.currentTime;
    // The next loop's start: from there in the new style if it is soon, else the file again from its start.
    const k = Math.max(0, Math.ceil((t - n.t0) / n.dur - 1e-9));
    const at = n.t0 + k * n.dur;
    if (at - t > 2) {
      const got = made.get(n.url);
      if (got) start(n.url, got.buf, got.ctx, n.level, style);
      return;
    }
    try {
      n.shape.gain.cancelScheduledValues(at);
    } catch {
      /* nothing set */
    }
    n.style = style;
    n.from = k;
    n.next = k;
    fillAhead(n);
  };

  return {
    async play(url, gain, style = flat) {
      asked = url;
      if (now?.url === url) {
        now.level = Math.max(0, Math.min(1, gain));
        now.vol.gain.setTargetAtTime(now.level, now.ctx.currentTime, 0.02);
        restyle(style);
        return true;
      }
      let got = made.get(url);
      if (!got) {
        try {
          const bytes = await (await fetch(url)).arrayBuffer();
          const ctx = contextAt(wavSampleRate(new Uint8Array(bytes)));
          if (!ctx) return false;
          got = { buf: await ctx.decodeAudioData(bytes), ctx };
        } catch {
          return false;
        }
        made.set(url, got);
        if (made.size > 4) made.delete(made.keys().next().value!);
      }
      const { buf, ctx } = got;
      if (ctx.state === "suspended") void ctx.resume();
      // Asked for another (or stopped) meanwhile.
      if (asked !== url) return false;
      try {
        start(url, buf, ctx, gain, style);
      } catch {
        return false;
      }
      return true;
    },
    gain(gain) {
      if (!now) return;
      now.level = Math.max(0, Math.min(1, gain));
      now.vol.gain.setTargetAtTime(now.level, now.ctx.currentTime, 0.02);
    },
    style(style) {
      restyle(style);
    },
    stop() {
      asked = "";
      fadeOut(now);
      now = null;
    },
  };
}

/**
 * The robot voice played (a .wav the phone's text-to-speech made): copies of it
 * at once, each spreadMs after the one before and speedUp times faster (pitch and
 * pace together, so they drift apart as they loop), a gap after each saying, its
 * loudness rung against a tone (the robot), at its volume. The same voice and
 * shape again: it goes on as it is.
 */
/** One voice played: when it starts (s), its speed (pitch and pace) and its loudness. */
export interface VoiceAt {
  at: number;
  speed: number;
  gain: number;
}

/** How a voice plays. */
export interface VoicePlay {
  /** The voices to play (none given: the shape's own copies). */
  voices?: VoiceAt[];
  /** Above 0: its copies recorded once, that long, then that one sound looped (light for the phone). */
  recordSec?: number;
  /** Each saying with its time-reversed copy, half and half. */
  reverse?: boolean;
  /** But not the first copy (the main voice, heard as it is said). */
  mainForward?: boolean;
  /** Said this many times (with its silence after each), then quiet; 0: as its loop is set. */
  times?: number;
  /** Called after the first voice's last saying and its silence (not if stopped first); with no times, once. */
  once?: () => void;
  /** Tells apart two plays of the same sound (said again: a tap, or another place). */
  tag?: string;
}

/** A shape's own copies: each spreadMs after the one before and speedUp times faster. */
function copiesOfShape(shape: VoiceShape): VoiceAt[] {
  return voiceSpeeds(shape).map((speed, k) => ({
    at: (k * shape.voiceSpreadMs) / 1000,
    speed,
    gain: Math.max(0, k === 0 ? shape.voiceVolume : shape.voiceCopiesVolume),
  }));
}

export interface VoicePlayer {
  /** Plays it with its shape (the same playing already: it goes on as it is). */
  play(url: string, shape: VoiceShape, o?: VoicePlay): Promise<boolean>;
  stop(): void;
}

export function voicePlayer(): VoicePlayer {
  let now: {
    nodes: AudioScheduledSourceNode[];
    out: GainNode;
    key: string;
    me: object;
  } | null = null;
  const made = new Map<string, AudioBuffer>();
  let asked = "";
  let madeAt = gen;

  const fadeOut = (n: typeof now) => {
    if (!n) return;
    try {
      const t = n.out.context.currentTime;
      n.out.gain.cancelScheduledValues(t);
      n.out.gain.setValueAtTime(n.out.gain.value, t);
      n.out.gain.linearRampToValueAtTime(0, t + FADE);
      for (const x of n.nodes) x.stop(t + FADE + 0.01);
    } catch {
      /* over already */
    }
  };

  return {
    async play(url, shape, o = {}) {
      const { recordSec = 0, reverse = false, mainForward = false, once, tag = "" } = o;
      const voices = o.voices ?? copiesOfShape(shape);
      // Said once with a call after: one time; else as many times as asked (0: as its loop is set).
      const times = Math.max(0, Math.floor(o.times ?? (once ? 1 : 0)));
      if (!voices.length) {
        asked = "";
        fadeOut(now);
        now = null;
        return true;
      }
      const key = JSON.stringify([
        url,
        shape,
        recordSec,
        reverse,
        mainForward,
        !!once,
        tag,
        voices,
        times,
      ]);
      // This play (its end told only if it is still the one playing).
      const me = {};
      asked = key;
      if (now?.key === key) return true;
      // Another rate: what was made at the one before is made again, and nothing of it plays on.
      if (madeAt !== gen) {
        madeAt = gen;
        made.clear();
        now = null;
      }
      const ctx = context();
      if (!ctx) return false;
      let buf = made.get(url);
      if (!buf) {
        try {
          buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        } catch {
          return false;
        }
        made.set(url, buf);
        if (made.size > 16) made.delete(made.keys().next().value!);
      }
      if (asked !== key) return false;
      try {
        // The saying and the gap after it, one channel.
        // Said a number of times: its silence too, before it is over.
        const gap =
          shape.voiceLoop || times > 0 ? Math.round((buf.sampleRate * shape.voiceGapMs) / 1000) : 0;
        const one = ctx.createBuffer(1, buf.length + gap, buf.sampleRate);
        const mono = one.getChannelData(0);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < d.length; i++) mono[i] = mono[i]! + d[i]! / buf.numberOfChannels;
        }
        // The main voice (the first copy) as it is said: never reversed.
        let first: AudioBuffer | undefined;
        if (reverse && mainForward) {
          first = ctx.createBuffer(1, one.length, one.sampleRate);
          first.copyToChannel(mono, 0);
        }
        if (reverse) {
          // The saying and its time-reversed copy, half and half (the gap after it stays).
          const len = buf.length;
          const fwd = mono.slice(0, len);
          for (let i = 0; i < len; i++) mono[i] = 0.5 * fwd[i]! + 0.5 * fwd[len - 1 - i]!;
        }
        const t = ctx.currentTime;
        const fade = ctx.createGain();
        fade.gain.setValueAtTime(0, t);
        fade.gain.linearRampToValueAtTime(1, t + FADE);
        fade.connect(ctx.destination);
        let nodes: AudioScheduledSourceNode[];
        if (recordSec && recordSec > 0 && shape.voiceLoop && times === 0) {
          // Recorded once (all its copies), then that one sound looped.
          const off = new OfflineAudioContext(
            2,
            Math.max(1, Math.round(one.sampleRate * recordSec)),
            one.sampleRate,
          );
          voiceGraph(off, off.destination, one, shape, voices, 0, first);
          const rec = await off.startRendering();
          if (asked !== key) return false;
          const src = ctx.createBufferSource();
          src.buffer = rec;
          src.loop = true;
          src.connect(fade);
          src.start(t);
          nodes = [src];
        } else
          nodes = voiceGraph(
            ctx,
            fade,
            one,
            shape,
            voices,
            t,
            first,
            times,
            times > 0
              ? () => {
                  // Over by itself (not stopped, nor followed by another).
                  if (now?.me !== me) return;
                  now = null;
                  once?.();
                }
              : undefined,
          ).nodes;
        const out = fade;
        fadeOut(now);
        now = { nodes, out, key, me };
        return true;
      } catch {
        return false;
      }
    },
    stop() {
      asked = "";
      fadeOut(now);
      now = null;
    },
  };
}

/** A layer's robot and turning, from t into dest: what its voices play into, and its own nodes. */
function voiceChain(
  c: BaseAudioContext,
  dest: AudioNode,
  shape: VoiceShape,
  t: number,
): { into: AudioNode; out: GainNode; nodes: AudioScheduledSourceNode[] } {
  const out = c.createGain();
  const nodes: AudioScheduledSourceNode[] = [];
  // Turned round left to right and back, panHz times a second.
  if (shape.voicePanHz > 0 && typeof c.createStereoPanner === "function") {
    const pan = c.createStereoPanner();
    const lfo = c.createOscillator();
    lfo.frequency.value = shape.voicePanHz;
    lfo.connect(pan.pan);
    lfo.start(t);
    nodes.push(lfo);
    out.connect(pan).connect(dest);
  } else out.connect(dest);
  let into: AudioNode = out;
  if (shape.voiceRobot > 0) {
    // Rung: its loudness times (1 - robot) + robot x a tone of robotHz.
    const ring = c.createGain();
    ring.gain.value = 1 - shape.voiceRobot;
    const tone = c.createOscillator();
    tone.frequency.value = shape.voiceRobotHz;
    const amount = c.createGain();
    amount.gain.value = shape.voiceRobot;
    tone.connect(amount).connect(ring.gain);
    ring.connect(out);
    tone.start(t);
    nodes.push(tone);
    into = ring;
  }
  return { into, out, nodes };
}

/**
 * The voices (each its start, speed and loudness), with the layer's robot and
 * turning, played from t into dest (live, or recorded). times above 0: each
 * says it that many times, then stops (ended: after the first voice's last);
 * 0: each loops if the shape loops.
 */
function voiceGraph(
  c: BaseAudioContext,
  dest: AudioNode,
  one: AudioBuffer,
  shape: VoiceShape,
  voices: VoiceAt[],
  t: number,
  /** The first voice's own sound (the main voice as it is said), if not `one`. */
  first?: AudioBuffer,
  times = 0,
  ended?: () => void,
): { nodes: AudioScheduledSourceNode[]; out: GainNode } {
  const { into, out, nodes } = voiceChain(c, dest, shape, t);
  voices.forEach((v, k) => {
    const src = c.createBufferSource();
    src.buffer = k === 0 && first ? first : one;
    src.playbackRate.value = v.speed;
    const g = c.createGain();
    g.gain.value = Math.max(0, v.gain);
    src.connect(g).connect(into);
    const start = t + v.at;
    if (times > 0) {
      src.loop = times > 1;
      src.start(start);
      if (times > 1) src.stop(start + (times * src.buffer.duration) / v.speed);
    } else {
      src.loop = shape.voiceLoop;
      src.start(start);
    }
    if (k === 0 && ended) src.onended = ended;
    nodes.push(src);
  });
  return { nodes, out };
}

// ---- A whole text read by voices, each by itself ----

/** A layer of voices reading a whole text: its shape (robot, turning, loop, silence) and whether reversed. */
export interface ReadLayer {
  shape: VoiceShape;
  reverse: boolean;
}

/** Voices reading a whole text, each by itself. */
export interface TextRead {
  /** What is read and how (the same again: it goes on as it is, never jumping). */
  key: string;
  /** How many phrases the text has. */
  phrases: number;
  layers: ReadLayer[];
  /** Each voice: its layer, when it starts (s), its speed and loudness. */
  voices: (VoiceAt & { layer: number })[];
  /** A phrase as a layer's voice says it: its file. */
  say(layer: number, phrase: number): Promise<string>;
}

export interface TextVoices {
  /** Every voice reads the text from its first phrase at its own speed, round and round (if its layer loops). */
  play(r: TextRead): boolean;
  stop(): void;
  /** How many voices are reading now. */
  reading(): number;
}

/** The phrases kept said and decoded (the voices on one text share them). */
const READ_KEEP = 48;
/** Sayings asked of the phone at once (so the main voice's next phrase never waits behind them). */
const READ_ASKS = 2;

/**
 * Voices reading a whole text, each by itself from the first phrase, at its
 * own speed, never waiting for another or for the main voice: each phrase
 * played as its layer's voice says it, its silence after it, then the next;
 * after the last, the first again (its layer looping). Each phrase is said by
 * the phone once per voice and shared; what is near is made ahead.
 */
export function textVoices(): TextVoices {
  interface Reader {
    v: VoiceAt & { layer: number };
    g: GainNode;
    i: number;
    next: number;
    done: boolean;
    miss: number;
  }
  interface Run {
    r: TextRead;
    ctx: AudioContext;
    out: GainNode;
    chains: { into: AudioNode; nodes: AudioScheduledSourceNode[] }[];
    readers: Reader[];
    srcs: Set<AudioBufferSourceNode>;
    timer: number;
    ready: Map<string, AudioBuffer | null>;
    making: Set<string>;
    /** Sayings wanted, by when they are needed (the soonest asked first). */
    wanted: Map<string, { layer: number; phrase: number; need: number }>;
    asking: number;
  }
  let run: Run | null = null;
  const decoded = new Map<string, AudioBuffer>();
  let decodedAt = gen;
  const reversedOf = new WeakMap<AudioBuffer, AudioBuffer>();

  const reversed = (c: AudioContext, b: AudioBuffer) => {
    let r = reversedOf.get(b);
    if (!r) {
      r = c.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let ch = 0; ch < b.numberOfChannels; ch++) {
        const d = b.getChannelData(ch);
        const o = r.getChannelData(ch);
        const n = d.length;
        for (let k = 0; k < n; k++) o[k] = 0.5 * d[k]! + 0.5 * d[n - 1 - k]!;
      }
      reversedOf.set(b, r);
    }
    return r;
  };

  /** The sayings needed soonest asked of the phone, a few at a time. */
  const ask = (x: Run) => {
    while (x.asking < READ_ASKS && x.wanted.size) {
      let best: string | null = null;
      for (const [k, w] of x.wanted)
        if (best === null || w.need < x.wanted.get(best)!.need) best = k;
      const w = x.wanted.get(best!)!;
      x.wanted.delete(best!);
      x.making.add(best!);
      x.asking += 1;
      void make(x, best!, w.layer, w.phrase);
    }
  };

  const make = async (x: Run, k: string, layer: number, phrase: number) => {
    let buf: AudioBuffer | null = null;
    try {
      const url = await x.r.say(layer, phrase);
      buf = decoded.get(url) ?? null;
      if (!buf) {
        buf = await x.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        decoded.set(url, buf);
        while (decoded.size > READ_KEEP) decoded.delete(decoded.keys().next().value!);
      }
    } catch {
      buf = null;
    }
    x.asking -= 1;
    x.making.delete(k);
    if (run !== x) return;
    x.ready.set(k, buf);
    while (x.ready.size > READ_KEEP * 2) x.ready.delete(x.ready.keys().next().value!);
    pump(x);
  };

  const request = (x: Run, layer: number, phrase: number, need: number) => {
    const k = `${layer}|${phrase}`;
    if (x.ready.has(k) || x.making.has(k)) return;
    const w = x.wanted.get(k);
    if (!w || need < w.need) x.wanted.set(k, { layer, phrase, need });
  };

  const pump = (x: Run) => {
    if (run !== x) return;
    const n = x.r.phrases;
    const now = x.ctx.currentTime;
    // Hidden (the screen off, another app): further ahead, as the page wakes less often.
    const ahead = typeof document !== "undefined" && document.hidden ? 30 : 4;
    // What is wanted is asked again below, by when it is needed now.
    x.wanted.clear();
    for (const rd of x.readers) {
      const L = x.r.layers[rd.v.layer]!;
      const advance = () => {
        rd.i += 1;
        if (rd.i >= n) {
          if (L.shape.voiceLoop) rd.i = 0;
          else rd.done = true;
        }
      };
      let steps = 0;
      while (!rd.done && rd.next < now + ahead && steps++ < 64) {
        const k = `${rd.v.layer}|${rd.i}`;
        const b = x.ready.get(k);
        if (b === undefined) {
          request(x, rd.v.layer, rd.i, rd.next);
          break;
        }
        // Used: kept longest.
        x.ready.delete(k);
        x.ready.set(k, b);
        if (!b || b.duration <= 0) {
          // Not said (the voice could not): on to the next; none at all, it stops.
          if (++rd.miss > n) rd.done = true;
          else advance();
          continue;
        }
        rd.miss = 0;
        const src = x.ctx.createBufferSource();
        src.buffer = L.reverse ? reversed(x.ctx, b) : b;
        src.playbackRate.value = rd.v.speed;
        src.connect(rd.g);
        const at = Math.max(rd.next, now + 0.03);
        src.start(at);
        x.srcs.add(src);
        src.onended = () => {
          x.srcs.delete(src);
        };
        rd.next = at + (b.duration + L.shape.voiceGapMs / 1000) / rd.v.speed;
        advance();
      }
      // Its next phrase made ahead, so it never waits.
      if (!rd.done) request(x, rd.v.layer, rd.i, rd.next);
    }
    ask(x);
  };

  const stop = () => {
    const x = run;
    run = null;
    if (!x) return;
    window.clearInterval(x.timer);
    try {
      const t = x.ctx.currentTime;
      x.out.gain.cancelScheduledValues(t);
      x.out.gain.setValueAtTime(x.out.gain.value, t);
      x.out.gain.linearRampToValueAtTime(0, t + FADE);
      for (const src of x.srcs) src.stop(t + FADE + 0.01);
      for (const c of x.chains) for (const nd of c.nodes) nd.stop(t + FADE + 0.01);
    } catch {
      /* over already */
    }
  };

  return {
    play(r) {
      // Another rate: started afresh, what was made at the one before made again.
      if (decodedAt !== gen) {
        decodedAt = gen;
        decoded.clear();
        stop();
      }
      if (run?.r.key === r.key) return true;
      stop();
      if (!r.voices.length || r.phrases <= 0) return true;
      const ctx = context();
      if (!ctx) return false;
      const t = ctx.currentTime + 0.05;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(1, t + FADE);
      out.connect(ctx.destination);
      const chains = r.layers.map((L) => voiceChain(ctx, out, L.shape, t));
      const readers = r.voices.map((v) => {
        const g = ctx.createGain();
        g.gain.value = Math.max(0, v.gain);
        g.connect(chains[v.layer]!.into);
        return { v, g, i: 0, next: t + v.at, done: false, miss: 0 };
      });
      const x: Run = {
        r,
        ctx,
        out,
        chains,
        readers,
        srcs: new Set(),
        timer: 0,
        ready: new Map(),
        making: new Set(),
        wanted: new Map(),
        asking: 0,
      };
      run = x;
      x.timer = window.setInterval(() => pump(x), 250);
      pump(x);
      return true;
    },
    stop,
    reading() {
      return run ? run.readers.filter((rd) => !rd.done).length : 0;
    },
  };
}
