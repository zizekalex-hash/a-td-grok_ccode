/**
 * Pieces, stars, traits, shop odds and the hit roll for auto chess. Pure data
 * and arithmetic over config.json, with no path aliases, so the tests can load it directly.
 */

import { CONFIG, type ChessPieceKey, type ChessPieceSpec, type ChessStat, type ChessTraitSpec } from "../config.ts";

export type PieceKey = ChessPieceKey;
export type Stat = ChessStat;

const CH = CONFIG.chess;

export const PIECES: Record<PieceKey, ChessPieceSpec> = CH.pieces;
export const TRAITS: Record<PieceKey, ChessTraitSpec> = CH.traits;
/** Shop and trait order. */
export const PIECE_KEYS: PieceKey[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
export const STATS: Stat[] = ["hp", "maxHit", "acc", "def"];

/** Squares on a side of the board. */
export const SIZE = 8;
/** Rows on each side a player sets pieces on: yours are the lower four. */
export const HOME_ROWS = 4;
export const MAX_LEVEL = CH.levelXp.length + 1;

/** Solid glyphs, drawn in each side's colour. */
export const GLYPH: Record<PieceKey, string> = {
  pawn: "♟",
  knight: "♞",
  bishop: "♝",
  rook: "♜",
  queen: "♛",
  king: "♚",
};

export function isStat(s: string): s is Stat {
  return (STATS as string[]).includes(s);
}

/** Seeded random numbers (mulberry32): the same seed plays the same game. */
export function rand(s: { seed: number }): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** RuneScape's hit chance: the accuracy roll against the defence roll. */
export function hitChance(acc: number, def: number): number {
  const a = Math.max(0, acc);
  const d = Math.max(0, def);
  return a > d ? 1 - (d + 2) / (2 * (a + 1)) : a / (2 * (d + 1));
}

export interface PieceStats {
  hp: number;
  maxHit: number;
  acc: number;
  def: number;
  speed: number;
  range: number;
  moveTicks: number;
}

export type Bonus = Partial<Record<Stat, number>>;

/** A piece's stats at a number of stars, with trait bonuses (0.3 = +30%). */
export function pieceStats(key: PieceKey, star: number, bonus: Bonus = {}): PieceStats {
  const p = PIECES[key];
  const up = Math.max(0, star - 1);
  const grow = CH.starGrowth ** up;
  const roll = CH.starRollGrowth ** up;
  const b = (k: Stat) => 1 + (bonus[k] ?? 0);
  return {
    hp: Math.max(1, Math.round(p.hp * grow * b("hp"))),
    maxHit: Math.max(1, Math.round(p.maxHit * grow * b("maxHit"))),
    acc: Math.round(p.acc * roll * b("acc")),
    def: Math.round(p.def * roll * b("def")),
    speed: Math.max(1, Math.round(p.speed)),
    range: Math.max(1, Math.round(p.range)),
    moveTicks: Math.max(1, Math.round(p.moveTicks)),
  };
}

/** Gold back for selling: every copy that went into it, at full price. */
export function sellValue(key: PieceKey, star: number): number {
  return PIECES[key].cost * 3 ** (star - 1);
}

/** XP needed at a level to reach the next one; 0 at the top level. */
export function xpNeed(level: number): number {
  return CH.levelXp[level - 1] ?? 0;
}

export interface TraitState {
  key: PieceKey;
  name: string;
  copy: string;
  count: number;
  /** Steps reached (0 = none yet). */
  step: number;
  /** Pieces needed for the next step, or 0 when all are reached. */
  next: number;
  /** Bonus at the step reached. */
  bonus: number;
  stat: Stat;
  all: boolean;
  needs: number[];
}

/** Every trait with at least one piece of its kind among `kinds`. */
export function traitsFor(kinds: PieceKey[]): TraitState[] {
  const out: TraitState[] = [];
  for (const key of PIECE_KEYS) {
    const count = kinds.filter((k) => k === key).length;
    if (!count) continue;
    const t = TRAITS[key];
    const steps = [...t.steps].sort((a, b) => a.need - b.need);
    let step = 0;
    let bonus = 0;
    steps.forEach((s, i) => {
      if (count >= s.need) {
        step = i + 1;
        bonus = s.bonus;
      }
    });
    out.push({
      key,
      name: t.name,
      copy: t.copy,
      count,
      step,
      next: steps[step]?.need ?? 0,
      bonus,
      stat: isStat(t.stat) ? t.stat : "def",
      all: t.all,
      needs: steps.map((s) => s.need),
    });
  }
  return out;
}

/** What the active traits add to one kind of piece. */
export function bonusFor(kind: PieceKey, traits: TraitState[]): Bonus {
  const b: Bonus = {};
  for (const t of traits) {
    if (t.step === 0 || (!t.all && t.key !== kind)) continue;
    b[t.stat] = (b[t.stat] ?? 0) + t.bonus;
  }
  return b;
}

/** Chance in percent of each tier (1 to 5) at a level. */
export function tierOdds(level: number): number[] {
  const rows = CH.odds;
  return rows[Math.max(0, Math.min(rows.length - 1, level - 1))] ?? [100];
}

export function piecesOfTier(tier: number): PieceKey[] {
  return PIECE_KEYS.filter((k) => PIECES[k].tier === tier);
}

/** A shop slot's piece for a roll in [0, 1). Tiers with no pieces are skipped. */
export function shopPiece(level: number, r1: number, r2: number): PieceKey {
  const odds = tierOdds(level).map((w, i) => (piecesOfTier(i + 1).length ? Math.max(0, w) : 0));
  const total = odds.reduce((a, b) => a + b, 0);
  let tier = 1;
  if (total > 0) {
    let x = r1 * total;
    for (let i = 0; i < odds.length; i++) {
      x -= odds[i] ?? 0;
      if (x < 0) {
        tier = i + 1;
        break;
      }
    }
  }
  const list = piecesOfTier(tier);
  const pool = list.length ? list : PIECE_KEYS;
  return pool[Math.min(pool.length - 1, Math.floor(r2 * pool.length))] ?? "pawn";
}
