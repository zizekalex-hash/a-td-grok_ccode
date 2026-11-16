/**
 * The background voices played as one sound (the swarm): mixed a little ahead
 * off the page's thread (swarm.worker.ts) and played piece after piece, so
 * hundreds of voices cost the phone one stream, not hundreds of players. Two
 * streams: the voices saying the phrase (on a new phrase they start again at
 * once) and those reading the whole text (never interrupted by a tap). The
 * phrases are said by the phone as the voices need them, soonest first. What
 * it does goes into the sound log; how it goes into its stats (the monitor).
 */
import type { SwarmLayer, SwarmNeed } from "@/game/swarmMix";
import { audioOut, liveContext } from "@/game/phraseSound";
import { soundLog } from "@/game/soundLog";
import { wavMono } from "@/game/ttsRender";

type Stream = "phrase" | "text";
const STREAMS: Stream[] = ["phrase", "text"];

/** What the swarm plays. */
export interface SwarmPlay {
  /** Its layers, voices and rate: another key starts it again, fresh. */
  key: string;
  /** What the phrases are (a text, or one phrase): another one, its sayings are said again. */
  list: string;
  phrases: string[];
  /** The phrase the phrase-saying voices say (an index into phrases). */
  phrase: number;
  layers: Record<Stream, SwarmLayer[]>;
  /** How far ahead it is mixed (s): more is more room for the phone (changed, nothing starts again). */
  aheadSec: number;
  /** A phrase as a voice says it: its file's address. */
  say(voice: number, text: string): Promise<string>;
}

export interface SwarmStats {
  running: boolean;
  voices: number;
  waiting: number;
  /** How long mixing takes against how long it plays (1: just in time; above: too slow). */
  load: number;
  /** Its loudest sample lately. */
  peak: number;
  /** Pieces that came too late to play whole. */
  late: number;
  /** How far ahead of what plays the mix is now (s): the whole-text voices', else the phrase-saying ones'. */
  ahead: number;
  rate: number;
}

let stats: SwarmStats = {
  running: false,
  voices: 0,
  waiting: 0,
  load: 0,
  peak: 0,
  late: 0,
  ahead: 0,
  rate: 0,
};
const subs = new Set<() => void>();
let statsTimer = 0;
const setStats = (p: Partial<SwarmStats>) => {
  stats = { ...stats, ...p };
  if (statsTimer || typeof window === "undefined") return;
  // Told at most four times a second.
  statsTimer = window.setTimeout(() => {
    statsTimer = 0;
    for (const f of subs) f();
  }, 250);
};

export function swarmStats(): SwarmStats {
  return stats;
}

export function subscribeSwarm(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

interface Out {
  bus: GainNode;
  srcs: Set<AudioBufferSourceNode>;
  /** When the next piece starts (the player's time). */
  next: number;
  pending: boolean;
  epoch: number;
  voices: number;
  waiting: number;
  load: number;
}

let worker: Worker | null = null;
let ctx: AudioContext | null = null;
let now: SwarmPlay | null = null;
let rate = 48_000;
/** The player's time at frame 0 of this run. */
let t0 = 0;
let timer = 0;
let epochSeq = 0;
const outs: Partial<Record<Stream, Out>> = {};
/** Sayings being made, and those that could not be (not asked again on this list). */
const asking = new Set<string>();
const failed = new Set<string>();
const queue: SwarmNeed[] = [];
let active = 0;
/** At most this many sayings asked of the phone at once (the main voice's go first). */
const ASKS = 2;
let peakSince = 0;
/** The worker has mixed a piece already (started, it answers at once). */
let warm = false;

const hidden = () => typeof document !== "undefined" && document.hidden;
/**
 * How far ahead each stream is mixed (s): the whole-text voices as set (10 at
 * least with the screen off: the page wakes less); the phrase-saying voices
 * less (a tap starts them again, and what was mixed ahead is dropped), as set
 * up to 1.5 (4 with the screen off).
 */
const aheadOf = (s: Stream) => {
  const want = now?.aheadSec ?? 4;
  if (s === "phrase") return Math.max(0.5, Math.min(want, hidden() ? 4 : 1.5));
  return hidden() ? Math.max(want, 10) : want;
};
/** Its pieces: longer the further ahead (fewer messages), at most 2 s. */
const pieceOf = (s: Stream) =>
  s === "phrase" ? (hidden() ? 1 : 0.25) : Math.max(0.5, Math.min(2, aheadOf("text") / 6));

function fadeOut(o: Out | undefined) {
  if (!o || !ctx) return;
  try {
    const t = ctx.currentTime;
    o.bus.gain.cancelScheduledValues(t);
    o.bus.gain.setValueAtTime(o.bus.gain.value, t);
    o.bus.gain.linearRampToValueAtTime(0, t + 0.04);
    for (const s of o.srcs) s.stop(t + 0.05);
  } catch {
    /* over already */
  }
}

function newOut(epoch: number, at: number): Out {
  const bus = ctx!.createGain();
  bus.gain.setValueAtTime(0, at);
  bus.gain.linearRampToValueAtTime(1, at + 0.04);
  bus.connect(audioOut(ctx!));
  return {
    bus,
    srcs: new Set(),
    next: at,
    pending: false,
    epoch,
    voices: 0,
    waiting: 0,
    load: 0,
  };
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./swarm.worker.ts", import.meta.url), { type: "module" });
  } catch (e) {
    soundLog(`The background mix could not start: ${String((e as Error)?.message ?? e)}`, "error");
    return null;
  }
  worker.onmessage = (e: MessageEvent) => onMessage(e.data);
  worker.onerror = (e) =>
    soundLog(`The background mix stopped: ${e.message || "an error"}`, "error");
  return worker;
}

function pump() {
  const w = worker;
  const c = ctx;
  if (!w || !c || !now) return;
  for (const s of STREAMS) {
    const o = outs[s];
    if (!o || o.pending) continue;
    if (o.next - c.currentTime >= aheadOf(s)) continue;
    o.pending = true;
    w.postMessage({
      type: "pull",
      stream: s,
      epoch: o.epoch,
      frames: Math.max(256, Math.round(pieceOf(s) * rate)),
    });
  }
}

function onMessage(d: {
  type: string;
  stream?: Stream;
  epoch?: number;
  from?: number;
  left?: Float32Array<ArrayBuffer>;
  right?: Float32Array<ArrayBuffer>;
  peak?: number;
  ms?: number;
  voices?: number;
  waiting?: number;
  list?: string;
  wants?: SwarmNeed[];
}) {
  const c = ctx;
  if (!c || !now) return;
  if (d.type === "need") {
    if (d.list === now.list) want(d.wants ?? []);
    return;
  }
  if (d.type !== "piece" || !d.stream) return;
  warm = true;
  const o = outs[d.stream];
  if (!o || o.epoch !== d.epoch) return;
  o.pending = false;
  const left = d.left!;
  const right = d.right!;
  const n = left.length;
  o.voices = d.voices ?? o.voices;
  if (n) {
    const buf = c.createBuffer(2, n, rate);
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(o.bus);
    const at = t0 + (d.from ?? 0) / rate;
    const late = c.currentTime - at;
    if (late > 0.005) {
      // Came late: what is already past is left out, the rest plays now.
      stats.late += 1;
      soundLog(
        `Background mix ${Math.round(late * 1000)} ms late (${o.voices} voices at ${rate / 1000} kHz): fewer copies or a lower rate is lighter`,
        "warn",
      );
      if (late < n / rate) src.start(c.currentTime, late);
    } else src.start(at);
    o.srcs.add(src);
    src.onended = () => o.srcs.delete(src);
    o.next = at + n / rate;
    const play = (n / rate) * 1000;
    o.load = (d.ms ?? 0) / Math.max(1, play);
    if (o.load > 0.9)
      soundLog(
        `Mixing takes ${Math.round(o.load * 100)}% of the time it plays (${o.voices} voices at ${rate / 1000} kHz): the phone can only just keep up`,
        "warn",
      );
  }
  o.voices = d.voices ?? 0;
  o.waiting = d.waiting ?? 0;
  peakSince = Math.max(peakSince * 0.9, d.peak ?? 0);
  const all = STREAMS.map((s) => outs[s]).filter(Boolean) as Out[];
  setStats({
    // The whole-text voices' head start (what the setting sets), else the phrase-saying ones'.
    ahead: Math.max(0, ((outs.text ?? outs.phrase)?.next ?? c.currentTime) - c.currentTime),
    voices: all.reduce((x, y) => x + y.voices, 0),
    waiting: all.reduce((x, y) => x + y.waiting, 0),
    load: all.reduce((x, y) => x + y.load, 0),
    peak: peakSince,
    late: stats.late,
  });
  pump();
}

/** Sayings wanted: asked of the phone, soonest first, a few at a time. */
function want(ws: SwarmNeed[]) {
  for (const w of ws) {
    const k = `${w.voice}|${w.phrase}`;
    if (asking.has(k) || failed.has(k)) continue;
    const q = queue.findIndex((x) => x.voice === w.voice && x.phrase === w.phrase);
    if (q >= 0) queue[q] = w;
    else queue.push(w);
  }
  queue.sort((a, b) => a.at - b.at);
  ask();
}

function ask() {
  while (active < ASKS && queue.length && now) {
    const w = queue.shift()!;
    const k = `${w.voice}|${w.phrase}`;
    if (asking.has(k)) continue;
    asking.add(k);
    active += 1;
    void make(now, w).finally(() => {
      asking.delete(k);
      active -= 1;
      ask();
    });
  }
}

async function make(p: SwarmPlay, w: SwarmNeed) {
  const text = p.phrases[w.phrase];
  const wk = worker;
  if (!wk || text === undefined) return;
  try {
    const url = await p.say(w.voice, text);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let mono = wavMono(bytes);
    if (!mono && ctx) {
      // Not a plain .wav: the player reads it.
      const b = await ctx.decodeAudioData(bytes.buffer.slice(0));
      mono = { samples: b.getChannelData(0).slice(), rate: b.sampleRate };
    }
    if (!mono) throw new Error("not a sound");
    if (now?.list !== p.list) return;
    wk.postMessage(
      {
        type: "source",
        list: p.list,
        voice: w.voice,
        phrase: w.phrase,
        data: mono.samples,
        rate: mono.rate,
      },
      [mono.samples.buffer],
    );
  } catch (e) {
    failed.add(`${w.voice}|${w.phrase}`);
    soundLog(
      `Phrase ${w.phrase + 1} could not be said (voice ${w.voice + 1}): ${String((e as Error)?.message ?? e)}`,
      "error",
    );
    if (now?.list === p.list)
      wk.postMessage({ type: "fail", list: p.list, voice: w.voice, phrase: w.phrase });
  }
}

/** Every stream faded out and dropped. */
function drop() {
  for (const s of STREAMS) {
    fadeOut(outs[s]);
    outs[s] = undefined;
  }
}

/**
 * The swarm plays this (null: it stops). The same key goes on as it is (a new
 * phrase starts the phrase-saying voices again on it at once); another key
 * starts all of it again, fresh.
 */
export function swarmPlay(p: SwarmPlay | null) {
  if (!p || (!p.layers.phrase.length && !p.layers.text.length)) {
    if (now) {
      drop();
      worker?.postMessage({ type: "stop" });
      now = null;
      window.clearInterval(timer);
      timer = 0;
      setStats({ running: false, voices: 0, waiting: 0, load: 0, peak: 0 });
    }
    return;
  }
  const c = liveContext();
  const w = ensureWorker();
  if (!c || !w) return;
  if (now && now.key === p.key && now.list === p.list && ctx === c) {
    // The same: only the phrase may have moved.
    if (p.phrase !== now.phrase && outs.phrase) {
      now = p;
      fadeOut(outs.phrase);
      const at = c.currentTime + 0.03;
      const epoch = ++epochSeq;
      outs.phrase = newOut(epoch, at);
      w.postMessage({
        type: "phrase",
        epoch,
        phrase: p.phrase,
        from: Math.round((at - t0) * rate),
      });
      pump();
    } else now = p;
    return;
  }
  // Started (again), fresh.
  drop();
  if (!now || now.list !== p.list) {
    failed.clear();
    queue.length = 0;
  }
  now = p;
  ctx = c;
  rate = c.sampleRate;
  // A moment ahead: the mix (and, the first time, its worker) gets ready meanwhile.
  t0 = c.currentTime + (warm ? 0.08 : 0.3);
  const epochs = { phrase: ++epochSeq, text: ++epochSeq };
  for (const s of STREAMS) outs[s] = p.layers[s].length ? newOut(epochs[s], t0) : undefined;
  w.postMessage({
    type: "start",
    rate,
    list: p.list,
    phrases: p.phrases.length,
    phrase: p.phrase,
    epochs,
    layers: p.layers,
  });
  const count = (s: Stream) => p.layers[s].reduce((n, l) => n + l.voices.length, 0);
  soundLog(
    `Background: ${count("phrase") + count("text")} voices (${count("phrase")} saying the phrase, ${count("text")} reading the whole text), mixed into one at ${rate / 1000} kHz`,
  );
  stats.late = 0;
  setStats({ running: true, rate, voices: count("phrase") + count("text"), waiting: 0 });
  window.clearInterval(timer);
  timer = window.setInterval(pump, 100);
  pump();
}
