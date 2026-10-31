/**
 * How the queens feel about you: her mood (and the gallery of every mood you
 * have seen), missing you after a long time away, jealousy of her rivals,
 * a wish each day, and the passes she remembers. Pure, with relative imports,
 * so the tests can load it. Tuned in court.hearts in config.json.
 */

import { CONFIG, type CourtArcKey } from "../config.ts";
import {
  isSkill,
  meetsNeed,
  QUEEN_KEYS,
  regionOf,
  tierOf,
  type CourtSave,
  type PlaceKey,
  type QueenKey,
  type SkillKey,
} from "./rules.ts";

const C = CONFIG.court;
const H = C.hearts;

export const MOODS = [
  "aloof",
  "smile",
  "delighted",
  "blush",
  "smitten",
  "adoring",
  "jealous",
  "longing",
  "fierce",
] as const;
export type Mood = (typeof MOODS)[number];

/** Each mood's name, and how to see it. */
export const MOOD_INFO: Record<Mood, { name: string; hint: string }> = {
  aloof: { name: "Aloof", hint: "Meet her." },
  smile: { name: "Smiling", hint: `Become ${C.affectionTiers[1]?.name ?? "Noticed"}.` },
  delighted: {
    name: "Delighted",
    hint: "Give her favourite gift, level a skill she loves, or grant her wish.",
  },
  blush: { name: "Blushing", hint: `Reach ${C.affectionTiers[3]?.name ?? "Fond"}.` },
  smitten: { name: "Smitten", hint: `Reach ${C.affectionTiers[4]?.name ?? "Smitten"}.` },
  adoring: { name: "Adoring", hint: `Reach ${C.affectionTiers[5]?.name ?? "Devoted"}.` },
  jealous: { name: "Jealous", hint: "Spoil a rival in her region while she cares." },
  longing: { name: "Longing", hint: `Come back to her after ${H.missAfterHours} hours away.` },
  fierce: { name: "Fierce", hint: `Keep a streak of ${H.fierceStreak} while she watches.` },
};

/** Every queen's every mood: the gallery's size. */
export const GALLERY_SIZE = QUEEN_KEYS.length * MOODS.length;

/** A mood from a moment (a loved gift, a long streak, a reunion), until a time. */
export interface Flash {
  mood: Mood;
  until: number;
}

/** How she looks at you when nothing in particular is happening: warmer with every tier. */
export function baseMood(tier: number): Mood {
  if (tier >= 5) return "adoring";
  if (tier >= 4) return "smitten";
  if (tier >= 3) return "blush";
  if (tier >= 1) return "smile";
  return "aloof";
}

/** Her mood now: jealousy first, then a moment's mood, then a feeling she has for a while, then her tier's. */
export function moodOf(save: CourtSave, q: QueenKey, flash: Flash | undefined, now: number): Mood {
  if (save.jealous[q] > 0) return "jealous";
  if (flash && flash.until > now) return flash.mood;
  const arc = arcOf(save, q, now);
  if (arc) return arc.mood;
  return baseMood(tierOf(save.affection[q]).index);
}

// ---- Feelings that last a while ----

export const ARC_KEYS: CourtArcKey[] = [
  "lonely",
  "seeking",
  "present",
  "satisfied",
  "distant",
  "confront",
  "softened",
];

export function isArc(v: unknown): v is CourtArcKey {
  return typeof v === "string" && (ARC_KEYS as string[]).includes(v);
}

function isMood(v: unknown): v is Mood {
  return typeof v === "string" && (MOODS as readonly string[]).includes(v);
}

/** The feeling she has now, its mood, when it ends and how it changes her affection; null when none. */
export function arcOf(
  save: CourtSave,
  q: QueenKey,
  now: number,
): { id: CourtArcKey; mood: Mood; ends: number; mult: number } | null {
  const a = save.arcs[q];
  if (!a || !isArc(a.id)) return null;
  const spec = H.arcs[a.id];
  const ends = a.start + spec.durationMinutes * 60_000;
  if (now >= ends || now < a.start) return null;
  return {
    id: a.id,
    mood: isMood(spec.mood) ? spec.mood : baseMood(tierOf(save.affection[q]).index),
    ends,
    mult: spec.affection > 0 ? spec.affection : 1,
  };
}

/** Gives her a feeling from now, in place of any other. */
export function setArc(save: CourtSave, q: QueenKey, id: CourtArcKey, now: number) {
  save.arcs[q] = { id, start: now };
}

/** Affection is multiplied by this while she has a feeling. */
export function arcMult(save: CourtSave, q: QueenKey, now: number): number {
  return arcOf(save, q, now)?.mult ?? 1;
}

// ---- The gallery ----

export function hasSeen(save: CourtSave, q: QueenKey, mood: Mood): boolean {
  return (save.seen[q] & (1 << MOODS.indexOf(mood))) !== 0;
}

/** Adds a mood to her gallery; true when it is new. */
export function markSeen(save: CourtSave, q: QueenKey, mood: Mood): boolean {
  if (hasSeen(save, q, mood)) return false;
  save.seen[q] |= 1 << MOODS.indexOf(mood);
  return true;
}

export function seenCount(save: CourtSave, q?: QueenKey): number {
  const keys = q ? [q] : QUEEN_KEYS;
  let n = 0;
  for (const k of keys) for (const m of MOODS) if (hasSeen(save, k, m)) n += 1;
  return n;
}

// ---- Missing you ----

/** Hours since you last spent time with her; 0 if you never have. */
export function hoursAway(save: CourtSave, q: QueenKey, now: number): number {
  const t = save.lastSeen[q];
  return t > 0 ? Math.max(0, (now - t) / 3_600_000) : 0;
}

/** Whether she has missed you: you know each other, and you have been away long enough. */
export function missesYou(save: CourtSave, q: QueenKey, now: number): boolean {
  return tierOf(save.affection[q]).index >= 1 && hoursAway(save, q, now) >= H.missAfterHours;
}

// ---- Bonds between the queens ----

export type BondKind = "sister" | "friend" | "rival";
export const BOND_NAME: Record<BondKind, string> = {
  sister: "sister",
  friend: "friend",
  rival: "rival",
};

/** How two queens are bound (court.news.bonds, each pair once, either way round), or null. */
export function bondOf(a: QueenKey, b: QueenKey): BondKind | null {
  if (a === b) return null;
  const B = C.news.bonds;
  const k = B[a]?.[b] ?? B[b]?.[a];
  return k === "sister" || k === "friend" || k === "rival" ? k : null;
}

/** Every queen bound to q, sisters first, then friends, then rivals. */
export function bondsOf(q: QueenKey): { queen: QueenKey; kind: BondKind }[] {
  const order: BondKind[] = ["sister", "friend", "rival"];
  return QUEEN_KEYS.flatMap((r) => {
    const kind = bondOf(q, r);
    return kind ? [{ queen: r, kind }] : [];
  }).sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
}

/** Whether you have met her: she meets you (her need) and you have won some affection. */
function knowsYou(save: CourtSave, q: QueenKey): boolean {
  return meetsNeed(q, save.skills) && save.affection[q] > 0;
}

/** Courting q: her sisters and friends who know you hear of it and put in a good word; who they are. */
export function goodWord(save: CourtSave, q: QueenKey): QueenKey[] {
  return bondsOf(q)
    .filter((b) => b.kind !== "rival" && knowsYou(save, b.queen))
    .map((b) => b.queen);
}

// ---- Jealousy ----

/**
 * The queens who would be jealous if you courted q: talking to you, fond enough
 * to care, and either her rival or in her region (but never her sister or friend).
 */
export function rivalsOf(save: CourtSave, q: QueenKey): QueenKey[] {
  const region = regionOf(C.queens[q].place as PlaceKey);
  return QUEEN_KEYS.filter((r) => {
    if (r === q) return false;
    const bond = bondOf(q, r);
    if (bond === "sister" || bond === "friend") return false;
    const near = bond === "rival" || regionOf(C.queens[r].place as PlaceKey) === region;
    return near && tierOf(save.affection[r]).index >= H.jealousTier && meetsNeed(r, save.skills);
  });
}

/** Courting q makes her rivals more jealous; the ones whose jealousy grew. */
export function stirJealousy(save: CourtSave, q: QueenKey): QueenKey[] {
  const grew: QueenKey[] = [];
  for (const r of rivalsOf(save, q)) {
    if (save.jealous[r] >= H.jealousMax) continue;
    save.jealous[r] += 1;
    grew.push(r);
  }
  return grew;
}

/** Affection from reciting is less while she is jealous. */
export function jealousMult(save: CourtSave, q: QueenKey): number {
  return save.jealous[q] > 0 ? H.jealousMult : 1;
}

/** Makes up a little (a phrase recited for her) or all the way (a gift); true when it is over. */
export function soothe(save: CourtSave, q: QueenKey, all: boolean): boolean {
  if (save.jealous[q] <= 0) return false;
  save.jealous[q] = all ? 0 : save.jealous[q] - 1;
  return save.jealous[q] === 0;
}

// ---- Wishes ----

/** A day number in local time, so wishes change at midnight. */
export function dayOf(ms: number): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);
}

/** What she wishes for on a day: passes of one of her favourite skills. */
export function wishOf(q: QueenKey, day: number): { skill: SkillKey; passes: number } {
  const favored = C.queens[q].favored.filter(isSkill);
  const mix = Math.imul((day + 7) ^ ((QUEEN_KEYS.indexOf(q) + 1) * 40503), 2654435761) >>> 0;
  return { skill: favored[mix % Math.max(1, favored.length)] ?? "charisma", passes: H.wishPasses };
}

/** Starts a new day's wishes when the day has changed. */
export function rollDay(save: CourtSave, day: number): boolean {
  if (save.wishes.day === day) return false;
  save.wishes.day = day;
  for (const q of QUEEN_KEYS) {
    save.wishes.progress[q] = 0;
    save.wishes.done[q] = false;
  }
  return true;
}

/** A pass of a skill counts towards every wish for it today; the queens whose wish it grants. */
export function countWish(save: CourtSave, skill: SkillKey, day: number): QueenKey[] {
  rollDay(save, day);
  const granted: QueenKey[] = [];
  for (const q of QUEEN_KEYS) {
    if (save.wishes.done[q] || !meetsNeed(q, save.skills)) continue;
    const wish = wishOf(q, day);
    if (wish.skill !== skill) continue;
    save.wishes.progress[q] += 1;
    if (save.wishes.progress[q] >= wish.passes) {
      save.wishes.done[q] = true;
      granted.push(q);
    }
  }
  return granted;
}

// ---- Memories ----

/** The milestone of passes recited for her that a pass just reached, or 0. */
export function memoryAt(before: number, after: number): number {
  return H.memories.find((m) => before < m && after >= m) ?? 0;
}

// ---- Saving ----

/** Reads the hearts from a saved game, keeping only sound values. */
export function loadHearts(save: CourtSave, data: unknown) {
  const d = (data && typeof data === "object" ? data : {}) as Partial<
    Record<keyof CourtSave, unknown>
  >;
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const num = (v: unknown, hi = Number.MAX_SAFE_INTEGER) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(0, v)) : 0;
  const lastSeen = rec(d.lastSeen);
  const jealous = rec(d.jealous);
  const devotion = rec(d.devotion);
  const seen = rec(d.seen);
  const arcs = rec(d.arcs);
  const wishes = rec(d.wishes);
  const progress = rec(wishes.progress);
  const done = rec(wishes.done);
  const allMoods = (1 << MOODS.length) - 1;
  for (const q of QUEEN_KEYS) {
    save.lastSeen[q] = num(lastSeen[q]);
    save.jealous[q] = Math.round(num(jealous[q], H.jealousMax));
    save.devotion[q] = Math.floor(num(devotion[q]));
    save.seen[q] = Math.floor(num(seen[q])) & allMoods;
    const arc = rec(arcs[q]);
    save.arcs[q] = isArc(arc.id) ? { id: arc.id, start: num(arc.start) } : { id: "", start: 0 };
    save.wishes.progress[q] = Math.floor(num(progress[q]));
    save.wishes.done[q] = done[q] === true;
  }
  save.wishes.day = Math.floor(num(wishes.day));
}
