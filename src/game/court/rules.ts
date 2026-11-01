/**
 * The Court's rules: skills, XP from reciting, streaks, gold, the queens'
 * affection, gifts, dates, and the timing of a recite session. Pure, with
 * relative imports, so the tests can load it.
 */

import {
  CONFIG,
  type CourtElement,
  type CourtGiftKey,
  type CourtLineKey,
  type CourtPlaceKey,
  type CourtQueenKey,
  type CourtRegionKey,
  type CourtSkillKey,
} from "../config.ts";
import { levelForXp } from "../recite.ts";

const C = CONFIG.court;

export type SkillKey = CourtSkillKey;
export type QueenKey = CourtQueenKey;
export type GiftKey = CourtGiftKey;
export type PlaceKey = CourtPlaceKey;
export type Element = CourtElement;
export type LineKey = CourtLineKey;
export type RegionKey = CourtRegionKey;
export type Need = { skill: string; level: number };

export const SKILL_KEYS = Object.keys(C.skills) as SkillKey[];
export const QUEEN_KEYS = Object.keys(C.queens) as QueenKey[];
export const GIFT_KEYS = Object.keys(C.gifts) as GiftKey[];
export const REGION_KEYS = Object.keys(C.regions) as RegionKey[];

export function isRegion(k: unknown): k is RegionKey {
  return typeof k === "string" && k in C.regions;
}

export function isPlace(k: unknown): k is PlaceKey {
  return typeof k === "string" && k in C.places;
}

export function isSkill(k: unknown): k is SkillKey {
  return typeof k === "string" && k in C.skills;
}

/** What you keep between visits. */
export interface CourtSave {
  skills: Record<SkillKey, number>;
  gold: number;
  stance: Element;
  /** The region you are in, and where you stand there. */
  region: RegionKey;
  affection: Record<QueenKey, number>;
  gifts: Record<GiftKey, number>;
  /** Repetitions left on the Elixir of Focus. */
  elixirReps: number;
  /** Dates finished with each queen. */
  dates: Record<QueenKey, number>;
  pos: [number, number];
  /** Time each word is lit, and passes per phrase. */
  wordMs: number;
  repsPerPhrase: number;
  /** Phrases in a round, before the round is complete. */
  phrasesPerRound: number;
  stats: { reps: number; phrases: number; bestStreak: number };
  /** When you last spent time with each queen (ms since 1970); 0 for never. */
  lastSeen: Record<QueenKey, number>;
  /** How jealous each queen is, 0 to court.hearts.jealousMax. */
  jealous: Record<QueenKey, number>;
  /** Passes recited while each queen watched. */
  devotion: Record<QueenKey, number>;
  /** Each queen's portraits in the gallery: one bit per mood. */
  seen: Record<QueenKey, number>;
  /** Today's wishes: the day they are for, passes so far, and whether granted. */
  wishes: { day: number; progress: Record<QueenKey, number>; done: Record<QueenKey, boolean> };
  /** A feeling each queen has for a while (court.hearts.arcs): which ("" for none) and since when. */
  arcs: Record<QueenKey, { id: string; start: number }>;
  /** When you first met each queen (ms since 1970; 0 for not yet), and the gifts you gave her. */
  met: Record<QueenKey, number>;
  given: Record<QueenKey, number>;
  /** What the Court has said, newest first, and when you last read it. */
  news: NewsItem[];
  newsRead: number;
}

/** A notice or rumor kept in the News list. */
export interface NewsItem {
  at: number;
  text: string;
  queen: QueenKey | null;
  kind: string;
}

export function newSave(): CourtSave {
  const zero = <K extends string>(keys: K[]) =>
    Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  return {
    skills: zero(SKILL_KEYS),
    gold: 0,
    stance: "fire",
    region: "realm",
    affection: zero(QUEEN_KEYS),
    gifts: zero(GIFT_KEYS),
    elixirReps: 0,
    dates: zero(QUEEN_KEYS),
    pos: [C.regions.realm.start[0] ?? 0, C.regions.realm.start[1] ?? 0],
    wordMs: C.wordMs,
    repsPerPhrase: C.repsPerPhrase,
    phrasesPerRound: C.phrasesPerRound,
    stats: { reps: 0, phrases: 0, bestStreak: 0 },
    lastSeen: zero(QUEEN_KEYS),
    jealous: zero(QUEEN_KEYS),
    devotion: zero(QUEEN_KEYS),
    seen: zero(QUEEN_KEYS),
    wishes: {
      day: 0,
      progress: zero(QUEEN_KEYS),
      done: Object.fromEntries(QUEEN_KEYS.map((k) => [k, false])) as Record<QueenKey, boolean>,
    },
    arcs: Object.fromEntries(QUEEN_KEYS.map((k) => [k, { id: "", start: 0 }])) as Record<
      QueenKey,
      { id: string; start: number }
    >,
    met: zero(QUEEN_KEYS),
    given: zero(QUEEN_KEYS),
    news: [],
    newsRead: 0,
  };
}

export function skillLevel(xp: number): number {
  return levelForXp(xp);
}

export function totalLevel(skills: Record<SkillKey, number>): number {
  return SKILL_KEYS.reduce((n, k) => n + skillLevel(skills[k] ?? 0), 0);
}

/** The skill a place trains in a style, if any. */
export function skillAt(place: PlaceKey, stance: Element): SkillKey | null {
  const k = C.places[place][stance];
  return isSkill(k) ? k : null;
}

// ---- Phrases ----

const PHRASE_END = /[.!?]["'”’)\]]*$/;

export function wordsIn(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Letters and digits in a phrase, the part of its XP that grows with every character. */
export function lettersIn(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/** A sector split into phrases at sentence ends. */
export function phrasesOf(sector: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const w of wordsIn(sector)) {
    cur.push(w);
    if (PHRASE_END.test(w)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * A random phrase from all the loaded texts: always a whole sentence, never cut;
 * short ones are joined to the next. Sentences up to `max` words are preferred,
 * and a longer one comes whole when no shorter one turns up. `rand` gives
 * numbers in [0, 1).
 */
export function pickPhrase(
  texts: string[][],
  rand: () => number,
  min = C.minPhraseWords,
  max = C.maxPhraseWords,
): string {
  const sectors = texts.flat().filter((s) => wordsIn(s).length > 0);
  if (!sectors.length) return "Recite this phrase to the beat.";
  let shortestLong: string[] | null = null;
  for (let tries = 0; tries < 24; tries++) {
    const sector = sectors[Math.floor(rand() * sectors.length)] ?? "";
    const phrases = phrasesOf(sector);
    const start = Math.floor(rand() * phrases.length);
    const words: string[] = [...(phrases[start] ?? [])];
    for (let i = start + 1; words.length < min && i < phrases.length; i++)
      words.push(...(phrases[i] ?? []));
    if (words.length < Math.min(min, wordsIn(sector).length)) continue;
    if (words.length <= max) return words.join(" ");
    if (!shortestLong || words.length < shortestLong.length) shortestLong = words;
  }
  return (shortestLong ?? wordsIn(sectors[0] ?? "")).join(" ");
}

// ---- XP, gold and affection ----

/** Multiplier for a streak of counted passes in a row: 1, then up a step each time, to the cap. */
export function streakMult(streak: number): number {
  return Math.min(C.streakMax, 1 + C.streakStep * Math.max(0, streak - 1));
}

/** XP for one counted pass through a phrase, before multipliers: letters, words and the pass itself. */
export function passXp(words: number, letters: number): number {
  return letters * C.xp.perLetter + words * C.xp.perWord + C.xp.perRep;
}

/** The bonus for finishing every pass of a phrase. */
export function phraseXp(words: number): number {
  return words * C.xp.phrasePerWord;
}

export function passGold(words: number, place: PlaceKey): number {
  return Math.max(0, Math.round(words * C.goldPerWord * C.places[place].goldMult));
}

/**
 * A bonus set from Reps after a round: it pays as `reps` passes of its phrase
 * (no streak), times court.bonus.xpMult and goldMult; a watching queen adds her
 * XP bonus and feels court.bonus.affection.
 */
export function bonusReward(
  text: string,
  reps: number,
  place: PlaceKey,
  watched: boolean,
): { xp: number; gold: number; affection: number } {
  const n = Math.max(0, Math.floor(reps));
  const words = Math.max(1, wordsIn(text).length);
  const B = C.bonus;
  return {
    xp: passXp(words, lettersIn(text)) * n * B.xpMult * (watched ? 1 + C.watchedBonus : 1),
    gold: Math.max(0, Math.round(passGold(words, place) * n * B.goldMult)),
    affection: watched && n > 0 ? B.affection : 0,
  };
}

/** Affection a queen feels while you recite where she can see: more in her element, with a streak, on a date. */
export function affectionGain(
  words: number,
  queen: QueenKey,
  stance: Element,
  streak: number,
  date: boolean,
): number {
  const q = C.queens[queen];
  const element = q.element === stance ? 1 + C.affection.elementBonus : 1;
  return (
    words * C.affection.perWord * element * streakMult(streak) * (date ? C.affection.dateMult : 1)
  );
}

export function tierOf(affection: number): { index: number; name: string; next: number } {
  const tiers = C.affectionTiers;
  let index = 0;
  tiers.forEach((t, i) => {
    if (affection >= t.at) index = i;
  });
  return { index, name: tiers[index]?.name ?? "", next: tiers[index + 1]?.at ?? 0 };
}

/** Whether your levels meet a need: a skill's level, or the total level. */
export function needMet(need: Need, skills: Record<SkillKey, number>): boolean {
  if (!need.level) return true;
  if (need.skill === "total") return totalLevel(skills) >= need.level;
  return isSkill(need.skill) ? skillLevel(skills[need.skill]) >= need.level : true;
}

export function needLabel(need: Need): string {
  if (!need.level) return "";
  const name =
    need.skill === "total"
      ? "Total level"
      : isSkill(need.skill)
        ? C.skills[need.skill].name
        : need.skill;
  return `${name} ${need.level}`;
}

/** Whether you meet what a queen asks before more than hello. */
export function meetsNeed(queen: QueenKey, skills: Record<SkillKey, number>): boolean {
  return needMet(C.queens[queen].need, skills);
}

export function needText(queen: QueenKey): string {
  return needLabel(C.queens[queen].need);
}

// ---- Regions and gates ----

export function regionOf(place: PlaceKey): RegionKey {
  const r = C.places[place].region;
  return isRegion(r) ? r : "realm";
}

/** Where a gate leads, or null for a place that is not a gate. */
export function gateOf(place: PlaceKey): { to: RegionKey; toPlace: PlaceKey; need: Need } | null {
  const g = C.places[place].gate;
  if (!g || !isRegion(g.to) || !isPlace(g.toPlace)) return null;
  return { to: g.to, toPlace: g.toPlace, need: g.need };
}

export function queensIn(region: RegionKey): QueenKey[] {
  return QUEEN_KEYS.filter(
    (q) => isPlace(C.queens[q].place) && regionOf(C.queens[q].place as PlaceKey) === region,
  );
}

/**
 * The gate to walk to first on the way from one region to another (the
 * shortest way through the gates), or null when already there or there is no way.
 */
export function firstGate(from: RegionKey, to: RegionKey): PlaceKey | null {
  if (from === to) return null;
  const first = new Map<RegionKey, PlaceKey>();
  const queue: RegionKey[] = [from];
  const seen = new Set<RegionKey>([from]);
  while (queue.length) {
    const r = queue.shift()!;
    for (const place of Object.keys(C.places) as PlaceKey[]) {
      if (regionOf(place) !== r) continue;
      const g = gateOf(place);
      if (!g || seen.has(g.to)) continue;
      seen.add(g.to);
      first.set(g.to, r === from ? place : first.get(r)!);
      if (g.to === to) return first.get(to)!;
      queue.push(g.to);
    }
  }
  return null;
}

/** What a gift is worth to a queen: double if it is her favourite. */
export function giftValue(queen: QueenKey, gift: GiftKey): number {
  return C.gifts[gift].value * (C.queens[queen].gift === gift ? 2 : 1);
}

/** A queen's line for a moment, with {skill}, {level}, {tier} and {need} filled in. */
export function queenLine(
  queen: QueenKey,
  key: LineKey,
  pick: number,
  fill: Record<string, string | number> = {},
): string {
  const list = C.queens[queen].lines[key] ?? [];
  const raw = list[Math.min(list.length - 1, Math.floor(pick * list.length))] ?? "";
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in fill ? String(fill[k]) : m));
}

/** The queen who stands at a place, if any. */
export function queenAt(place: PlaceKey): QueenKey | null {
  return QUEEN_KEYS.find((q) => C.queens[q].place === place) ?? null;
}

// ---- Recite sessions ----

/**
 * A recite session, in rounds: a round is phrasesPerRound phrases, each read
 * reps times. Each pass lights the phrase word by word, wordMs a word; when the
 * words finish, the pass waits for a tap. The tap completes it (XP and gold)
 * and starts the next pass at once; the last pass of a phrase adds the phrase
 * bonus and brings the next phrase; the last phrase completes the round.
 */
export interface Session {
  place: PlaceKey;
  skill: SkillKey;
  /** The queen watching, if any. */
  queen: QueenKey | null;
  date: boolean;
  phrase: string;
  words: string[];
  letters: number;
  /** Time each word is lit. */
  wordMs: number;
  reps: number;
  /** Phrases in a round. */
  round: number;
  /** The pass running or waiting (0-based), and when it began (ms). */
  pass: number;
  start: number;
  /** The words have finished: the pass waits for the tap that completes it. */
  waiting: boolean;
  /** The passes of this phrase completed. */
  hits: number[];
  /** Phrases completed in this round, and whether the round is complete. */
  roundPhrases: number;
  roundDone: boolean;
  streak: number;
  /** Phrases completed in the whole session. */
  phrases: number;
  totals: { xp: number; gold: number; reps: number };
  /** What this round has paid so far. */
  roundTotals: { xp: number; gold: number; reps: number; phrases: number };
  over: boolean;
}

export function startSession(
  o: {
    place: PlaceKey;
    skill: SkillKey;
    queen: QueenKey | null;
    date: boolean;
    wordMs: number;
    reps: number;
    round: number;
  },
  phrase: string,
  now: number,
): Session {
  return {
    ...o,
    round: Math.max(1, Math.floor(o.round)),
    phrase,
    words: wordsIn(phrase),
    letters: lettersIn(phrase),
    pass: 0,
    start: now,
    waiting: false,
    hits: [],
    roundPhrases: 0,
    roundDone: false,
    streak: 0,
    phrases: 0,
    totals: { xp: 0, gold: 0, reps: 0 },
    roundTotals: { xp: 0, gold: 0, reps: 0, phrases: 0 },
    over: false,
  };
}

/** Length of one pass through the phrase: every word lit for wordMs. */
export function passMs(s: Session): number {
  return Math.max(1, s.words.length) * s.wordMs;
}

/** The pass, the lit word, and how far through the pass (0 to 1). */
export function passAt(s: Session, now: number): { pass: number; word: number; progress: number } {
  if (s.waiting || s.roundDone)
    return { pass: s.pass, word: Math.max(0, s.words.length - 1), progress: 1 };
  const within = Math.max(0, now - s.start);
  return {
    pass: s.pass,
    word: Math.min(s.words.length - 1, Math.floor(within / s.wordMs)),
    progress: Math.min(1, within / passMs(s)),
  };
}

/** Time left in the running pass (ms); 0 once its words have finished. */
export function timeLeft(s: Session, now: number): number {
  return s.waiting || s.roundDone ? 0 : Math.max(0, passMs(s) - (now - s.start));
}

export type Reward =
  | { type: "pass"; xp: number; gold: number; streak: number }
  | { type: "phrase"; xp: number }
  | { type: "round" }
  | { type: "end" };

/** XP multiplier from everything but the streak: the elixir, a watching queen, a date. */
function bonusMult(s: Session, elixir: boolean): number {
  return (
    (elixir ? C.elixir.mult : 1) * (s.queen ? 1 + C.watchedBonus : 1) * (s.date ? C.dateXpMult : 1)
  );
}

/** Moves the session on to `now`: when the words finish, the pass waits for its tap. True when it just began to wait. */
export function advance(s: Session, now: number): boolean {
  if (s.over || s.waiting || s.roundDone || now - s.start < passMs(s)) return false;
  s.waiting = true;
  return true;
}

/**
 * The tap that completes a pass whose words have finished: it pays the pass
 * (more on a streak), then starts the next pass at once. After the last pass of
 * a phrase comes the phrase bonus and the next phrase; after the last phrase of
 * the round, the round is complete (and a date ends). While the words still
 * run, or once the round is done, a tap does nothing: [].
 */
export function tapComplete(
  s: Session,
  now: number,
  nextPhrase: () => string,
  elixir: boolean,
): Reward[] {
  if (s.over || s.roundDone || !s.waiting) return [];
  const out: Reward[] = [];
  s.hits.push(s.pass);
  s.streak += 1;
  const xp = passXp(s.words.length, s.letters) * streakMult(s.streak) * bonusMult(s, elixir);
  const gold = passGold(s.words.length, s.place);
  s.totals.xp += xp;
  s.totals.gold += gold;
  s.totals.reps += 1;
  s.roundTotals.xp += xp;
  s.roundTotals.gold += gold;
  s.roundTotals.reps += 1;
  out.push({ type: "pass", xp, gold, streak: s.streak });
  s.waiting = false;
  if (s.pass < s.reps - 1) {
    s.pass += 1;
    s.start = now;
    return out;
  }
  const bonus = phraseXp(s.words.length) * bonusMult(s, elixir);
  s.totals.xp += bonus;
  s.roundTotals.xp += bonus;
  s.phrases += 1;
  s.roundPhrases += 1;
  s.roundTotals.phrases += 1;
  out.push({ type: "phrase", xp: bonus });
  if (s.roundPhrases >= s.round) {
    s.roundDone = true;
    out.push({ type: "round" });
    if (s.date) {
      s.over = true;
      out.push({ type: "end" });
    }
    return out;
  }
  newPhrase(s, nextPhrase(), now);
  return out;
}

function newPhrase(s: Session, phrase: string, now: number) {
  s.phrase = phrase;
  s.words = wordsIn(phrase);
  s.letters = lettersIn(phrase);
  s.pass = 0;
  s.hits = [];
  s.waiting = false;
  s.start = now;
}

/** After a complete round, another: round phrases, starting now. */
export function nextRound(s: Session, now: number, phrase: string, round = s.round) {
  if (s.over || !s.roundDone) return;
  s.round = Math.max(1, Math.floor(round));
  s.roundDone = false;
  s.roundPhrases = 0;
  s.roundTotals = { xp: 0, gold: 0, reps: 0, phrases: 0 };
  newPhrase(s, phrase, now);
}

/** A different phrase now, in place of this one, without its bonus; the round's count stays. */
export function skipPhrase(s: Session, now: number, phrase: string) {
  if (s.over || s.roundDone) return;
  newPhrase(s, phrase, now);
}
