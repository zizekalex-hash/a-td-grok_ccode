/**
 * Queens' speech, put together from pieces (voices.ts) so it rarely repeats:
 * a line from config.json, sometimes with an opener before it and an ending
 * after (a warm one when she is fond of you), in her own words; small-talk
 * conversations on many topics; and her asks to be fed a set of reps. Pure:
 * randomness is passed in. No path aliases (tests).
 */
import { CONFIG } from "../config.ts";
import type { LineKey, QueenKey } from "./rules.ts";
import { TOPICS, VOICES } from "./voices.ts";

const C = CONFIG.court;

/** Values for placeholders; an empty one leaves its line out. */
export type Fill = Record<string, string | number | undefined>;

/** How often a line gets an opener, and an ending. */
export const OPEN_CHANCE = 0.45;
export const CLOSE_CHANCE = 0.5;
/** From this affection tier on, half her endings are warm ones. */
export const WARM_TIER = 3;
/** Own small talk instead of a topic, this often. */
const OWN_TALK = 0.4;
/** Asks for a chat about nothing in particular, before her own small talk. */
const FREE_ASK = ["Tell me something.", "What's on your mind?", "Talk to me.", "Say anything."];

function pick<T>(list: readonly T[], rand: () => number): T | undefined {
  return list.length
    ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
    : undefined;
}

/** Each gift as a queen says it, in a sentence. */
const GIFT_SAY: Record<string, string> = {
  flowers: "wildflowers",
  mead: "honey mead",
  poems: "a book of poems",
  lily: "a moon lily",
  dragonglass: "dragon-glass",
  jewel: "the Jewel of the Tides",
  pearl: "a sea pearl",
  moonwell: "moonwell water",
  arrow: "a Windrunner arrow",
  ember: "a heart of embers",
  dagger: "a gilded dagger",
  voidshard: "a shard of the Void",
};

/** A gift as said in a sentence ("a sea pearl"). */
export function giftSay(key: string): string {
  return (
    GIFT_SAY[key] ?? (C.gifts as Record<string, { name: string }>)[key]?.name.toLowerCase() ?? key
  );
}

/** A name in the middle of a sentence: "The Realm" becomes "the Realm". */
export function midSentence(name: string): string {
  return name.replace(/^The /, "the ");
}

/** Every sentence starts with a capital, whatever was filled in. */
function capitalize(text: string): string {
  return text.replace(/(^|[.!?…]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** A line with its placeholders filled, or null when one of them has no value. */
export function fillAll(line: string, fill: Fill): string | null {
  let ok = true;
  const out = line.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = fill[k];
    if (v === undefined || v === "") {
      ok = false;
      return m;
    }
    return String(v);
  });
  return ok ? capitalize(out) : null;
}

/** Her pet name for you and something on her mind, unless given. */
function withVoice(q: QueenKey, fill: Fill, rand: () => number): Fill {
  const v = VOICES[q];
  return { pet: pick(v.pet, rand), thing: pick(v.things, rand), ...fill };
}

function bare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z' ]/g, "")
    .trim();
}

/**
 * Her line in her voice: sometimes an opener before it, sometimes an ending
 * after (warm ones when she is fond of you). An opener the line already starts
 * with is left off, and long lines get no ending.
 */
export function dress(
  q: QueenKey,
  text: string,
  rand: () => number,
  tier = 0,
  fill: Fill = {},
): string {
  const v = VOICES[q];
  const f = withVoice(q, fill, rand);
  const parts: string[] = [];
  if (rand() < OPEN_CHANCE) {
    const o = fillAll(pick(v.open, rand) ?? "", f);
    if (o && !bare(text).startsWith(bare(o)) && !bare(o).startsWith(bare(text))) parts.push(o);
  }
  parts.push(text);
  if (text.length < 140 && rand() < CLOSE_CHANCE) {
    const pool = tier >= WARM_TIER && rand() < 0.5 ? v.warm : v.close;
    const c = fillAll(pick(pool, rand) ?? "", f);
    if (c && c !== text) parts.push(c);
  }
  return parts.join(" ");
}

/**
 * What she says, for a kind of moment (greet, watch, gift, ...): one of her
 * config.json lines for it, dressed in her voice. Not one of `recent` when
 * another turns up in a few tries.
 */
export function speak(
  q: QueenKey,
  key: LineKey,
  rand: () => number,
  fill: Fill = {},
  tier = 0,
  recent: readonly string[] = [],
): string {
  const lines = C.queens[q].lines[key] ?? [];
  const f = withVoice(q, fill, rand);
  let out = "";
  for (let i = 0; i < 6; i++) {
    const raw = pick(lines, rand) ?? "";
    // Old lines leave a missing value as it is, as before.
    const core = raw.replace(/\{(\w+)\}/g, (m, k: string) =>
      f[k] !== undefined && f[k] !== "" ? String(f[k]) : m,
    );
    out = dress(q, core, rand, tier, f);
    if (!recent.includes(out)) break;
  }
  return out;
}

/** The topics that can be talked about with these values, with a ready ask and answer. */
function topicsFor(q: QueenKey, fill: Fill): { topic: string; ask: string[]; answer: string[] }[] {
  const out: { topic: string; ask: string[]; answer: string[] }[] = [];
  for (const [topic, t] of Object.entries(TOPICS)) {
    const ask = t.ask.map((a) => fillAll(a, fill)).filter((a): a is string => !!a);
    const answer = t.answer.map((a) => fillAll(a, fill)).filter((a): a is string => !!a);
    if (ask.length && answer.length) out.push({ topic, ask, answer });
  }
  const own = VOICES[q].talk.map((a) => fillAll(a, fill)).filter((a): a is string => !!a);
  if (own.length) out.push({ topic: "own", ask: FREE_ASK, answer: own });
  return out;
}

/**
 * A turn of conversation: what you ask, and her answer in her voice. Her own
 * small talk comes about OWN_TALK of the time; topics just talked about are
 * left for later when there are others.
 */
export function chat(
  q: QueenKey,
  rand: () => number,
  fill: Fill = {},
  tier = 0,
  recentTopics: readonly string[] = [],
): { topic: string; ask: string; answer: string } {
  const f = withVoice(q, fill, rand);
  const all = topicsFor(q, f);
  const fresh = all.filter((t) => !recentTopics.includes(t.topic));
  const pool = fresh.length ? fresh : all;
  const own = pool.find((t) => t.topic === "own");
  const t =
    own && rand() < OWN_TALK
      ? own
      : (pick(
          pool.filter((x) => x.topic !== "own"),
          rand,
        ) ?? own);
  if (!t) return { topic: "own", ask: FREE_ASK[0]!, answer: dress(q, "...", rand, tier, f) };
  return {
    topic: t.topic,
    ask: pick(t.ask, rand)!,
    answer: dress(q, pick(t.answer, rand)!, rand, tier, f),
  };
}

/** Her ask to be fed ({count} reps of {phrase}), her thanks, or her goodbye unfed. */
export function feedLine(
  q: QueenKey,
  kind: "feed" | "fed" | "hungry",
  rand: () => number,
  fill: Fill = {},
): string {
  const f = withVoice(q, fill, rand);
  const lines = VOICES[q][kind].map((l) => fillAll(l, f)).filter((l): l is string => !!l);
  return pick(lines, rand) ?? "";
}

/** How many different lines she can say for a kind of moment (for the tests). */
export function variety(q: QueenKey, key: LineKey): number {
  const v = VOICES[q];
  const cores = (C.queens[q].lines[key] ?? []).length;
  return cores * (1 + v.open.length) * (1 + v.close.length + v.warm.length);
}
