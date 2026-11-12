/**
 * The wake set (towers paid in ATP), the dream set of creeps, the wake core's
 * levels, stitched maps, and the circles of towers that do not fire.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import {
  boardCount,
  buildable,
  COLS,
  findMap,
  inGrid,
  mapFor,
  MAPS,
  pointAt,
  ROWS,
  sectionAt,
  stitchKey,
  stitchKeys,
  stitchScale,
  type TdMap,
} from "./map.ts";
import {
  ascensionsOf,
  bossesFor,
  buildCost,
  coreCost,
  coreStats,
  CREEPS,
  currencyOf,
  isSupport,
  isVoid,
  isWake,
  noPerks,
  pathsOf,
  poolFor,
  TOWER_KEYS,
  TOWERS,
  towerStats,
  upgradeCost,
  VOID_TOWER_KEYS,
  WAKE_TOWER_KEYS,
  type CreepKind,
  type TowerKey,
} from "./economy.ts";
import { restore, serialize, summarize } from "./save.ts";
import {
  auraBonus,
  build,
  chooseAscension,
  choosePath,
  CORE_ID,
  coreOf,
  coreRaises,
  createGame,
  pickTarget,
  raiseCore,
  raiseCoreMax,
  rangeOf,
  reachBonus,
  sell,
  sendWave,
  step,
  towerAt,
  upgrade,
  type TdCreep,
  type TdShot,
  type TdState,
} from "./sim.ts";

const text = () => "word";

/** A creep placed straight on the lane, outside any wave, standing still unless given a speed. */
function put(s: TdState, kind: CreepKind, dist: number, hp = 1e6, speed = 0): TdCreep {
  const p = pointAt(s.map, dist);
  const spec = CREEPS[kind];
  const c: TdCreep = {
    id: s.nextId++,
    kind,
    wave: 0,
    hp,
    maxHp: hp,
    dist,
    x: p.x,
    y: p.y,
    speed,
    armor: 0,
    gold: 1,
    regen: 0,
    heal: 0,
    slow: 0,
    slowTime: 0,
    burn: 0,
    burnTime: 0,
    summonTimer: 99,
    hit: 0,
    leaked: false,
    lastHit: 0,
    burnBy: 0,
    vuln: 0,
    shred: 0,
    lane: 0,
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
    jamTimer: spec.jamEvery ?? 0,
  };
  s.creeps.push(c);
  return c;
}

/** A shot about to land on a creep, from no tower. */
function shotAt(c: TdCreep, damage: number, id = 9000): TdShot {
  return {
    id,
    key: "ink",
    from: 0,
    target: c.id,
    fromX: c.x,
    fromY: c.y,
    x: c.x,
    y: c.y,
    tx: c.x,
    ty: c.y,
    travel: 0.001,
    total: 0.25,
    damage,
    splash: 0,
    slow: 0,
    slowTime: 0,
    burn: 0,
    burnTime: 0,
    pierce: 0,
    text: "",
    corrode: 0,
    rend: 0,
    stun: 0,
    block: 0,
  };
}

/** A game on the default map (Coil) with plenty of every currency. Row 1 is free, between two rows of lane. */
function rich(map?: TdMap): TdState {
  const s = createGame(map);
  s.gold = 1e7;
  s.flux = 1e7;
  s.atp = 1e7;
  return s;
}

/** Steps in small slices until `done` says so, at most `limit` seconds. */
function until(s: TdState, done: () => boolean, limit = 10, dt = 0.01) {
  for (let t = 0; t < limit && !done(); t += dt) step(s, dt, 1, text);
}

describe("the wake set", () => {
  it("has one wake tower for every tower, each paid in ATP", () => {
    assert.equal(WAKE_TOWER_KEYS.length, TOWER_KEYS.length);
    assert.equal(new Set([...TOWER_KEYS, ...VOID_TOWER_KEYS, ...WAKE_TOWER_KEYS]).size, 3 * TOWER_KEYS.length);
    for (const k of WAKE_TOWER_KEYS) {
      assert.ok(isWake(k) && !isVoid(k), k);
      assert.equal(currencyOf(k), "atp");
      assert.equal(pathsOf(k).length, 2);
      assert.equal(ascensionsOf(k).length, 2);
    }
    for (const k of [...TOWER_KEYS, ...VOID_TOWER_KEYS]) assert.ok(!isWake(k), k);
    // The same roles as the first set, in the same order of the build menu (the last ones in each set's own words).
    WAKE_TOWER_KEYS.slice(0, 8).forEach((k, i) => assert.equal(TOWERS[k].role, TOWERS[TOWER_KEYS[i] as TowerKey].role, k));
  });

  it("is built, upgraded, specialized and sold in ATP, never O/I", () => {
    const s = createGame();
    s.gold = 1e6;
    assert.equal(build(s, "orexin", 4, 1).ok, false, "O/I does not buy a wake tower");
    s.atp = buildCost("orexin");
    assert.ok(build(s, "orexin", 4, 1).ok);
    assert.equal(s.atp, 0);
    assert.equal(s.gold, 1e6);
    s.atp = upgradeCost("orexin", 1);
    assert.ok(upgrade(s, 4, 1).ok);
    assert.equal(s.atp, 0);
    const t = towerAt(s, 4, 1)!;
    assert.equal(t.invested, buildCost("orexin") + upgradeCost("orexin", 1));
    assert.ok(sell(s, 4, 1).ok);
    assert.equal(s.atp, t.invested, "an unused tower built this wave sells back in full, in ATP");
    assert.equal(s.gold, 1e6);
  });

  it("Orexin fires at two creeps at once, each a different one", () => {
    const s = rich();
    build(s, "orexin", 4, 1);
    const a = put(s, "adenosine", 4);
    step(s, 0.01, 1, text);
    assert.equal(s.shots.length, 1, "one creep in reach: one shot");
    const t = createGame();
    t.atp = 1e6;
    build(t, "orexin", 4, 1);
    const b = put(t, "adenosine", 4);
    const c = put(t, "adenosine", 4.6);
    step(t, 0.01, 1, text);
    assert.deepEqual(t.shots.map((sh) => sh.target).sort(), [b.id, c.id].sort());
    assert.ok(a.hp > 0);
    // Its path adds a third creep to the volley.
    assert.equal(towerStats("orexin", 5, noPerks(), 0).multi, 2);
  });

  it("Noradrenaline stops a creep dead, but not twice in a row, and a boss for half as long", () => {
    const s = rich();
    build(s, "noradrenaline", 4, 1);
    const c = put(s, "adenosine", 4, 1e6, 1);
    until(s, () => c.stun > 0);
    assert.ok(c.stun > 0, "the hit stuns");
    const at = c.dist;
    step(s, 0.2, 1, text);
    assert.equal(c.dist, at, "a stunned creep does not move");
    until(s, () => c.stun <= 0);
    assert.ok(c.stunGrace > 0, "then it cannot be stunned again for a moment");
    const grace = c.dist;
    step(s, 0.2, 1, text);
    assert.ok(c.dist > grace, "and walks on");
    const b = rich();
    build(b, "noradrenaline", 4, 1);
    const boss = put(b, "pressure", 4);
    until(b, () => boss.stun > 0);
    const full = TOWERS.noradrenaline.stun ?? 0;
    assert.ok(Math.abs(boss.stun - full * (1 - CONFIG.td.bossSlowResist)) < 0.02);
  });

  it("Glutamate's every third blast hits three times as hard", () => {
    const s = rich();
    build(s, "glutamate", 4, 1);
    const c = put(s, "adenosine", 4);
    const hits: number[] = [];
    let last = c.hp;
    for (let t = 0; t < 4.2; t += 0.01) {
      step(s, 0.01, 1, text);
      if (c.hp < last - 1e-9) hits.push(Math.round(last - c.hp));
      last = c.hp;
    }
    const base = TOWERS.glutamate.damage;
    assert.deepEqual(hits.slice(0, 3), [base, base, base * (TOWERS.glutamate.spikeMult ?? 0)]);
  });

  it("Caffeine blocks mending: no regeneration and no healing while it lasts", () => {
    const s = rich();
    build(s, "caffeine", 4, 1);
    const rem = put(s, "rem", 4, 1000);
    rem.hp = 500;
    rem.regen = 20;
    until(s, () => rem.block > 0);
    assert.ok(rem.block > 0 && rem.slowTime > 0, "the hit blocks and slows");
    const hp = rem.hp;
    step(s, 0.4, 1, text);
    assert.equal(rem.hp, hp, "a blocked creep does not regenerate");
    // A healer mends the creep next to it, unless that creep is blocked.
    const h = createGame();
    const healer = put(h, "glycine", 4);
    healer.heal = 50;
    const open = put(h, "adenosine", 4.2, 1000);
    const blocked = put(h, "adenosine", 4.4, 1000);
    open.hp = blocked.hp = 500;
    blocked.block = 5;
    step(h, 1, 1, text);
    assert.ok(open.hp > 500);
    assert.equal(blocked.hp, 500);
  });

  it("Acetylcholine's strike loses nothing from creep to creep", () => {
    const s = rich();
    build(s, "acetylcholine", 4, 1);
    const line = [3.6, 4, 4.4, 4.8].map((d) => put(s, "adenosine", d, 1000));
    step(s, 0.01, 1, text);
    for (const c of line) assert.equal(1000 - c.hp, TOWERS.acetylcholine.damage);
    // Echo, for comparison, weakens on each jump.
    const e = rich();
    build(e, "echo", 4, 1);
    const far = [4, 4.4, 4.8].map((d) => put(e, "adenosine", d, 1000));
    step(e, 0.01, 1, text);
    const lost = far.map((c) => 1000 - c.hp);
    assert.ok(Math.min(...lost) < Math.max(...lost) && Math.min(...lost) > 0);
  });

  it("Cortisol wears armor away for good", () => {
    const s = rich();
    build(s, "cortisol", 4, 1);
    const c = put(s, "galanin", 4);
    c.armor = 0.4;
    until(s, () => c.armor < 0.4);
    assert.ok(Math.abs(c.armor - (0.4 - (TOWERS.cortisol.corrode ?? 0))) < 1e-9);
    until(s, () => c.armor < 0.36, 5);
    assert.ok(c.armor < 0.36 && c.armor >= 0);
    c.armor = 0.01;
    until(s, () => c.armor === 0, 5);
    assert.equal(c.armor, 0, "never below none");
  });

  it("Daybreak burns away a share of the life left, a quarter of it on a boss", () => {
    const rend = TOWERS.daybreak.rend ?? 0;
    const loss = (kind: CreepKind) => {
      const s = rich();
      build(s, "daybreak", 4, 1);
      const c = put(s, kind, 4, 100000);
      step(s, 0.01, 1, text);
      return 100000 - c.hp;
    };
    const d = TOWERS.daybreak.damage;
    assert.ok(Math.abs(loss("adenosine") - (d + (100000 - d) * rend)) < 1e-6);
    assert.ok(Math.abs(loss("pressure") - (d + ((100000 - d) * rend) / 4)) < 1e-6);
  });

  it("Serotonin lets the towers in its circle reach further; several do not stack", () => {
    const s = rich();
    build(s, "ink", 4, 1);
    const ink = towerAt(s, 4, 1)!;
    // Just past the Ink's own range, on the row of lane above it.
    const dx = Math.sqrt((ink.stats.range + 0.2) ** 2 - 1);
    const c = put(s, "adenosine", 4 + dx);
    assert.equal(pickTarget(s, ink), undefined);
    assert.equal(reachBonus(s, ink), 0);
    build(s, "serotonin", 5, 1);
    const reach = TOWERS.serotonin.reach ?? 0;
    assert.equal(reachBonus(s, ink), reach);
    assert.equal(rangeOf(s, ink), ink.stats.range + reach);
    assert.equal(pickTarget(s, ink), c);
    step(s, 0.01, 1, text);
    assert.equal(s.shots.length, 1, "and it fires that far");
    build(s, "serotonin", 3, 1);
    assert.equal(reachBonus(s, ink), reach, "the widest counts, not the sum");
    assert.ok(Math.abs(auraBonus(s, ink) - 1 - 2 * (TOWERS.serotonin.aura ?? 0)) < 1e-9, "their damage does add up");
    // A tower that does not fire gets no reach.
    assert.equal(reachBonus(s, towerAt(s, 5, 1)!), 0);
  });

  it("Dopamine pays ATP when a wave clears, on top of what the core makes", () => {
    const s = rich();
    build(s, "dopamine", 4, 1);
    s.atp = 0;
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.01, 1, text);
    const cleared = s.events.find((e) => e.type === "waveCleared");
    assert.ok(cleared && cleared.type === "waveCleared");
    assert.equal(cleared.atp, coreStats(1).atp + (TOWERS.dopamine.atpIncome ?? 0));
    assert.equal(s.atp, cleared.atp);
  });

  it("Histamine slows the creeps in its circle, a boss half as much", () => {
    const walk = (kind: CreepKind, withTower: boolean) => {
      const s = rich();
      if (withTower) build(s, "histamine", 4, 1);
      const c = put(s, kind, 4, 1e6, 1);
      // The circle marks a creep at the end of a step, so the slowing shows from the next one.
      step(s, 0.01, 1, text);
      const from = c.dist;
      step(s, 0.5, 1, text);
      return c.dist - from;
    };
    const mire = TOWERS.histamine.mire ?? 0;
    assert.ok(Math.abs(walk("adenosine", true) / walk("adenosine", false) - (1 - mire)) < 1e-9);
    assert.ok(Math.abs(walk("pressure", true) / walk("pressure", false) - (1 - mire * (1 - CONFIG.td.bossSlowResist))) < 1e-9);
  });
});

describe("the dream set", () => {
  it("joins the waves from wave 12, and its bosses the rotation", () => {
    const dream: CreepKind[] = ["delta", "kcomplex", "microsleep", "cytokine", "atonia", "debt"];
    const early = poolFor(11).map((p) => p.kind);
    const late = poolFor(30).map((p) => p.kind);
    for (const k of dream) {
      assert.ok(!early.includes(k), `${k} is not in wave 11`);
      assert.ok(late.includes(k), `${k} is in wave 30`);
      assert.ok((CREEPS[k].atp ?? 0) > 0, `${k} drops ATP`);
    }
    assert.deepEqual(bossesFor(20), ["hypnos"]);
    assert.deepEqual(bossesFor(25), ["morpheus", "nyx"]);
    assert.deepEqual(bossesFor(35), ["pressure", "circadian"]);
    for (const b of CONFIG.td.bosses) assert.ok((CREEPS[b as CreepKind].atp ?? 0) > 0, `${b} drops ATP`);
  });

  it("drops ATP when slain, more in later waves", () => {
    const s = createGame();
    const c = put(s, "delta", 4, 1000);
    c.hp = 1;
    s.shots.push(shotAt(c, 50));
    step(s, 0.01, 1, text);
    assert.equal(s.atp, CREEPS.delta.atp);
    const t = createGame();
    t.wave = 40;
    const d = put(t, "delta", 4, 1000);
    d.hp = 1;
    t.shots.push(shotAt(d, 50));
    step(t, 0.01, 1, text);
    assert.ok(t.atp > (CREEPS.delta.atp ?? 0));
    // A creep of the first set, other than Adenosine, drops none.
    const u = createGame();
    const g = put(u, "gaba", 4, 1);
    u.shots.push(shotAt(g, 50));
    step(u, 0.01, 1, text);
    assert.equal(u.atp, 0);
  });

  it("Delta wave loses no more than its ward's share of its life to one hit", () => {
    const s = createGame();
    const c = put(s, "delta", 4, 1000);
    s.shots.push(shotAt(c, 5000));
    step(s, 0.01, 1, text);
    assert.equal(1000 - c.hp, 1000 * (CREEPS.delta.ward ?? 0));
  });

  it("K-complex sprints at the end of each of its cycles", () => {
    const s = createGame();
    const spec = CREEPS.kcomplex;
    const c = put(s, "kcomplex", 0, 1e6, 1);
    step(s, spec.dashEvery ?? 0, 1, text);
    const cycle = (spec.dashEvery ?? 0) - (spec.dashTime ?? 0) + (spec.dashTime ?? 0) * (spec.dashSpeed ?? 1);
    assert.ok(Math.abs(c.dist - cycle) < 0.2, `${c.dist} of ${cycle}`);
  });

  it("Microsleep fades out of aim, though a blast still reaches it", () => {
    const s = rich();
    build(s, "ink", 4, 1);
    const ink = towerAt(s, 4, 1)!;
    const spec = CREEPS.microsleep;
    const c = put(s, "microsleep", 4);
    step(s, 0.01, 1, text);
    assert.equal(c.faded, false);
    assert.equal(pickTarget(s, ink), c);
    c.age = (spec.phaseEvery ?? 0) - (spec.phaseTime ?? 0) + 0.05;
    step(s, 0.01, 1, text);
    assert.equal(c.faded, true);
    assert.equal(pickTarget(s, ink), undefined, "no tower can aim at it");
    const hp = c.hp;
    const other = put(s, "adenosine", 4.1);
    s.shots.push({ ...shotAt(other, 20), splash: 1 });
    step(s, 0.01, 1, text);
    assert.equal(hp - c.hp, 20, "a blast beside it still hits");
  });

  it("Cytokine lends armor to the creeps near it, not to itself", () => {
    const s = createGame();
    const guard = put(s, "cytokine", 4, 1000);
    const near = put(s, "adenosine", 4.5, 1000);
    const far = put(s, "adenosine", 7.5, 1000);
    step(s, 0.01, 1, text);
    s.shots.push(shotAt(guard, 100, 9001), shotAt(near, 100, 9002), shotAt(far, 100, 9003));
    step(s, 0.01, 1, text);
    assert.equal(1000 - guard.hp, 100);
    assert.equal(1000 - far.hp, 100);
    assert.ok(Math.abs(1000 - near.hp - 100 * (1 - (CREEPS.cytokine.guard ?? 0))) < 1e-9);
  });

  it("Atonia, slain, jams the towers around it for a moment", () => {
    const s = rich();
    build(s, "ink", 4, 1);
    build(s, "ink", 1, 5);
    const near = towerAt(s, 4, 1)!;
    const far = towerAt(s, 1, 5)!;
    const c = put(s, "atonia", 4, 1);
    until(s, () => c.hp <= 0, 3);
    assert.ok(near.jam > 0, "the tower next to it is jammed");
    assert.equal(far.jam, 0);
    const shots = near.shots;
    put(s, "adenosine", 4);
    step(s, (CREEPS.atonia.jam ?? 0) - 0.2, 1, text);
    assert.equal(near.shots, shots, "a jammed tower holds its fire");
    step(s, 1.2, 1, text);
    assert.ok(near.shots > shots, "then fires again");
  });

  it("Sleep debt gathers speed the longer it walks, up to a limit", () => {
    const s = createGame();
    const spec = CREEPS.debt;
    const c = put(s, "debt", 0, 1e6, 0.1);
    step(s, 1, 1, text);
    const first = c.dist;
    step(s, 1, 1, text);
    assert.ok(c.dist - first > first, "the second second covers more ground than the first");
    c.age = 1000;
    const at = c.dist;
    step(s, 1, 1, text);
    assert.ok(Math.abs(c.dist - at - 0.1 * (1 + (spec.rushMax ?? 0))) < 1e-9);
  });

  it("Hypnos slows the fire of the towers near it", () => {
    const gap = (boss: boolean) => {
      const s = rich();
      build(s, "ink", 4, 1);
      if (boss) put(s, "hypnos", 4);
      else put(s, "adenosine", 4);
      step(s, 0.01, 1, text);
      return towerAt(s, 4, 1)!.cooldown;
    };
    const plain = gap(false);
    const lulled = gap(true);
    assert.ok(Math.abs((plain + 0.01) / (lulled + 0.01) - (1 - (CREEPS.hypnos.lull ?? 0))) < 1e-9);
  });

  it("Nyx jams the towers she passes, on a clock", () => {
    const s = rich();
    build(s, "ink", 4, 1);
    const t = towerAt(s, 4, 1)!;
    put(s, "nyx", 4);
    step(s, (CREEPS.nyx.jamEvery ?? 0) - 0.2, 1, text);
    assert.equal(t.jam, 0);
    step(s, 0.3, 1, text);
    assert.ok(t.jam > 0);
  });
});

describe("the wake core", () => {
  it("is raised with ATP: each level costs more, and adds lives and ATP a wave", () => {
    const s = createGame();
    assert.equal(s.core.level, 1);
    assert.equal(raiseCore(s).ok, false, "no ATP, no level");
    s.atp = coreCost(1);
    const lives = s.lives;
    assert.ok(raiseCore(s).ok);
    assert.equal(s.core.level, 2);
    assert.equal(s.atp, 0);
    assert.equal(s.lives, lives + CONFIG.td.core.livesPerLevel);
    assert.equal(s.maxLives, lives + CONFIG.td.core.livesPerLevel);
    assert.ok(coreCost(2) > coreCost(1) && coreCost(10) > coreCost(9));
    assert.ok(coreStats(5).atp > coreStats(1).atp);
    s.atp = coreCost(2) + coreCost(3) + 1;
    assert.deepEqual(coreRaises(s), { levels: 2, cost: coreCost(2) + coreCost(3) });
    assert.equal(raiseCoreMax(s).levels, 2);
    assert.equal(s.core.level, 4);
    assert.equal(s.atp, 1);
    assert.ok(s.events.some((e) => e.type === "coreRaised" && e.stage !== ""), "a new stage is told");
  });

  it("makes ATP every time a wave clears", () => {
    const s = createGame();
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.01, 1, text);
    assert.equal(s.atp, coreStats(1).atp);
  });

  it("pulses from its second level: every creep in its circle is hit, none outside it", () => {
    const P = CONFIG.td.core.pulse;
    const s = createGame();
    const near = put(s, "adenosine", s.map.length - 1, 1000);
    const far = put(s, "adenosine", 4, 1000);
    step(s, P.every + 0.5, 1, text);
    assert.equal(near.hp, 1000, "level 1 does not pulse");
    s.core.level = P.fromLevel;
    step(s, P.every + 0.1, 1, text);
    assert.ok(Math.abs(1000 - near.hp - P.damage) < 1e-9);
    assert.equal(far.hp, 1000);
    assert.ok(Math.abs(s.core.dealt - P.damage) < 1e-9);
    assert.ok(s.core.flash > 0, "the ring shows");
    // A stronger pulse and a wider circle with every level, the circle to a limit.
    assert.ok(coreStats(6).damage > coreStats(5).damage);
    assert.ok(coreStats(6).range > coreStats(5).range);
    assert.equal(coreStats(100).range, P.maxRange);
  });

  it("gets the kill when its pulse finishes a creep", () => {
    const s = createGame();
    s.core.level = CONFIG.td.core.pulse.fromLevel;
    const c = put(s, "adenosine", s.map.length - 1, 1);
    until(s, () => c.hp <= 0, 5);
    assert.equal(c.lastHit, CORE_ID);
    assert.equal(s.core.kills, 1);
    assert.equal(s.kills, 1);
  });

  it("gains from its stages: the pulse slows, towers near it hit harder, lives come back", () => {
    const stages = CONFIG.td.core.stages;
    const slowAt = stages.find((st) => st.slow)!.level;
    const auraAt = stages.find((st) => st.aura)!.level;
    const mendAt = stages.find((st) => st.mend)!.level;
    assert.equal(coreStats(slowAt - 1).slow, 0);
    assert.ok(coreStats(slowAt).slow > 0);
    const s = rich();
    s.core.level = slowAt;
    const c = put(s, "adenosine", s.map.length - 1, 1000);
    until(s, () => c.hp < 1000, 5);
    assert.ok(c.slowTime > 0, "a Kindled core's pulse slows");
    // Radiant: a tower in the core's circle deals more; one outside it does not.
    const [cc, cr] = s.map.core;
    build(s, "ink", cc, cr - 1);
    build(s, "ink", 4, 1);
    const beside = towerAt(s, cc, cr - 1)!;
    const away = towerAt(s, 4, 1)!;
    assert.equal(auraBonus(s, beside), 1);
    s.core.level = auraAt;
    assert.ok(Math.abs(auraBonus(s, beside) - 1 - coreOf(s).aura) < 1e-9);
    assert.equal(auraBonus(s, away), 1);
    // Awakened: a life back for every wave cleared, never past the most.
    s.core.level = mendAt;
    s.creeps = [];
    s.lives = s.maxLives - 3;
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.01, 1, text);
    assert.equal(s.lives, s.maxLives - 3 + coreStats(mendAt).mend);
    s.lives = s.maxLives;
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.01, 1, text);
    assert.equal(s.lives, s.maxLives);
  });

  it("is kept in a saved run, and a save from before it starts at level 1", () => {
    const s = createGame();
    sendWave(s);
    s.atp = 345;
    s.core.level = 6;
    s.core.dealt = 99;
    const back = restore(serialize(s))!;
    assert.equal(back.atp, 345);
    assert.equal(back.core.level, 6);
    assert.equal(back.core.dealt, 99);
    const old = JSON.parse(serialize(s));
    delete old.state.atp;
    delete old.state.core;
    for (const c of old.state.creeps) for (const k of ["stun", "stunGrace", "block", "age", "faded", "guard", "mire", "jamTimer"]) delete c[k];
    const from = restore(JSON.stringify(old))!;
    assert.equal(from.atp, CONFIG.td.atp.start);
    assert.equal(from.core.level, 1);
    assert.ok(from.wave === 1);
  });
});

describe("stitched maps", () => {
  const two = mapFor("coil+zigzag");
  const coil = MAPS.coil!;
  const zigzag = MAPS.zigzag!;

  it("join two maps side by side into one", () => {
    assert.equal(two.key, "coil+zigzag");
    assert.equal(two.cols, 2 * COLS);
    assert.equal(two.rows, ROWS);
    assert.equal(boardCount(two), 2);
    assert.deepEqual(two.gate, coil.gate);
    assert.deepEqual(two.core, [zigzag.core[0] + COLS, zigzag.core[1]]);
    assert.deepEqual(two.joins, [coil.core]);
    assert.equal(boardCount(coil), 1);
    assert.deepEqual(coil.joins, []);
  });

  it("are one connected lane: every step goes to a neighbouring cell, from the first gate to the core", () => {
    for (const key of ["coil+zigzag", "zigzag+coil", "arrow+sprint", "coil+zigzag+arrow", "coil+zigzag+arrow+fork", "pincer+fork"]) {
      const map = mapFor(key);
      assert.equal(map.key, key);
      for (const lane of map.lanes) {
        for (let i = 1; i < lane.path.length; i++) {
          const a = lane.path[i - 1]!;
          const b = lane.path[i]!;
          assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1, `${key}: gap at step ${i}`);
        }
        assert.equal(lane.path.length, lane.length + 1, `${key}: nothing is skipped`);
        assert.deepEqual(lane.path[lane.path.length - 1], map.core);
        for (const [c, r] of lane.path) assert.ok(inGrid(c, r, map), `${key}: the lane stays on the map`);
        lane.waypoints.forEach(([c, r], i) => {
          const prev = lane.waypoints[i - 1];
          if (prev) assert.ok(prev[0] === c || prev[1] === r, `${key}: corner ${i} is not in line`);
        });
      }
    }
  });

  it("run through each map's own lane in turn, and on from its end to the next one's gate", () => {
    const cells = two.path.map(([c, r]) => `${c},${r}`);
    // The first map's lane, whole, comes first.
    assert.deepEqual(cells.slice(0, coil.path.length), coil.path.map(([c, r]) => `${c},${r}`));
    // Then the link to the second map's gate, and that map's lane, whole, to the core.
    const second = zigzag.path.map(([c, r]) => `${c + COLS},${r}`);
    assert.deepEqual(cells.slice(-second.length), second);
    const link = two.length - coil.length - zigzag.length;
    assert.ok(link >= 1, "the link has length: creeps walk it");
    assert.equal(link, Math.abs(coil.core[0] - (zigzag.gate[0] + COLS)) + Math.abs(coil.core[1] - zigzag.gate[1]));
    // A point on the link lies between the two maps' lanes, not on a jump.
    const mid = pointAt(two, coil.length + 1);
    assert.ok(Math.abs(mid.x - coil.core[0] - 0.5) + Math.abs(mid.y - coil.core[1] - 0.5) === 1);
    assert.deepEqual(pointAt(two, two.length), { x: two.core[0] + 0.5, y: two.core[1] + 0.5 });
  });

  it("take towers on every board, but not on the lane, the link or the core", () => {
    assert.equal(inGrid(2 * COLS - 1, ROWS - 1, two), true);
    assert.equal(inGrid(2 * COLS, 0, two), false);
    assert.equal(inGrid(COLS, 0), false, "one board is nine cells wide");
    assert.equal(buildable(two, COLS + 1, 1), true, "a free cell of the second board");
    assert.equal(buildable(two, coil.core[0], coil.core[1]), false, "where the first lane ends");
    assert.equal(buildable(two, two.core[0], two.core[1]), false, "the core");
    assert.equal(buildable(two, COLS, 0), false, "the second board's gate");
    const link = two.path[coil.path.length]!;
    assert.equal(buildable(two, link[0], link[1]), false, "the link is lane too");
    const s = createGame(two);
    s.gold = 1e6;
    assert.ok(build(s, "ink", COLS + 1, 1).ok);
  });

  it("are walked from the first gate to the core on the last board, with no life lost on the way", () => {
    const s = createGame(two);
    const c = put(s, "adenosine", coil.length - 0.1, 10, 1);
    step(s, 0.3, 1, text);
    assert.ok(c.dist > coil.length, "past the first map's end");
    assert.equal(s.lives, s.maxLives, "where the first lane ends costs no life");
    c.dist = two.length - coil.length / 2;
    step(s, 0.05, 1, text);
    assert.equal(sectionAt(two, c.x, c.y), 1, "on the second board");
    c.dist = two.length - 0.05;
    step(s, 0.2, 1, text);
    assert.equal(s.lives, s.maxLives - CREEPS.adenosine.leak);
  });

  it("put three or four boards in a square, each touching the one before, and lanes of a two-lane map in turn", () => {
    const three = mapFor("coil+zigzag+arrow");
    assert.equal(three.cols, 2 * COLS);
    assert.equal(three.rows, 2 * ROWS);
    assert.deepEqual(three.sections.map((b) => [b.col, b.row]), [
      [0, 0],
      [COLS, 0],
      [COLS, ROWS],
    ]);
    assert.equal(three.joins.length, 2);
    assert.equal(buildable(three, 3, ROWS + 3), true, "the empty quarter is free ground");
    const four = mapFor("coil+zigzag+arrow+fork");
    assert.equal(boardCount(four), 4);
    assert.deepEqual([four.sections[3]!.col, four.sections[3]!.row], [0, ROWS]);
    assert.equal(four.lanes.length, 2, "a board with two lanes gives the whole two");
    const own = coil.length + zigzag.length + MAPS.arrow!.length;
    assert.ok(four.lanes[0]!.length > own + MAPS.fork!.lanes[0]!.length);
    assert.ok(four.lanes[1]!.length > own + MAPS.fork!.lanes[1]!.length);
    assert.deepEqual(four.core, [MAPS.fork!.core[0], MAPS.fork!.core[1] + ROWS]);
    // Each lane comes in by its own gate of the last board, and both end at the one core.
    for (let lane = 0; lane < 2; lane++) {
      const gate = four.sections[3]!.gates[lane]!;
      assert.ok(four.lanes[lane]!.path.some(([c, r]) => c === gate[0] && r === gate[1]));
      assert.deepEqual(pointAt(four, four.lanes[lane]!.length, lane), { x: four.core[0] + 0.5, y: four.core[1] + 0.5 });
    }
  });

  it("are named by their maps' keys, in order; other keys name no map", () => {
    assert.deepEqual(stitchKeys("coil+zigzag"), ["coil", "zigzag"]);
    assert.equal(stitchKey(["coil", "zigzag"]), "coil+zigzag");
    assert.equal(findMap("coil"), MAPS.coil);
    assert.equal(findMap("coil+zigzag"), two, "made once");
    assert.notEqual(findMap("zigzag+coil"), two, "the order matters");
    assert.equal(findMap("coil+nowhere"), undefined);
    assert.equal(findMap("coil+"), undefined);
    assert.equal(findMap(""), undefined);
    assert.equal(findMap(Array(CONFIG.td.stitch.maxMaps + 1).fill("coil").join("+")), undefined, "too many boards");
    assert.equal(mapFor("coil+nowhere").key, CONFIG.td.defaultMap);
  });

  it("give creeps more life and kills more O/I for every board after the first", () => {
    const S = CONFIG.td.stitch;
    assert.deepEqual(stitchScale(coil), { hp: 1, gold: 1 });
    assert.deepEqual(stitchScale(two), { hp: 1 + S.hpPerBoard, gold: 1 + S.goldPerBoard });
    const plain = createGame(coil);
    const wide = createGame(two);
    for (const s of [plain, wide]) {
      sendWave(s);
      step(s, 0.01, 1, text);
    }
    assert.ok(Math.abs(wide.creeps[0]!.maxHp / plain.creeps[0]!.maxHp - (1 + S.hpPerBoard)) < 1e-9);
    assert.ok(wide.gold > plain.gold, "and more O/I to start");
  });

  it("are kept in a saved run, towers on the second board included", () => {
    const s = createGame(two);
    s.gold = 1e6;
    build(s, "ink", COLS + 1, 1);
    sendWave(s);
    const raw = serialize(s);
    const back = restore(raw)!;
    assert.equal(back.map, two);
    assert.ok(towerAt(back, COLS + 1, 1));
    assert.equal(summarize(raw)?.map, "coil+zigzag");
    const lost = JSON.parse(raw);
    lost.map = "coil+nowhere";
    assert.equal(restore(JSON.stringify(lost)), null);
  });
});

describe("circles of towers that do not fire", () => {
  const cap = CONFIG.td.maxSupportRange;
  const at = CONFIG.td.ascendLevel;

  it("stop growing by level at the limit", () => {
    for (const key of Object.keys(TOWERS) as TowerKey[]) {
      if (!isSupport(key)) continue;
      assert.ok(towerStats(key, 60).range <= cap + 1e-9, key);
    }
    assert.equal(towerStats("wormhole", at).range, cap, "a Wormhole's circle is at the limit by the level it ascends");
  });

  it("are widened by every path and Ascension that says so, at any level", () => {
    let checked = 0;
    for (const key of Object.keys(TOWERS) as TowerKey[]) {
      if (!isSupport(key)) continue;
      pathsOf(key).forEach((p, i) => {
        const add = p.add?.range ?? 0;
        if (add <= 0) return;
        for (const level of [5, at, 30]) {
          const plain = towerStats(key, level).range;
          assert.ok(Math.abs(towerStats(key, level, noPerks(), i).range - plain - add) < 1e-9, `${key} ${p.name} at level ${level}`);
        }
        checked++;
      });
      ascensionsOf(key).forEach((a, i) => {
        const add = a.add?.range ?? 0;
        if (add <= 0) return;
        for (const level of [at, 30]) {
          const before = towerStats(key, level, noPerks(), 0).range;
          assert.ok(Math.abs(towerStats(key, level, noPerks(), 0, i).range - before - add) < 1e-9, `${key} ${a.name} at level ${level}`);
        }
        checked++;
      });
    }
    assert.ok(checked >= 4, "the Wormhole and the Singularity each have two");
  });

  it("a Wormhole with Lensing and Spacetime fold boosts towers its plain circle never reached", () => {
    const s = rich();
    // Row 1 of the Coil is free from end to end: the Wormhole at one end, an Ink four cells along.
    build(s, "wormhole", 1, 1);
    build(s, "ink", 5, 1);
    const worm = towerAt(s, 1, 1)!;
    const ink = towerAt(s, 5, 1)!;
    while (worm.level < at) upgrade(s, 1, 1);
    assert.equal(worm.stats.range, cap);
    assert.equal(auraBonus(s, ink), 1, "four cells is outside the plain circle");
    const lensing = pathsOf("wormhole").findIndex((p) => (p.add?.range ?? 0) > 0);
    const fold = ascensionsOf("wormhole").findIndex((p) => (p.add?.range ?? 0) > 0);
    assert.ok(choosePath(s, 1, 1, lensing).ok);
    assert.ok(worm.stats.range > cap, "Lensing widens it past the limit");
    assert.equal(auraBonus(s, ink), 1, "though not yet to four cells");
    assert.ok(chooseAscension(s, 1, 1, fold).ok);
    assert.ok(worm.stats.range >= 4);
    assert.ok(auraBonus(s, ink) > 1, "the folded circle reaches it");
  });

  it("a Singularity's wider circle marks creeps its plain one misses", () => {
    const s = rich();
    build(s, "singularity", 1, 1);
    const hole = towerAt(s, 1, 1)!;
    while (hole.level < at) upgrade(s, 1, 1);
    const wider = pathsOf("singularity").findIndex((p) => (p.add?.range ?? 0) > 0);
    // On the row of lane above it, just past the plain circle's edge.
    const dx = Math.sqrt((cap + 0.15) ** 2 - 1);
    const c = put(s, "adenosine", 1 + dx);
    step(s, 0.01, 1, text);
    assert.equal(c.vuln, 0);
    assert.ok(choosePath(s, 1, 1, wider).ok);
    step(s, 0.01, 1, text);
    assert.ok(c.vuln > 0);
  });
});
