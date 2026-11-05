/**
 * The timed set's alarm: the phrase itself as sound, made the way Rehearse
 * sounds a phrase (its raw UTF-8 bytes as a wave, fitted to Rehearse's length
 * and raised to its peak loudness, both set in the Rehearse tab), played
 * `repeats` times with `gapMs` between. Tuned in reps.alarm in config.json.
 *
 * In the Android app it is set with the phone's own alarm clock
 * (PhraseAlarmPlugin.java), so it rings on time with the screen off or the app
 * away, on the alarm sound (not media), with the phone's alarm volume set to the
 * chosen share (0.36) while it rings and put back after. Elsewhere the page
 * plays it on its audio clock. The sound itself is pure (alarmSamples, pcm16),
 * so the tests can load it; playing it needs a page.
 */
import { CONFIG } from "./config.ts";
import {
  defaultSettings,
  loadRehearse,
  phraseSignal,
  REHEARSE_KEY,
  type RehearseSettings,
} from "./rehearse.ts";

/** The longest the alarm lasts (ms): fewer repeats if one is long. */
export const MAX_ALARM_MS = 8000;
/** The sample rate the alarm is made at. */
export const ALARM_RATE = 22_050;

export interface AlarmSpec {
  /** Times played, and the silence between (ms). */
  repeats: number;
  gapMs: number;
}

/** How the phrase sounds: Rehearse's length, raw rate and peak. */
export type AlarmSound = Pick<RehearseSettings, "signalMs" | "amp" | "rawRate">;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** The alarm as set in config.json, each number kept sensible. */
export function alarmSpec(): AlarmSpec {
  const A = CONFIG.reps.alarm;
  return {
    repeats: Math.round(clamp(A.repeats, 1, 20)),
    gapMs: clamp(A.gapMs, 0, 5000),
  };
}

/**
 * The alarm's samples at a sample rate: the phrase's signal (as Rehearse makes
 * it), `repeats` times with `gapMs` of silence between, as many as fit in
 * MAX_ALARM_MS (at least one). Its loudest point is the sound's amp.
 */
export function alarmSamples(
  text: string,
  rate: number,
  sound: AlarmSound,
  spec: AlarmSpec,
): Float32Array<ArrayBuffer> {
  const one = phraseSignal(text, rate, sound);
  const gap = Math.round((rate * spec.gapMs) / 1000);
  const most = Math.round((rate * MAX_ALARM_MS) / 1000);
  let repeats = Math.max(1, spec.repeats);
  while (repeats > 1 && repeats * one.length + (repeats - 1) * gap > most) repeats--;
  const out = new Float32Array(repeats * one.length + (repeats - 1) * gap);
  for (let r = 0; r < repeats; r++) out.set(one, r * (one.length + gap));
  return out;
}

/** Samples as 16-bit PCM, little-endian, for the phone. */
export function pcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((v, i) => view.setInt16(i * 2, Math.round(clamp(v, -1, 1) * 32767), true));
  return out;
}

/** Bytes as base64 (in chunks, so a long sound does not overflow the call stack). */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// ---- Playing it (a page only) ----

/** Rehearse's sound settings, as saved (its defaults if none). */
export function rehearseSound(): AlarmSound {
  try {
    const raw = localStorage.getItem(REHEARSE_KEY);
    return loadRehearse(raw ? JSON.parse(raw) : null).settings;
  } catch {
    return defaultSettings();
  }
}

/** The Android app's alarm: PhraseAlarmPlugin.java. */
interface PhraseAlarmApi {
  schedule(o: {
    id: string;
    delay: number;
    rate: number;
    volume: number;
    pcm: string;
  }): Promise<{ exact: boolean }>;
  cancel(o: { id: string }): Promise<void>;
  play(o: { rate: number; volume: number; pcm: string }): Promise<void>;
}

let native: Promise<{ api: PhraseAlarmApi } | null> | null = null;

/** The phone's alarm, in the Android app only (wrapped: a plugin is not a promise's result). */
function phoneAlarm(): Promise<{ api: PhraseAlarmApi } | null> {
  native ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? { api: registerPlugin<PhraseAlarmApi>("PhraseAlarm") }
        : null,
    )
    .catch(() => null);
  return native;
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

/** The page plays it at a moment (ms, like Date.now()), on the audio clock; gives back what stops it. */
function pageAlarm(text: string, atMs: number): () => void {
  const ctx = context();
  const sound = rehearseSound();
  if (!ctx || sound.amp <= 0) return () => {};
  try {
    const data = alarmSamples(text, ctx.sampleRate, sound, alarmSpec());
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

/** The alarm's sound for the phone: 16-bit PCM in base64. */
function phonePcm(text: string): string {
  return toBase64(pcm16(alarmSamples(text, ALARM_RATE, rehearseSound(), alarmSpec())));
}

/**
 * Sets the alarm for a phrase at a moment (ms, like Date.now()), at a share of
 * the phone's alarm volume (the Android app); gives back what cancels it. If the
 * phone's alarm cannot be set, the page plays it instead.
 */
export function scheduleAlarm(
  text: string,
  atMs: number,
  volume = CONFIG.reps.alarm.volume,
): () => void {
  let cancelled = false;
  let stop: () => void = () => {};
  void phoneAlarm().then((phone) => {
    if (cancelled) return;
    if (!phone) {
      stop = pageAlarm(text, atMs);
      return;
    }
    const id = `t${Math.round(atMs)}`;
    stop = () => void phone.api.cancel({ id }).catch(() => {});
    phone.api
      .schedule({
        id,
        delay: Math.max(0, Math.round(atMs - Date.now())),
        rate: ALARM_RATE,
        volume: clamp(volume, 0.05, 1),
        pcm: phonePcm(text),
      })
      .catch(() => {
        if (!cancelled) stop = pageAlarm(text, atMs);
      });
  });
  return () => {
    cancelled = true;
    stop();
  };
}

/** The alarm now, as it will sound (the Test button). */
export function playAlarmNow(text: string, volume = CONFIG.reps.alarm.volume) {
  void phoneAlarm().then((phone) => {
    if (!phone) return void pageAlarm(text, Date.now());
    phone.api
      .play({ rate: ALARM_RATE, volume: clamp(volume, 0.05, 1), pcm: phonePcm(text) })
      .catch(() => pageAlarm(text, Date.now()));
  });
}
