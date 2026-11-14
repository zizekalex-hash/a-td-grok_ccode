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
  renderWriter,
  type FolderWriter,
  type StereoTurn,
} from "@/game/azsFolder";
import {
  heardVoiceLayers,
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
  reverseMix,
  type TtsLayer,
  type TtsMixer,
  type TtsSource,
} from "@/game/ttsRender";
import {
  buildMatrix,
  dualCfg,
  legionMaster,
  n as ln,
  on as lon,
  voicePower,
  voiceStep,
  type LegionMatrix,
  type LegionSettings,
} from "@/game/legion";
import { guard, guardAll, peakOf } from "@/game/legionDsp";
import { legionState } from "@/game/legionRun";
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
  /** A render: past this size at its rate, made at half the rate (not below 24 kHz). */
  fitBytes?: number;
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
  /** The Legion matrix's layers under it (none: no matrix). */
  layers: string[];
  /** Its frames, and when each phrase's turn starts (s). */
  frames: number;
  turns: number[];
}

type VoiceSay = Pick<RehearseSettings, "voiceEngine" | "voiceName" | "voiceRate" | "voicePitch">;

/** What it works with: the phone's voice and the azs-folder (others in a test). */
export interface TtsDeps {
  /** The phrase said: an address of its .wav. */
  say(text: string, voice: VoiceSay): Promise<string>;
  /** Where the file is written (null: nowhere, and why). */
  writer(): Promise<FolderWriter | string>;
  /** The Legion matrix (the app: in a worker). */
  matrix?(
    phrases: string[],
    rate: number,
    s: LegionSettings,
    step: (note: string, part: number) => void,
    stopped: () => boolean,
  ): Promise<LegionMatrix>;
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
  legion: LegionSettings | null = null,
): Promise<TtsMade> {
  const n = job.phrases.length;
  if (!n) throw new Error("Nothing to say");
  const w = await deps.writer();
  if (typeof w === "string") throw new Error(w);
  const L = legion && lon(legion, "LEGION_ON") ? legion : null;
  const withVoice = !L || lon(L, "CON_TTS");
  // The progress bar's parts: the matrix, the sayings, the voice's level, the file.
  const span = (a: number, b: number) => (part: number) => a + (b - a) * part;
  const P = L
    ? { matrix: span(0, 0.3), say: span(0.3, 0.45), level: span(0.45, 0.6), make: span(0.6, 0.95) }
    : { matrix: span(0, 0), say: span(0, 0.4), level: span(0.4, 0.4), make: span(0.4, 0.95) };
  // The Legion matrix (off the page's thread in the app).
  const matrix = L
    ? await (deps.matrix ?? matrixHere)(
        job.phrases,
        job.rate,
        L,
        (note, part) => step(note, P.matrix(part)),
        stopped,
      )
    : null;
  let mix: TtsMixer | null = null;
  let make: (() => TtsMixer) | null = null;
  // The next piece of a mix: the sources of the sayings it starts read first.
  let pull: (m: TtsMixer, len: number) => Promise<Float32Array> = async (m, len) => m.next(len);
  let sayings = 0;
  let skipped = 0;
  let turns: number[] = [0];
  let rate = job.rate;
  if (withVoice) {
    // The layers heard (muted ones left out); the first leads.
    const all = heardVoiceLayers(set);
    if (!all.length) throw new Error("Every voice layer is off: turn one on");
    const layers: TtsLayer[] = all.map((l) => ({ shape: voiceShapeOf(l), whole: l.voiceWhole }));
    // Each way of saying it (voice, rate, pitch, reversed or not) once: layers alike share their sayings.
    const sayKey = (l: (typeof all)[number]) =>
      JSON.stringify([l.voiceName, l.voiceRate, l.voicePitch, l.voiceReverse]);
    const keys = [...new Set(all.map(sayKey))];
    const voiceOf = all.map((l) => keys.indexOf(sayKey(l)));
    const firstOf = keys.map((_, v) => all[voiceOf.indexOf(v)]!);
    const says = firstOf.map((l) => ({
      voiceEngine: set.voiceEngine,
      voiceName: l.voiceName,
      voiceRate: l.voiceRate,
      voicePitch: l.voicePitch,
    }));
    // Each saying's address and length (s). Its sound is read again when the mix comes to it
    // (the ones read last are kept): a long text never sits in memory all at once.
    const urls: string[][] = keys.map(() => []);
    const lensOf: number[][] = keys.map(() => []);
    let said = 0;
    for (let v = 0; v < keys.length; v++) {
      for (let i = 0; i < n; i++) {
        if (stopped()) throw new Error(TTS_STOPPED);
        step(
          `Saying phrase ${(i + 1).toLocaleString()} of ${n.toLocaleString()}${keys.length > 1 ? ` (voice ${v + 1} of ${keys.length})` : ""}…`,
          P.say(said / (n * keys.length)),
        );
        const url = await deps.say(job.phrases[i]!, says[v]!);
        const src = await load(url);
        urls[v]![i] = url;
        lensOf[v]![i] = src.length / src.rate;
        said += 1;
      }
    }
    const lens = all.map((_, li) => lensOf[voiceOf[li]!]!);
    const plan = ttsPlan(layers, lens, job.kind === "text", set.voiceLead);
    turns = plan.turns;
    if (!plan.plays.length || plan.total <= 0)
      throw new Error("Nothing to make: every copy is silent, or left out");
    sayings = plan.plays.length;
    skipped = plan.skipped;
    // A render too long for its rate: at half (not below 24 kHz), so it stays a size the phone keeps.
    if (job.fitBytes && !L)
      while (rate / 2 >= 24_000 && floatWavBytes(Math.ceil(plan.total * rate), 1) > job.fitBytes)
        rate /= 2;
    // A saying's sound (reversed: with its time-reversed copy, half and half). Gone from the
    // phone's cache meanwhile (a very long text): said again.
    const sourceOf = async (v: number, i: number): Promise<TtsSource> => {
      let src: TtsSource;
      try {
        src = await load(urls[v]![i]!);
      } catch {
        urls[v]![i] = await deps.say(job.phrases[i]!, says[v]!);
        src = await load(urls[v]![i]!);
      }
      return firstOf[v]!.voiceReverse ? reverseMix(src) : src;
    };
    const ready = new Map<number, TtsSource>();
    const keyOf = (li: number, p: number) => voiceOf[li]! * n + p;
    make = () => ttsMixer(plan, layers, (li, p) => ready.get(keyOf(li, p)) ?? null, rate);
    pull = async (m, len) => {
      ready.clear();
      for (const p of m.ahead(len)) {
        const k = keyOf(p.layer, p.phrase);
        if (!ready.has(k)) ready.set(k, await sourceOf(voiceOf[p.layer]!, p.phrase));
      }
      const out = m.next(len);
      ready.clear();
      return out;
    };
    mix = make();
  }
  const frames = mix ? mix.frames : Math.max(1, Math.round(ln(L!, "MATRIX_ONLY_SEC") * rate));
  const seconds = frames / rate;
  // One channel all the way: two only at the very end (the final export, from this file).
  const bytes = floatWavBytes(frames, 1);
  if (bytes > MAX_WAV_BYTES)
    throw new Error(
      `It would be ${sizeOf(bytes)} (${clockOf(seconds)} at ${rate / 1000} kHz): a .wav holds at most 4 GB. Choose a lower rate, or fewer, shorter layers.`,
    );
  const piece = Math.max(1, Math.floor(PIECE_BYTES / 4));
  // With the matrix: the voice's peak found first, so it sits at its own level on top.
  const dual = L ? dualCfg(L) : null;
  let scale = 1;
  if (L && make) {
    const m1 = make();
    let peak = 0;
    while (m1.at() < m1.frames) {
      if (stopped()) throw new Error(TTS_STOPPED);
      peak = Math.max(peak, peakOf(voiceStep(await pull(m1, piece), dual)));
      step(
        `The voice's level: ${Math.floor((m1.at() / m1.frames) * 100)}%…`,
        P.level(m1.at() / m1.frames),
      );
      await pause();
    }
    scale = peak > 1e-12 ? voicePower(L) / peak : 0;
  }
  const master = matrix && L ? legionMaster(matrix, L) : null;
  try {
    await w.write(floatWavHeader(frames, 1, rate));
    const t0 = Date.now();
    let at = 0;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    while (at < frames) {
      if (stopped()) throw new Error(TTS_STOPPED);
      const len = Math.min(piece, frames - at);
      const v = mix ? await pull(mix, len) : null;
      if (v && L) {
        voiceStep(v, dual);
        for (let i = 0; i < v.length; i++) v[i] = guard(v[i]! * scale);
      } else if (v) guardAll(v);
      const out = master ? master.next(v, at, len) : v!;
      for (let i = 0; i < out.length; i++) {
        const x = out[i]!;
        sum += x;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      await w.write(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      at += len;
      const part = at / frames;
      const left = part > 0.02 ? (((Date.now() - t0) / part) * (1 - part)) / 1000 : 0;
      step(
        `Making it: ${Math.floor(part * 100)}% of ${clockOf(seconds)}${left >= 1 ? `, about ${clockOf(left)} left` : ""}…`,
        P.make(part),
      );
      await pause();
    }
    // With the matrix: its DC off and its peak brought to the master peak, as it is saved.
    let gain = 1;
    let offset = 0;
    if (L && lon(L, "MASTER_NORMALIZE") && frames > 0) {
      offset = sum / frames;
      const pk = Math.max(hi - offset, offset - lo);
      gain = pk > 1e-12 ? ln(L, "FINAL_MIX_AMP") / pk : 1;
    }
    step(`Saving ${sizeOf(bytes)}…`, 0.96);
    await w.save(job.path, gain, offset);
  } catch (e) {
    await w.drop();
    throw e;
  }
  return {
    path: job.path,
    seconds,
    bytes,
    rate,
    frames,
    sayings,
    skipped,
    layers: matrix?.layers ?? [],
    turns,
  };
}

/** The matrix: in a worker where there is one (the page stays live), else here. */
function matrixHere(
  phrases: string[],
  rate: number,
  s: LegionSettings,
  step: (note: string, part: number) => void,
  stopped: () => boolean,
): Promise<LegionMatrix> {
  if (typeof Worker === "undefined") return buildMatrix(phrases, rate, s, step, stopped);
  return new Promise((resolve, reject) => {
    const wk = new Worker(new URL("./legion.worker.ts", import.meta.url), { type: "module" });
    const done = () => {
      window.clearInterval(watch);
      wk.terminate();
    };
    const watch = window.setInterval(() => {
      if (!stopped()) return;
      done();
      reject(new Error(TTS_STOPPED));
    }, 200);
    wk.onmessage = (e: MessageEvent) => {
      const d = e.data as {
        type: string;
        note?: string;
        part?: number;
        message?: string;
      } & LegionMatrix;
      if (d.type === "step") return step(d.note ?? "", d.part ?? 0);
      done();
      if (d.type === "done")
        resolve({ loop: d.loop, burst: d.burst, rate: d.rate, layers: d.layers });
      else reject(new Error(d.message ?? "The matrix could not be made"));
    };
    wk.onerror = (e) => {
      done();
      reject(new Error(e.message || "The matrix could not be made"));
    };
    wk.postMessage({ phrases, rate, settings: s });
  });
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
      undefined,
      legionState(),
    );
    setStatus({
      busy: false,
      part: 0,
      note: `Saved ${made.path}: ${clockOf(made.seconds)}, ${sizeOf(made.bytes)}, ${made.rate / 1000} kHz float32, one channel, ${made.layers.length ? `the Legion matrix (${made.layers.length} layers) under ` : ""}${made.sayings.toLocaleString()} sayings${made.skipped ? ` (${made.skipped} cop${made.skipped === 1 ? "y" : "ies"} too fast or slow left out)` : ""}. Looping it now.`,
    });
    window.dispatchEvent(new CustomEvent(TTS_MADE, { detail: made.path }));
    return made;
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    setStatus({ busy: false, part: 0, note: m === TTS_STOPPED ? "Stopped: nothing saved." : m });
    return null;
  }
}

/** How the final export turns, from the settings. */
export function turnOf(set: RehearseSettings): StereoTurn {
  if (!set.ttsTurn) return { turn: "none", hz: 0 };
  if (set.ttsTurnKind === "pan") return { turn: "pan", hz: set.ttsTurnHz };
  if (set.ttsTurnKind === "eight") return { turn: "eight", hz: set.eightHz, gain: set.eightGain };
  return {
    turn: "bridge",
    hz: set.bridgeHz,
    startDeg: set.bridgeStartDeg,
    dual: set.bridgeDual,
    wRot: set.bridgeRotWeight,
    wOrig: set.bridgeOrigWeight,
    dualAmp: set.bridgeDualAmp,
  };
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
/** The final file's kind: with the bridge rotation it is the bridged one (its starting angle sets it). */
export function finalKind(set: RehearseSettings): StereoKind {
  return set.ttsTurn && set.ttsTurnKind === "bridge" ? "bridged" : set.ttsStereo;
}

export async function startStereo(ttsPath: string, set: RehearseSettings): Promise<boolean> {
  const kind = finalKind(set);
  const turn = turnOf(set);
  if (status.busy) return false;
  stopAsked = false;
  const to = finalPath(ttsPath, kind);
  const name = to.split("/").pop() ?? to;
  setStatus({ busy: true, note: `Making ${name}…`, part: 0 });
  try {
    const r = await folderStereo(ttsPath, to, kind === "bridged", turn, (part) =>
      setStatus({ busy: true, note: `Making ${name}: ${Math.floor(part * 100)}%…`, part }),
    );
    setStatus({
      busy: false,
      part: 0,
      note: `Saved ${to}: ${sizeOf(r.bytes)}, two channels (${turn.turn === "bridge" ? `the bridge rotation, ${turn.hz} turns a second from ${turn.startDeg}°${turn.dual ? ", with the held duplicate" : ""}` : `${kind === "bridged" ? "bridged, the right side flipped" : "the same both sides"}${turn.turn === "pan" ? `, turned left-right ${turn.hz} times a second` : turn.turn === "eight" ? `, 8D at ${turn.hz} a second` : ""}`}), from ${ttsPath.split("/").pop()}, nothing mixed again.`,
    });
    return true;
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    setStatus({ busy: false, part: 0, note: m === TTS_STOPPED ? "Stopped: nothing saved." : m });
    return false;
  }
}

// ---- A whole text rendered for the app itself: then it runs by itself ----

/** Renders at this rate: what the phone plays (the export has its own). */
export const RENDER_RATE = 48_000;
/** Past this, a render is made at 24 kHz (a text of over 3 hours said: half the size). */
export const RENDER_FIT_BYTES = 2 * 1024 ** 3;

/**
 * The whole text's voice made into the app's cache (not the folder), as the
 * export makes it (each phrase said once per voice, every layer heard, its
 * turns led as set): its frames and where each phrase starts. The phone app.
 */
export async function renderText(
  phrases: string[],
  set: RehearseSettings,
  name: string,
  step: (note: string, part: number) => void,
  stopped: () => boolean,
): Promise<{ name: string; turns: number[]; frames: number; rate: number }> {
  const w = await renderWriter(name);
  if (!w) throw new Error("Rendering a whole text is in the Android app");
  const made = await makeTts(
    { kind: "text", phrases, path: name, rate: RENDER_RATE, fitBytes: RENDER_FIT_BYTES },
    set,
    step,
    stopped,
    { say: voiceFile, writer: async () => w },
    null,
  );
  return { name, turns: made.turns, frames: made.frames, rate: made.rate };
}
