/**
 * Recitation: practise a sector by saying it again and again at a steady pace,
 * tapping once per repetition. Recall: type the sector from memory and get
 * scored on it. Skill levels use the classic RuneScape curve.
 */

/** Time each word is held on screen during a drill (ms). */
export const WORD_MS = 900;

export type SkillKey = "recitation" | "recall";

export const SKILLS: { key: SkillKey; name: string; copy: string }[] = [
  {
    key: "recitation",
    name: "Recitation",
    copy: "Say a sector in your head to the beat, tap once per repetition. Each rep earns XP for every word.",
  },
  {
    key: "recall",
    name: "Recall",
    copy: "Type a sector from memory. The closer you get, the more XP you earn.",
  },
];

/** XP per word for one completed repetition. */
export const REP_XP_PER_WORD = 2;
/** XP per word for a perfect recall. Scaled by the score. */
export const RECALL_XP_PER_WORD = 6;

/** Total XP needed to reach a level (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  let points = 0;
  for (let l = 1; l < level; l++) points += Math.floor(l + 300 * Math.pow(2, l / 7));
  return Math.floor(points / 4);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 99 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Length of one full pass through the words, in ms. */
export function cycleMs(wordCount: number): number {
  return wordCount * WORD_MS;
}

/** Index of the word on screen at this time in a repeating drill. */
export function wordIndexAt(wordCount: number, ms: number): number {
  if (wordCount <= 0) return 0;
  return Math.floor(ms / WORD_MS) % wordCount;
}

/** Which repetition (pass through the words) a time falls in. */
export function repAt(wordCount: number, ms: number): number {
  if (wordCount <= 0) return 0;
  return Math.floor(ms / cycleMs(wordCount));
}

export interface RepState {
  reps: number;
  /** The last repetition that was already counted, so one tap counts one rep. */
  lastCountedRep: number;
}

/**
 * One tap counts one repetition: the first tap inside a pass counts, any extra
 * taps during the same pass are ignored.
 */
export function tapRep(state: RepState, rep: number): { state: RepState; counted: boolean } {
  if (rep <= state.lastCountedRep) return { state, counted: false };
  return { state: { reps: state.reps + 1, lastCountedRep: rep }, counted: true };
}

/** XP earned by a number of completed repetitions of a sector with this many words. */
export function repXp(wordCount: number, reps: number): number {
  return wordCount * REP_XP_PER_WORD * reps;
}

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * How much of the target was recalled, from 0 to 1. Words count when they appear
 * in order, so a missing or swapped word lowers the score.
 */
export function recallScore(typed: string, target: string): number {
  const want = normalise(target);
  if (!want.length) return 0;
  const got = normalise(typed);
  let matched = 0;
  let from = 0;
  for (const word of want) {
    const at = got.indexOf(word, from);
    if (at !== -1) {
      matched += 1;
      from = at + 1;
    }
  }
  return matched / want.length;
}

/** XP for a recall attempt. */
export function recallXp(wordCount: number, score: number): number {
  return Math.round(wordCount * RECALL_XP_PER_WORD * Math.max(0, Math.min(1, score)));
}

/** The wake core's level. It follows the Recitation skill, so tapping in the drill powers the core. */
export function coreLevel(skills: Record<SkillKey, number>): number {
  return levelForXp(skills.recitation);
}

/** Shot damage multiplier from the core level: `perLevel` for each level above 1, never more than `maxBonus`. */
export function coreDamageMultiplier(level: number, perLevel: number, maxBonus: number): number {
  return 1 + Math.max(0, Math.min(maxBonus, (level - 1) * perLevel));
}
