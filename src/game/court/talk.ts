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
  /** Going home unfed. */
  hungry: string[];
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

/** What queens say when they find you, and when they leave. */
const FOUND = ["hours", "rival", "passes", "streak"];
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
  },
};

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

/** A queen talking about a sister, friend or rival ({other}). */
export const BOND_TALK_FILLS: Record<string, string[]> = {
  sister: ["other"],
  friend: ["other"],
  rival: ["other"],
};

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
