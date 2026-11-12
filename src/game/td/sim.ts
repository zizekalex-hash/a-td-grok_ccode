/**
 * The tower-defense simulation. Pure: time and text come in as arguments, so the
 * rules can be tested without a canvas. Imports are relative with extensions so
 * the test runner can load this file directly.
 *
 * Waves never end. The player can call the next wave at any time, even while
 * others are still on the board, and gets a bonus for calling it early.
 */
import { CONFIG } from "../config.ts";
import { buildable, DEFAULT_MAP, laneCount, laneLength, pointAt, stitchScale, type TdMap } from "./map.ts";
import {
  buildCost,
  coreCost,
  coreStats,
  CREEPS,
  CURRENCY_NAME,
  currencyOf,
  batchFlux,
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
  type CoreStats,
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
  /** Seconds it stays jammed: an Atonia slain near it, or Nyx passing, stops it firing. */
  jam: number;
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
  /** Seconds it stands stunned, and seconds before it can be stunned again. */
  stun: number;
  stunGrace: number;
  /** Seconds it cannot mend (no regeneration, no healing from others). */
  block: number;
  /** Seconds it has been on the board, for the kinds that sprint, fade, rush or jam on a clock. */
  age: number;
  /** Faded right now: no tower can aim at it. */
  faded: boolean;
  /** Armor lent by a Cytokine near it, and the slowing of a Histamine it walks through. */
  guard: number;
  mire: number;
  /** Seconds until it next jams the towers around it (Nyx). */
  jamTimer: number;
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
  /** What a wake tower's shot also does where it lands (see afflict). */
  corrode: number;
  rend: number;
  stun: number;
  block: number;
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
  | { type: "waveCleared"; wave: number; bonus: number; income: number; interest: number; atp: number }
  | { type: "leak"; kind: CreepKind; lives: number }
  | { type: "bossSpawned"; kind: CreepKind; wave: number }
  | { type: "bossKilled"; kind: CreepKind; gold: number; atp: number }
  | { type: "coreRaised"; level: number; stage: string }
  | { type: "spell"; key: SpellKey; hit: number; text: string }
  | { type: "rep"; flux: number; gold: number; count: number }
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
  /** ATP, the third currency: from dream creeps, bosses, the core and Dopamine towers. */
  atp: number;
  /** The wake core: its level, the clock of its pulse, what it has dealt, and a flash to draw. */
  core: TdCore;
  nextId: number;
  /** Things that happened since the game last read this list. */
  events: TdEvent[];
}

export interface TdCore {
  level: number;
  /** Seconds since its last pulse. */
  pulse: number;
  dealt: number;
  kills: number;
  /** Seconds of pulse ring left to draw. */
  flash: number;
}

/** The core's id as the last thing that hit a creep (towers count from 1). */
export const CORE_ID = -1;

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
/** Seconds a creep cannot be stunned again once a stun ends. */
const STUN_GRACE = 1.5;
/** Share of a rend (life burned away by a hit) a boss takes. */
const BOSS_REND = 0.25;
/** Seconds the core's pulse ring shows. */
const PULSE_FLASH = 0.4;

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
    atp: Math.max(0, CONFIG.td.atp.start),
    core: { level: 1, pulse: 0, dealt: 0, kills: 0, flash: 0 },
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

/** What the player has of a tower's currency: O/I, flux for a void tower, ATP for a wake tower. */
export function purse(s: TdState, key: TowerKey): number {
  const money = currencyOf(key);
  return money === "flux" ? s.flux : money === "atp" ? s.atp : s.gold;
}

/** The currency's short name, for messages. */
export function unit(key: TowerKey): string {
  return CURRENCY_NAME[currencyOf(key)];
}

function pay(s: TdState, key: TowerKey, amount: number) {
  const money = currencyOf(key);
  if (money === "flux") s.flux -= amount;
  else if (money === "atp") s.atp -= amount;
  else s.gold -= amount;
}

/** What the core does now. */
export function coreOf(s: TdState): CoreStats {
  return coreStats(s.core.level);
}

/** Raises the wake core a level, for ATP: more lives, more ATP a wave, a stronger pulse. */
export function raiseCore(s: TdState): Result {
  if (s.phase === "over") return fail("The rite is over");
  const cost = coreCost(s.core.level);
  if (s.atp < cost) return fail(`Needs ${cost} ATP`);
  s.atp -= cost;
  const before = coreOf(s).stage;
  s.core.level += 1;
  const lives = Math.max(0, CONFIG.td.core.livesPerLevel);
  s.maxLives += lives;
  s.lives += lives;
  const now = coreOf(s).stage;
  s.events.push({ type: "coreRaised", level: s.core.level, stage: now !== before ? now.name : "" });
  return OK;
}

/** How many levels the ATP would buy the core right now, and their total price. */
export function coreRaises(s: TdState): { levels: number; cost: number } {
  let atp = s.atp;
  let level = s.core.level;
  let cost = 0;
  let levels = 0;
  while (levels < 100) {
    const next = coreCost(level);
    if (atp < next) break;
    atp -= next;
    cost += next;
    level += 1;
    levels += 1;
  }
  return { levels, cost };
}

/** Raises the core as many levels as the ATP allows. */
export function raiseCoreMax(s: TdState): Result & { levels?: number } {
  let levels = 0;
  let last: Result = OK;
  while (levels < 100) {
    last = raiseCore(s);
    if (!last.ok) break;
    levels += 1;
  }
  return levels > 0 ? { ok: true, levels } : last;
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
    jam: 0,
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
export function addRep(
  s: TdState,
  now: number,
  count = 1,
): Result & { flux?: number; gold?: number; count?: number } {
  if (s.phase === "over") return fail("The rite is over");
  const n = Math.max(1, Math.min(100, Math.floor(count)));
  const gap = Math.max(0, CONFIG.td.void.repSeconds) * 1000 * n;
  if (s.lastRepAt > 0 && now - s.lastRepAt < gap) {
    const left = Math.ceil((gap - (now - s.lastRepAt)) / 100) / 10;
    return fail(`${n === 1 ? "A rep" : `${n} reps`} take${n === 1 ? "s" : ""} ${+(gap / 1000).toFixed(2)} s: ${left} s to go`);
  }
  s.lastRepAt = now;
  const flux = batchFlux(s.voidPerks, s.fluxBoost, s.reps, n);
  const gold = repGold(s.voidPerks) * n;
  s.flux += flux;
  s.gold += gold;
  s.reps += n;
  s.events.push({ type: "rep", flux, gold, count: n });
  return { ok: true, flux, gold, count: n };
}

/**
 * Starts the reps' clock (when the rep window or the tap button first shows):
 * the first tap then needs its time too, like every one after it.
 */
export function armReps(s: TdState, now: number) {
  if (s.lastRepAt <= 0) s.lastRepAt = now;
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
  // On a stitched map the lane is longer, so creeps have more life and pay more.
  const boards = stitchScale(s.map);
  const hp = c.hp * spec.hpScale * (c.boss ? spec.bossScale : 1) * difficulty(s.difficulty).hp * boards.hp;
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
    gold: Math.max(1, Math.round(c.gold * spec.goldScale * boards.gold)),
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
    stun: 0,
    stunGrace: 0,
    block: 0,
    age: 0,
    faded: false,
    guard: 0,
    mire: 0,
    jamTimer: c.jamEvery ?? 0,
  };
}

/**
 * Marks the creeps inside an Eraser's circle (Erasers do not stack: the strongest
 * counts), the ones a Histamine slows, and the ones a Cytokine near them armors.
 */
function markCreeps(s: TdState) {
  for (const c of s.creeps) {
    c.vuln = 0;
    c.shred = 0;
    c.exec = 0;
    c.execBy = 0;
    c.mire = 0;
    c.guard = 0;
  }
  for (const e of s.towers) {
    // A firing tower's collapse works on what it hits (see land); a Singularity's on its circle.
    const field = e.stats.rate <= 0 && e.stats.execute > 0;
    const mire = e.stats.rate <= 0 ? e.stats.mire : 0;
    if (e.stats.vuln <= 0 && e.stats.shred <= 0 && mire <= 0 && !field) continue;
    const cx = e.col + 0.5;
    const cy = e.row + 0.5;
    const r2 = e.stats.range * e.stats.range;
    for (const c of s.creeps) {
      if (!alive(c) || (c.x - cx) ** 2 + (c.y - cy) ** 2 > r2) continue;
      c.vuln = Math.max(c.vuln, e.stats.vuln);
      c.shred = Math.max(c.shred, e.stats.shred);
      if (mire > 0) c.mire = Math.max(c.mire, CREEPS[c.kind].boss ? mire * (1 - CONFIG.td.bossSlowResist) : mire);
      if (field && e.stats.execute > c.exec) {
        c.exec = e.stats.execute;
        c.execBy = e.id;
      }
    }
  }
  for (const g of s.creeps) {
    const spec = CREEPS[g.kind];
    if (!spec.guard || !alive(g)) continue;
    const range = spec.guardRange ?? 1;
    for (const o of s.creeps) {
      if (o === g || !alive(o) || Math.hypot(o.x - g.x, o.y - g.y) > range) continue;
      o.guard = Math.max(o.guard, spec.guard);
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

/** Whoever gets the credit for damage: a tower, or the core. */
type Credit = { id: number; dealt: number };

/**
 * Damage after armor. `pierce` is the share of armor ignored. The tower that dealt
 * it (or the core) gets the credit. A warded creep loses no more than its ward's
 * share of its full life to one hit.
 */
function hurt(c: TdCreep, amount: number, pierce: number, by?: Credit) {
  const worn = Math.min(CONFIG.td.maxArmor, c.armor + c.guard);
  const armor = worn * (1 - Math.max(0, Math.min(1, pierce))) * (1 - c.shred);
  const ward = CREEPS[c.kind].ward ?? 0;
  let dmg = amount * (1 - armor) * (1 + c.vuln);
  if (ward > 0) dmg = Math.min(dmg, c.maxHp * ward);
  if (by) {
    by.dealt += Math.max(0, Math.min(c.hp, dmg));
    c.lastHit = by.id;
  }
  c.hp -= dmg;
  c.hit = 0.08;
}

/** What a wake tower's hit does on top of its damage: wears armor away, burns off a share of the life left, stuns, blocks mending. */
function afflict(c: TdCreep, st: { corrode: number; rend: number; stun: number; block: number }, by?: Credit) {
  if (st.corrode > 0) c.armor = Math.max(0, c.armor - st.corrode);
  if (st.rend > 0 && c.hp > 0) {
    const dmg = c.hp * st.rend * (CREEPS[c.kind].boss ? BOSS_REND : 1);
    if (by) by.dealt += dmg;
    c.hp -= dmg;
  }
  if (st.block > 0) c.block = Math.max(c.block, st.block);
  if (st.stun > 0 && c.stun <= 0 && c.stunGrace <= 0) {
    c.stun = CREEPS[c.kind].boss ? st.stun * (1 - CONFIG.td.bossSlowResist) : st.stun;
  }
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

/**
 * The creep a tower aims at: by its targeting rule, among those in its range
 * (with `reach` more from a Serotonin). Faded creeps cannot be aimed at; `skip`
 * leaves out the ones a volley already fires at.
 */
export function pickTarget(
  s: TdState,
  t: TdTower,
  reach = reachBonus(s, t),
  skip?: readonly TdCreep[],
): TdCreep | undefined {
  const cx = t.col + 0.5;
  const cy = t.row + 0.5;
  const range = t.stats.range + reach;
  const r2 = range * range;
  let best: TdCreep | undefined;
  let bestScore = -Infinity;
  for (const c of s.creeps) {
    if (!alive(c) || c.faded || skip?.includes(c)) continue;
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

/** True when a tower stands in the core's circle. */
export function inCore(s: TdState, t: TdTower, core: CoreStats = coreOf(s)): boolean {
  return Math.hypot(s.map.core[0] - t.col, s.map.core[1] - t.row) <= core.range + 1e-9;
}

/** Damage multiplier a tower gets from the Muses around it, and from a Radiant core. */
export function auraBonus(s: TdState, t: TdTower): number {
  let bonus = 0;
  for (const m of s.towers) {
    if (m === t || m.stats.aura <= 0) continue;
    if (inCircle(m, t)) bonus += m.stats.aura;
  }
  const core = coreOf(s);
  if (core.aura > 0 && inCore(s, t, core)) bonus += core.aura;
  return 1 + bonus;
}

/** Extra range a firing tower gets from the Serotonins around it. They do not stack: the widest counts. */
export function reachBonus(s: TdState, t: TdTower): number {
  if (t.stats.rate <= 0) return 0;
  let reach = 0;
  for (const m of s.towers) {
    if (m === t || m.stats.reach <= reach) continue;
    if (inCircle(m, t)) reach = m.stats.reach;
  }
  return reach;
}

/** How far a tower reaches now: its own range, and what a Serotonin adds. */
export function rangeOf(s: TdState, t: TdTower): number {
  return t.stats.range + reachBonus(s, t);
}

/** How much slower a tower fires for the Hypnos near it (0.3 = 30%). */
function lullOf(t: TdTower, lullers: readonly TdCreep[]): number {
  let lull = 0;
  for (const c of lullers) {
    const spec = CREEPS[c.kind];
    if (Math.hypot(c.x - t.col - 0.5, c.y - t.row - 0.5) <= (spec.lullRange ?? 1)) lull = Math.max(lull, spec.lull ?? 0);
  }
  return Math.min(0.9, lull);
}

/** Stops the towers that fire within `range` of a point for `time` seconds. Circles (a Muse, an Eraser) keep working. */
function jamTowers(s: TdState, x: number, y: number, range: number, time: number) {
  for (const t of s.towers) {
    if (t.stats.rate > 0 && Math.hypot(t.col + 0.5 - x, t.row + 0.5 - y) <= range) t.jam = Math.max(t.jam, time);
  }
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
  // Every spikeEvery-th shot of a Glutamate hits spikeMult times as hard.
  const spike = st.spikeEvery > 0 && st.spikeMult > 0 && t.shots % st.spikeEvery === st.spikeEvery - 1;
  const damage = st.damage * aura * (spike ? st.spikeMult : 1);

  if (st.beam) {
    if (target.id === t.focusId) {
      t.focusStacks = Math.min(st.maxRamp, t.focusStacks + 1);
    } else {
      t.focusId = target.id;
      t.focusStacks = 0;
      t.phrase = phraseFor(t, nextText, every);
    }
    hurt(target, damage * (1 + st.ramp * t.focusStacks), st.pierce, t);
    afflict(target, st, t);
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
        if (!alive(c) || c.faded || hits.includes(c)) continue;
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
    // An Acetylcholine's strike keeps all of its damage from creep to creep.
    const keep = st.chainKeep > 0 ? Math.min(1, st.chainKeep) : CHAIN_FALLOFF;
    hits.forEach((c, i) => {
      hurt(c, damage * keep ** i, st.pierce, t);
      afflict(c, st, t);
    });
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
    corrode: st.corrode,
    rend: st.rend,
    stun: st.stun,
    block: st.block,
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
      afflict(c, sh, by);
      applySlow(c, sh.slow, sh.slowTime);
      applyBurn(c, sh.burn, sh.burnTime, sh.from);
      if (by) strike(c, by);
    }
    return;
  }
  if (!target) return;
  hurt(target, sh.damage, sh.pierce, by);
  afflict(target, sh, by);
  applySlow(target, sh.slow, sh.slowTime);
  applyBurn(target, sh.burn, sh.burnTime, sh.from);
  if (by) strike(target, by);
}

/**
 * The core's pulse: once it has the level for it, every creep in its circle is hit
 * (and slowed, once Kindled). It waits for a creep to come in reach.
 */
function pulseCore(s: TdState, t: number) {
  const core = coreOf(s);
  if (s.core.flash > 0) s.core.flash -= t;
  if (!core.pulses) return;
  s.core.pulse = Math.min(core.every, s.core.pulse + t);
  if (s.core.pulse < core.every) return;
  const cx = s.map.core[0] + 0.5;
  const cy = s.map.core[1] + 0.5;
  const r2 = core.range * core.range;
  const credit: Credit = { id: CORE_ID, dealt: 0 };
  let hit = 0;
  for (const c of s.creeps) {
    if (!alive(c) || (c.x - cx) ** 2 + (c.y - cy) ** 2 > r2) continue;
    hurt(c, core.damage, core.pierce, credit);
    applySlow(c, core.slow, core.slowTime);
    hit += 1;
  }
  if (!hit) return;
  s.core.dealt += credit.dealt;
  s.core.pulse = 0;
  s.core.flash = PULSE_FLASH;
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
    // A blocked creep (Caffeine) does not mend.
    if (c.regen > 0 && c.hp > 0 && c.block <= 0) c.hp = Math.min(c.maxHp, c.hp + c.regen * t);
    if (c.hit > 0) c.hit -= t;
    if (c.block > 0) c.block -= t;
    c.age += t;
    // A Microsleep fades at the end of each of its cycles; a K-complex sprints at the end of each of its own.
    c.faded = !!spec.phaseEvery && !!spec.phaseTime && c.age % spec.phaseEvery >= spec.phaseEvery - spec.phaseTime;
    const dash =
      spec.dashEvery && spec.dashTime && c.age % spec.dashEvery >= spec.dashEvery - spec.dashTime
        ? Math.max(1, spec.dashSpeed ?? 1)
        : 1;
    // Sleep debt gathers speed for as long as it is left to walk.
    const rush = spec.rush ? 1 + Math.min(spec.rushMax ?? 1, spec.rush * c.age) : 1;
    let pace = (1 - Math.max(c.slowTime > 0 ? c.slow : 0, c.mire)) * dash * rush;
    if (c.slowTime > 0) c.slowTime -= t;
    if (c.stun > 0) {
      // Stunned: it stands still, then cannot be stunned again for a moment.
      pace = 0;
      c.stun -= t;
      if (c.stun <= 0) c.stunGrace = STUN_GRACE;
    } else if (c.stunGrace > 0) c.stunGrace -= t;
    c.dist += c.speed * pace * t;
    if (spec.jamEvery && spec.jam && c.hp > 0) {
      c.jamTimer -= t;
      if (c.jamTimer <= 0) {
        c.jamTimer += spec.jamEvery;
        jamTowers(s, c.x, c.y, spec.jamRange ?? 1, spec.jam);
      }
    }
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
      if (o === h || !alive(o) || o.block > 0) continue;
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
  const lullers = s.creeps.filter((c) => alive(c) && (CREEPS[c.kind].lull ?? 0) > 0);
  const reaches = s.towers.some((m) => m.stats.reach > 0);
  for (const tower of s.towers) {
    if (tower.jam > 0) {
      // Jammed: it holds its fire, and a beam loses its lock.
      tower.jam -= t;
      tower.focusId = -1;
      continue;
    }
    if (tower.stats.rate <= 0) continue;
    tower.cooldown -= t;
    if (tower.cooldown > 0) continue;
    const reach = reaches ? reachBonus(s, tower) : 0;
    const target = pickTarget(s, tower, reach);
    if (!target) {
      tower.cooldown = 0;
      tower.focusId = -1;
      continue;
    }
    const lull = lullers.length ? 1 - lullOf(tower, lullers) : 1;
    tower.cooldown += 1 / (tower.stats.rate * hasteBonus(s, tower) * lull);
    fire(s, tower, target, nextText, every);
    // An Orexin fires at more creeps in the same volley, each a different one.
    if (tower.stats.multi > 0) {
      const aimed = [target];
      for (let i = 0; i < tower.stats.multi; i++) {
        const more = pickTarget(s, tower, reach, aimed);
        if (!more) break;
        aimed.push(more);
        fire(s, tower, more, nextText, every);
      }
    }
  }
  pulseCore(s, t);

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
    else if (c.lastHit === CORE_ID) s.core.kills += 1;
    // The dream set and every boss drop ATP, a little more each wave.
    const atp = spec.atp ? Math.max(1, Math.round(spec.atp * specFor(s, Math.max(1, c.wave || s.wave)).atpScale)) : 0;
    s.atp += atp;
    if (spec.boss) s.events.push({ type: "bossKilled", kind: c.kind, gold: pay, atp });
    // An Atonia slain leaves the towers around it jammed for a moment.
    if (spec.jam && !spec.jamEvery) jamTowers(s, c.x, c.y, spec.jamRange ?? 1, spec.jam);
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
    // The core makes ATP, and so do Dopamine towers; an Awakened core mends too.
    const core = coreOf(s);
    const atp = Math.round(core.atp + s.towers.reduce((sum, tw) => sum + tw.stats.atpIncome, 0));
    s.atp += atp;
    if (core.mend > 0) s.lives = Math.min(s.maxLives, s.lives + core.mend);
    s.cleared = Math.max(s.cleared, sp.wave);
    s.events.push({ type: "waveCleared", wave: sp.wave, bonus, income, interest, atp });
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
