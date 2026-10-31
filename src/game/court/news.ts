/**
 * What the Court says: the queen the town is talking about today, rumors about
 * you and the queens (who loves what, who misses you, who is jealous of whom,
 * which sisters talked about you all night), the queens talking about their
 * sisters, friends and rivals, and the News list that keeps it all. Pure, with
 * relative imports, so the tests can load it. Tuned in court.news in config.json.
 */

import { CONFIG } from "../config.ts";
import {
  meetsNeed,
  needText,
  QUEEN_KEYS,
  SKILL_KEYS,
  skillLevel,
  tierOf,
  type CourtSave,
  type NewsItem,
  type QueenKey,
  type SkillKey,
} from "./rules.ts";
import { BOND_NAME, bondsOf, hoursAway, missesYou, wishOf } from "./hearts.ts";

const C = CONFIG.court;
const N = C.news;

export const RUMOR_KINDS = [
  "buzz",
  "favored",
  "gift",
  "need",
  "wish",
  "stranger",
  "fond",
  "devoted",
  "jealous",
  "longing",
  "bond",
  "rival",
  "you",
] as const;
export type RumorKind = (typeof RUMOR_KINDS)[number];

/** How often each kind comes up, when it can: the heartfelt ones most. */
const WEIGHT: Record<RumorKind, number> = {
  buzz: 1,
  favored: 0.6,
  gift: 0.6,
  need: 0.8,
  wish: 1,
  stranger: 1,
  fond: 1.5,
  devoted: 1.5,
  jealous: 2,
  longing: 2,
  bond: 1.5,
  rival: 1.5,
  you: 0.8,
};

export interface Rumor {
  kind: RumorKind;
  /** Who it is about (her portrait and colour), and who else is in it. */
  queen: QueenKey | null;
  other: QueenKey | null;
  text: string;
}

/** Fills {name} in a line; names it does not know stay as they are. */
export function fillLine(line: string, values: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

function pick<T>(list: readonly T[], rand: () => number): T | undefined {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

// ---- Talk of the town ----

/** The queen the town is talking about on a day (local days, as wishes are). */
export function buzzOf(day: number): QueenKey {
  const mix = Math.imul((day + 11) ^ 0x5bd1e995, 2246822519) >>> 0;
  return QUEEN_KEYS[mix % QUEEN_KEYS.length] ?? "eltharia";
}

/** Affection for her today is multiplied by this. */
export function buzzMult(q: QueenKey, day: number): number {
  return buzzOf(day) === q ? N.buzzMult : 1;
}

// ---- Rumors ----

interface Candidate {
  kind: RumorKind;
  queen: QueenKey | null;
  other: QueenKey | null;
  values: Record<string, string | number>;
}

/** Everything the town could say now, one candidate per kind and queen it fits. */
export function rumorsNow(
  save: CourtSave,
  day: number,
  now: number,
  rand: () => number,
): Candidate[] {
  const out: Candidate[] = [];
  const add = (
    kind: RumorKind,
    queen: QueenKey | null,
    other: QueenKey | null,
    values: Record<string, string | number> = {},
  ) => {
    if (!(N.rumors[kind]?.length ?? 0)) return;
    const names = {
      queen: queen ? C.queens[queen].name : "",
      other: other ? C.queens[other].name : "",
    };
    out.push({ kind, queen, other, values: { ...names, ...values } });
  };
  add("buzz", buzzOf(day), null, { mult: N.buzzMult });
  const fondest = (q: QueenKey) =>
    QUEEN_KEYS.filter((r) => r !== q).sort((a, b) => save.affection[b] - save.affection[a])[0] ??
    null;
  for (const q of QUEEN_KEYS) {
    const spec = C.queens[q];
    const ok = meetsNeed(q, save.skills);
    const tier = tierOf(save.affection[q]).index;
    const favored = spec.favored.filter((k): k is SkillKey => k in C.skills);
    const skill = pick(favored, rand);
    if (skill) add("favored", q, null, { skill: C.skills[skill].name });
    const gift = C.gifts[spec.gift as keyof typeof C.gifts];
    if (gift) add("gift", q, null, { gift: gift.name });
    if (!ok) {
      add("need", q, null, { need: needText(q) });
      continue;
    }
    // Wishes are for today: a save still on another day has every wish open.
    const done = save.wishes.day === day && save.wishes.done[q];
    if (!done) {
      const w = wishOf(q, day);
      add("wish", q, null, { count: w.passes, skill: C.skills[w.skill].name });
    }
    if (tier === 0) add("stranger", q, null);
    else if (tier >= 4) add("devoted", q, null);
    else if (tier >= 2) add("fond", q, null);
    if (save.jealous[q] > 0) add("jealous", q, fondest(q));
    if (missesYou(save, q, now))
      add("longing", q, null, { hours: Math.floor(hoursAway(save, q, now)) });
    for (const b of bondsOf(q)) {
      // Each pair once: from the first of the two in the list of queens.
      if (QUEEN_KEYS.indexOf(b.queen) < QUEEN_KEYS.indexOf(q)) continue;
      const known = save.affection[q] > 0 || save.affection[b.queen] > 0;
      if (b.kind === "rival") {
        if (tier >= 1 && tierOf(save.affection[b.queen]).index >= 1) add("rival", q, b.queen);
      } else if (known) add("bond", q, b.queen, { bond: BOND_NAME[b.kind] });
    }
  }
  if (save.stats.reps > 0) {
    const best = [...SKILL_KEYS].sort((a, b) => save.skills[b] - save.skills[a])[0];
    if (best && skillLevel(save.skills[best]) >= 2)
      add("you", null, null, {
        skill: C.skills[best].name,
        level: skillLevel(save.skills[best]),
        reps: save.stats.reps.toLocaleString("en"),
      });
  }
  return out;
}

/**
 * A rumor: a kind by its weight (not the last kind told, when another can be
 * told), then a queen it fits (not the last queen, when another fits).
 */
export function makeRumor(
  save: CourtSave,
  day: number,
  now: number,
  rand: () => number,
  avoid: { kind?: string; queen?: QueenKey | null } = {},
): Rumor | null {
  const all = rumorsNow(save, day, now, rand);
  if (!all.length) return null;
  const kinds = RUMOR_KINDS.filter((k) => all.some((c) => c.kind === k));
  const fresh = kinds.filter((k) => k !== avoid.kind);
  const choose = fresh.length ? fresh : kinds;
  const total = choose.reduce((n, k) => n + WEIGHT[k], 0);
  let roll = rand() * total;
  let kind = choose[choose.length - 1]!;
  for (const k of choose) {
    roll -= WEIGHT[k];
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  const of = all.filter((c) => c.kind === kind);
  const others = of.filter((c) => !avoid.queen || c.queen !== avoid.queen);
  const c = pick(others.length ? others : of, rand)!;
  const line = pick(N.rumors[kind] ?? [], rand) ?? "";
  return { kind, queen: c.queen, other: c.other, text: fillLine(line, c.values) };
}

/** A queen talking about one of her sisters, friends or rivals, or null if she has none. */
export function bondTalk(
  q: QueenKey,
  rand: () => number,
): { other: QueenKey; text: string } | null {
  const bonds = bondsOf(q).filter((b) => (N.talk[b.kind]?.length ?? 0) > 0);
  const b = pick(bonds, rand);
  if (!b) return null;
  const line = pick(N.talk[b.kind] ?? [], rand) ?? "";
  return { other: b.queen, text: fillLine(line, { other: C.queens[b.queen].name }) };
}

// ---- The News list ----

/** Keeps a notice or rumor, newest first, up to court.news.keep. */
export function addNews(save: CourtSave, item: NewsItem) {
  save.news.unshift(item);
  if (save.news.length > N.keep) save.news.length = Math.max(0, N.keep);
}

/** News you have not read yet. */
export function unreadNews(save: CourtSave): number {
  return save.news.filter((n) => n.at > save.newsRead).length;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(at: number, now: number): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Reads first meetings, gifts given and the News list from a saved game, keeping only sound values. */
export function loadNews(save: CourtSave, data: unknown) {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const met = rec(d.met);
  const given = rec(d.given);
  for (const q of QUEEN_KEYS) {
    save.met[q] = num(met[q]);
    save.given[q] = num(given[q]);
  }
  save.newsRead = num(d.newsRead);
  const list = Array.isArray(d.news) ? d.news : [];
  save.news = [];
  for (const raw of list) {
    const n = rec(raw);
    if (typeof n.text !== "string" || !n.text) continue;
    const queen = QUEEN_KEYS.find((q) => q === n.queen) ?? null;
    save.news.push({
      at: num(n.at),
      text: n.text.slice(0, 300),
      queen,
      kind: typeof n.kind === "string" ? n.kind.slice(0, 20) : "notice",
    });
    if (save.news.length >= N.keep) break;
  }
}
