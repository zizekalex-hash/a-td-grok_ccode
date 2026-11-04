/**
 * Towers, creeps, perks and waves for the tower-defense mode. Pure data and
 * arithmetic over config.json, with no path aliases, so the tests can load it directly.
 */

import {
  CONFIG,
  type TdDifficultyKey,
  type TdPathSpec,
  type TdSpellKey,
  type TdCreepKind,
  type TdCreepSpec,
  type TdPerkKey,
  type TdPerkSpec,
  type TdTowerKey,
  type TdTowerSpec,
  type TdVoidPerkKey,
} from "../config.ts";

export type TowerKey = TdTowerKey;
export type CreepKind = TdCreepKind;
export type PerkKey = TdPerkKey;
export type TowerSpec = TdTowerSpec;
export type CreepSpec = TdCreepSpec;
export type PerkSpec = TdPerkSpec;
export type PathSpec = TdPathSpec;
export type SpellKey = TdSpellKey;
export type DifficultyKey = TdDifficultyKey;

export const SPELL_KEYS: SpellKey[] = ["storm", "still"];
export const DIFFICULTY_KEYS: DifficultyKey[] = ["easy", "normal", "hard"];

export function isDifficulty(key: unknown): key is DifficultyKey {
  return typeof key === "string" && (DIFFICULTY_KEYS as string[]).includes(key);
}

export function difficulty(key: DifficultyKey) {
  return TD.difficulties[key] ?? TD.difficulties.normal;
}

const TD = CONFIG.td;

export const TOWERS: Record<TowerKey, TowerSpec> = TD.towers;
export const CREEPS: Record<CreepKind, CreepSpec> = TD.creeps;
export const PERKS: Record<PerkKey, PerkSpec> = TD.perks;

/** Build-menu order of the void set (paid in flux), one for each tower above. */
export const VOID_TOWER_KEYS: TowerKey[] = [
  "tachyon",
  "railgun",
  "antimatter",
  "graviton",
  "entangler",
  "plasma",
  "quasar",
  "wormhole",
  "reactor",
  "singularity",
];

/** A void tower: built, upgraded and specialized with flux, not O/I. */
export function isVoid(key: TowerKey): boolean {
  return TOWERS[key]?.void === true;
}

/** What a tower is paid in. */
export type Currency = "gold" | "flux";
export function currencyOf(key: TowerKey): Currency {
  return isVoid(key) ? "flux" : "gold";
}

/** Build-menu order. */
export const TOWER_KEYS: TowerKey[] = [
  "ink",
  "verse",
  "sigil",
  "comma",
  "echo",
  "cipher",
  "focus",
  "muse",
  "archive",
  "eraser",
];
export const PERK_KEYS: PerkKey[] = ["damage", "rate", "range", "interest", "lives", "thrift"];
export const CREEP_KINDS = Object.keys(CREEPS) as CreepKind[];

export const MAX_TOWER_LEVEL = TD.maxLevel;
export const START_GOLD = TD.startGold;
export const START_LIVES = TD.startLives;

export function isCreepKind(kind: string | undefined): kind is CreepKind {
  return kind !== undefined && kind in CREEPS;
}

export type Perks = Record<PerkKey, number>;

export function noPerks(): Perks {
  return { damage: 0, rate: 0, range: 0, interest: 0, lives: 0, thrift: 0 };
}

// ---- The void: flux, the rep currency ----

const V = TD.void;
export type VoidPerkKey = TdVoidPerkKey;
export type VoidPerks = Record<VoidPerkKey, number>;
export const VOID_PERK_KEYS: VoidPerkKey[] = ["yield", "power", "reach", "tithe"];
export const VOID_PERKS: Record<VoidPerkKey, PerkSpec> = V.perks;

export function noVoidPerks(): VoidPerks {
  return { yield: 0, power: 0, reach: 0, tithe: 0 };
}

/** Price of the next level of a void perk, in flux. */
export function voidPerkCost(key: VoidPerkKey, level: number): number {
  const spec = VOID_PERKS[key];
  return spec.baseCost + spec.costPerLevel * level;
}

/**
 * Flux one rep pays after reps others in the run: fluxPerRep plus repGrowth for
 * every repGrowthEvery reps done, raised by Resonance and by every Rift Titan slain (boost).
 */
export function fluxPerRep(vp: VoidPerks, boost = 0, reps = 0): number {
  const every = Math.max(1, Math.floor(V.repGrowthEvery));
  const base = V.fluxPerRep + Math.max(0, V.repGrowth) * Math.floor(Math.max(0, reps) / every);
  return Math.round(base * (1 + VOID_PERKS.yield.amount * vp.yield + Math.max(0, boost)));
}

/** Flux a batch of n reps pays, done after reps others in the run (each rep at its own step). */
export function batchFlux(vp: VoidPerks, boost: number, reps: number, n: number): number {
  let flux = 0;
  for (let i = 0; i < n; i++) flux += fluxPerRep(vp, boost, reps + i);
  return flux;
}

/** Reps to go before flux a rep goes up again. */
export function repsToGrowth(reps: number): number {
  const every = Math.max(1, Math.floor(V.repGrowthEvery));
  return every - (Math.max(0, reps) % every);
}

/** O/I one rep also pays, with Rep tithe. */
export function repGold(vp: VoidPerks): number {
  return Math.round(VOID_PERKS.tithe.amount * vp.tithe);
}

/** O/I to summon a Rift Titan now (it grows with the waves called). */
export function summonCost(wave: number): number {
  return Math.round(V.summonGold + V.summonGoldPerWave * Math.max(0, wave));
}

/** Flux for slaying a summoned Rift Titan at a wave. */
export function summonReward(wave: number): number {
  return Math.round(V.summonFlux + V.summonFluxPerWave * Math.max(0, wave));
}

/** What a tower does at a level, with the global perks applied. */
export interface TowerStats {
  damage: number;
  /** Shots per second; zero for towers that do not fire. */
  rate: number;
  range: number;
  splash: number;
  slow: number;
  slowTime: number;
  chain: number;
  burn: number;
  burnTime: number;
  pierce: number;
  beam: boolean;
  ramp: number;
  maxRamp: number;
  aura: number;
  income: number;
  /** Fire-rate bonus for towers next to this one. */
  haste: number;
  /** Extra share of O/I every kill pays. */
  bounty: number;
  /** Extra damage creeps in range take, and the share of armor they lose. */
  vuln: number;
  shred: number;
  /** Creeps (not bosses) at this share of life or less in its circle, or hit by it, collapse. */
  execute: number;
  /** Flux paid when a wave clears. */
  fluxIncome: number;
}

/** A tower that does not fire but affects everything in its circle (Muse, Eraser). */
export function isSupport(key: TowerKey): boolean {
  const spec = TOWERS[key];
  return spec.rate <= 0 && spec.range > 0;
}

/** The two paths a tower can take at the top level. */
export function pathsOf(key: TowerKey): PathSpec[] {
  return TOWERS[key].paths ?? [];
}

/** The two Ascensions a tower can take at td.ascendLevel, after a path. */
export function ascensionsOf(key: TowerKey): PathSpec[] {
  return TOWERS[key].ascend ?? [];
}

/** Multiplies and adds a path's or Ascension's numbers into a tower's stats. */
function applyMods(out: TowerStats, p: PathSpec) {
  for (const [k, v] of Object.entries(p.mult ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) out[k as "damage" | "rate" | "burn"] *= v;
  }
  for (const [k, v] of Object.entries(p.add ?? {})) {
    if (typeof v !== "number" || !Number.isFinite(v) || !(k in out)) continue;
    const field = k as keyof TowerStats;
    if (field === "beam") continue;
    // Range only matters to towers that fire or have an aura.
    if (field === "range" && out.range <= 0) continue;
    (out[field] as number) += v;
  }
}

/**
 * What a tower does at a level, with the global perks, its path and its
 * Ascension (-1 for none) applied: each multiplies some stats and adds to others.
 */
export function towerStats(
  key: TowerKey,
  level: number,
  perks: Perks = noPerks(),
  path = -1,
  ascend = -1,
  voidPerks: VoidPerks = noVoidPerks(),
): TowerStats {
  const base = baseStats(key, level, perks);
  // Void towers also take the void perks: Dark energy (damage) and Event horizon (range).
  if (isVoid(key)) {
    const power = 1 + VOID_PERKS.power.amount * voidPerks.power;
    base.damage *= power;
    base.burn *= power;
    if (base.range > 0 && base.rate > 0) base.range += VOID_PERKS.reach.amount * voidPerks.reach;
  }
  const p = path >= 0 ? pathsOf(key)[path] : undefined;
  const a = ascend >= 0 ? ascensionsOf(key)[ascend] : undefined;
  if (!p && !a) return base;
  const out = { ...base };
  if (p) applyMods(out, p);
  if (a) applyMods(out, a);
  out.slow = Math.min(0.85, out.slow);
  out.shred = Math.min(1, out.shred);
  if (isSupport(key)) out.range = Math.min(TD.maxSupportRange, out.range);
  out.pierce = Math.min(1, out.pierce);
  out.execute = Math.min(0.35, out.execute);
  out.chain = Math.round(out.chain);
  out.maxRamp = Math.round(out.maxRamp);
  return out;
}

function baseStats(key: TowerKey, level: number, perks: Perks): TowerStats {
  const spec = TOWERS[key];
  const g = TD.levelGrowth;
  const up = Math.max(0, level - 1);
  const damageMult = (1 + g.damage * up) * (1 + PERKS.damage.amount * perks.damage);
  const rateMult = (1 + g.rate * up) * (1 + PERKS.rate.amount * perks.rate);
  const fires = spec.rate > 0;
  return {
    damage: spec.damage * damageMult,
    rate: spec.rate * rateMult,
    range:
      spec.range <= 0
        ? 0
        : fires
          ? spec.range + g.range * up + PERKS.range.amount * perks.range
          : // A Muse's or Eraser's circle is the area it affects, so it grows with level, to a limit.
            Math.min(TD.maxSupportRange, spec.range + g.range * up),
    splash: spec.splash ?? 0,
    slow: spec.slow ? Math.min(0.7, spec.slow + g.slow * up) : 0,
    slowTime: spec.slowTime ?? 0,
    // Two more jumps at first, then one more at level 3 and at level 5.
    chain: spec.chain ? spec.chain + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) : 0,
    burn: (spec.burn ?? 0) * damageMult,
    burnTime: spec.burnTime ?? 0,
    pierce: spec.pierce ?? 0,
    beam: spec.beam === true,
    ramp: spec.ramp ?? 0,
    maxRamp: spec.maxRamp ?? 0,
    aura: spec.aura ? spec.aura + g.aura * up : 0,
    income: spec.income ? spec.income + g.income * up : 0,
    haste: spec.haste ?? 0,
    bounty: 0,
    vuln: spec.vuln ? spec.vuln + (g.vuln ?? 0) * up : 0,
    shred: spec.shred ?? 0,
    execute: spec.execute ?? 0,
    fluxIncome: spec.fluxIncome ? spec.fluxIncome + (g.fluxIncome ?? 0) * up : 0,
  };
}

/** Price of an Ascension: several times the tower's own price. */
export function ascendCost(key: TowerKey, perks: Perks = noPerks()): number {
  return Math.round(TOWERS[key].cost * TD.ascendCostFactor * thrift(perks));
}

/** Price of a path: a few times the tower's own price. */
export function pathCost(key: TowerKey, perks: Perks = noPerks()): number {
  return Math.round(TOWERS[key].cost * TD.pathCostFactor * thrift(perks));
}

function thrift(perks: Perks): number {
  return Math.max(0, 1 - PERKS.thrift.amount * perks.thrift);
}

export function buildCost(key: TowerKey, perks: Perks = noPerks()): number {
  return Math.round(TOWERS[key].cost * thrift(perks));
}

/**
 * Price to go from `level` to `level + 1`. Up to the top level it rises steadily;
 * past it, each mastery level costs masteryCostGrowth times the one before, so
 * there is always something to spend on as the waves keep coming.
 */
export function upgradeCost(key: TowerKey, level: number, perks: Perks = noPerks()): number {
  const base = TOWERS[key].cost * TD.upgradeCostFactor * thrift(perks);
  if (level < MAX_TOWER_LEVEL) return Math.round(base * level);
  return Math.round(
    base * (MAX_TOWER_LEVEL - 1) * TD.masteryCostGrowth ** (level - MAX_TOWER_LEVEL + 1),
  );
}

/** Levels past the top one. */
export function masteryOf(level: number): number {
  return Math.max(0, level - MAX_TOWER_LEVEL);
}

/** O/I back when a tower is sold, given everything spent on it. */
export function sellValue(invested: number): number {
  return Math.round(invested * TD.sellRefund);
}

/** Price of the next level of a perk. */
export function perkCost(key: PerkKey, level: number): number {
  const spec = PERKS[key];
  return spec.baseCost + spec.costPerLevel * level;
}

export interface WaveSpec {
  wave: number;
  kinds: CreepKind[];
  /** Seconds between spawns. */
  interval: number;
  /** Hit-point multiplier for every creep in the wave. */
  hpScale: number;
  /** Extra hit-point multiplier for its bosses. */
  bossScale: number;
  speedScale: number;
  /** Armor added to every creep, on top of its own. */
  armorBonus: number;
  /** Multiplier on the O/I each creep pays. */
  goldScale: number;
}

/** Small seeded generator, so wave n is the same wave every run. */
function seeded(seed: number): () => number {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** Kinds that walk in wave n on their own (not only as splits or summons), with their weights. */
export function poolFor(wave: number): { kind: CreepKind; weight: number }[] {
  const { unlocks, weights } = TD.waves;
  return CREEP_KINDS.filter(
    (k) => !CREEPS[k].boss && unlocks[k] !== undefined && wave >= (unlocks[k] ?? Infinity),
  ).map((kind) => ({ kind, weight: Math.max(0, weights[kind] ?? 1) }));
}

/** The bosses that close wave n, if it is a boss wave. */
export function bossesFor(wave: number): CreepKind[] {
  const { bossEvery, extraBossEvery } = TD.waves;
  if (bossEvery <= 0 || wave % bossEvery !== 0) return [];
  const bosses = TD.bosses.filter(isCreepKind);
  if (!bosses.length) return [];
  const count = 1 + (extraBossEvery > 0 ? Math.floor(wave / extraBossEvery) : 0);
  const first = wave / bossEvery - 1;
  return Array.from({ length: count }, (_, i) => bosses[(first + i) % bosses.length] as CreepKind);
}

/**
 * Wave n. Waves never run out: the count grows to a cap, while hit points grow
 * faster than linearly, speed and armor creep up, and bosses come more often.
 */
export function waveSpec(wave: number): WaveSpec {
  const w = TD.waves;
  const n = Math.max(1, Math.floor(wave));
  const count = Math.min(w.maxCount, w.baseCount + w.countPerWave * n);
  const pool = poolFor(n);
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  const random = seeded(n * 7919 + 13);
  const kinds: CreepKind[] = [];
  while (kinds.length < count && total > 0) {
    let roll = random() * total;
    let pick = pool[0]?.kind ?? "adenosine";
    for (const p of pool) {
      roll -= p.weight;
      if (roll <= 0) {
        pick = p.kind;
        break;
      }
    }
    const pack = CREEPS[pick].swarm ? Math.max(1, w.swarmSize) : 1;
    for (let i = 0; i < pack && kinds.length < count; i++) kinds.push(pick);
  }
  kinds.push(...bossesFor(n));
  const k = n - 1;
  return {
    wave: n,
    kinds,
    interval: Math.max(w.minInterval, w.baseInterval - w.intervalDropPerWave * n),
    hpScale: 1 + w.hpLinear * k + w.hpQuadratic * k * k,
    bossScale: 1 + w.bossHpPerBossWave * Math.max(0, n / Math.max(1, w.bossEvery) - 1),
    speedScale: 1 + Math.min(w.maxSpeedBonus, w.speedPerWave * k),
    armorBonus:
      n >= w.armorFromWave
        ? Math.min(w.maxArmorBonus, w.armorPerWave * (n - w.armorFromWave + 1))
        : 0,
    goldScale: 1 + w.goldPerWave * k,
  };
}

/** O/I for clearing wave n. */
export function waveBonus(wave: number): number {
  return TD.waves.clearBonusBase + TD.waves.clearBonusPerWave * wave;
}

/** O/I for calling wave n while another is still on the board. */
export function earlyBonus(wave: number): number {
  return TD.earlySend.base + TD.earlySend.perWave * wave;
}

/** What wave n brings, kind by kind in order of arrival, bosses last. */
export function wavePreview(wave: number): { kind: CreepKind; count: number; boss: boolean }[] {
  const out: { kind: CreepKind; count: number; boss: boolean }[] = [];
  for (const kind of waveSpec(wave).kinds) {
    const row = out.find((r) => r.kind === kind);
    if (row) row.count += 1;
    else out.push({ kind, count: 1, boss: CREEPS[kind].boss === true });
  }
  return out;
}
