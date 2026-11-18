/**
 * The robot voices as raw binary (Rehearse's Sound tab): for a phrase, every heard
 * layer and copy of the phone's voice saying it is mixed as one (ttsExport.ts
 * voiceMix) and kept as that mix's own bytes (rehearse.ts mixBytes: its samples as
 * the app holds them, nothing re-encoded: no PCM, that is for the text), so the
 * phrase's sound can read them as raw samples (bits, bytes, or both) and mix them
 * in (phraseSignal). The phone says a phrase in a moment or two, so a phrase's
 * sound starts without them and takes them in the moment they are ready
 * (subscribeVoiceRaw). Only in the Android app: a browser's voice cannot be recorded.
 */
import {
  heardVoices,
  MAX_BIT_BYTES,
  mixBytes,
  voiceReadings,
  type RehearseSettings,
} from "@/game/rehearse";
import { soundLog } from "@/game/soundLog";
import { sizeOf, voiceMix, VOICE_RAW_RATE } from "@/game/ttsExport";

interface Entry {
  state: "making" | "ready" | "error";
  /** When it was asked for (ms). */
  at: number;
  bytes: Uint8Array | null;
  /** The mix's length (s), how far it is while it is made (0..1) and what it is doing, and why it failed. */
  seconds: number;
  part: number;
  doing: string;
  error: string;
}

/** What the mix depends on: the text and every heard layer (its voice, speed and copies). */
export function voiceRawKey(text: string, set: RehearseSettings): string {
  return JSON.stringify([
    text,
    set.voiceEngine,
    heardVoices(set).map((h) => [h.layer, h.voices.length]),
  ]);
}

const made = new Map<string, Entry>();
/** A mix that could not be made is not tried again for this long (ms), so a missing voice is not asked for over and over. */
const RETRY_MS = 20_000;
/** Mixes kept (newest last). */
const KEEP = 8;
const subs = new Set<() => void>();

function told() {
  for (const fn of subs) fn();
}

/** Called when a phrase's voices are made, are being made (a step on), or could not be. Gives back what takes it away. */
export function subscribeVoiceRaw(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** The phrase's voices as raw bytes, if made, and what identifies them; null while they are not. */
export function voiceBytesFor(
  text: string,
  set: RehearseSettings,
): { bytes: Uint8Array; tag: string } | null {
  const key = voiceRawKey(text, set);
  const e = made.get(key);
  return e?.state === "ready" && e.bytes ? { bytes: e.bytes, tag: `${e.at}:${e.bytes.length}` } : null;
}

const quoted = (text: string) => `"${text.length > 28 ? `${text.slice(0, 27)}…` : text}"`;

/** Starts making the phrase's voices as raw bytes, if they are not made or being made. */
export function prepareVoiceRaw(text: string, set: RehearseSettings): void {
  if (!text.trim()) return;
  const key = voiceRawKey(text, set);
  const had = made.get(key);
  if (had && (had.state !== "error" || Date.now() - had.at < RETRY_MS)) return;
  const entry: Entry = {
    state: "making",
    at: Date.now(),
    bytes: null,
    seconds: 0,
    part: 0,
    doing: "",
    error: "",
  };
  made.set(key, entry);
  if (made.size > KEEP) made.delete(made.keys().next().value!);
  const heard = heardVoices(set);
  const voices = heard.reduce((n, h) => n + h.voices.length, 0);
  soundLog(
    `Voices as raw: making ${quoted(text)}: ${voices} voice${voices === 1 ? "" : "s"} in ${heard.length} layer${heard.length === 1 ? "" : "s"}, mixed as one`,
  );
  let lastPart = -1;
  void voiceMix(text, set, VOICE_RAW_RATE, undefined, (doing, part) => {
    entry.doing = doing;
    entry.part = part;
    // The note moves on in tenths, not on every step.
    const tenth = Math.floor(part * 10);
    if (tenth !== lastPart) {
      lastPart = tenth;
      told();
    }
  })
    .then((mix) => {
      entry.bytes = mixBytes(mix);
      entry.seconds = mix.length / VOICE_RAW_RATE;
      entry.state = "ready";
      soundLog(
        `Voices as raw: ready, ${entry.seconds.toFixed(1)} s of them = ${entry.bytes.length.toLocaleString()} raw bytes, taken into the sound`,
      );
    })
    .catch((e: unknown) => {
      entry.state = "error";
      entry.error = e instanceof Error ? e.message : "The voices could not be made";
      soundLog(`Voices as raw: could not be made: ${entry.error}`, "error");
    })
    .finally(told);
}

/** How the phrase's voices stand, for the Sound tab. */
export function voiceRawStatus(
  text: string,
  set: RehearseSettings,
): { state: "none" | "making" | "ready" | "error"; note: string; bytes: number; seconds: number } {
  const e = made.get(voiceRawKey(text, set));
  if (!e) return { state: "none", note: "", bytes: 0, seconds: 0 };
  if (e.state === "making")
    return {
      state: "making",
      note: `${e.doing || "The phone is saying this phrase for each voice…"}${e.part > 0 ? ` ${Math.round(e.part * 100)}%` : ""}`,
      bytes: 0,
      seconds: 0,
    };
  if (e.state === "error") return { state: "error", note: e.error, bytes: 0, seconds: 0 };
  const n = e.bytes?.length ?? 0;
  return { state: "ready", note: "", bytes: n, seconds: e.seconds };
}

/**
 * What to tell, under the voices row, about the phrase's voices as raw binary: being
 * made by the phone (and how far), in the sound (how much, read how), or why not. Null
 * with the row off.
 */
export function voiceRawLine(
  text: string,
  set: RehearseSettings,
): { text: string; bad: boolean } | null {
  if (set.voiceRaw === "off") return null;
  const say = (s: string, bad = false) => ({ text: s, bad });
  if (!set.sound) return say("Sound is off above: turn it on to hear the voices as raw binary.");
  if (!set.voice) return say("The robot voice is off below, so there are no voices to read: turn it on.");
  if (!text) return say("Choose a phrase first.");
  const st = voiceRawStatus(text, set);
  if (st.state === "error") return say(`The voices could not be made: ${st.note}`, true);
  if (st.state === "making") return say(`${st.note} Until they are in, the sound is the phrase's own bytes.`);
  if (st.state === "none") return say("The phone is about to say the phrase for each voice. (Only in the Android app.)");
  const readings = voiceReadings(set.voiceRaw);
  const as = readings.map((r) => (r === "bits" ? "raw bits" : "raw bytes")).join(" and ");
  const cut =
    readings.includes("bits") && st.bytes > MAX_BIT_BYTES
      ? ` (the bits of the first ${sizeOf(MAX_BIT_BYTES)})`
      : "";
  return say(
    `The voices are in the sound: ${st.seconds.toFixed(1)} s of them, ${sizeOf(st.bytes)} of raw binary, read as ${as}${cut}, mixed with the phrase's own bytes.`,
  );
}
