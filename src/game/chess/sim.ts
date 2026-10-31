/**
 * Auto chess: buy pieces, set them on your half of an 8 by 8 board, and they
 * fight a computer board on their own, tick by tick. Rounds never end; every few
 * a boss leads the other side. Pure state and functions, so the tests can run whole games.
 */

import { CONFIG } from "../config.ts";
import {
  bonusFor,
  hitChance,
  HOME_ROWS,
  MAX_LEVEL,
  PIECE_KEYS,
  PIECES,
  pieceStats,
  rand,
  sellValue,
  shopPiece,
  SIZE,
  traitsFor,
  xpNeed,
  type PieceKey,
} from "./rules.ts";

const CH = CONFIG.chess;

export type ChessPhase = "plan" | "fight" | "result" | "over";
export type Area = "board" | "bench";

/** A piece you own. On the bench, col is the slot. */
export interface Piece {
  id: number;
  kind: PieceKey;
  star: number;
  area: Area;
  col: number;
  row: number;
}

/** A piece on the other side, as set for this round. */
export interface EnemyPiece {
  kind: PieceKey;
  star: number;
  col: number;
  row: number;
  /** Boss name, for a boss. */
  boss?: string;
  hpMult: number;
  hitMult: number;
}

/** A piece in a fight. Side 0 is yours and marches up; side 1 marches down. */
export interface Fighter {
  id: number;
  side: 0 | 1;
  kind: PieceKey;
  star: number;
  boss?: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  shield: number;
  mana: number;
  maxHit: number;
  acc: number;
  def: number;
  speed: number;
  range: number;
  moveTicks: number;
  atkCd: number;
  moveCd: number;
  stun: number;
  /** Turns in a row it found no way closer. */
  stuck: number;
  /** Attacks made, for the phrase on every Nth. */
  shots: number;
  promoted: boolean;
  target: number;
  dead: boolean;
}

export type ChessEvent =
  | {
      type: "attack";
      from: number;
      to: number;
      side: 0 | 1;
      fx: number;
      fy: number;
      tx: number;
      ty: number;
      hit: boolean;
      dmg: number;
      /** The ability this hit came from, if any. */
      ability?: string;
      text?: string;
    }
  | { type: "heal"; to: number; x: number; y: number; amount: number; text?: string }
  | { type: "shield"; to: number; x: number; y: number; amount: number; text?: string }
  | { type: "cast"; id: number; side: 0 | 1; x: number; y: number; name: string }
  | { type: "die"; id: number; side: 0 | 1; x: number; y: number; kind: PieceKey; boss?: string }
  | { type: "promote"; id: number; side: 0 | 1; x: number; y: number; text?: string }
  | { type: "fightStart"; boss?: string }
  | { type: "result"; win: boolean; damage: number; round: number; survivors: number; timeout: boolean }
  | { type: "round"; round: number; income: number; interest: number; win: number; boss?: string }
  | { type: "merge"; kind: PieceKey; star: number }
  | { type: "levelUp"; level: number }
  | { type: "over"; round: number };

export interface ChessState {
  seed: number;
  phase: ChessPhase;
  round: number;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  pieces: Piece[];
  nextId: number;
  shop: (PieceKey | null)[];
  enemy: EnemyPiece[];
  fighters: Fighter[];
  tick: number;
  /** Seconds banked toward the next fight tick. */
  clock: number;
  /** Seconds the round's result stays up. */
  resultLeft: number;
  lastWin: boolean | null;
  lastDamage: number;
  wins: number;
  losses: number;
  kills: number;
  events: ChessEvent[];
}

export type Result = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

const KING_STEPS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const ORTHO: [number, number][] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
const DIAG: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const KNIGHT: [number, number][] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];
/** Columns from the middle out, the order pawns and spare pieces fill a row. */
const CENTRE_OUT = [3, 4, 2, 5, 1, 6, 0, 7];
/** Squares on your back row for each piece, as in a chess opening. */
const BACK: Record<PieceKey, number[]> = {
  pawn: [],
  knight: [1, 6],
  bishop: [2, 5],
  rook: [0, 7],
  queen: [3],
  king: [4],
};

export function onBoard(col: number, row: number): boolean {
  return col >= 0 && col < SIZE && row >= 0 && row < SIZE;
}

/** Your half: the lower rows. */
export function isHome(row: number): boolean {
  return row >= SIZE - HOME_ROWS && row < SIZE;
}

export function dist(ac: number, ar: number, bc: number, br: number): number {
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
}

export function boardPieces(s: ChessState): Piece[] {
  return s.pieces.filter((p) => p.area === "board");
}

export function benchPieces(s: ChessState): Piece[] {
  return s.pieces.filter((p) => p.area === "bench");
}

/** Most pieces the board takes at a level. */
export function boardLimit(level: number): number {
  return level;
}

export function pieceAt(s: ChessState, col: number, row: number): Piece | undefined {
  return s.pieces.find((p) => p.area === "board" && p.col === col && p.row === row);
}

export function benchAt(s: ChessState, slot: number): Piece | undefined {
  return s.pieces.find((p) => p.area === "bench" && p.col === slot);
}

function freeBenchSlot(s: ChessState): number {
  for (let i = 0; i < CH.benchSize; i++) if (!benchAt(s, i)) return i;
  return -1;
}

/**
 * A free square for a piece: its chess-opening square first (pawns one row ahead
 * of the others), then any square on the side's half, back rows first.
 */
function homeSquare(kind: PieceKey, taken: (c: number, r: number) => boolean, enemy = false): [number, number] | null {
  const flip = (r: number) => (enemy ? SIZE - 1 - r : r);
  const back = SIZE - 1;
  const prefs: [number, number][] =
    kind === "pawn"
      ? CENTRE_OUT.map((c) => [c, back - 1] as [number, number])
      : BACK[kind].map((c) => [c, back] as [number, number]);
  for (const [c, r] of prefs) if (!taken(c, flip(r))) return [c, flip(r)];
  const rows = kind === "pawn" ? [back - 1, back - 2, back, back - 3] : [back, back - 1, back - 2, back - 3];
  for (const r of rows) for (const c of CENTRE_OUT) if (!taken(c, flip(r))) return [c, flip(r)];
  return null;
}

function emit(s: ChessState, e: ChessEvent) {
  s.events.push(e);
  if (s.events.length > 600) s.events.splice(0, s.events.length - 600);
}

function rollShop(s: ChessState) {
  s.shop = Array.from({ length: CH.shopSize }, () => shopPiece(s.level, rand(s), rand(s)));
}

function gainXp(s: ChessState, n: number) {
  if (s.level >= MAX_LEVEL) return;
  s.xp += n;
  while (s.level < MAX_LEVEL && s.xp >= xpNeed(s.level)) {
    s.xp -= xpNeed(s.level);
    s.level += 1;
    emit(s, { type: "levelUp", level: s.level });
  }
  if (s.level >= MAX_LEVEL) s.xp = 0;
}

export function isBossRound(round: number): boolean {
  return CH.enemy.bossEvery > 0 && round % CH.enemy.bossEvery === 0;
}

/** The boss leading a round, if it is a boss round. */
export function bossFor(round: number): { kind: PieceKey; name: string; index: number } | null {
  if (!isBossRound(round) || !CH.enemy.bosses.length) return null;
  const index = Math.round(round / CH.enemy.bossEvery);
  const spec = CH.enemy.bosses[(index - 1) % CH.enemy.bosses.length]!;
  const kind = (PIECE_KEYS as string[]).includes(spec.kind) ? (spec.kind as PieceKey) : "king";
  return { kind, name: spec.name, index };
}

/** What the other side's board is worth in gold at a round. */
export function enemyBudget(round: number): number {
  const E = CH.enemy;
  const r = Math.max(0, round - 1);
  return E.budget + E.budgetPerRound * r + E.budgetQuadratic * r * r;
}

/** Stat growth for the other side, once the rounds pass enemy.statsFrom. */
export function enemyStatMult(round: number): number {
  const E = CH.enemy;
  return round >= E.statsFrom ? 1 + E.statsPerRound * (round - E.statsFrom + 1) : 1;
}

/** Builds the other side's pieces for a round, from the seeded random numbers. */
export function makeEnemy(s: ChessState, round: number): EnemyPiece[] {
  const E = CH.enemy;
  let budget = enemyBudget(round);
  const units = Math.max(1, Math.min(E.maxUnits, Math.floor(E.unitsBase + E.unitsPerRound * (round - 1))));
  const maxTier = Math.min(5, 1 + Math.floor(round / Math.max(1, E.tierEvery)));
  const mult = enemyStatMult(round);
  const list: { kind: PieceKey; star: number; boss?: string; hpMult: number; hitMult: number }[] = [];
  const boss = bossFor(round);
  if (boss) {
    // A star more every fourth boss; until then they grow in life only.
    const star = Math.min(CH.maxStars, 1 + Math.floor((boss.index - 1) / 4));
    list.push({
      kind: boss.kind,
      star,
      boss: boss.name,
      hpMult: mult * (E.bossHp + E.bossHpPerBoss * (boss.index - 1)),
      hitMult: mult * E.bossHit,
    });
    budget *= 1 - E.bossShare;
  }
  const kinds = PIECE_KEYS.filter((k) => PIECES[k].tier <= maxTier);
  // Fill the ranks with single pieces it can pay for, cheaper ones more often.
  let guard = 0;
  while (list.length < units + (boss ? 1 : 0) && guard++ < 50) {
    const affordable = kinds.filter((k) => PIECES[k].cost <= budget);
    if (!affordable.length) break;
    const weights = affordable.map((k) => 1 / PIECES[k].tier);
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand(s) * total;
    let pick = affordable[0]!;
    for (let i = 0; i < affordable.length; i++) {
      x -= weights[i]!;
      if (x < 0) {
        pick = affordable[i]!;
        break;
      }
    }
    budget -= PIECES[pick].cost;
    list.push({ kind: pick, star: 1, hpMult: mult, hitMult: mult });
  }
  // Then spend what is left on stars, the lowest first.
  guard = 0;
  while (guard++ < 60) {
    const options = list.filter(
      (p) => !p.boss && p.star < CH.maxStars && PIECES[p.kind].cost * 2 * 3 ** (p.star - 1) <= budget,
    );
    if (!options.length) break;
    const low = Math.min(...options.map((p) => p.star));
    const pool = options.filter((p) => p.star === low);
    const p = pool[Math.floor(rand(s) * pool.length)]!;
    budget -= PIECES[p.kind].cost * 2 * 3 ** (p.star - 1);
    p.star += 1;
  }
  // Set them like a chess opening, at the top of the board.
  const out: EnemyPiece[] = [];
  const taken = (c: number, r: number) => out.some((p) => p.col === c && p.row === r);
  const order = [...list].sort((a, b) => (a.boss ? -1 : b.boss ? 1 : PIECES[b.kind].tier - PIECES[a.kind].tier));
  for (const p of order) {
    const sq = homeSquare(p.kind, taken, true);
    if (!sq) break;
    out.push({ ...p, col: sq[0], row: sq[1] });
  }
  return out;
}

export function createGame(seed = Date.now()): ChessState {
  const s: ChessState = {
    seed: seed | 0,
    phase: "plan",
    round: 1,
    hp: CH.startHp,
    gold: CH.startGold,
    level: Math.max(1, Math.min(MAX_LEVEL, CH.startLevel)),
    xp: 0,
    pieces: [],
    nextId: 1,
    shop: [],
    enemy: [],
    fighters: [],
    tick: 0,
    clock: 0,
    resultLeft: 0,
    lastWin: null,
    lastDamage: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    events: [],
  };
  rollShop(s);
  s.enemy = makeEnemy(s, 1);
  return s;
}

/** Copies of a piece at a star you own, on the board and the bench. */
export function owned(s: ChessState, kind: PieceKey, star = 1): number {
  return s.pieces.filter((p) => p.kind === kind && p.star === star).length;
}

/** Merges every three copies at the same stars into one with a star more. */
function mergeAll(s: ChessState) {
  const rank = (p: Piece) => (p.area === "board" ? 0 : p.col >= 0 ? 1 : 2);
  let again = true;
  while (again) {
    again = false;
    for (const kind of PIECE_KEYS) {
      for (let star = 1; star < CH.maxStars; star++) {
        const same = s.pieces
          .filter((p) => p.kind === kind && p.star === star)
          .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
        if (same.length < 3) continue;
        const [keep, a, b] = same as [Piece, Piece, Piece];
        s.pieces = s.pieces.filter((p) => p !== a && p !== b);
        keep.star += 1;
        emit(s, { type: "merge", kind, star: keep.star });
        again = true;
      }
    }
  }
  // A piece bought onto a full bench takes a slot a merge freed.
  for (const p of s.pieces) {
    if (p.area !== "bench" || p.col >= 0) continue;
    const slot = freeBenchSlot(s);
    if (slot >= 0) p.col = slot;
    else {
      s.gold += sellValue(p.kind, p.star);
      s.pieces = s.pieces.filter((q) => q !== p);
    }
  }
}

function takenHome(s: ChessState) {
  return (c: number, r: number) => !!pieceAt(s, c, r);
}

/** Buys the piece in a shop slot: onto the board while there is room in planning, else the bench. */
export function buy(s: ChessState, slot: number): Result & { id?: number } {
  if (s.phase === "over") return fail("The game is over.");
  const kind = s.shop[slot];
  if (!kind) return fail("That slot is empty.");
  const cost = PIECES[kind].cost;
  if (s.gold < cost) return fail(`${PIECES[kind].name} costs ${cost} gold.`);
  const planning = s.phase !== "fight";
  const room = s.phase === "plan" && boardPieces(s).length < boardLimit(s.level);
  const square = room ? homeSquare(kind, takenHome(s)) : null;
  const slotFree = freeBenchSlot(s);
  const merges = planning && owned(s, kind, 1) >= 2;
  if (!square && slotFree < 0 && !merges) return fail("The bench is full. Sell a piece first.");
  s.gold -= cost;
  s.shop[slot] = null;
  const piece: Piece = square
    ? { id: s.nextId++, kind, star: 1, area: "board", col: square[0], row: square[1] }
    : { id: s.nextId++, kind, star: 1, area: "bench", col: slotFree, row: 0 };
  s.pieces.push(piece);
  if (planning) mergeAll(s);
  return { ok: true, id: piece.id };
}

export function sell(s: ChessState, id: number): Result {
  const p = s.pieces.find((q) => q.id === id);
  if (!p) return fail("Nothing to sell.");
  if (s.phase === "over") return fail("The game is over.");
  if (s.phase === "fight" && p.area === "board") return fail("It is fighting. Sell it after the round.");
  s.gold += sellValue(p.kind, p.star);
  s.pieces = s.pieces.filter((q) => q !== p);
  return OK;
}

export function refresh(s: ChessState): Result {
  if (s.phase === "over") return fail("The game is over.");
  if (s.gold < CH.refreshCost) return fail(`A new shop costs ${CH.refreshCost} gold.`);
  s.gold -= CH.refreshCost;
  rollShop(s);
  return OK;
}

export function buyXp(s: ChessState): Result {
  if (s.phase === "over") return fail("The game is over.");
  if (s.level >= MAX_LEVEL) return fail("Already at the top level.");
  if (s.gold < CH.xpCost) return fail(`XP costs ${CH.xpCost} gold.`);
  s.gold -= CH.xpCost;
  gainXp(s, CH.xpPerBuy);
  return OK;
}

/**
 * Moves a piece to a board square on your half or a bench slot, swapping with
 * whatever is there. Board moves wait for the fight to end.
 */
export function move(s: ChessState, id: number, area: Area, col: number, row = 0): Result {
  const p = s.pieces.find((q) => q.id === id);
  if (!p) return fail("Pick a piece first.");
  if (s.phase === "over") return fail("The game is over.");
  if (area === "board" && (!onBoard(col, row) || !isHome(row))) return fail("Set pieces on your half: the lower four rows.");
  if (area === "bench" && (col < 0 || col >= CH.benchSize)) return fail("No such bench slot.");
  const other = area === "board" ? pieceAt(s, col, row) : benchAt(s, col);
  if (other === p) return OK;
  if (s.phase === "fight" && (area === "board" || p.area === "board")) return fail("Wait for the fight to end.");
  if (area === "board" && p.area === "bench" && !other && boardPieces(s).length >= boardLimit(s.level)) {
    return fail(`Level ${s.level} fields ${boardLimit(s.level)} pieces. Buy XP to field more.`);
  }
  if (other) {
    other.area = p.area;
    other.col = p.col;
    other.row = p.row;
  }
  p.area = area;
  p.col = col;
  p.row = area === "board" ? row : 0;
  return OK;
}

function makeFighter(
  s: ChessState,
  side: 0 | 1,
  kind: PieceKey,
  star: number,
  col: number,
  row: number,
  bonus: ReturnType<typeof bonusFor>,
  hpMult = 1,
  hitMult = 1,
  boss?: string,
): Fighter {
  const st = pieceStats(kind, star, bonus);
  const hp = Math.max(1, Math.round(st.hp * hpMult));
  return {
    id: s.nextId++,
    side,
    kind,
    star,
    boss,
    col,
    row,
    hp,
    maxHp: hp,
    shield: 0,
    mana: 0,
    maxHit: Math.max(1, Math.round(st.maxHit * hitMult)),
    acc: st.acc,
    def: st.def,
    speed: st.speed,
    range: st.range,
    moveTicks: st.moveTicks,
    atkCd: 0,
    moveCd: 0,
    stun: 0,
    stuck: 0,
    shots: 0,
    promoted: false,
    target: 0,
    dead: false,
  };
}

/** Starts the round's fight. Free places on the board are filled from the bench first. */
export function startFight(s: ChessState): Result {
  if (s.phase !== "plan") return fail("A fight is already on.");
  // Like other auto battlers: room on the board takes pieces from the bench, dearest first.
  const spare = benchPieces(s).sort((a, b) => sellValue(b.kind, b.star) - sellValue(a.kind, a.star));
  for (const p of spare) {
    if (boardPieces(s).length >= boardLimit(s.level)) break;
    const sq = homeSquare(p.kind, takenHome(s));
    if (!sq) break;
    p.area = "board";
    p.col = sq[0];
    p.row = sq[1];
  }
  const mine = boardPieces(s);
  if (!mine.length) return fail("Buy a piece first.");
  const myTraits = traitsFor(mine.map((p) => p.kind));
  const theirTraits = traitsFor(s.enemy.map((p) => p.kind));
  s.fighters = [
    ...mine.map((p) => makeFighter(s, 0, p.kind, p.star, p.col, p.row, bonusFor(p.kind, myTraits))),
    ...s.enemy.map((p) =>
      makeFighter(s, 1, p.kind, p.star, p.col, p.row, bonusFor(p.kind, theirTraits), p.hpMult, p.hitMult, p.boss),
    ),
  ];
  s.phase = "fight";
  s.tick = 0;
  s.clock = 0;
  emit(s, { type: "fightStart", boss: s.enemy.find((e) => e.boss)?.boss });
  return OK;
}

function alive(s: ChessState, side?: 0 | 1): Fighter[] {
  return s.fighters.filter((f) => !f.dead && (side === undefined || f.side === side));
}

function occupied(s: ChessState, col: number, row: number): boolean {
  return s.fighters.some((f) => !f.dead && f.col === col && f.row === row);
}

function pickTarget(s: ChessState, f: Fighter): Fighter | undefined {
  const cur = s.fighters.find((g) => g.id === f.target && !g.dead);
  if (cur && dist(f.col, f.row, cur.col, cur.row) <= f.range) return cur;
  let best: Fighter | undefined;
  let bestD = Infinity;
  for (const g of s.fighters) {
    if (g.dead || g.side === f.side) continue;
    const d = dist(f.col, f.row, g.col, g.row);
    if (d < bestD || (d === bestD && best && (g.hp < best.hp || (g.hp === best.hp && g.id < best.id)))) {
      best = g;
      bestD = d;
    }
  }
  f.target = best?.id ?? 0;
  return best;
}

/** Squares a piece can move to this turn, by its own rule. */
function movesFor(s: ChessState, f: Fighter, steps: "own" | "king"): [number, number][] {
  const out: [number, number][] = [];
  const free = (c: number, r: number) => onBoard(c, r) && !occupied(s, c, r);
  const slide = (dirs: [number, number][], reach: number) => {
    for (const [dc, dr] of dirs) {
      for (let k = 1; k <= reach; k++) {
        const c = f.col + dc * k;
        const r = f.row + dr * k;
        if (!free(c, r)) break;
        out.push([c, r]);
      }
    }
  };
  if (steps === "king" || f.kind === "king") slide(KING_STEPS, 1);
  else if (f.kind === "knight") {
    for (const [dc, dr] of KNIGHT) if (free(f.col + dc, f.row + dr)) out.push([f.col + dc, f.row + dr]);
  } else if (f.kind === "bishop") slide(DIAG, 2);
  else if (f.kind === "rook") slide(ORTHO, 2);
  else slide(KING_STEPS, 2);
  return out;
}

/** How far a square is from striking a target: squares out of reach first, then straight-line distance. */
function gap(f: Fighter, c: number, r: number, t: Fighter): [number, number] {
  return [Math.max(0, dist(c, r, t.col, t.row) - f.range), (c - t.col) ** 2 + (r - t.row) ** 2];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

function promote(s: ChessState, f: Fighter, nextText: () => string) {
  const st = pieceStats("queen", f.star);
  const frac = f.hp / Math.max(1, f.maxHp);
  f.kind = "queen";
  f.promoted = true;
  f.maxHp = Math.round(st.hp * (f.side === 1 ? enemyStatMult(s.round) : 1));
  f.hp = Math.max(1, Math.round(f.maxHp * frac));
  f.maxHit = Math.max(f.maxHit, st.maxHit);
  f.acc = Math.max(f.acc, st.acc);
  f.def = Math.max(f.def, st.def);
  f.range = st.range;
  f.speed = st.speed;
  f.moveTicks = st.moveTicks;
  emit(s, { type: "promote", id: f.id, side: f.side, x: f.col, y: f.row, text: nextText() });
}

/** One move toward the target, by the piece's rule. Pawns only march ahead. */
function step1(s: ChessState, f: Fighter, t: Fighter, nextText: () => string) {
  if (f.kind === "pawn") {
    const dir = f.side === 0 ? -1 : 1;
    const ahead = f.row + dir;
    const side = t.col < f.col ? [-1, 1] : [1, -1];
    const tries: [number, number][] = [[f.col, ahead], ...side.map((dc) => [f.col + dc, ahead] as [number, number])];
    const sq = tries.find(([c, r]) => onBoard(c, r) && !occupied(s, c, r));
    if (!sq) return;
    f.col = sq[0];
    f.row = sq[1];
    if (f.row === (f.side === 0 ? 0 : SIZE - 1)) promote(s, f, nextText);
    return;
  }
  const now = gap(f, f.col, f.row, t);
  let best: [number, number] | null = null;
  let bestGap = now;
  for (const [c, r] of movesFor(s, f, "own")) {
    const g = gap(f, c, r, t);
    if (better(g, bestGap)) {
      best = [c, r];
      bestGap = g;
    }
  }
  // Boxed in by its own rule for a while: take any single step that helps.
  if (!best && f.stuck >= 2) {
    for (const [c, r] of movesFor(s, f, "king")) {
      const g = gap(f, c, r, t);
      if (better(g, bestGap)) {
        best = [c, r];
        bestGap = g;
      }
    }
  }
  if (!best) {
    f.stuck += 1;
    return;
  }
  f.stuck = 0;
  f.col = best[0];
  f.row = best[1];
}

function hurt(s: ChessState, to: Fighter, dmg: number) {
  let left = dmg;
  if (to.shield > 0) {
    const soak = Math.min(to.shield, left);
    to.shield -= soak;
    left -= soak;
  }
  to.hp -= left;
  const max = PIECES[to.kind].ability.mana;
  if (max > 0) to.mana = Math.min(max, to.mana + CH.manaPerHurt);
  if (to.hp <= 0 && !to.dead) {
    to.hp = 0;
    to.dead = true;
    if (to.side === 1) s.kills += 1;
    emit(s, { type: "die", id: to.id, side: to.side, x: to.col, y: to.row, kind: to.kind, boss: to.boss });
  }
}

/** Overtime: past overtimeFrom ticks every hit grows, so no fight stalls. */
export function overtime(tick: number): number {
  return tick > CH.overtimeFrom ? 1 + CH.overtimeGrowth * (tick - CH.overtimeFrom) : 1;
}

function strike(s: ChessState, f: Fighter, t: Fighter, sure: boolean, mult: number, text: string | undefined, ability?: string) {
  const hit = sure || rand(s) < hitChance(f.acc, t.def);
  const dmg = hit ? 1 + Math.floor(rand(s) * Math.max(1, Math.round(f.maxHit * mult * overtime(s.tick)))) : 0;
  emit(s, {
    type: "attack",
    from: f.id,
    to: t.id,
    side: f.side,
    fx: f.col,
    fy: f.row,
    tx: t.col,
    ty: t.row,
    hit,
    dmg,
    ability,
    text,
  });
  if (dmg > 0) hurt(s, t, dmg);
}

/** Casts the piece's ability. False when there is nothing worth casting it on. */
function cast(s: ChessState, f: Fighter, t: Fighter, nextText: () => string): boolean {
  const ab = PIECES[f.kind].ability;
  const foes = alive(s).filter((g) => g.side !== f.side);
  // Heals and shields stop in overtime.
  if ((f.kind === "bishop" || f.kind === "rook") && s.tick > CH.overtimeFrom) return false;
  if (f.kind === "bishop") {
    const hurtAlly = alive(s, f.side)
      .filter((g) => dist(f.col, f.row, g.col, g.row) <= f.range && g.hp < g.maxHp * 0.9)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!hurtAlly) return false;
    const amount = Math.max(1, Math.round(hurtAlly.maxHp * ab.power));
    hurtAlly.hp = Math.min(hurtAlly.maxHp, hurtAlly.hp + amount);
    emit(s, { type: "cast", id: f.id, side: f.side, x: f.col, y: f.row, name: ab.name });
    emit(s, { type: "heal", to: hurtAlly.id, x: hurtAlly.col, y: hurtAlly.row, amount, text: nextText() });
    return true;
  }
  if (f.kind === "rook") {
    const amount = Math.max(1, Math.round(f.maxHp * ab.power));
    // A fresh shield replaces the old one rather than piling on, or a rook could not fall.
    f.shield = Math.max(f.shield, amount);
    emit(s, { type: "cast", id: f.id, side: f.side, x: f.col, y: f.row, name: ab.name });
    emit(s, { type: "shield", to: f.id, x: f.col, y: f.row, amount, text: nextText() });
    return true;
  }
  emit(s, { type: "cast", id: f.id, side: f.side, x: f.col, y: f.row, name: ab.name });
  const text = nextText();
  if (f.kind === "knight") {
    const near = foes
      .filter((g) => g !== t && dist(f.col, f.row, g.col, g.row) <= f.range)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, 1);
    for (const g of [t, ...near]) strike(s, f, g, true, ab.power, g === t ? text : undefined, ab.name);
  } else if (f.kind === "queen") {
    const splash = foes.filter((g) => g !== t && dist(t.col, t.row, g.col, g.row) <= 1);
    for (const g of [t, ...splash]) strike(s, f, g, true, ab.power, g === t ? text : undefined, ab.name);
  } else {
    strike(s, f, t, true, ab.power, text, ab.name);
    if (!t.dead) t.stun = Math.max(t.stun, ab.stunTicks ?? 0);
  }
  return true;
}

function attack(s: ChessState, f: Fighter, t: Fighter, nextText: () => string, phraseEvery: number) {
  f.atkCd = f.speed;
  const ab = PIECES[f.kind].ability;
  if (ab.mana > 0 && f.mana >= ab.mana && cast(s, f, t, nextText)) {
    f.mana = 0;
    return;
  }
  const text = f.shots % Math.max(1, Math.round(phraseEvery)) === 0 ? nextText() : undefined;
  f.shots += 1;
  if (ab.mana > 0) f.mana = Math.min(ab.mana, f.mana + CH.manaPerAttack);
  strike(s, f, t, false, 1, text);
}

/** Damage a lost round costs: a base, more each round, and each enemy left standing. */
export function lossDamage(round: number, survivors: { kind: PieceKey; star: number; boss?: string }[]): number {
  const left = survivors.reduce((sum, f) => sum + PIECES[f.kind].tier * f.star + (f.boss ? 3 : 0), 0);
  return Math.max(1, Math.round(CH.loss.base + CH.loss.perRound * round + left));
}

function endFight(s: ChessState, timeout: boolean) {
  const enemies = alive(s, 1);
  const win = enemies.length === 0;
  const damage = win ? 0 : lossDamage(s.round, enemies);
  s.lastWin = win;
  s.lastDamage = damage;
  if (win) s.wins += 1;
  else s.losses += 1;
  s.hp = Math.max(0, s.hp - damage);
  emit(s, { type: "result", win, damage, round: s.round, survivors: enemies.length, timeout });
  if (s.hp <= 0) {
    s.phase = "over";
    emit(s, { type: "over", round: s.round });
    return;
  }
  s.phase = "result";
  s.resultLeft = CH.resultSeconds;
}

/** One fight tick: every piece, in a fresh random order, attacks if it can reach its target, else moves. */
export function fightTick(s: ChessState, nextText: () => string = () => "", phraseEvery = 1) {
  if (s.phase !== "fight") return;
  s.tick += 1;
  const order = alive(s);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const f of order) {
    if (f.dead) continue;
    if (f.stun > 0) {
      f.stun -= 1;
      continue;
    }
    f.atkCd = Math.max(0, f.atkCd - 1);
    f.moveCd = Math.max(0, f.moveCd - 1);
    const t = pickTarget(s, f);
    if (!t) break;
    if (dist(f.col, f.row, t.col, t.row) <= f.range) {
      if (f.atkCd <= 0) attack(s, f, t, nextText, phraseEvery);
      continue;
    }
    if (f.moveCd > 0) continue;
    f.moveCd = f.moveTicks;
    step1(s, f, t, nextText);
    // A piece that steps into reach strikes at once, so moving first is no handicap.
    const t2 = pickTarget(s, f);
    if (t2 && f.atkCd <= 0 && dist(f.col, f.row, t2.col, t2.row) <= f.range) attack(s, f, t2, nextText, phraseEvery);
  }
  if (!alive(s, 0).length || !alive(s, 1).length) endFight(s, false);
  else if (s.tick >= CH.maxTicks) endFight(s, true);
}

/** Runs the current fight to its end at once. */
export function runFight(s: ChessState, nextText: () => string = () => "", phraseEvery = 1) {
  let guard = 0;
  while (s.phase === "fight" && guard++ < CH.maxTicks + 5) fightTick(s, nextText, phraseEvery);
}

/** Pays out and sets up the next round. */
export function nextRound(s: ChessState) {
  if (s.phase === "over") return;
  const interest = Math.min(CH.maxInterest, Math.floor(s.gold / Math.max(1, CH.interestPer)));
  const win = s.lastWin ? CH.winGold : 0;
  s.round += 1;
  s.gold += CH.income + interest + win;
  gainXp(s, CH.xpPerRound);
  s.fighters = [];
  s.phase = "plan";
  mergeAll(s);
  rollShop(s);
  s.enemy = makeEnemy(s, s.round);
  emit(s, { type: "round", round: s.round, income: CH.income, interest, win, boss: bossFor(s.round)?.name });
}

/**
 * Advances by dt seconds at a speed multiplier: fight ticks while a fight is on,
 * then the result's pause, then the next round. `nextText` gives the phrase an
 * attack carries; only each piece's first attack and every phraseEvery-th after
 * it ask for one. Abilities always do.
 */
export function step(s: ChessState, dt: number, speed: number, nextText: () => string, phraseEvery = 1) {
  const t = Math.max(0, dt * Math.max(0, speed));
  if (s.phase === "fight") {
    s.clock += t;
    const tick = Math.max(0.05, CH.tickSeconds);
    let guard = 0;
    while (s.clock >= tick && s.phase === "fight" && guard++ < 40) {
      s.clock -= tick;
      fightTick(s, nextText, phraseEvery);
    }
  } else if (s.phase === "result") {
    s.resultLeft -= t;
    if (s.resultLeft <= 0) nextRound(s);
  }
}

/** Traits of the pieces on your board. */
export function myTraits(s: ChessState) {
  return traitsFor(boardPieces(s).map((p) => p.kind));
}
