/**
 * The robot voices as raw binary (Rehearse's Sound tab): for what the voices are of
 * (a phrase, or in Whole texts the whole text: rehearse.ts VoiceSubject), every
 * heard layer and copy of the phone's voice saying it is mixed as one (ttsExport.ts
 * voiceMix, as its .tts.wav is) and kept as that mix's own bytes (rehearse.ts
 * mixBytes: its samples as the app holds them, nothing re-encoded: no PCM, that is
 * for the text), so the sound can read them, all of them, as raw samples (bits,
 * bytes, or both) and mix them in (phraseSignal). The phone says a phrase in a
 * moment or two (a text takes longer, and the note says how far it is), so a sound
 * starts without them and takes them in the moment they are ready
 * (subscribeVoiceRaw). Only in the Android app: a browser's voice cannot be recorded.
 */
import {
  heardVoices,
  mixBytes,
  voiceReadingFits,
  type RehearseSettings,
  type VoiceSubject,
} from "@/game/rehearse";
import { soundLog } from "@/game/soundLog";
import { clockOf, sizeOf, TTS_STOPPED, voiceMix, VOICE_RAW_RATE } from "@/game/ttsExport";

interface Entry {
  state: "making" | "ready" | "error";
  /** When it was asked for (ms). */
  at: number;
  bytes: Uint8Array | null;
  /** The mix's length (s) and rate (Hz), how far it is while it is made (0..1) and what it is doing, and why it failed. */
  seconds: number;
  rate: number;
  part: number;
  doing: string;
  error: string;
  /** No longer wanted: it stops at the next step. */
  stop: boolean;
}

/** What the mix depends on: what the voices are of, and every heard layer (its voice, speed and copies). */
export function voiceRawKey(subject: VoiceSubject, set: RehearseSettings): string {
  return JSON.stringify([
    subject.whole,
    subject.id,
    set.voiceEngine,
    heardVoices(set).map((h) => [h.layer, h.voices.length]),
  ]);
}

const made = new Map<string, Entry>();
/** A mix that could not be made is not tried again for this long (ms), so a missing voice is not asked for over and over. */
const RETRY_MS = 20_000;
/** Mixes kept (newest last), and the most memory they may take together (bytes). */
const KEEP = 8;

const subs = new Set<() => void>();

function told() {
  for (const fn of subs) fn();
}

/** Called when voices are made, are being made (a step on), or could not be. Gives back what takes it away. */
export function subscribeVoiceRaw(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** The voices as raw bytes, if made, and what identifies them; null while they are not. */
export function voiceBytesFor(
  subject: VoiceSubject,
  set: RehearseSettings,
): { bytes: Uint8Array; tag: string } | null {
  const e = made.get(voiceRawKey(subject, set));
  return e?.state === "ready" && e.bytes ? { bytes: e.bytes, tag: `${e.at}:${e.bytes.length}` } : null;
}

/** "412 ms", "3.1 s", "2:03": how long the voices, or a reading of them, last. */
const lasts = (ms: number) =>
  ms < 1000
    ? `${Math.max(1, Math.round(ms))} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : clockOf(ms / 1000);

const quoted = (text: string) => `"${text.length > 28 ? `${text.slice(0, 27)}…` : text}"`;

/** The oldest mixes go when there are too many, or they hold too much (the newest stays). */
function trim() {
  for (const [k, e] of made) {
    if (made.size <= 1) break;
    if (made.size <= KEEP) break;
    if (e.state === "making") continue;
    made.delete(k);
  }
}

/** Nothing is wanted now: whatever is being made stops. */
export function releaseVoiceRaw(): void {
  for (const e of made.values()) if (e.state === "making") e.stop = true;
}

/**
 * Starts making the voices as raw bytes, if they are not made or being made. It is
 * the one thing wanted: any other still being made is let go (a text takes minutes).
 */
export function prepareVoiceRaw(subject: VoiceSubject, set: RehearseSettings): void {
  const key = voiceRawKey(subject, set);
  for (const [k, e] of made) if (k !== key && e.state === "making") e.stop = true;
  const had = made.get(key);
  if (had && (had.state !== "error" || Date.now() - had.at < RETRY_MS)) {
    had.stop = false;
    return;
  }
  const entry: Entry = {
    state: "making",
    at: Date.now(),
    bytes: null,
    seconds: 0,
    rate: VOICE_RAW_RATE,
    part: 0,
    doing: "",
    error: "",
    stop: false,
  };
  // The newest (a retried one moves to the end of the line too).
  made.delete(key);
  made.set(key, entry);
  const heard = heardVoices(set);
  const voices = heard.reduce((n, h) => n + h.voices.length, 0);
  soundLog(
    `Voices as raw: making ${subject.whole ? `the whole text (${subject.phrases.length.toLocaleString()} phrases)` : quoted(subject.phrases[0] ?? "")}: ${voices} voice${voices === 1 ? "" : "s"} in ${heard.length} layer${heard.length === 1 ? "" : "s"}, mixed as one`,
  );
  let lastPart = -1;
  void voiceMix(
    { kind: subject.whole ? "text" : "phrase", phrases: subject.phrases },
    set,
    undefined,
    (doing, part) => {
      entry.doing = doing;
      entry.part = part;
      // The note moves on in hundredths of the way, not on every step.
      const step = Math.floor(part * 100);
      if (step !== lastPart) {
        lastPart = step;
        told();
      }
    },
    () => entry.stop,
  )
    .then((mix) => {
      entry.bytes = mixBytes(mix.samples);
      entry.seconds = mix.seconds;
      entry.rate = mix.rate;
      entry.state = "ready";
      trim();
      soundLog(
        `Voices as raw: ready, ${lasts(entry.seconds * 1000)} of them = ${entry.bytes.length.toLocaleString()} raw bytes, taken into the sound`,
      );
    })
    .catch((e: unknown) => {
      if (e instanceof Error && e.message === TTS_STOPPED) {
        // Let go (something else is wanted): not a failure.
        if (made.get(key) === entry) made.delete(key);
        return;
      }
      entry.state = "error";
      entry.error = e instanceof Error ? e.message : "The voices could not be made";
      soundLog(`Voices as raw: could not be made: ${entry.error}`, "error");
    })
    .finally(told);
}

/** How the voices stand, for the Sound tab. */
export function voiceRawStatus(
  subject: VoiceSubject,
  set: RehearseSettings,
): {
  state: "none" | "making" | "ready" | "error";
  note: string;
  bytes: number;
  seconds: number;
  rate: number;
} {
  const e = made.get(voiceRawKey(subject, set));
  const none = { note: "", bytes: 0, seconds: 0, rate: VOICE_RAW_RATE };
  if (!e) return { state: "none", ...none };
  if (e.state === "making")
    return {
      state: "making",
      ...none,
      note: `${e.doing || "The phone is saying it for each voice…"}${e.part > 0 ? ` ${Math.round(e.part * 100)}%` : ""}, ${clockOf((Date.now() - e.at) / 1000)} so far${e.part > 0.02 ? `, about ${clockOf(((Date.now() - e.at) / 1000) * (1 / e.part - 1))} left` : ""}.`,
    };
  if (e.state === "error") return { state: "error", ...none, note: e.error };
  return {
    state: "ready",
    note: "",
    bytes: e.bytes?.length ?? 0,
    seconds: e.seconds,
    rate: e.rate,
  };
}

/**
 * What to tell, under the voices row, about the voices as raw binary: being
 * made by the phone (and how far), in the sound (how much, read how, how long a
 * pass of it lasts), or why not. Null with the row off.
 */
export function voiceRawLine(
  subject: VoiceSubject | null,
  set: RehearseSettings,
): { text: string; bad: boolean } | null {
  if (set.voiceRaw === "off") return null;
  const say = (s: string, bad = false) => ({ text: s, bad });
  if (!set.sound) return say("Sound is off above: turn it on to hear the voices as raw binary.");
  if (!set.voice) return say("The robot voice is off below, so there are no voices to read: turn it on.");
  if (!subject) return say("Choose a phrase first.");
  const of = subject.whole ? "the whole text" : "this phrase";
  const st = voiceRawStatus(subject, set);
  if (st.state === "error") return say(`The voices could not be made: ${st.note}`, true);
  if (st.state === "making")
    return say(`The voices of ${of}: ${st.note} Until they are in, the sound is the phrase's own bytes.`);
  if (st.state === "none")
    return say(`The phone is about to say ${of} for each voice. (Only in the Android app.)`);
  const passes = voiceReadingFits(st.bytes, set)
    .map(
      (f) =>
        `${f.reading === "bits" ? "bits" : "bytes"} ${lasts(f.naturalMs)}${f.speed > 1 ? `, sped up ×${f.speed.toFixed(1)} to fit one play` : ""}`,
    )
    .join("; ");
  return say(
    `The voices of ${of} are in the sound: ${lasts(st.seconds * 1000)} of them, ${sizeOf(st.bytes)} of raw binary, all of it read, then round again. One pass at the raw rate: ${passes}. Mixed with the phrase's own bytes.`,
  );
}
