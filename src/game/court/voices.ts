/**
 * How each queen talks, in pieces that combine (see speech.ts): words she
 * opens with and ends on, what she calls you, the things on her mind, her own
 * small talk, and what she says when she wants feeding or has been fed; and the
 * conversation topics. The words themselves live in the talk pack
 * (src/game/court/talk/*.json, see talk.ts and GROK_TALK.md).
 * No path aliases (tests).
 */
import { QUEEN_KEYS, type QueenKey } from "./rules.ts";
import { QUEEN_TALK, SHARED, type Topic, type Voice } from "./talk.ts";

export type { Topic, Voice };

export const VOICES = Object.fromEntries(QUEEN_KEYS.map((q) => [q, QUEEN_TALK[q].voice])) as Record<
  QueenKey,
  Voice
>;

export const TOPICS: Record<string, Topic> = SHARED.topics;
