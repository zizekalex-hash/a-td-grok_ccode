/**
 * The robot voice made into a .tts.wav, float32 at 48 to 384 kHz: every phrase
 * said by the phone once for each voice (the sayings are kept, so made again at
 * another rate or with other copies, nothing is said again), laid out and mixed
 * (ttsRender.ts), and written into the azs-folder a piece at a time, next to
 * the phrase's (or text's) .txt. In the phone app.
 */
import {
  folderName,
  folderStereo,
  folderStereoStop,
  folderWriter,
  type FolderWriter,
} from "@/game/azsFolder";
import {
  voiceLayersOf,
  voiceShapeOf,
  type RehearseSettings,
  type StereoKind,
} from "@/game/rehearse";
import {
  floatWavBytes,
  floatWavHeader,
  MAX_WAV_BYTES,
  ttsMixer,
  ttsPlan,
  ttsSource,
  wavMono,
  type TtsLayer,
  type TtsSource,
} from "@/game/ttsRender";
import { playTts } from "@/game/rehearseRun";
import { voiceFile } from "@/game/voice";

export interface TtsJob {
  /** "phrase": the phrase alone, every layer saying it; "text": the whole text (see ttsPlan). */
  kind: "phrase" | "text";
  phrases: string[];
  /** Where it goes in the azs-folder, like "input_pertext/Chloride.tts.wav". */
  path: string;
  /** Its sample rate (Hz). */
  rate: number;
}

export interface TtsMade {
  path: string;
  /** Its length (s), size (bytes) and rate (one channel). */
  seconds: number;
  bytes: number;
  rate: number;
  /** Sayings in it, and copies left out (too fast or slow). */
  sayings: number;
  skipped: number;
}

type VoiceSay = Pick<RehearseSettings, "voiceEngine" | "voiceName" | "voiceRate" | "voicePitch">;

/** What it works with: the phone's voice and the azs-folder (others in a test). */
export interface TtsDeps {
  /** The phrase said: an address of its .wav. */
  say(text: string, voice: VoiceSay): Promise<string>;
  /** Where the file is written (null: nowhere, and why). */
  writer(): Promise<FolderWriter | string>;
}

export const TTS_STOPPED = "Stopped";

/** About 4 MB a piece, written at a time. */
const PIECE_BYTES = 4 * 1024 * 1024;

const phone: TtsDeps = {
  say: voiceFile,
  async writer() {
    if (!(await folderName()))
      return "Choose the azs-folder first (above): the .tts.wav is saved in it, next to the .txt";
    return (await folderWriter("export.tts.wav")) ?? "Making a .tts.wav is in the Android app";
  },
};

/** Sayings read lately, by their address: made again soon, they are not read again. */
const kept = new Map<string, TtsSource>();
let keptSamples = 0;
const KEEP_SAMPLES = 24_000_000;

async function decoded(bytes: Uint8Array): Promise<{ samples: Float32Array; rate: number }> {
  const Off = globalThis.OfflineAudioContext;
  if (!Off) throw new Error("The voice's sound could not be read");
  const b = await new Off(1, 1, 48_000).decodeAudioData(bytes.slice().buffer);
  const samples = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) samples[i] = samples[i]! + d[i]! / b.numberOfChannels;
  }
  return { samples, rate: b.sampleRate };
}

async function load(url: string): Promise<TtsSource> {
  const got = kept.get(url);
  if (got) {
    kept.delete(url);
    kept.set(url, got);
    return got;
  }
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const m = wavMono(bytes) ?? (await decoded(bytes));
  const src = ttsSource(m.samples, m.rate);
  kept.set(url, src);
  keptSamples += src.length;
  while (keptSamples > KEEP_SAMPLES && kept.size > 1) {
    const [k, v] = kept.entries().next().value!;
    kept.delete(k);
    keptSamples -= v.length;
  }
  return src;
}

/** "1:05", "1:02:03". */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "12 MB", "1.2 GB". */
export function sizeOf(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Makes the job's .tts.wav from Rehearse's voice settings (every layer). step:
 * what it is doing and how far (0..1). stopped: asked to stop (it throws
 * TTS_STOPPED, nothing saved). Throws why it could not.
 */
export async function makeTts(
  job: TtsJob,
  set: RehearseSettings,
  step: (note: string, part: number) => void,
  stopped: () => boolean,
  deps: TtsDeps = phone,
): Promise<TtsMade> {
  const n = job.phrases.length;
  if (!n) throw new Error("Nothing to say");
  const w = await deps.writer();
  if (typeof w === "string") throw new Error(w);
  const all = voiceLayersOf(set);
  const layers: TtsLayer[] = all.map((l) => ({ shape: voiceShapeOf(l), whole: l.voiceWhole }));
  // Each way of saying it (voice, rate, pitch) once: layers alike share their sayings.
  const sayKey = (l: (typeof all)[number]) =>
    JSON.stringify([l.voiceName, l.voiceRate, l.voicePitch]);
  const keys = [...new Set(all.map(sayKey))];
  const voiceOf = all.map((l) => keys.indexOf(sayKey(l)));
  const sources: TtsSource[][] = keys.map(() => []);
  let said = 0;
  for (let v = 0; v < keys.length; v++) {
    const l = all[voiceOf.indexOf(v)]!;
    for (let i = 0; i < n; i++) {
      if (stopped()) throw new Error(TTS_STOPPED);
      step(
        `Saying phrase ${(i + 1).toLocaleString()} of ${n.toLocaleString()}${keys.length > 1 ? ` (voice ${v + 1} of ${keys.length})` : ""}…`,
        (0.4 * said) / (n * keys.length),
      );
      const url = await deps.say(job.phrases[i]!, {
        voiceEngine: set.voiceEngine,
        voiceName: l.voiceName,
        voiceRate: l.voiceRate,
        voicePitch: l.voicePitch,
      });
      sources[v]![i] = await load(url);
      said += 1;
    }
  }
  const lens = all.map((_, li) => sources[voiceOf[li]!]!.map((s) => s.length / s.rate));
  const plan = ttsPlan(layers, lens, job.kind === "text");
  if (!plan.plays.length || plan.total <= 0)
    throw new Error("Nothing to make: every copy is silent, or left out");
  const mix = ttsMixer(plan, layers, (li, p) => sources[voiceOf[li]!]![p] ?? null, job.rate);
  // One channel all the way: two only at the very end (the final export, from this file).
  const bytes = floatWavBytes(mix.frames, 1);
  if (bytes > MAX_WAV_BYTES)
    throw new Error(
      `It would be ${sizeOf(bytes)} (${clockOf(plan.total)} at ${job.rate / 1000} kHz): a .wav holds at most 4 GB. Choose a lower rate, or fewer, shorter layers.`,
    );
  try {
    await w.write(floatWavHeader(mix.frames, 1, job.rate));
    const piece = Math.max(1, Math.floor(PIECE_BYTES / 4));
    const t0 = Date.now();
    while (mix.at() < mix.frames) {
      if (stopped()) throw new Error(TTS_STOPPED);
      const out = mix.next(piece);
      await w.write(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      const part = mix.at() / mix.frames;
      const left = part > 0.02 ? (((Date.now() - t0) / part) * (1 - part)) / 1000 : 0;
      step(
        `Making it: ${Math.floor(part * 100)}% of ${clockOf(plan.total)}${left >= 1 ? `, about ${clockOf(left)} left` : ""}…`,
        0.4 + 0.55 * part,
      );
      await pause();
    }
    step(`Saving ${sizeOf(bytes)} into the azs-folder…`, 0.96);
    await w.save(job.path);
  } catch (e) {
    await w.drop();
    throw e;
  }
  return {
    path: job.path,
    seconds: plan.total,
    bytes,
    rate: job.rate,
    sayings: plan.plays.length,
    skipped: plan.skipped,
  };
}

// ---- One at a time, wherever it was started: its progress shown wherever it is open ----

export interface TtsStatus {
  busy: boolean;
  /** What it is doing, or how it went. */
  note: string;
  part: number;
}

let status: TtsStatus = { busy: false, note: "", part: 0 };
let stopAsked = false;
const subs = new Set<() => void>();

function setStatus(next: TtsStatus) {
  status = next;
  for (const f of subs) f();
}

export function ttsStatus(): TtsStatus {
  return status;
}

export function subscribeTts(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function stopTts() {
  if (!status.busy) return;
  stopAsked = true;
  void folderStereoStop();
}

/** Sent with the path when a .tts.wav is made: it is there, and loops. */
export const TTS_MADE = "azshara-tts-made";

/** Makes it (one at a time), keeping its progress where every panel sees it. */
export async function startTts(job: TtsJob, set: RehearseSettings): Promise<TtsMade | null> {
  if (status.busy) return null;
  stopAsked = false;
  setStatus({ busy: true, note: "Starting…", part: 0 });
  // Its loop stops: the file it reads is written over (it starts again, new, when made).
  await playTts(null);
  try {
    const made = await makeTts(
      job,
      set,
      (note, part) => setStatus({ busy: true, note, part }),
      () => stopAsked,
    );
    setStatus({
      busy: false,
      part: 0,
      note: `Saved ${made.path}: ${clockOf(made.seconds)}, ${sizeOf(made.bytes)}, ${made.rate / 1000} kHz float32, one channel, ${made.sayings.toLocaleString()} sayings${made.skipped ? ` (${made.skipped} cop${made.skipped === 1 ? "y" : "ies"} too fast or slow left out)` : ""}. Looping it now.`,
    });
    window.dispatchEvent(new CustomEvent(TTS_MADE, { detail: made.path }));
    return made;
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    setStatus({ busy: false, part: 0, note: m === TTS_STOPPED ? "Stopped: nothing saved." : m });
    return null;
  }
}

/** The final export's file: next to the .tts.wav, .tts.stereo.wav (or .tts.bridged.wav). */
export function finalPath(ttsPath: string, kind: StereoKind): string {
  return (
    ttsPath.replace(/\.tts\.wav$/i, "") +
    (kind === "bridged" ? ".tts.bridged.wav" : ".tts.stereo.wav")
  );
}

/**
 * The final export (one at a time, with the others): the finished one-channel
 * .tts.wav made two channels by the phone, the same both sides or bridged, and
 * turned left-right turnHz times a second if above 0. Nothing is mixed again.
 */
export async function startStereo(
  ttsPath: string,
  kind: StereoKind,
  turnHz: number,
): Promise<boolean> {
  if (status.busy) return false;
  stopAsked = false;
  const to = finalPath(ttsPath, kind);
  const name = to.split("/").pop() ?? to;
  setStatus({ busy: true, note: `Making ${name}…`, part: 0 });
  try {
    const r = await folderStereo(ttsPath, to, kind === "bridged", turnHz, (part) =>
      setStatus({ busy: true, note: `Making ${name}: ${Math.floor(part * 100)}%…`, part }),
    );
    setStatus({
      busy: false,
      part: 0,
      note: `Saved ${to}: ${sizeOf(r.bytes)}, two channels (${kind === "bridged" ? "bridged, the right side flipped" : "the same both sides"}${turnHz > 0 ? `, turned left-right ${turnHz} times a second` : ""}), from ${ttsPath.split("/").pop()}, nothing mixed again.`,
    });
    return true;
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    setStatus({ busy: false, part: 0, note: m === TTS_STOPPED ? "Stopped: nothing saved." : m });
    return false;
  }
}
