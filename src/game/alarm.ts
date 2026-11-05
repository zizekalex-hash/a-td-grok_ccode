/**
 * The timed set's alarm: the phrase itself as sound, made the way Rehearse
 * sounds a phrase (its raw UTF-8 bytes as a wave, fitted to Rehearse's length
 * and raised to its peak loudness, both set in the Rehearse tab), played
 * `repeats` times with `gapMs` between. Tuned in reps.alarm in config.json.
 *
 * In the Android app (PhraseAlarmPlugin.java) it is rung by whichever of three
 * ways gets there first, once: the phone's own alarm clock, the app's own timer
 * (the phone kept awake till then), or the page when it sees the time is up. It
 * plays on the alarm sound (not media), with the phone's alarm volume set to the
 * chosen share of its steps while it rings (0.36 of 15 steps is 5), put back
 * after; if the phone keeps its own volume, the sound is scaled to that share
 * instead. Never louder than asked. Elsewhere the page plays it on its audio
 * clock, at that share of the page's volume. The sound itself is pure (alarmSamples, pcm16),
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
  }): Promise<{ at: string; way: string; error: string }>;
  cancel(o: { id: string }): Promise<void>;
  fire(o: { id: string; rate: number; volume: number; pcm: string }): Promise<{ rang: boolean }>;
  play(o: { rate: number; volume: number; pcm: string }): Promise<Rung>;
  log(): Promise<{ log: string }>;
}

/** How the phone rang it: whether it played, its alarm volume before, asked for, while it rang (of max steps), and the sound's scale. */
export interface Rung {
  played: boolean;
  before: number;
  want: number;
  during: number;
  max: number;
  gain: number;
  error?: string;
}

/** The Test button's words for how it rang. */
export function rungNote(r: Rung | null, volume: number): string {
  const share = `${Math.round(volume * 100)}%`;
  if (!r) return `Played by the page at ${share} of the media volume (not as a phone alarm).`;
  if (!r.played) return `The phone could not play it${r.error ? ` (${r.error})` : ""}.`;
  const at = `${r.during}/${r.max}`;
  const scaled = r.gain < 0.995 ? `, the sound at ${Math.round(r.gain * 100)}%` : "";
  if (r.during === r.want) {
    const back =
      r.before >= 0 && r.before !== r.during ? `, back to ${r.before}/${r.max} after` : "";
    return `Rang as an alarm at ${at} of the phone's alarm volume (${share})${scaled}${back}.`;
  }
  return `Rang as an alarm: the phone kept its alarm volume at ${at}, so the sound was scaled to ${Math.round(r.gain * 100)}% of it (${share} in all).`;
}

/** What the rest screen says once the alarm is set. */
export function setNote(r: { at: string; way: string; error: string } | null): string {
  if (!r)
    return "The alarm could not be set on the phone: the app rings it when it sees the time is up.";
  if (r.error)
    return `Alarm at ${r.at}: the app's timer is set; the phone's alarm clock failed (${r.error}).`;
  return `Alarm at ${r.at}: the phone's ${r.way} and the app's timer, rung once.`;
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

/** The page plays it at a moment (ms, like Date.now()), on the audio clock, at a share of its volume; gives back what stops it. */
function pageAlarm(text: string, atMs: number, volume: number): () => void {
  const ctx = context();
  const sound = rehearseSound();
  if (!ctx || sound.amp <= 0) return () => {};
  try {
    const data = alarmSamples(text, ctx.sampleRate, sound, alarmSpec());
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = clamp(volume, 0, 1);
    src.connect(gain).connect(ctx.destination);
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

/** An alarm's id: its moment. */
const alarmId = (atMs: number) => `t${Math.round(atMs)}`;

/**
 * Sets the alarm for a phrase at a moment (ms, like Date.now()), at a share of
 * the phone's alarm volume (the Android app); gives back what cancels it, and
 * tells onStatus how it was set. Without the phone, the page plays it.
 */
export function scheduleAlarm(
  text: string,
  atMs: number,
  volume = CONFIG.reps.alarm.volume,
  onStatus?: (note: string) => void,
): () => void {
  let cancelled = false;
  let stop: () => void = () => {};
  void phoneAlarm().then((phone) => {
    if (cancelled) return;
    if (!phone) {
      stop = pageAlarm(text, atMs, volume);
      onStatus?.("The page rings it at the time (keep the app open and the screen on).");
      return;
    }
    const id = alarmId(atMs);
    stop = () => void phone.api.cancel({ id }).catch(() => {});
    phone.api
      .schedule({
        id,
        delay: Math.max(0, Math.round(atMs - Date.now())),
        rate: ALARM_RATE,
        volume: clamp(volume, 0.01, 1),
        pcm: phonePcm(text),
      })
      .then((r) => {
        if (!cancelled) onStatus?.(setNote(r));
      })
      .catch(() => {
        if (!cancelled) onStatus?.(setNote(null));
      });
  });
  return () => {
    cancelled = true;
    stop();
  };
}

/**
 * Time's up, seen by the page: on the phone it rings the alarm for that moment
 * now, unless it has rung already (one ring in all). Without the phone the page
 * already has it on its audio clock.
 */
export function ringAlarmNow(text: string, atMs: number, volume = CONFIG.reps.alarm.volume) {
  void phoneAlarm().then((phone) => {
    if (!phone) return;
    void phone.api
      .fire({
        id: alarmId(atMs),
        rate: ALARM_RATE,
        volume: clamp(volume, 0.01, 1),
        pcm: phonePcm(text),
      })
      .catch(() => {});
  });
}

/** The phone alarm's log, newest first ("" in a browser). */
export async function alarmLog(): Promise<string> {
  const phone = await phoneAlarm();
  if (!phone) return "";
  try {
    return (await phone.api.log()).log;
  } catch {
    return "";
  }
}

/** The alarm now, as it will sound (the Test button). */
export async function playAlarmNow(
  text: string,
  volume = CONFIG.reps.alarm.volume,
): Promise<string> {
  const v = clamp(volume, 0.01, 1);
  const phone = await phoneAlarm();
  if (phone) {
    try {
      return rungNote(
        await phone.api.play({ rate: ALARM_RATE, volume: v, pcm: phonePcm(text) }),
        v,
      );
    } catch {
      /* the page plays it */
    }
  }
  pageAlarm(text, Date.now(), v);
  return rungNote(null, v);
}
