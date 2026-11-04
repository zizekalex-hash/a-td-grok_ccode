/**
 * Saving a tower-defense run, so it can be picked up after the app closes. The
 * whole board goes in (towers, creeps on the lane, waves still spawning), as
 * plain JSON. A save that does not check out is ignored rather than trusted.
 */

import { CONFIG } from "../config.ts";
import { MAPS, buildable, laneCount, type TdMap } from "./map.ts";
import {
  CREEPS,
  isCreepKind,
  isDifficulty,
  noPerks,
  ascensionsOf,
  pathsOf,
  PERK_KEYS,
  SPELL_KEYS,
  TOWERS,
  towerStats,
  VOID_PERK_KEYS,
  VOID_PERKS,
  waveSpec,
  type DifficultyKey,
  type TowerKey,
} from "./economy.ts";
import { createGame, TARGETING, type Targeting, type TdState } from "./sim.ts";

export const SAVE_VERSION = 1;

/** What the title screen shows about a saved run. */
export interface RunSummary {
  map: string;
  difficulty: DifficultyKey;
  wave: number;
  cleared: number;
  lives: number;
  savedAt: number;
}

interface SavedRun {
  v: number;
  savedAt: number;
  map: string;
  state: Omit<TdState, "map" | "events">;
}

export function serialize(s: TdState, now = Date.now()): string {
  const { map, events, ...rest } = s;
  void events;
  const run: SavedRun = { v: SAVE_VERSION, savedAt: now, map: map.key, state: rest };
  return JSON.stringify(run);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function isTower(key: unknown): key is TowerKey {
  return typeof key === "string" && key in TOWERS;
}

/** The run in a save, or null when it is missing, from another version, or broken. */
export function restore(raw: string | null): TdState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const run = obj(data);
  const st = obj(run.state);
  if (run.v !== SAVE_VERSION || typeof run.map !== "string" || !MAPS[run.map]) return null;
  if (!num(st.gold) || !num(st.lives) || !num(st.wave) || !num(st.cleared) || st.lives <= 0) return null;
  if (st.phase === "over") return null;
  const map = MAPS[run.map] as TdMap;
  const s = createGame(map, isDifficulty(st.difficulty) ? st.difficulty : "normal");

  s.gold = Math.max(0, st.gold);
  s.lives = st.lives;
  s.maxLives = num(st.maxLives) ? Math.max(st.lives, st.maxLives) : s.maxLives;
  s.wave = Math.max(0, Math.floor(st.wave));
  s.cleared = Math.max(0, Math.min(s.wave, Math.floor(st.cleared)));
  s.kills = num(st.kills) ? Math.max(0, st.kills) : 0;
  s.auto = st.auto === true;
  const perks = obj(st.perks);
  s.perks = noPerks();
  for (const key of PERK_KEYS) if (num(perks[key])) s.perks[key] = Math.max(0, Math.floor(perks[key]));
  const retired = obj(st.retired);
  for (const [key, raw] of Object.entries(retired)) {
    const rec = obj(raw);
    if (isTower(key) && num(rec.dealt) && num(rec.kills)) s.retired[key] = { dealt: rec.dealt, kills: rec.kills };
  }
  const spells = obj(st.spells);
  for (const key of SPELL_KEYS) s.spells[key] = num(spells[key]) ? Math.max(0, spells[key]) : 0;
  // Flux, the reps done this run, and what the flux bought.
  s.flux = num(st.flux) ? Math.max(0, st.flux) : 0;
  s.reps = num(st.reps) ? Math.max(0, Math.floor(st.reps)) : 0;
  s.fluxBoost = num(st.fluxBoost)
    ? Math.max(0, Math.min(CONFIG.td.void.summonBoostMax, st.fluxBoost))
    : 0;
  const vp = obj(st.voidPerks);
  for (const key of VOID_PERK_KEYS)
    if (num(vp[key])) s.voidPerks[key] = Math.max(0, Math.min(VOID_PERKS[key].max, Math.floor(vp[key])));

  let maxId = 0;
  const seen = new Set<string>();
  for (const raw of list(st.towers)) {
    const t = obj(raw);
    if (!isTower(t.key) || !num(t.col) || !num(t.row) || !num(t.level) || !num(t.id)) continue;
    const spot = `${t.col},${t.row}`;
    if (!buildable(map, t.col, t.row) || seen.has(spot)) continue;
    seen.add(spot);
    const level = Math.max(1, Math.floor(t.level));
    const path = num(t.path) && pathsOf(t.key)[t.path] ? t.path : -1;
    const ascend = path >= 0 && num(t.ascend) && ascensionsOf(t.key)[t.ascend] ? t.ascend : -1;
    s.towers.push({
      id: t.id,
      key: t.key,
      col: t.col,
      row: t.row,
      level,
      invested: num(t.invested) ? t.invested : 0,
      cooldown: num(t.cooldown) ? t.cooldown : 0,
      targeting: TARGETING.includes(t.targeting as Targeting) ? (t.targeting as Targeting) : "first",
      // Stats are worked out again, never read from the save.
      stats: towerStats(t.key, level, s.perks, path, ascend, s.voidPerks),
      focusId: -1,
      focusStacks: 0,
      phrase: "",
      shots: num(t.shots) ? t.shots : 0,
      path,
      ascend,
      dealt: num(t.dealt) ? t.dealt : 0,
      kills: num(t.kills) ? t.kills : 0,
      // A save from before refunds were tracked never counts as a fresh build.
      builtWave: num(t.builtWave) ? t.builtWave : -1,
      builtCleared: num(t.builtCleared) ? t.builtCleared : -1,
    });
    maxId = Math.max(maxId, t.id);
  }

  for (const raw of list(st.creeps)) {
    const c = obj(raw);
    if (!isCreepKind(c.kind as string) || !num(c.id) || !num(c.hp) || !num(c.maxHp) || !num(c.dist)) continue;
    const kind = c.kind as keyof typeof CREEPS;
    const n = (k: string, d = 0) => (num(c[k]) ? (c[k] as number) : d);
    s.creeps.push({
      id: c.id,
      kind,
      wave: n("wave", 1),
      hp: c.hp,
      maxHp: c.maxHp,
      dist: c.dist,
      x: n("x"),
      y: n("y"),
      speed: n("speed", CREEPS[kind].speed),
      armor: n("armor"),
      gold: n("gold", CREEPS[kind].gold),
      regen: n("regen"),
      heal: n("heal"),
      slow: n("slow"),
      slowTime: n("slowTime"),
      burn: n("burn"),
      burnTime: n("burnTime"),
      summonTimer: n("summonTimer"),
      hit: 0,
      leaked: false,
      lastHit: n("lastHit"),
      burnBy: n("burnBy"),
      vuln: 0,
      shred: 0,
      lane: Math.max(0, Math.min(laneCount(map) - 1, Math.floor(n("lane")))),
      exec: 0,
      execBy: 0,
      summoned: c.summoned === true && kind === "rift",
    });
    maxId = Math.max(maxId, c.id);
  }

  for (const raw of list(st.spawners)) {
    const sp = obj(raw);
    if (!num(sp.wave)) continue;
    const queue = list(sp.queue).filter((k): k is keyof typeof CREEPS => isCreepKind(k as string));
    // The wave's numbers come from the rules, so a save cannot make one easier.
    s.spawners.push({
      wave: sp.wave,
      spec: waveSpec(sp.wave),
      queue,
      acc: num(sp.acc) ? sp.acc : 0,
      lane: num(sp.lane) ? Math.max(0, Math.floor(sp.lane)) : 0,
    });
  }

  s.nextId = Math.max(num(st.nextId) ? st.nextId : 1, maxId + 1);
  s.phase = s.spawners.length || s.creeps.length ? "wave" : "build";
  return s;
}

/** A save's map, wave and when it was made, for the Continue button. */
export function summarize(raw: string | null): RunSummary | null {
  if (!raw) return null;
  const s = restore(raw);
  if (!s) return null;
  let savedAt = 0;
  try {
    savedAt = Number(obj(JSON.parse(raw)).savedAt) || 0;
  } catch {
    /* restore already parsed it */
  }
  return { map: s.map.key, difficulty: s.difficulty, wave: s.wave, cleared: s.cleared, lives: s.lives, savedAt };
}
