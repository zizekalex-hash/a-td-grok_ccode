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
      audio = new AC();
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
export interface VoicePlayer {
  /** recordSec above 0: its copies recorded once, that long, then that one sound looped (light for the phone). */
  play(url: string, shape: VoiceShape, recordSec?: number): Promise<boolean>;
  stop(): void;
}

export function voicePlayer(): VoicePlayer {
  let now: { nodes: AudioScheduledSourceNode[]; out: GainNode; key: string } | null = null;
  const made = new Map<string, AudioBuffer>();
  let asked = "";

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
    async play(url, shape, recordSec = 0) {
      const key = JSON.stringify([url, shape, recordSec]);
      asked = key;
      if (now?.key === key) return true;
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
        const gap = shape.voiceLoop ? Math.round((buf.sampleRate * shape.voiceGapMs) / 1000) : 0;
        const one = ctx.createBuffer(1, buf.length + gap, buf.sampleRate);
        const mono = one.getChannelData(0);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < d.length; i++) mono[i] = mono[i]! + d[i]! / buf.numberOfChannels;
        }
        const t = ctx.currentTime;
        const fade = ctx.createGain();
        fade.gain.setValueAtTime(0, t);
        fade.gain.linearRampToValueAtTime(1, t + FADE);
        fade.connect(ctx.destination);
        let nodes: AudioScheduledSourceNode[];
        if (recordSec && recordSec > 0 && shape.voiceLoop) {
          // Recorded once (all its copies), then that one sound looped.
          const off = new OfflineAudioContext(
            2,
            Math.max(1, Math.round(one.sampleRate * recordSec)),
            one.sampleRate,
          );
          voiceGraph(off, off.destination, one, shape, 0);
          const rec = await off.startRendering();
          if (asked !== key) return false;
          const src = ctx.createBufferSource();
          src.buffer = rec;
          src.loop = true;
          src.connect(fade);
          src.start(t);
          nodes = [src];
        } else nodes = voiceGraph(ctx, fade, one, shape, t).nodes;
        const out = fade;
        fadeOut(now);
        now = { nodes, out, key };
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

/** The voice's copies, robot and turning, played from t into dest (live, or recorded). */
function voiceGraph(
  c: BaseAudioContext,
  dest: AudioNode,
  one: AudioBuffer,
  shape: VoiceShape,
  t: number,
): { nodes: AudioScheduledSourceNode[]; out: GainNode } {
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
  voiceSpeeds(shape).forEach((speed, k) => {
    const src = c.createBufferSource();
    src.buffer = one;
    src.loop = shape.voiceLoop;
    src.playbackRate.value = speed;
    // The first is the main voice (its volume); the copies have theirs.
    const g = c.createGain();
    g.gain.value = Math.max(0, k === 0 ? shape.voiceVolume : shape.voiceCopiesVolume);
    src.connect(g).connect(into);
    src.start(t + (k * shape.voiceSpreadMs) / 1000);
    nodes.push(src);
  });
  return { nodes, out };
}
