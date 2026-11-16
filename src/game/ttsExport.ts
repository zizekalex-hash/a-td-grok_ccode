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
import { heardVoices, voiceShapeOf, type RehearseSettings, type StereoKind } from "@/game/rehearse";
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
  type TtsPlan,
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

/** A plan being mixed: the mixer, and its next piece made (the sources it starts read first). */
export interface TtsMixing {
  mix: TtsMixer;
  pull(len: number): Promise<Float32Array>;
}

/** Every heard layer's sayings, said: their lengths, and mixers of plans made of them. */
interface Voices {
  layers: TtsLayer[];
  lens: number[][];
  mixer(plan: TtsPlan, rate: number): TtsMixing;
}

/**
 * Each phrase said once for each way of saying it (voice, rate, pitch: layers
 * alike share theirs), its length kept and its sound read again as a mix comes
 * to it (the ones read last are kept), so a long text never sits in memory at
 * once. A saying gone from the phone's cache meanwhile is said again. Each
 * layer's reversed copies (its sayings with their time-reversed selves, half
 * and half) are made as they are played; the main voice is never reversed.
 */
async function sayAll(
  job: TtsJob,
  set: RehearseSettings,
  deps: TtsDeps,
  step: (note: string, part: number) => void,
  stopped: () => boolean,
): Promise<Voices> {
  // The layers heard (muted ones left out), each with its voices (a stacked layer's
  // multiplied); the first holds the main voice.
  const heard = heardVoices(set);
  const all = heard.map((h) => h.layer);
  if (!all.length) throw new Error("Every voice layer is off: turn one on");
  const n = job.phrases.length;
  const layers: TtsLayer[] = heard.map((h) => ({ shape: voiceShapeOf(h.layer), voices: h.voices }));
  const sayKey = (l: (typeof all)[number]) =>
    JSON.stringify([l.voiceName, l.voiceRate, l.voicePitch]);
  const keys = [...new Set(all.map(sayKey))];
  const voiceOf = all.map((l) => keys.indexOf(sayKey(l)));
  const says = keys.map((_, v) => {
    const l = all[voiceOf.indexOf(v)]!;
    return {
      voiceEngine: set.voiceEngine,
      voiceName: l.voiceName,
      voiceRate: l.voiceRate,
      voicePitch: l.voicePitch,
    };
  });
  const urls: string[][] = keys.map(() => []);
  const lensOf: number[][] = keys.map(() => []);
  let said = 0;
  for (let v = 0; v < keys.length; v++) {
    for (let i = 0; i < n; i++) {
      if (stopped()) throw new Error(TTS_STOPPED);
      step(
        `Saying phrase ${(i + 1).toLocaleString()} of ${n.toLocaleString()}${keys.length > 1 ? ` (voice ${v + 1} of ${keys.length})` : ""}…`,
        said / (n * keys.length),
      );
      const url = await deps.say(job.phrases[i]!, says[v]!);
      const src = await load(url);
      urls[v]![i] = url;
      lensOf[v]![i] = src.length / src.rate;
      said += 1;
    }
  }
  const sourceOf = async (v: number, i: number, reversed: boolean): Promise<TtsSource> => {
    let src: TtsSource;
    try {
      src = await load(urls[v]![i]!);
    } catch {
      urls[v]![i] = await deps.say(job.phrases[i]!, says[v]!);
      src = await load(urls[v]![i]!);
    }
    return reversed ? reverseMix(src) : src;
  };
  // Reversed: as its layer is set, but never the main voice.
  const reversed = (li: number, main: boolean) => !main && all[li]!.voiceReverse;
  return {
    layers,
    lens: all.map((_, li) => lensOf[voiceOf[li]!]!),
    mixer(plan, rate) {
      const ready = new Map<number, TtsSource>();
      const keyOf = (li: number, p: number, main: boolean) =>
        (voiceOf[li]! * n + p) * 2 + (reversed(li, main) ? 1 : 0);
      const mix = ttsMixer(
        plan,
        layers,
        (li, p, main) => ready.get(keyOf(li, p, main)) ?? null,
        rate,
      );
      return {
        mix,
        async pull(len) {
          ready.clear();
          for (const p of mix.ahead(len)) {
            const main = !!p.main;
            const k = keyOf(p.layer, p.phrase, main);
            if (!ready.has(k))
              ready.set(k, await sourceOf(voiceOf[p.layer]!, p.phrase, reversed(p.layer, main)));
          }
          const out = mix.next(len);
          ready.clear();
          return out;
        },
      };
    },
  };
}

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
  let mixer: TtsMixing | null = null;
  let remix: (() => TtsMixing) | null = null;
  let sayings = 0;
  let skipped = 0;
  let turns: number[] = [0];
  const rate = job.rate;
  if (withVoice) {
    const vs = await sayAll(job, set, deps, (note, part) => step(note, P.say(part)), stopped);
    const plan = ttsPlan(vs.layers, vs.lens, job.kind === "text");
    turns = plan.turns;
    if (!plan.plays.length || plan.total <= 0)
      throw new Error("Nothing to make: every copy is silent, or left out");
    sayings = plan.plays.length;
    skipped = plan.skipped;
    remix = () => vs.mixer(plan, rate);
    mixer = remix();
  }
  const frames = mixer
    ? mixer.mix.frames
    : Math.max(1, Math.round(ln(L!, "MATRIX_ONLY_SEC") * rate));
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
  if (L && remix) {
    const m1 = remix();
    let peak = 0;
    while (m1.mix.at() < m1.mix.frames) {
      if (stopped()) throw new Error(TTS_STOPPED);
      peak = Math.max(peak, peakOf(voiceStep(await m1.pull(piece), dual)));
      step(
        `The voice's level: ${Math.floor((m1.mix.at() / m1.mix.frames) * 100)}%…`,
        P.level(m1.mix.at() / m1.mix.frames),
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
      const v = mixer ? await mixer.pull(len) : null;
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

/** The other voices' track: at least this rate (the app's sample rate, if higher). */
export const RENDER_RATE = 48_000;
/** The main voice's track: one voice as it is said needs no more. */
export const RENDER_MAIN_RATE = 24_000;
/** Past this, a track is made at 24 kHz (a text of over 3 hours said: half the size). */
export const RENDER_FIT_BYTES = 2 * 1024 ** 3;

/** A track rendered into the app's cache. */
export interface RenderTrack {
  name: string;
  frames: number;
  rate: number;
}

export interface RenderMade {
  /** The main voice alone, phrase after phrase; turns: where each phrase starts (s). */
  main: RenderTrack & { turns: number[] };
  /** Every other voice, each reading the whole text by itself (none: only the main voice). */
  back: RenderTrack | null;
}

/** A plan mixed into a file, a piece at a time (each sample guarded): its frames. */
async function writeMix(
  w: FolderWriter,
  m: TtsMixing,
  rate: number,
  step: (note: string, part: number) => void,
  stopped: () => boolean,
): Promise<number> {
  const frames = m.mix.frames;
  const bytes = floatWavBytes(frames, 1);
  if (bytes > MAX_WAV_BYTES)
    throw new Error(
      `It would be ${sizeOf(bytes)} (${clockOf(frames / rate)}): over a .wav's 4 GB. Fewer or slower copies.`,
    );
  const piece = Math.max(1, Math.floor(PIECE_BYTES / 4));
  try {
    await w.write(floatWavHeader(frames, 1, rate));
    let at = 0;
    while (at < frames) {
      if (stopped()) throw new Error(TTS_STOPPED);
      const len = Math.min(piece, frames - at);
      const v = guardAll(await m.pull(len));
      await w.write(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      at += len;
      step(`${Math.floor((at / frames) * 100)}% of ${clockOf(frames / rate)}…`, at / frames);
      await pause();
    }
    await w.save("", 1, 0);
  } catch (e) {
    await w.drop();
    throw e;
  }
  return frames;
}

/**
 * The whole text's voice made into the app's cache (not the folder), two
 * tracks: the main voice alone, phrase after phrase (where each phrase starts:
 * it moves the text on, or says one and waits), and every other voice, each
 * copy reading the whole text by itself, round and round (it plays all the
 * time). Each phrase said once per voice. The phone app.
 */
export async function renderText(
  phrases: string[],
  set: RehearseSettings,
  names: { main: string; back: string },
  step: (note: string, part: number) => void,
  stopped: () => boolean,
): Promise<RenderMade> {
  const wMain = await renderWriter(names.main);
  if (!wMain) throw new Error("Rendering a whole text is in the Android app");
  const job: TtsJob = { kind: "text", phrases, path: names.main, rate: RENDER_MAIN_RATE };
  const vs = await sayAll(
    job,
    set,
    { say: voiceFile, writer: async () => wMain },
    (note, part) => step(note, part * 0.4),
    stopped,
  );
  const mainPlan = ttsPlan(vs.layers, vs.lens, true, "main");
  const backPlan = ttsPlan(vs.layers, vs.lens, true, "others");
  if (mainPlan.total <= 0) throw new Error("Nothing to say");
  const mainFrames = await writeMix(
    wMain,
    vs.mixer(mainPlan, RENDER_MAIN_RATE),
    RENDER_MAIN_RATE,
    (note, part) =>
      step(`The main voice: ${note}`, 0.4 + part * (backPlan.plays.length ? 0.1 : 0.55)),
    stopped,
  );
  let back: RenderTrack | null = null;
  if (backPlan.plays.length) {
    // At the app's sample rate (48 to 384 kHz), lower if that would be too big.
    let rate = Math.max(RENDER_RATE, set.ttsRate);
    while (
      rate / 2 >= 24_000 &&
      floatWavBytes(Math.ceil(backPlan.total * rate), 1) > RENDER_FIT_BYTES
    )
      rate /= 2;
    const wBack = await renderWriter(names.back);
    if (!wBack) throw new Error("Rendering a whole text is in the Android app");
    const frames = await writeMix(
      wBack,
      vs.mixer(backPlan, rate),
      rate,
      (note, part) => step(`The other voices: ${note}`, 0.5 + part * 0.45),
      stopped,
    );
    back = { name: names.back, frames, rate };
  }
  return {
    main: { name: names.main, frames: mainFrames, rate: RENDER_MAIN_RATE, turns: mainPlan.turns },
    back,
  };
}
