/**
 * A phrase's sound playing all the time: Rehearse's Nonstop and the Read tab's
 * phrase sound. The current phrase's sound as Rehearse shapes it (steady, or
 * the rising cycle; game/rehearse.ts soundOf), looped with no gap; when the
 * phrase (or a setting) changes, the new one fades in as the old fades out.
 * Each player plays one phrase at a time. Needs a page.
 */
import {
  defaultSettings,
  loadRehearse,
  REHEARSE_KEY,
  soundOf,
  wavSampleRate,
  type RehearseSettings,
} from "./rehearse.ts";

export type LoopSound = Pick<
  RehearseSettings,
  "signalMs" | "amp" | "rawRate" | "mode" | "plays" | "topSpeed"
>;

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
        sound.mode,
        sound.plays,
        sound.topSpeed,
        ctx.sampleRate,
      ]);
      if (now?.key === key) return;
      let buf = made.get(key);
      if (!buf) {
        const data = soundOf(text, ctx.sampleRate, sound);
        buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
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

/** A sound file looping as it is (a phrase's own .wav): nothing cut or changed, only its gain. */
export interface FileLoop {
  /** Plays the file at this address over and over (the same address again: only the gain changes). */
  play(url: string, gain: number): Promise<boolean>;
  gain(gain: number): void;
  stop(): void;
}

export function fileLoop(): FileLoop {
  let now: { src: AudioBufferSourceNode; gain: GainNode; url: string } | null = null;
  const made = new Map<string, { buf: AudioBuffer; ctx: AudioContext }>();
  let asked = "";

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
    async play(url, gain) {
      asked = url;
      if (now?.url === url) {
        now.gain.gain.setTargetAtTime(
          Math.max(0, Math.min(1, gain)),
          now.gain.context.currentTime,
          0.02,
        );
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
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, gain)), t + FADE);
      src.connect(g).connect(ctx.destination);
      src.start(t);
      fadeOut(now);
      now = { src, gain: g, url };
      return true;
    },
    gain(gain) {
      if (now)
        now.gain.gain.setTargetAtTime(
          Math.max(0, Math.min(1, gain)),
          now.gain.context.currentTime,
          0.02,
        );
    },
    stop() {
      asked = "";
      fadeOut(now);
      now = null;
    },
  };
}
