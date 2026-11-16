/**
 * The swarm mixed off the page's thread: two streams of background voices,
 * those saying the phrase (started again on each new phrase) and those reading
 * the whole text (never interrupted by a tap), each mixed a piece at a time
 * when the page asks. The sayings come from the page as they are said; the
 * ones wanted and not here go back to it, soonest first.
 */
import { createSwarm, type Swarm, type SwarmLayer, type SwarmNeed } from "./swarmMix.ts";
import { ttsSource, type TtsSource } from "./ttsRender.ts";

type Stream = "phrase" | "text";

type Ask =
  | {
      type: "start";
      rate: number;
      list: string;
      phrases: number;
      phrase: number;
      epochs: Record<Stream, number>;
      layers: Record<Stream, SwarmLayer[]>;
    }
  | { type: "phrase"; epoch: number; phrase: number; from: number }
  | {
      type: "source";
      list: string;
      voice: number;
      phrase: number;
      data: Float32Array;
      rate: number;
    }
  | { type: "fail"; list: string; voice: number; phrase: number }
  | { type: "pull"; stream: Stream; epoch: number; frames: number }
  | { type: "stop" };

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(
    msg,
    transfer,
  );

/** The sayings kept (the most recently used last): enough for the voices near each other. */
const KEEP = 160;

let list = "";
let rate = 48_000;
let phrases = 0;
const swarms: Partial<Record<Stream, Swarm>> = {};
const epochs: Record<Stream, number> = { phrase: 0, text: 0 };
const sources = new Map<string, TtsSource>();
/** A saying the phone could not make: silence, so its voices go on. */
const SILENT: TtsSource = ttsSource(new Float32Array(1), 1);

const source = (voice: number, phrase: number): TtsSource | null => {
  const k = `${voice}|${phrase}`;
  const s = sources.get(k);
  if (!s) return null;
  // Used: kept longest.
  sources.delete(k);
  sources.set(k, s);
  return s;
};

const wantedAll = (): SwarmNeed[] => {
  const all = [...(swarms.phrase?.wanted() ?? []), ...(swarms.text?.wanted() ?? [])];
  const seen = new Set<string>();
  return all
    .sort((a, b) => a.at - b.at)
    .filter((w) => {
      const k = `${w.voice}|${w.phrase}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
};

self.onmessage = (e: MessageEvent<Ask>) => {
  const d = e.data;
  if (d.type === "start") {
    if (d.list !== list) sources.clear();
    list = d.list;
    rate = d.rate;
    phrases = d.phrases;
    for (const s of ["phrase", "text"] as Stream[]) {
      epochs[s] = d.epochs[s];
      swarms[s] = d.layers[s].length
        ? createSwarm(d.layers[s], phrases, rate, 0, d.phrase)
        : undefined;
    }
    return;
  }
  if (d.type === "phrase") {
    epochs.phrase = d.epoch;
    swarms.phrase?.restart(d.from, d.phrase);
    return;
  }
  if (d.type === "source" || d.type === "fail") {
    if (d.list !== list) return;
    sources.set(
      `${d.voice}|${d.phrase}`,
      d.type === "source" && d.data.length ? ttsSource(d.data, d.rate) : SILENT,
    );
    while (sources.size > KEEP) sources.delete(sources.keys().next().value!);
    return;
  }
  if (d.type === "pull") {
    const sw = swarms[d.stream];
    if (!sw || d.epoch !== epochs[d.stream]) return;
    const t = performance.now();
    const from = sw.at();
    const piece = sw.mix(d.frames, source);
    const st = sw.stats();
    post(
      {
        type: "piece",
        stream: d.stream,
        epoch: d.epoch,
        from,
        left: piece.left,
        right: piece.right,
        peak: piece.peak,
        ms: performance.now() - t,
        voices: st.voices,
        waiting: st.waiting,
      },
      [piece.left.buffer, piece.right.buffer],
    );
    const wants = wantedAll();
    if (wants.length) post({ type: "need", list, wants: wants.slice(0, 64) });
    return;
  }
  if (d.type === "stop") {
    swarms.phrase = undefined;
    swarms.text = undefined;
    sources.clear();
    list = "";
  }
};
