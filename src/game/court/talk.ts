/**
 * The Court's words, in plain JSON files anyone can fill (src/game/court/talk/,
 * see GROK_TALK.md): one file per queen (her voice, and her lines for each
 * moment) and shared.json (conversation topics, pick-up lines, what queens say
 * when they find you or leave, what the Court notices, rumors, and talk about
 * sisters, friends and rivals). A list in these files replaces the same list
 * in config.json, which stays as the fallback for anything left out.
 * talk.test.ts checks every file: keys, placeholders and repeats.
 * No path aliases (tests).
 */
import { CONFIG } from "../config.ts";
import type { LineKey, QueenKey } from "./rules.ts";
import alexstrasza from "./talk/alexstrasza.json" with { type: "json" };
import azshara from "./talk/azshara.json" with { type: "json" };
import eltharia from "./talk/eltharia.json" with { type: "json" };
import jaina from "./talk/jaina.json" with { type: "json" };
import onyxia from "./talk/onyxia.json" with { type: "json" };
import shared from "./talk/shared.json" with { type: "json" };
import sinestra from "./talk/sinestra.json" with { type: "json" };
import sylvanas from "./talk/sylvanas.json" with { type: "json" };
import tyrande from "./talk/tyrande.json" with { type: "json" };
import valeera from "./talk/valeera.json" with { type: "json" };
import xalatath from "./talk/xalatath.json" with { type: "json" };
import ysera from "./talk/ysera.json" with { type: "json" };

const C = CONFIG.court;

export interface Voice {
  /** Short words before a line. */
  open: string[];
  /** Short sentences after a line. */
  close: string[];
  /** Endings for when she is fond of you (tier 3 and up). */
  warm: string[];
  /** What she calls you. */
  pet: string[];
  /** What is on her mind, for {thing}. */
  things: string[];
  /** Her own small talk. */
  talk: string[];
  /** Asking to be fed: {count} reps of “{phrase}”. */
  feed: string[];
  /** Fed. */
  fed: string[];
  /** Going home unfed (or not prayed for). */
  hungry: string[];
  /** Asking for a prayer: {minutes} minutes of “{phrase}”, repeated nonstop. */
  pray: string[];
  /** Prayed for. */
  prayed: string[];
}

/** A conversation topic: what you ask, and answers any queen gives in her own words. */
export interface Topic {
  ask: string[];
  answer: string[];
}

export interface QueenTalk {
  queen: string;
  voice: Voice;
  lines: Partial<Record<LineKey, string[]>>;
}

export interface SharedTalk {
  topics: Record<string, Topic>;
  pickupLines: string[];
  presence: { lines: Record<string, string[]>; notices: Record<string, string[]> };
  rumors: Record<string, string[]>;
  bondTalk: Record<string, string[]>;
  /** Two queens with you: one says something to the other ({other}), by their bond. */
  duo: Record<string, string[]>;
  /** And the other answers ({other} is the first). */
  duoReply: Record<string, string[]>;
  /**
   * Two particular queens both with you ("a+b", in alphabetical order): what the
   * Court notices (notice), and what each says to the other (under her key).
   */
  pairs?: Record<string, Record<string, string[]>>;
  /** The talk screen: what you can say, by tone (sweet, bold, witty, humble, honest). */
  tones?: Record<string, string[]>;
  /** Her answer to a tone, by how she takes it (loved, liked, plain, disliked). */
  reacts?: Record<string, string[]>;
  /** Your apologies when she is jealous, by tone. */
  sorry?: Record<string, string[]>;
  /** Other things you can say there (more, bond, wish, memory, feeling, bye, pour). */
  ask?: Record<string, string[]>;
  /** Her answers to those: lists (more, bye, byeWarm, pour, empty), or lists by feeling or by how she takes it (feeling, sorry). */
  answers?: Record<string, string[] | Record<string, string[]>>;
  /** The exotic conversation, while crystal wine is open: topics like the others, but deeper, and answers any queen gives in her own voice. */
  exotic?: Record<string, Topic>;
  /** Things she asks you, each with your answers, one per tone. */
  herAsks?: { list: HerAsk[] };
}

/** A question of hers, and what you can answer, by tone. */
export interface HerAsk {
  ask: string;
  replies: Record<string, string>;
}

export const QUEEN_TALK = {
  eltharia,
  alexstrasza,
  ysera,
  onyxia,
  azshara,
  xalatath,
  jaina,
  tyrande,
  sylvanas,
  sinestra,
  valeera,
} as unknown as Record<QueenKey, QueenTalk>;

export const SHARED = shared as unknown as SharedTalk;

// ---- What each list may use ----

/** Filled in every queen line, voice piece and conversation. */
export const BASE_FILLS = [
  "pet",
  "thing",
  "place",
  "region",
  "skill",
  "level",
  "total",
  "gift",
  "time",
  "sister",
  "friend",
  "foe",
  "phrase",
  "passes",
  "dates",
] as const;

/** More, for a moment's lines. */
export const LINE_FILLS: Partial<Record<LineKey, string[]>> = {
  locked: ["need"],
  levelUp: ["skill", "level"],
  tierUp: ["tier"],
  missed: ["hours"],
  jealous: ["rival"],
  wish: ["count", "skill"],
  memory: ["count"],
};

/** Feeding lines also know {count}; asks must use {count} and {phrase}. */
export const FEED_FILLS = [...BASE_FILLS, "count"];
/** Prayer lines also know {minutes}; asks must use {minutes} and {phrase}. */
export const PRAY_FILLS = [...BASE_FILLS, "minutes"];

/** What queens say when they find you, and when they leave. */
const FOUND = ["hours", "rival", "passes", "streak", "dates"];
export const PRESENCE_FILLS: Record<"lines" | "notices", Record<string, string[]>> = {
  lines: {
    seeking: FOUND,
    lonely: FOUND,
    confront: FOUND,
    present: FOUND,
    leaveHappy: [],
    leaveHurt: [],
  },
  notices: {
    out: ["queen", "place"],
    outConfront: ["queen", "place"],
    found: ["queen"],
    leftHappy: ["queen"],
    leftHurt: ["queen"],
    rivals: ["queen", "other", "bond"],
    close: ["queen", "other", "bond"],
    doubleRival: ["queen", "other"],
    together: ["queen", "other", "bond"],
    alliance: ["queen", "other", "bond"],
    groupSister: ["queen", "other"],
    groupFriend: ["queen", "other"],
  },
};

/** A pair's lines: the notice uses no fills; what each says knows the other and what she calls you. */
export const PAIR_FILLS = { notice: [] as string[], queen: ["other", "pet"] };

/** The key of a pair of queens in shared.json pairs: the two, in alphabetical order, joined by +. */
export function pairName(a: string, b: string): string {
  return [a, b].sort().join("+");
}

/** Each rumor kind's names and values. */
const WHO = ["queen", "other"];
export const RUMOR_FILLS: Record<string, string[]> = {
  buzz: [...WHO, "mult"],
  favored: [...WHO, "skill"],
  gift: [...WHO, "gift"],
  need: [...WHO, "need"],
  wish: [...WHO, "count", "skill"],
  stranger: WHO,
  fond: WHO,
  devoted: WHO,
  jealous: WHO,
  longing: [...WHO, "hours"],
  bond: [...WHO, "bond"],
  rival: WHO,
  you: ["skill", "level", "reps"],
};

/** Two queens with you talking to each other ({other}, and what she calls you). */
export const DUO_FILLS: Record<string, string[]> = {
  sister: ["other", "pet"],
  friend: ["other", "pet"],
  rival: ["other", "pet"],
};

/** A queen talking about a sister, friend or rival ({other}). */
export const BOND_TALK_FILLS: Record<string, string[]> = {
  sister: ["other"],
  friend: ["other"],
  rival: ["other"],
};

// ---- The talk screen ----

/** The tones you can speak in, and how a queen can take one. */
export const TONE_KEYS = ["sweet", "bold", "witty", "humble", "honest"] as const;
export const TASTE_KEYS = ["loved", "liked", "plain", "disliked"] as const;
/** How she can feel when you ask: nothing special, one of her feelings (court.hearts.arcs), or jealous. */
export const FEELING_KEYS = [
  "calm",
  "lonely",
  "seeking",
  "present",
  "satisfied",
  "distant",
  "confront",
  "softened",
  "jealous",
] as const;

/** What you say knows only her name; a question about a bond also the other queen. */
export const ASK_FILLS: Record<string, string[]> = {
  more: ["queen"],
  bond: ["queen", "other"],
  wish: ["queen"],
  memory: ["queen"],
  feeling: ["queen"],
  bye: ["queen"],
  pour: ["queen"],
};
export const TONE_FILLS = ["queen"];
/** An apology (and her answer to it) also knows who she is jealous of. */
export const SORRY_FILLS = ["queen", "rival"];

// ---- The lists the game uses ----

function or(
  list: readonly string[] | undefined,
  fallback: readonly string[] | undefined,
): string[] {
  return list?.length ? [...list] : [...(fallback ?? [])];
}

/** Her lines for a moment (greet, watch, gift, ...). */
export function queenLines(q: QueenKey, key: LineKey): string[] {
  return or(QUEEN_TALK[q]?.lines?.[key], C.queens[q].lines[key]);
}

export function pickupLines(): string[] {
  return or(SHARED.pickupLines, C.pickupLines);
}

export function presenceLines(from: "lines" | "notices", kind: string): string[] {
  return or(SHARED.presence?.[from]?.[kind], C.presence[from][kind]);
}

export function rumorLines(kind: string): string[] {
  return or(SHARED.rumors?.[kind], C.news.rumors[kind]);
}

export function bondTalkLines(kind: string): string[] {
  return or(SHARED.bondTalk?.[kind], C.news.talk[kind]);
}

export function duoLines(kind: string): string[] {
  return [...(SHARED.duo?.[kind] ?? [])];
}

export function duoReplyLines(kind: string): string[] {
  return [...(SHARED.duoReply?.[kind] ?? [])];
}

/** Two particular queens with you: the Court's notice, and what each says to the other (empty when none). */
export function pairTalk(
  a: QueenKey,
  b: QueenKey,
): { notice: string[]; says: Record<string, string[]> } {
  const p = SHARED.pairs?.[pairName(a, b)];
  if (!p) return { notice: [], says: {} };
  return {
    notice: [...(p.notice ?? [])],
    says: { [a]: [...(p[a] ?? [])], [b]: [...(p[b] ?? [])] },
  };
}

/** What you can say in a tone (empty when the pack has none). */
export function toneLines(tone: string): string[] {
  return [...(SHARED.tones?.[tone] ?? [])];
}

/** Her answers to a tone she loved, liked, took plainly or disliked. */
export function reactLines(taste: string): string[] {
  return [...(SHARED.reacts?.[taste] ?? [])];
}

/** Your apologies in a tone, for when she is jealous. */
export function sorryLines(tone: string): string[] {
  return [...(SHARED.sorry?.[tone] ?? [])];
}

/** Other things you can say in the talk screen (more, bond, wish, memory, feeling, bye, pour). */
export function askLines(kind: string): string[] {
  return [...(SHARED.ask?.[kind] ?? [])];
}

/** Her answers there: a plain list (more, bye, byeWarm, pour, empty), or one of a kind's lists (feeling by how she feels, sorry by how she takes it). */
export function answerLines(kind: string, sub?: string): string[] {
  const a = SHARED.answers?.[kind];
  if (Array.isArray(a)) return [...a];
  if (!a || sub === undefined) return [];
  return [...(a[sub] ?? [])];
}

/** The exotic conversation's topics (what you ask while crystal wine is open, and the answers); notes starting with "_" are left out. */
export function exoticTopics(): Record<string, Topic> {
  const out: Record<string, Topic> = {};
  for (const [k, t] of Object.entries(SHARED.exotic ?? {}))
    if (!k.startsWith("_") && t && Array.isArray(t.ask) && Array.isArray(t.answer)) out[k] = t;
  return out;
}

/** The things she may ask you. */
export function herAsks(): HerAsk[] {
  return [...(SHARED.herAsks?.list ?? [])];
}
