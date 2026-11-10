/**
 * The timed set's alarm: the phrase itself as sound, made the way Rehearse
 * sounds a phrase (its raw UTF-8 bytes as a wave, fitted to Rehearse's length
 * and raised to its peak loudness, both set in the Rehearse tab), played
 * `repeats` times with `gapMs` between. Tuned in reps.alarm in config.json.
 *
 * In the Android app (PhraseAlarmPlugin.java) it is rung by whichever of three
 * ways gets there first, once: the phone's own alarm clock, the app's own timer
 * (the phone kept awake till then), or the page when it sees the time is up. It
 * plays on the alarm sound (not media). How loud is a knob from 0.01 to 1: a
 * level below the phone's full alarm volume, even steps of dB over 70 dB
 * (alarmDb: 1 is full, 0.9 is -7 dB, 0.6 is -28 dB, 0.3 is -49 dB, quiet). The
 * phone's alarm volume goes to the step at
 * or just above that level while it rings (put back after) and the sound is
 * turned down the rest of the way, so it is never louder than asked. Elsewhere
 * the page plays it on its audio clock, that far below the media volume.
 *
 * After that first ring, until the set is answered (Done, Done and again, the
 * next part, or the set cancelled), it keeps calling, louder each time and
 * whatever the phone's volume: 3 s, then at 0.3; 6 s, then at 0.6; 9 s, then at
 * 0.9; and round again (NAG_WAITS, the same in AlarmRun.java; the three levels are
 * set in the Reps tab, 0.3, 0.6 and 0.9 to start). On the phone
 * the app stays in the foreground with a notification meanwhile, so it calls
 * with the screen off too. The sound itself is pure (alarmSamples, pcm16,
 * alarmMs), so the tests can load it; playing it needs a page.
 */
import { CONFIG } from "./config.ts";
import {
  defaultSettings,
  loadRehearse,
  phraseSignal,
  REHEARSE_KEY,
  type RehearseSettings,
  type SoundEncoding,
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
export type AlarmSound = Pick<RehearseSettings, "signalMs" | "amp" | "rawRate"> & {
  encoding?: SoundEncoding;
};

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
  // One play at most as long as the whole alarm may be.
  const one = phraseSignal(text, rate, {
    ...sound,
    signalMs: Math.min(sound.signalMs, MAX_ALARM_MS),
  });
  const gap = Math.round((rate * spec.gapMs) / 1000);
  const most = Math.round((rate * MAX_ALARM_MS) / 1000);
  let repeats = Math.max(1, spec.repeats);
  while (repeats > 1 && repeats * one.length + (repeats - 1) * gap > most) repeats--;
  const out = new Float32Array(repeats * one.length + (repeats - 1) * gap);
  for (let r = 0; r < repeats; r++) out.set(one, r * (one.length + gap));
  return out;
}

/** After the first ring, till the set is answered: the wait before each call (ms, from the end of the ring before), as in AlarmRun.java. */
export const NAG_WAITS: readonly number[] = [3000, 6000, 9000];

/** The calls, round and round: each one's wait and its level (the same knob as the setting). */
export function nagSteps(calls: readonly number[]): { waitMs: number; volume: number }[] {
  return NAG_WAITS.map((waitMs, i) => ({
    waitMs,
    volume: clamp(calls[i] ?? [0.3, 0.6, 0.9][i]!, 0.01, 1),
  }));
}

/** The calls' levels as config.json starts them (0.3, 0.6, 0.9). */
const CALLS: readonly number[] = CONFIG.reps.alarm.calls ?? [0.3, 0.6, 0.9];

/** How long one ring lasts (ms): its plays and the gaps between, as alarmSamples makes them. */
export function alarmMs(sound: AlarmSound, spec: AlarmSpec): number {
  const one = Math.min(sound.signalMs, MAX_ALARM_MS);
  let repeats = Math.max(1, spec.repeats);
  while (repeats > 1 && repeats * one + (repeats - 1) * spec.gapMs > MAX_ALARM_MS) repeats--;
  return repeats * one + (repeats - 1) * spec.gapMs;
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
    title: string;
    call1: number;
    call2: number;
    call3: number;
  }): Promise<{ at: string; way: string; error: string }>;
  cancel(o: { id: string }): Promise<void>;
  stopAll(): Promise<void>;
  fire(o: {
    id: string;
    rate: number;
    volume: number;
    pcm: string;
    call1: number;
    call2: number;
    call3: number;
  }): Promise<{ rang: boolean }>;
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
  /** The asked level and the alarm step's own, in dB below full. */
  target?: number;
  stepDb?: number;
  error?: string;
}

/** The knob's whole range, in dB: 0.01 is nearly that far below full. */
export const ALARM_RANGE_DB = 70;

/** How far below full the alarm is, in dB, for a volume from 0.01 to 1: even steps (1 is 0, 0.9 is -7, 0.6 is -28, 0.3 is -49). */
export function alarmDb(volume: number): number {
  return ALARM_RANGE_DB * (clamp(volume, 0.01, 1) - 1);
}

/** The sound's own scale for a volume (when nothing else turns it down): its level as an amplitude. */
export function alarmGain(volume: number): number {
  return 10 ** (alarmDb(volume) / 20);
}

/** The Test button's words for how it rang. */
export function rungNote(r: Rung | null, volume: number): string {
  const level = `${Math.round(alarmDb(volume))} dB`;
  if (!r) return `Played by the page, ${level} below the media volume (not as a phone alarm).`;
  if (!r.played) return `The phone could not play it${r.error ? ` (${r.error})` : ""}.`;
  const at = `${r.during}/${r.max}`;
  const sound = `the sound at ${Math.round(r.gain * 100)}%`;
  const back = r.before >= 0 && r.before !== r.during ? `, back to ${r.before}/${r.max} after` : "";
  const kept = r.during === r.want ? "" : " (the phone kept its own)";
  return `Rang as an alarm ${level} below full: alarm volume ${at}${kept}, ${sound}${back}.`;
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
    gain.gain.value = alarmGain(volume);
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

/** The calls' levels for the phone: call1, call2, call3. */
function callsOf(calls: readonly number[]) {
  const [call1, call2, call3] = nagSteps(calls).map((n) => n.volume);
  return { call1: call1!, call2: call2!, call3: call3! };
}

/** An alarm's id: its moment. */
const alarmId = (atMs: number) => `t${Math.round(atMs)}`;

/** The page's own calls after the first ring (no phone), by alarm id: what stops them. */
const pageNags = new Map<string, () => void>();

/** Without the phone: the page calls again (nagSteps), till stopped. The first ring is the one at atMs. */
function startPageNag(text: string, atMs: number, calls: readonly number[]) {
  const NAG = nagSteps(calls);
  const id = alarmId(atMs);
  if (pageNags.has(id)) return;
  const ring = alarmMs(rehearseSound(), alarmSpec());
  let stopped = false;
  let timer = 0;
  let sound: () => void = () => {};
  const call = (k: number, wait: number) => {
    timer = window.setTimeout(() => {
      if (stopped) return;
      const step = NAG[k % NAG.length]!;
      sound = pageAlarm(text, Date.now(), step.volume);
      call(k + 1, ring + NAG[(k + 1) % NAG.length]!.waitMs);
    }, wait);
  };
  call(0, Math.max(0, atMs + ring - Date.now()) + NAG[0]!.waitMs);
  pageNags.set(id, () => {
    stopped = true;
    window.clearTimeout(timer);
    sound();
  });
}

function stopPageNag(atMs: number) {
  const id = alarmId(atMs);
  pageNags.get(id)?.();
  pageNags.delete(id);
}

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
  calls: readonly number[] = CALLS,
): () => void {
  let cancelled = false;
  let stop: () => void = () => {};
  void phoneAlarm().then((phone) => {
    if (cancelled) return;
    if (!phone) {
      const sound = pageAlarm(text, atMs, volume);
      stop = () => {
        sound();
        stopPageNag(atMs);
      };
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
        title: text.slice(0, 80),
        ...callsOf(calls),
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
 * Time's up, seen by the page: on the phone it starts the alarm for that moment
 * now (the ring, then the calls till answered), unless it has started already.
 * Without the phone the page has the ring on its audio clock, and starts its
 * own calls after it.
 */
export function ringAlarmNow(
  text: string,
  atMs: number,
  volume = CONFIG.reps.alarm.volume,
  calls: readonly number[] = CALLS,
) {
  void phoneAlarm().then((phone) => {
    if (!phone) return startPageNag(text, atMs, calls);
    void phone.api
      .fire({
        id: alarmId(atMs),
        rate: ALARM_RATE,
        volume: clamp(volume, 0.01, 1),
        pcm: phonePcm(text),
        ...callsOf(calls),
      })
      .catch(() => {});
  });
}

/** The set was answered: the alarm for that moment stops, waiting or calling. */
export function stopAlarm(atMs: number) {
  stopPageNag(atMs);
  void phoneAlarm().then((phone) => {
    if (phone) void phone.api.cancel({ id: alarmId(atMs) }).catch(() => {});
  });
}

/** At the app's start: with no set running, any alarm still waiting or calling is stale, and stops. */
export function settleAlarms(setRunning: boolean) {
  if (setRunning) return;
  void phoneAlarm().then((phone) => {
    if (phone) void phone.api.stopAll().catch(() => {});
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
