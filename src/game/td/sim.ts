/**
 * The tower-defense simulation. Pure: time and text come in as arguments, so the
 * rules can be tested without a canvas. Imports are relative with extensions so
 * the test runner can load this file directly.
 *
 * Waves never end. The player can call the next wave at any time, even while
 * others are still on the board, and gets a bonus for calling it early.
 */
import { CONFIG } from "../config.ts";
import { buildable, DEFAULT_MAP, laneCount, laneLength, pointAt, type TdMap } from "./map.ts";
import {
  buildCost,
  CREEPS,
  currencyOf,
  fluxPerRep,
  noVoidPerks,
  repGold,
  summonCost,
  summonReward,
  voidPerkCost,
  VOID_PERKS,
  difficulty,
  earlyBonus,
  isCreepKind,
  MAX_TOWER_LEVEL,
  noPerks,
  ascendCost,
  ascensionsOf,
  pathCost,
  pathsOf,
  perkCost,
  PERKS,
  sellValue,
  START_LIVES,
  towerStats,
  upgradeCost,
  waveBonus,
  waveSpec,
  type CreepKind,
  type DifficultyKey,
  type PerkKey,
  type Perks,
  type SpellKey,
  type TowerKey,
  type TowerStats,
  type VoidPerkKey,
  type VoidPerks,
  type WaveSpec,
} from "./economy.ts";

export type TdPhase = "build" | "wave" | "over";

/** Which creep in range a tower shoots at. */
export type Targeting = "first" | "last" | "strong" | "close";
export const TARGETING: Targeting[] = ["first", "last", "strong", "close"];

export interface TdTower {
  id: number;
  key: TowerKey;
  col: number;
  row: number;
  level: number;
  invested: number;
  cooldown: number;
  targeting: Targeting;
  stats: TowerStats;
  /** The creep a beam is locked on, how long it has held it, and the phrase it carries. */
  focusId: number;
  focusStacks: number;
  phrase: string;
  /** Shots fired (beam locks for a beam), to pick which ones carry a phrase. */
  shots: number;
  /** The path taken at the top level, and the Ascension taken later, or -1. */
  path: number;
  ascend: number;
  /** Damage dealt and creeps finished, for the tower panel. */
  dealt: number;
  kills: number;
  /** The wave count and cleared count when it was built, for a full refund until it is used. */
  builtWave: number;
  builtCleared: number;
}

export interface TdCreep {
  id: number;
  kind: CreepKind;
  /** The wave it belongs to. Splits and summons join their parent's wave. */
  wave: number;
  hp: number;
  maxHp: number;
  /** Cells walked along the lane. */
  dist: number;
  x: number;
  y: number;
  speed: number;
  armor: number;
  gold: number;
  regen: number;
  heal: number;
  slow: number;
  slowTime: number;
  burn: number;
  burnTime: number;
  summonTimer: number;
  /** Seconds of hit flash left, for drawing. */
  hit: number;
  leaked: boolean;
  /** The tower that hit it last, and the one that set it burning (ids, 0 for none). */
  lastHit: number;
  burnBy: number;
  /** From an Eraser it walks through: extra damage taken, and the share of armor lost. */
  vuln: number;
  shred: number;
  /** The lane it walks (0 on a map with one). */
  lane: number;
  /** From a Singularity it walks through: the share of life it collapses at, and which one. */
  exec: number;
  execBy: number;
  /** A Rift Titan the player summoned (pays flux when slain). */
  summoned: boolean;
}

export interface TdShot {
  id: number;
  key: TowerKey;
  /** The tower that fired it. */
  from: number;
  target: number;
  fromX: number;
  fromY: number;
  /** Where the shot is now, and where it last saw its target. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  travel: number;
  total: number;
  damage: number;
  splash: number;
  slow: number;
  slowTime: number;
  burn: number;
  burnTime: number;
  pierce: number;
  text: string;
}

/** An instant strike or a beam, kept briefly for drawing. */
export interface TdBeam {
  key: TowerKey;
  points: { x: number; y: number }[];
  life: number;
  total: number;
  text: string;
}

export interface Spawner {
  wave: number;
  spec: WaveSpec;
  queue: CreepKind[];
  acc: number;
  /** The lane the next creep takes (they take turns). */
  lane: number;
}

export type TdEvent =
  | { type: "waveSent"; wave: number; bonus: number; auto: boolean }
  | { type: "waveCleared"; wave: number; bonus: number; income: number; interest: number }
  | { type: "leak"; kind: CreepKind; lives: number }
  | { type: "bossSpawned"; kind: CreepKind; wave: number }
  | { type: "bossKilled"; kind: CreepKind; gold: number }
  | { type: "spell"; key: SpellKey; hit: number; text: string }
  | { type: "rep"; flux: number; gold: number }
  | { type: "riftSummoned"; cost: number }
  | { type: "riftKilled"; flux: number; boost: number }
  | { type: "over" };

export interface TdState {
  map: TdMap;
  phase: TdPhase;
  gold: number;
  lives: number;
  maxLives: number;
  /** Highest wave called so far (0 before the first). */
  wave: number;
  /** Highest wave cleared. */
  cleared: number;
  kills: number;
  towers: TdTower[];
  creeps: TdCreep[];
  shots: TdShot[];
  beams: TdBeam[];
  spawners: Spawner[];
  perks: Perks;
  /** Call the next wave by itself once the last one has finished spawning. */
  auto: boolean;
  autoTimer: number;
  difficulty: DifficultyKey;
  /** Seconds until each spell is ready again. */
  spells: Record<SpellKey, number>;
  /** Damage and kills of towers already sold, by kind, for the run's report. */
  retired: Partial<Record<TowerKey, { dealt: number; kills: number }>>;
  /** Flux, the rep currency: what there is, reps counted this run, and the upgrades it bought. */
  flux: number;
  reps: number;
  voidPerks: VoidPerks;
  /** Extra flux per rep from Rift Titans slain (0.05 = +5%). */
  fluxBoost: number;
  /** When the last rep counted (ms, by the clock), so a rep takes repSeconds. */
  lastRepAt: number;
  nextId: number;
  /** Things that happened since the game last read this list. */
  events: TdEvent[];
}

export type Result = { ok: true } | { ok: false; reason: string };

const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

/** Seconds a projectile spends in the air. */
const SHOT_SECONDS = 0.25;
/** Longest slice of time simulated at once, so fast-forward stays accurate. */
const MAX_STEP = 0.05;
/** How far an instant strike can jump between creeps, in cells. */
const CHAIN_RANGE = 1.6;
/** Damage kept on each jump. */
const CHAIN_FALLOFF = 0.8;

export function createGame(map: TdMap = DEFAULT_MAP, level: DifficultyKey = "normal"): TdState {
  const diff = difficulty(level);
  const lives = Math.max(1, Math.round(START_LIVES * diff.lives));
  return {
    map,
    phase: "build",
    gold: Math.round(map.startGold * diff.gold),
    lives,
    maxLives: lives,
    wave: 0,
    cleared: 0,
    kills: 0,
    towers: [],
    creeps: [],
    shots: [],
    beams: [],
    spawners: [],
    perks: noPerks(),
    auto: false,
    autoTimer: 0,
    difficulty: level,
    spells: { storm: 0, still: 0 },
    retired: {},
    flux: Math.max(0, CONFIG.td.void.startFlux),
    reps: 0,
    voidPerks: noVoidPerks(),
    fluxBoost: 0,
    lastRepAt: 0,
    nextId: 1,
    events: [],
  };
}

export function towerAt(s: TdState, col: number, row: number): TdTower | undefined {
  return s.towers.find((t) => t.col === col && t.row === row);
}

/** A tower's stats now, with every perk (the void ones too). */
export function statsOf(s: TdState, t: TdTower): TowerStats {
  return towerStats(t.key, t.level, s.perks, t.path, t.ascend, s.voidPerks);
}

/** What the player has of a tower's currency: O/I, or flux for a void tower. */
export function purse(s: TdState, key: TowerKey): number {
  return currencyOf(key) === "flux" ? s.flux : s.gold;
}

/** The currency's short name, for messages. */
export function unit(key: TowerKey): string {
  return currencyOf(key) === "flux" ? "flux" : "O/I";
}

function pay(s: TdState, key: TowerKey, amount: number) {
  if (currencyOf(key) === "flux") s.flux -= amount;
  else s.gold -= amount;
}

export function build(s: TdState, key: TowerKey, col: number, row: number): Result {
  if (s.phase === "over") return fail("The rite is over");
  if (!buildable(s.map, col, row)) return fail("Build on a free cell off the lane");
  if (towerAt(s, col, row)) return fail("A tower already stands here");
  const cost = buildCost(key, s.perks);
  if (purse(s, key) < cost) return fail(`Needs ${cost} ${unit(key)}`);
  pay(s, key, cost);
  s.towers.push({
    id: s.nextId++,
    key,
    col,
    row,
    level: 1,
    invested: cost,
    cooldown: 0,
    targeting: "first",
    stats: towerStats(key, 1, s.perks, -1, -1, s.voidPerks),
    focusId: -1,
    focusStacks: 0,
    phrase: "",
    shots: 0,
    path: -1,
    ascend: -1,
    dealt: 0,
    kills: 0,
    builtWave: s.wave,
    builtCleared: s.cleared,
  });
  return OK;
}

export function upgrade(s: TdState, col: number, row: number): Result {
  const t = towerAt(s, col, row);
  if (!t) return fail("No tower here");
  const cost = upgradeCost(t.key, t.level, s.perks);
  if (purse(s, t.key) < cost) return fail(`Needs ${cost} ${unit(t.key)}`);
  pay(s, t.key, cost);
  t.invested += cost;
  t.level += 1;
  t.stats = statsOf(s, t);
  return OK;
}

/**
 * Takes one of the tower's two Ascensions: its second choice, at td.ascendLevel,
 * once it has a path. Only once.
 */
export function chooseAscension(s: TdState, col: number, row: number, index: number): Result {
  if (s.phase === "over") return fail("The rite is over");
  const t = towerAt(s, col, row);
  if (!t) return fail("No tower here");
  const spec = ascensionsOf(t.key)[index];
  if (!spec) return fail("No such Ascension");
  if (t.ascend >= 0) return fail("This tower has already ascended");
  if (t.path < 0) return fail("Take a path first");
  const need = CONFIG.td.ascendLevel;
  if (t.level < need) return fail(`Ascensions open at level ${need}`);
  const cost = ascendCost(t.key, s.perks);
  if (purse(s, t.key) < cost) return fail(`Needs ${cost} ${unit(t.key)}`);
  pay(s, t.key, cost);
  t.invested += cost;
  t.ascend = index;
  t.stats = statsOf(s, t);
  return OK;
}

/** Takes one of the tower's two paths. Only at the top level, and only once. */
export function choosePath(s: TdState, col: number, row: number, path: number): Result {
  if (s.phase === "over") return fail("The rite is over");
  const t = towerAt(s, col, row);
  if (!t) return fail("No tower here");
  const spec = pathsOf(t.key)[path];
  if (!spec) return fail("No such path");
  if (t.path >= 0) return fail("This tower already took its path");
  if (t.level < MAX_TOWER_LEVEL) return fail(`Paths open at level ${MAX_TOWER_LEVEL}`);
  const cost = pathCost(t.key, s.perks);
  if (purse(s, t.key) < cost) return fail(`Needs ${cost} ${unit(t.key)}`);
  pay(s, t.key, cost);
  t.invested += cost;
  t.path = path;
  t.stats = statsOf(s, t);
  return OK;
}

/**
 * Raises a tower as many levels as the O/I allows, mastery included. A tap on a
 * tablet instead of one per level.
 */
export function upgradeMax(s: TdState, col: number, row: number): Result & { levels?: number } {
  let levels = 0;
  let last: Result = OK;
  while (levels < 100) {
    last = upgrade(s, col, row);
    if (!last.ok) break;
    levels += 1;
  }
  return levels > 0 ? { ok: true, levels } : last;
}

/** How many levels the O/I would buy for a tower right now, and their total price. */
export function maxUpgrades(s: TdState, t: TdTower): { levels: number; cost: number } {
  let gold = purse(s, t.key);
  let level = t.level;
  let cost = 0;
  let levels = 0;
  while (levels < 100) {
    const next = upgradeCost(t.key, level, s.perks);
    if (gold < next) break;
    gold -= next;
    cost += next;
    level += 1;
    levels += 1;
  }
  return { levels, cost };
}

/**
 * A tower built since the last wave was called, before any wave cleared, that has
 * not fired yet: selling it undoes the build, for every O/I put into it.
 */
export function undoable(s: TdState, t: TdTower): boolean {
  return t.builtWave === s.wave && t.builtCleared === s.cleared && t.shots === 0;
}

/** O/I back for selling a tower now. */
export function refundFor(s: TdState, t: TdTower): number {
  return undoable(s, t) ? t.invested : sellValue(t.invested);
}

export function sell(s: TdState, col: number, row: number): Result {
  const t = towerAt(s, col, row);
  if (!t) return fail("No tower here");
  pay(s, t.key, -refundFor(s, t));
  const rec = s.retired[t.key] ?? { dealt: 0, kills: 0 };
  s.retired[t.key] = { dealt: rec.dealt + t.dealt, kills: rec.kills + t.kills };
  s.towers = s.towers.filter((x) => x.id !== t.id);
  return OK;
}

/** Damage and kills by tower kind over the run, sold towers included, the most damage first. */
export function damageReport(s: TdState): { key: TowerKey; dealt: number; kills: number }[] {
  const by = new Map<TowerKey, { dealt: number; kills: number }>();
  for (const [key, rec] of Object.entries(s.retired) as [TowerKey, { dealt: number; kills: number }][]) {
    by.set(key, { ...rec });
  }
  for (const t of s.towers) {
    const rec = by.get(t.key) ?? { dealt: 0, kills: 0 };
    by.set(t.key, { dealt: rec.dealt + t.dealt, kills: rec.kills + t.kills });
  }
  return [...by.entries()]
    .map(([key, rec]) => ({ key, ...rec }))
    .filter((r) => r.dealt > 0 || r.kills > 0)
    .sort((a, b) => b.dealt - a.dealt);
}

/** The boss furthest along the lane, if one is on the board. */
export function leadBoss(s: TdState): TdCreep | undefined {
  let lead: TdCreep | undefined;
  for (const c of s.creeps) {
    if (!alive(c) || !CREEPS[c.kind].boss) continue;
    if (!lead || c.dist > lead.dist) lead = c;
  }
  return lead;
}

/** Moves a tower to its next targeting rule. */
export function cycleTargeting(s: TdState, col: number, row: number): Result {
  const t = towerAt(s, col, row);
  if (!t) return fail("No tower here");
  t.targeting = TARGETING[(TARGETING.indexOf(t.targeting) + 1) % TARGETING.length] ?? "first";
  return OK;
}

export function buyPerk(s: TdState, key: PerkKey): Result {
  if (s.phase === "over") return fail("The rite is over");
  const level = s.perks[key];
  const spec = PERKS[key];
  if (level >= spec.max) return fail(`${spec.name} is at its limit`);
  const cost = perkCost(key, level);
  if (s.gold < cost) return fail(`Needs ${cost} O/I`);
  s.gold -= cost;
  s.perks[key] = level + 1;
  if (key === "lives") {
    s.lives += spec.amount;
    s.maxLives += spec.amount;
  }
  for (const t of s.towers) t.stats = statsOf(s, t);
  return OK;
}

/** Buys the next level of a void perk, with flux. */
export function buyVoidPerk(s: TdState, key: VoidPerkKey): Result {
  if (s.phase === "over") return fail("The rite is over");
  const level = s.voidPerks[key];
  const spec = VOID_PERKS[key];
  if (level >= spec.max) return fail(`${spec.name} is at its limit`);
  const cost = voidPerkCost(key, level);
  if (s.flux < cost) return fail(`Needs ${cost} flux`);
  s.flux -= cost;
  s.voidPerks[key] = level + 1;
  for (const t of s.towers) t.stats = statsOf(s, t);
  return OK;
}

/**
 * A rep, done for real: it counts only if repSeconds have passed since the last
 * one (by the clock, so neither fast-forward nor quick taps make more), and pays
 * flux (and O/I with Rep tithe). Works while the game is held, too.
 */
export function addRep(s: TdState, now: number): Result & { flux?: number; gold?: number } {
  if (s.phase === "over") return fail("The rite is over");
  const gap = Math.max(0, CONFIG.td.void.repSeconds) * 1000;
  if (s.lastRepAt > 0 && now - s.lastRepAt < gap)
    return fail(`A rep takes ${CONFIG.td.void.repSeconds} s`);
  s.lastRepAt = now;
  const flux = fluxPerRep(s.voidPerks, s.fluxBoost);
  const gold = repGold(s.voidPerks);
  s.flux += flux;
  s.gold += gold;
  s.reps += 1;
  s.events.push({ type: "rep", flux, gold });
  return { ok: true, flux, gold };
}

/** Summons a Rift Titan, for O/I: slain, it pays flux and raises flux per rep for the run. */
export function summonRift(s: TdState): Result {
  if (s.phase === "over") return fail("The rite is over");
  const cost = summonCost(s.wave);
  if (s.gold < cost) return fail(`Needs ${cost} O/I`);
  s.gold -= cost;
  const lanes = laneCount(s.map);
  const c = makeCreep(s, "rift", waveSpecOf(s), 0, s.nextId % lanes);
  // Not part of any wave, so it never holds up a wave's clearing.
  c.wave = 0;
  c.summoned = true;
  s.creeps.push(c);
  s.events.push({ type: "riftSummoned", cost });
  return OK;
}

export function setAuto(s: TdState, on: boolean) {
  s.auto = on;
  s.autoTimer = 0;
}

/** True while any creep, or any creep still to spawn, is on the board. */
function busy(s: TdState): boolean {
  return s.spawners.length > 0 || s.creeps.length > 0;
}

/**
 * Calls the next wave. Works between waves and during them: waves stack, and
 * calling one while another is still on the board pays a bonus.
 */
export function sendWave(s: TdState, auto = false): Result {
  if (s.phase === "over") return fail("The rite is over");
  if (s.spawners.length >= CONFIG.td.maxActiveWaves) return fail("Too many waves at once");
  const wave = s.wave + 1;
  const spec = waveSpec(wave);
  const bonus = !auto && busy(s) ? earlyBonus(wave) : 0;
  s.gold += bonus;
  s.spawners.push({ wave, spec, queue: [...spec.kinds], acc: spec.interval, lane: 0 });
  s.wave = wave;
  s.phase = "wave";
  s.autoTimer = 0;
  s.events.push({ type: "waveSent", wave, bonus, auto });
  return OK;
}

function specFor(s: TdState, wave: number): WaveSpec {
  return s.spawners.find((sp) => sp.wave === wave)?.spec ?? waveSpec(wave);
}

function makeCreep(s: TdState, kind: CreepKind, spec: WaveSpec, dist: number, lane = 0): TdCreep {
  const c = CREEPS[kind];
  const hp = c.hp * spec.hpScale * (c.boss ? spec.bossScale : 1) * difficulty(s.difficulty).hp;
  const p = pointAt(s.map, dist, lane);
  return {
    id: s.nextId++,
    kind,
    wave: spec.wave,
    hp,
    maxHp: hp,
    dist,
    x: p.x,
    y: p.y,
    speed: c.speed * spec.speedScale,
    armor: Math.min(CONFIG.td.maxArmor, (c.armor ?? 0) + spec.armorBonus),
    gold: Math.max(1, Math.round(c.gold * spec.goldScale)),
    regen: (c.regen ?? 0) * spec.hpScale,
    heal: (c.heal ?? 0) * spec.hpScale,
    slow: 0,
    slowTime: 0,
    burn: 0,
    burnTime: 0,
    summonTimer: c.summonEvery ?? 0,
    hit: 0,
    leaked: false,
    lastHit: 0,
    burnBy: 0,
    vuln: 0,
    shred: 0,
    lane,
    exec: 0,
    execBy: 0,
    summoned: false,
  };
}

/** Marks the creeps inside an Eraser's circle. Erasers do not stack: the strongest counts. */
function markCreeps(s: TdState) {
  for (const c of s.creeps) {
    c.vuln = 0;
    c.shred = 0;
    c.exec = 0;
    c.execBy = 0;
  }
  for (const e of s.towers) {
    // A firing tower's collapse works on what it hits (see land); a Singularity's on its circle.
    const field = e.stats.rate <= 0 && e.stats.execute > 0;
    if (e.stats.vuln <= 0 && e.stats.shred <= 0 && !field) continue;
    const cx = e.col + 0.5;
    const cy = e.row + 0.5;
    const r2 = e.stats.range * e.stats.range;
    for (const c of s.creeps) {
      if (!alive(c) || (c.x - cx) ** 2 + (c.y - cy) ** 2 > r2) continue;
      c.vuln = Math.max(c.vuln, e.stats.vuln);
      c.shred = Math.max(c.shred, e.stats.shred);
      if (field && e.stats.execute > c.exec) {
        c.exec = e.stats.execute;
        c.execBy = e.id;
      }
    }
  }
}

/** Creeps (not bosses) at or under their collapse share of life fall in: the tower gets the kill. */
function collapse(s: TdState, towers: Map<number, TdTower>) {
  for (const c of s.creeps) {
    if (!alive(c) || c.exec <= 0 || CREEPS[c.kind].boss) continue;
    if (c.hp > c.maxHp * c.exec) continue;
    const by = towers.get(c.execBy);
    if (by) {
      by.dealt += c.hp;
      c.lastHit = by.id;
    }
    c.hp = 0;
  }
}

/** Damage after armor. `pierce` is the share of armor ignored. The tower that dealt it gets the credit. */
function hurt(c: TdCreep, amount: number, pierce: number, by?: TdTower) {
  const armor = c.armor * (1 - Math.max(0, Math.min(1, pierce))) * (1 - c.shred);
  const dmg = amount * (1 - armor) * (1 + c.vuln);
  if (by) {
    by.dealt += Math.max(0, Math.min(c.hp, dmg));
    c.lastHit = by.id;
  }
  c.hp -= dmg;
  c.hit = 0.08;
}

function applySlow(c: TdCreep, amount: number, time: number) {
  if (amount <= 0 || time <= 0) return;
  const felt = CREEPS[c.kind].boss ? amount * (1 - CONFIG.td.bossSlowResist) : amount;
  c.slow = c.slowTime > 0 ? Math.max(c.slow, felt) : felt;
  c.slowTime = Math.max(c.slowTime, time);
}

function applyBurn(c: TdCreep, dps: number, time: number, by = 0) {
  if (dps <= 0 || time <= 0) return;
  if (dps >= c.burn || c.burnTime <= 0) c.burnBy = by;
  c.burn = Math.max(c.burn, dps);
  c.burnTime = Math.max(c.burnTime, time);
}

function alive(c: TdCreep): boolean {
  return c.hp > 0 && !c.leaked;
}

export function pickTarget(s: TdState, t: TdTower): TdCreep | undefined {
  const cx = t.col + 0.5;
  const cy = t.row + 0.5;
  const r2 = t.stats.range * t.stats.range;
  let best: TdCreep | undefined;
  let bestScore = -Infinity;
  for (const c of s.creeps) {
    if (!alive(c)) continue;
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const score =
      t.targeting === "first"
        ? c.dist
        : t.targeting === "last"
          ? -c.dist
          : t.targeting === "strong"
            ? c.hp
            : -d2;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * True when tower t stands in support tower m's circle: the circle drawn when m is
 * selected, which grows with m's level.
 */
export function inCircle(m: TdTower, t: TdTower): boolean {
  return Math.hypot(m.col - t.col, m.row - t.row) <= m.stats.range + 1e-9;
}

/** The Muses whose circle a tower stands in. */
export function musesOf(s: TdState, t: TdTower): TdTower[] {
  return s.towers.filter((m) => m !== t && (m.stats.aura > 0 || m.stats.haste > 0) && inCircle(m, t));
}

/** Damage multiplier a tower gets from the Muses around it. */
export function auraBonus(s: TdState, t: TdTower): number {
  let bonus = 0;
  for (const m of s.towers) {
    if (m === t || m.stats.aura <= 0) continue;
    if (inCircle(m, t)) bonus += m.stats.aura;
  }
  return 1 + bonus;
}

/** Fire-rate multiplier a tower gets from Tempo Muses around it. */
export function hasteBonus(s: TdState, t: TdTower): number {
  let bonus = 0;
  for (const m of s.towers) {
    if (m === t || m.stats.haste <= 0) continue;
    if (inCircle(m, t)) bonus += m.stats.haste;
  }
  return 1 + bonus;
}

/** Extra share of O/I every kill pays, from Scriptoria, up to td.maxBounty. */
export function bountyBonus(s: TdState): number {
  const sum = s.towers.reduce((a, t) => a + t.stats.bounty, 0);
  return Math.min(CONFIG.td.maxBounty, sum);
}

/**
 * The phrase for a tower's next shot. Its first shot and every `every`-th one after
 * carry a phrase; the others fly bare, which is lighter to draw.
 */
function phraseFor(t: TdTower, nextText: () => string, every: number): string {
  const n = t.shots++;
  return n % Math.max(1, Math.round(every)) === 0 ? nextText() : "";
}

function fire(s: TdState, t: TdTower, target: TdCreep, nextText: () => string, every: number) {
  const st = t.stats;
  const from = { x: t.col + 0.5, y: t.row + 0.5 };
  const aura = auraBonus(s, t);
  const damage = st.damage * aura;

  if (st.beam) {
    if (target.id === t.focusId) {
      t.focusStacks = Math.min(st.maxRamp, t.focusStacks + 1);
    } else {
      t.focusId = target.id;
      t.focusStacks = 0;
      t.phrase = phraseFor(t, nextText, every);
    }
    hurt(target, damage * (1 + st.ramp * t.focusStacks), st.pierce, t);
    const life = 1 / Math.max(0.1, st.rate) + 0.03;
    s.beams.push({
      key: t.key,
      points: [from, { x: target.x, y: target.y }],
      life,
      total: life,
      text: t.phrase,
    });
    return;
  }

  if (st.chain > 0) {
    const hits = [target];
    let last = target;
    for (let i = 0; i < st.chain; i++) {
      let next: TdCreep | undefined;
      let nextD = CHAIN_RANGE * CHAIN_RANGE;
      for (const c of s.creeps) {
        if (!alive(c) || hits.includes(c)) continue;
        const d = (c.x - last.x) ** 2 + (c.y - last.y) ** 2;
        if (d <= nextD) {
          next = c;
          nextD = d;
        }
      }
      if (!next) break;
      hits.push(next);
      last = next;
    }
    hits.forEach((c, i) => hurt(c, damage * CHAIN_FALLOFF ** i, st.pierce, t));
    s.beams.push({
      key: t.key,
      points: [from, ...hits.map((c) => ({ x: c.x, y: c.y }))],
      life: 0.18,
      total: 0.18,
      text: phraseFor(t, nextText, every),
    });
    return;
  }

  s.shots.push({
    id: s.nextId++,
    key: t.key,
    from: t.id,
    target: target.id,
    fromX: from.x,
    fromY: from.y,
    x: from.x,
    y: from.y,
    tx: target.x,
    ty: target.y,
    travel: SHOT_SECONDS,
    total: SHOT_SECONDS,
    damage,
    splash: st.splash,
    slow: st.slow,
    slowTime: st.slowTime,
    // The Muse bonus covers the burn a shot leaves, not only its hit.
    burn: st.burn * aura,
    burnTime: st.burnTime,
    pierce: st.pierce,
    text: phraseFor(t, nextText, every),
  });
}

function land(s: TdState, sh: TdShot, byId: Map<number, TdCreep>, towers: Map<number, TdTower>) {
  const found = byId.get(sh.target);
  const target = found && alive(found) ? found : undefined;
  // A tower sold while its shot was in the air gets no credit.
  const by = towers.get(sh.from);
  if (sh.splash > 0) {
    // A splash still bursts where its target was, even if the target is already gone.
    for (const c of s.creeps) {
      if (!alive(c) || Math.hypot(c.x - sh.tx, c.y - sh.ty) > sh.splash) continue;
      hurt(c, sh.damage, sh.pierce, by);
      applySlow(c, sh.slow, sh.slowTime);
      applyBurn(c, sh.burn, sh.burnTime, sh.from);
      if (by) strike(c, by);
    }
    return;
  }
  if (!target) return;
  hurt(target, sh.damage, sh.pierce, by);
  applySlow(target, sh.slow, sh.slowTime);
  applyBurn(target, sh.burn, sh.burnTime, sh.from);
  if (by) strike(target, by);
}

/** A tower with collapse (execute) that hits a creep marks it to fall at that share of life. */
function strike(c: TdCreep, by: TdTower) {
  if (by.stats.execute > c.exec) {
    c.exec = by.stats.execute;
    c.execBy = by.id;
  }
}

function tick(s: TdState, t: number, nextText: () => string, every: number) {
  const born: TdCreep[] = [];
  const towerById = new Map(s.towers.map((tw) => [tw.id, tw]));
  for (const key of SPELLS) s.spells[key] = Math.max(0, s.spells[key] - t);

  // Every active wave spawns on its own clock.
  for (const sp of s.spawners) {
    if (!sp.queue.length) continue;
    sp.acc += t;
    while (sp.queue.length && sp.acc >= sp.spec.interval) {
      sp.acc -= sp.spec.interval;
      const kind = sp.queue.shift();
      if (!kind) continue;
      born.push(makeCreep(s, kind, sp.spec, 0, sp.lane % laneCount(s.map)));
      sp.lane = (sp.lane + 1) % laneCount(s.map);
      if (CREEPS[kind].boss) s.events.push({ type: "bossSpawned", kind, wave: sp.wave });
    }
  }

  if (s.auto && s.spawners.every((sp) => sp.queue.length === 0)) {
    s.autoTimer += t;
    if (s.autoTimer >= CONFIG.td.autoSendDelay) sendWave(s, true);
  }

  // Creeps burn, mend, call up minions and walk. Any that reach the core cost lives.
  for (const c of s.creeps) {
    const spec = CREEPS[c.kind];
    if (c.burnTime > 0) {
      const dmg = c.burn * Math.min(t, c.burnTime) * (1 + c.vuln);
      const by = towerById.get(c.burnBy);
      if (by && c.hp > 0) {
        by.dealt += Math.min(c.hp, dmg);
        c.lastHit = by.id;
      }
      c.hp -= dmg;
      c.burnTime -= t;
    }
    if (c.regen > 0 && c.hp > 0) c.hp = Math.min(c.maxHp, c.hp + c.regen * t);
    if (c.hit > 0) c.hit -= t;
    const pace = c.slowTime > 0 ? 1 - c.slow : 1;
    if (c.slowTime > 0) c.slowTime -= t;
    c.dist += c.speed * pace * t;
    const p = pointAt(s.map, c.dist, c.lane);
    c.x = p.x;
    c.y = p.y;
    if (spec.summon && spec.summonEvery && isCreepKind(spec.summon) && c.hp > 0) {
      c.summonTimer -= t;
      if (c.summonTimer <= 0) {
        c.summonTimer += spec.summonEvery;
        const waveSpecOf = specFor(s, c.wave);
        for (let i = 0; i < (spec.summonCount ?? 1); i++) {
          born.push(
            makeCreep(s, spec.summon, waveSpecOf, Math.max(0, c.dist - 0.25 - 0.15 * i), c.lane),
          );
        }
      }
    }
    if (c.dist >= laneLength(s.map, c.lane) && !c.leaked) {
      c.leaked = true;
      s.lives -= spec.leak;
      s.events.push({ type: "leak", kind: c.kind, lives: Math.max(0, s.lives) });
    }
  }

  // Healers mend every other creep near them.
  for (const h of s.creeps) {
    if (h.heal <= 0 || !alive(h)) continue;
    const range = CREEPS[h.kind].healRange ?? 1;
    for (const o of s.creeps) {
      if (o === h || !alive(o)) continue;
      if (Math.hypot(o.x - h.x, o.y - h.y) <= range) o.hp = Math.min(o.maxHp, o.hp + h.heal * t);
    }
  }

  s.creeps = s.creeps.filter((c) => !c.leaked);
  if (s.lives <= 0) {
    s.lives = 0;
    s.phase = "over";
    s.events.push({ type: "over" });
    return;
  }

  // Erasers mark the creeps in their circle, then the towers take aim and fire.
  markCreeps(s);
  for (const tower of s.towers) {
    if (tower.stats.rate <= 0) continue;
    tower.cooldown -= t;
    if (tower.cooldown > 0) continue;
    const target = pickTarget(s, tower);
    if (!target) {
      tower.cooldown = 0;
      tower.focusId = -1;
      continue;
    }
    tower.cooldown += 1 / (tower.stats.rate * hasteBonus(s, tower));
    fire(s, tower, target, nextText, every);
  }

  // Projectiles fly toward their target, then land.
  const byId = new Map(s.creeps.map((c) => [c.id, c]));
  for (const sh of s.shots) {
    const target = byId.get(sh.target);
    if (target && alive(target)) {
      sh.tx = target.x;
      sh.ty = target.y;
    }
    sh.travel -= t;
    const u = Math.max(0, Math.min(1, 1 - sh.travel / sh.total));
    sh.x = sh.fromX + (sh.tx - sh.fromX) * u;
    sh.y = sh.fromY + (sh.ty - sh.fromY) * u;
  }
  for (const sh of s.shots) if (sh.travel <= 0) land(s, sh, byId, towerById);
  s.shots = s.shots.filter((sh) => sh.travel > 0);
  collapse(s, towerById);

  // The dead pay out, and some break apart.
  for (const c of s.creeps) {
    if (c.hp > 0) continue;
    const spec = CREEPS[c.kind];
    const pay = Math.round(c.gold * (1 + bountyBonus(s)));
    s.gold += pay;
    s.kills += 1;
    const killer = towerById.get(c.lastHit);
    if (killer) killer.kills += 1;
    if (spec.boss) s.events.push({ type: "bossKilled", kind: c.kind, gold: pay });
    if (c.summoned) {
      const V = CONFIG.td.void;
      const flux = summonReward(s.wave);
      const before = s.fluxBoost;
      s.fluxBoost = Math.min(V.summonBoostMax, s.fluxBoost + V.summonBoost);
      s.flux += flux;
      s.events.push({ type: "riftKilled", flux, boost: s.fluxBoost - before });
    }
    if (spec.split && isCreepKind(spec.split)) {
      const waveSpecOf = specFor(s, c.wave);
      for (let i = 0; i < (spec.splitCount ?? 2); i++) {
        born.push(makeCreep(s, spec.split, waveSpecOf, Math.max(0, c.dist - 0.12 * i), c.lane));
      }
    }
  }
  s.creeps = s.creeps.filter((c) => c.hp > 0);
  if (born.length) s.creeps.push(...born);

  for (const b of s.beams) b.life -= t;
  s.beams = s.beams.filter((b) => b.life > 0);

  // A wave clears once it has spawned everything and none of its creeps are left.
  const walking = new Set(s.creeps.map((c) => c.wave));
  const done = s.spawners.filter((sp) => sp.queue.length === 0 && !walking.has(sp.wave));
  for (const sp of done) {
    const bonus = waveBonus(sp.wave);
    const income = s.towers.reduce((sum, tw) => sum + tw.stats.income, 0);
    const perk = PERKS.interest;
    const level = s.perks.interest;
    const interest =
      level > 0
        ? Math.min((perk.cap ?? Infinity) * level, Math.floor(s.gold * perk.amount * level))
        : 0;
    s.gold += bonus + income + interest;
    s.flux += s.towers.reduce((sum, tw) => sum + tw.stats.fluxIncome, 0);
    s.cleared = Math.max(s.cleared, sp.wave);
    s.events.push({ type: "waveCleared", wave: sp.wave, bonus, income, interest });
  }
  if (done.length) s.spawners = s.spawners.filter((sp) => !done.includes(sp));

  s.phase = s.spawners.length ? "wave" : "build";
}

const SPELLS: SpellKey[] = ["storm", "still"];

/**
 * Casts a spell on every creep on the board. Ink Storm strikes them through
 * armor (bosses take a share), scaled to the latest wave so it keeps its bite;
 * Stillness slows them. Each then waits out its cooldown.
 */
export function castSpell(s: TdState, key: SpellKey, nextText: () => string = () => ""): Result {
  if (s.phase === "over") return fail("The rite is over");
  const left = s.spells[key];
  if (left > 0) return fail(`Ready in ${Math.ceil(left)} s`);
  const targets = s.creeps.filter(alive);
  if (!targets.length) return fail("No creeps on the board");
  const spells = CONFIG.td.spells;
  if (key === "storm") {
    const spec = spells.storm;
    // Scaled like creep life, by wave and difficulty, so the storm keeps its bite.
    const damage = spec.damage * waveSpecOf(s).hpScale * difficulty(s.difficulty).hp;
    for (const c of targets) hurt(c, CREEPS[c.kind].boss ? damage * spec.bossShare : damage, 1);
  } else {
    const spec = spells.still;
    for (const c of targets) applySlow(c, spec.slow, spec.time);
  }
  s.spells[key] = spells[key].cooldown;
  s.events.push({ type: "spell", key, hit: targets.length, text: nextText() });
  return OK;
}

/** The latest wave called, or the first. */
function waveSpecOf(s: TdState): WaveSpec {
  return specFor(s, Math.max(1, s.wave));
}

/**
 * Advances the game by dt seconds at a speed multiplier. `nextText` supplies the
 * whole phrase a shot carries; with `phraseEvery` above 1, only each tower's first
 * shot and every phraseEvery-th after it ask for one.
 */
export function step(
  s: TdState,
  dt: number,
  speed: number,
  nextText: () => string,
  phraseEvery = 1,
): void {
  let left = Math.max(0, dt * Math.max(0, speed));
  while (left > 1e-9 && s.phase !== "over") {
    const t = Math.min(MAX_STEP, left);
    tick(s, t, nextText, phraseEvery);
    left -= t;
  }
}

/** Creeps still to spawn across every active wave. */
export function pending(s: TdState): number {
  return s.spawners.reduce((sum, sp) => sum + sp.queue.length, 0);
}
