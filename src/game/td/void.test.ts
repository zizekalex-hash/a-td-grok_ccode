/**
 * The void: flux (the rep currency), void towers paid in it, void perks, the
 * Rift Titan, and maps with two lanes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { buildable, laneCount, laneLength, MAPS, pointAt, type TdMap } from "./map.ts";
import {
  batchFlux,
  buildCost,
  CREEPS,
  fluxPerRep,
  isVoid,
  noVoidPerks,
  repGold,
  repsToGrowth,
  summonCost,
  summonReward,
  TOWER_KEYS,
  TOWERS,
  upgradeCost,
  VOID_PERKS,
  VOID_TOWER_KEYS,
  voidPerkCost,
} from "./economy.ts";
import { batchMs, clampBatch, defaultRepUi, loadRepUi } from "./repui.ts";
import { restore, serialize } from "./save.ts";
import {
  addRep,
  armReps,
  build,
  buyVoidPerk,
  createGame,
  sell,
  sendWave,
  step,
  summonRift,
  towerAt,
  upgrade,
  type TdState,
} from "./sim.ts";

const V = CONFIG.td.void;
const text = () => "word";

/** A free cell next to the lane, as near the gate as the n-th one. */
function spotNear(s: TdState, dist: number): [number, number] {
  const p = pointAt(s.map, dist);
  for (const [dc, dr] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    const c = Math.floor(p.x) + dc;
    const r = Math.floor(p.y) + dr;
    if (buildable(s.map, c, r) && !towerAt(s, c, r)) return [c, r];
  }
  throw new Error("no free cell");
}

/** Reps at the pace a rep takes, from a start time (ms). */
function reps(s: TdState, n: number, from = 1_000_000): number {
  let t = from;
  for (let i = 0; i < n; i++) {
    assert.ok(addRep(s, t).ok);
    t += V.repSeconds * 1000;
  }
  return t;
}

describe("the void", () => {
  it("has one void tower for every tower, each paid in flux, each different", () => {
    assert.equal(VOID_TOWER_KEYS.length, TOWER_KEYS.length);
    assert.equal(new Set([...TOWER_KEYS, ...VOID_TOWER_KEYS]).size, 2 * TOWER_KEYS.length);
    for (const k of VOID_TOWER_KEYS) assert.ok(isVoid(k), k);
    for (const k of TOWER_KEYS) assert.ok(!isVoid(k), k);
    assert.deepEqual(Object.keys(TOWERS).sort(), [...TOWER_KEYS, ...VOID_TOWER_KEYS].sort());
  });

  it("pays flux for a rep, only once the rep's time has passed", () => {
    const s = createGame();
    assert.equal(s.flux, V.startFlux);
    assert.ok(addRep(s, 10_000).ok);
    assert.equal(s.flux, V.startFlux + V.fluxPerRep);
    const quick = addRep(s, 10_000 + V.repSeconds * 1000 - 1);
    assert.equal(quick.ok, false, "a tap too soon does not count");
    assert.equal(s.reps, 1);
    assert.ok(addRep(s, 10_000 + V.repSeconds * 1000).ok);
    assert.equal(s.reps, 2);
    // 10 reps make 100 flux: the worth of a rep.
    const t = createGame();
    reps(t, 10);
    assert.equal(t.flux, V.startFlux + 10 * V.fluxPerRep);
    assert.equal(10 * V.fluxPerRep, 100);
  });

  it("counts reps in batches: 10 at once after 10 reps' time, paying 10 reps' flux", () => {
    const s = createGame();
    armReps(s, 100_000);
    assert.equal(addRep(s, 100_000, 1).ok, false, "armed: even the first needs its time");
    const ten = 10 * V.repSeconds * 1000;
    assert.equal(addRep(s, 100_000 + ten - 1, 10).ok, false);
    const r = addRep(s, 100_000 + ten, 10);
    assert.ok(r.ok);
    assert.equal(r.count, 10);
    assert.equal(s.reps, 10);
    assert.equal(s.flux, V.startFlux + 10 * V.fluxPerRep);
    assert.equal(10 * V.fluxPerRep, 100, "10 reps in one tap: 100 flux");
    // The next batch counts from this tap.
    assert.equal(addRep(s, 100_000 + ten + ten - 1, 10).ok, false);
    armReps(s, 999_999_999);
    assert.equal(s.lastRepAt, 100_000 + ten, "arming does not reset a running clock");
    assert.deepEqual(CONFIG.td.void.batches.slice(0, 2), [1, 10]);
  });

  it("pays more as the run's reps grow: +1 flux a rep for every 10 done (100, 110, 120)", () => {
    assert.equal(V.repGrowth, 1);
    assert.equal(V.repGrowthEvery, 10);
    const s = createGame();
    armReps(s, 1);
    const ten = 10 * V.repSeconds * 1000;
    const paid: number[] = [];
    for (let i = 1; i <= 3; i++) paid.push(addRep(s, 1 + i * ten, 10).flux ?? 0);
    assert.deepEqual(paid, [100, 110, 120]);
    assert.equal(s.flux, V.startFlux + 330);
    assert.equal(fluxPerRep(s.voidPerks, 0, s.reps), 13, "the next rep pays 13");
    // A batch across a step pays each rep at its own step: 5 at 10, then 5 at 11.
    assert.equal(batchFlux(noVoidPerks(), 0, 5, 10), 105);
    assert.equal(batchFlux(noVoidPerks(), 0, 0, 30), 330);
    assert.equal(repsToGrowth(0), 10);
    assert.equal(repsToGrowth(13), 7);
  });

  it("builds, upgrades and sells void towers with flux, never O/I", () => {
    const s = createGame();
    const [c, r] = spotNear(s, 2);
    const cost = buildCost("tachyon");
    assert.equal(build(s, "tachyon", c, r).ok, false, "no flux yet");
    reps(s, Math.ceil(cost / V.fluxPerRep));
    const gold = s.gold;
    const flux = s.flux;
    assert.ok(build(s, "tachyon", c, r).ok);
    assert.equal(s.gold, gold, "O/I untouched");
    assert.equal(s.flux, flux - cost);
    const up = upgradeCost("tachyon", 1);
    reps(s, Math.ceil(up / V.fluxPerRep), 9_000_000);
    const f2 = s.flux;
    assert.ok(upgrade(s, c, r).ok);
    assert.equal(s.flux, f2 - up);
    const before = s.flux;
    assert.ok(sell(s, c, r).ok);
    assert.ok(s.flux > before, "the refund comes back as flux");
    assert.equal(s.gold, gold);
  });

  it("buys void perks with flux: more flux a rep, stronger void towers, O/I a rep", () => {
    const s = createGame();
    const base = fluxPerRep(noVoidPerks());
    assert.equal(base, V.fluxPerRep);
    reps(s, 200);
    const [c, r] = spotNear(s, 2);
    assert.ok(build(s, "railgun", c, r).ok);
    const dmg = towerAt(s, c, r)!.stats.damage;
    assert.ok(buyVoidPerk(s, "yield").ok);
    assert.ok(fluxPerRep(s.voidPerks) > base);
    assert.ok(buyVoidPerk(s, "power").ok);
    assert.ok(towerAt(s, c, r)!.stats.damage > dmg, "Dark energy strengthens void towers");
    assert.ok(buyVoidPerk(s, "tithe").ok);
    assert.equal(repGold(s.voidPerks), VOID_PERKS.tithe.amount);
    const gold = s.gold;
    reps(s, 1, 50_000_000);
    assert.equal(s.gold, gold + VOID_PERKS.tithe.amount);
    assert.equal(
      voidPerkCost("yield", 1),
      VOID_PERKS.yield.baseCost + VOID_PERKS.yield.costPerLevel,
    );
    const poor = createGame();
    assert.equal(buyVoidPerk(poor, "yield").ok, false);
  });

  it("Singularity: creeps in its circle at 10% life or less collapse, bosses do not", () => {
    const s = createGame();
    s.flux = 10_000;
    const [c, r] = spotNear(s, 3);
    assert.ok(build(s, "singularity", c, r).ok);
    const t = towerAt(s, c, r)!;
    // A creep and a boss standing in its circle, both nearly gone.
    const near = [...Array(Math.floor(s.map.length * 4)).keys()]
      .map((i) => i / 4)
      .find((d) => {
        const p = pointAt(s.map, d);
        return Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)) < t.stats.range - 0.2;
      })!;
    sendWave(s);
    s.spawners = [];
    s.creeps = [];
    for (const kind of ["adenosine", "pressure"] as const) {
      s.creeps.push({
        id: s.nextId++,
        kind,
        wave: 0,
        hp: 1,
        maxHp: 100,
        dist: near,
        x: 0,
        y: 0,
        speed: 0,
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
      });
    }
    step(s, 0.06, 1, text);
    assert.deepEqual(
      s.creeps.map((x) => x.kind),
      ["pressure"],
      "the boss stays",
    );
    assert.ok(t.kills >= 1);
  });

  it("Reactor pays flux every time a wave clears", () => {
    const s = createGame();
    s.flux = 1000;
    const [c, r] = freeCell(s);
    assert.ok(build(s, "reactor", c, r).ok);
    const flux = s.flux;
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.1, 1, text);
    assert.equal(s.flux, flux + TOWERS.reactor.fluxIncome!);
  });

  it("summons a Rift Titan for O/I; slain, it pays flux and a lasting boost, and holds up no wave", () => {
    const s = createGame();
    s.gold = 10_000;
    const cost = summonCost(s.wave);
    assert.ok(summonRift(s).ok);
    assert.equal(s.gold, 10_000 - cost);
    const rift = s.creeps.find((c) => c.kind === "rift")!;
    assert.ok(rift && rift.summoned && rift.wave === 0);
    assert.ok(CREEPS.rift.boss);
    // A wave alongside clears without waiting for it.
    sendWave(s);
    s.spawners[0]!.queue = [];
    step(s, 0.06, 1, text);
    assert.equal(s.cleared, 1);
    const flux = s.flux;
    rift.hp = 0;
    step(s, 0.01, 1, text);
    assert.equal(s.flux, flux + summonReward(s.wave));
    assert.equal(s.fluxBoost, V.summonBoost);
    assert.ok(fluxPerRep(s.voidPerks, s.fluxBoost) > V.fluxPerRep);
    const poor = createGame();
    poor.gold = 0;
    assert.equal(summonRift(poor).ok, false);
  });

  it("keeps flux, reps, void perks and the boost in a saved run", () => {
    const s = createGame();
    reps(s, 30);
    s.fluxBoost = 0.1;
    assert.ok(buyVoidPerk(s, "yield").ok);
    const back = restore(serialize(s))!;
    assert.equal(back.flux, s.flux);
    assert.equal(back.reps, 30);
    assert.equal(back.voidPerks.yield, 1);
    assert.equal(back.fluxBoost, 0.1);
  });
});

describe("two lanes", () => {
  const twins = Object.values(MAPS).filter((m) => laneCount(m) > 1);

  it("has maps with two lanes", () => {
    assert.ok(twins.length >= 2);
  });

  for (const map of twins) {
    it(`${map.name}: every lane runs connected from its own gate to the core`, () => {
      const gates = new Set<string>();
      for (const lane of map.lanes) {
        for (let i = 1; i < lane.path.length; i++) {
          const a = lane.path[i - 1]!;
          const b = lane.path[i]!;
          assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
        }
        assert.equal(lane.path.length, lane.length + 1);
        assert.deepEqual(lane.path[lane.path.length - 1], map.core);
        gates.add(lane.gate.join(","));
      }
      assert.equal(gates.size, map.lanes.length, "a gate for each");
    });

    it(`${map.name}: a wave's creeps take the lanes in turn, and leak at each lane's end`, () => {
      const s = createGame(map as TdMap);
      sendWave(s);
      step(s, 6, 1, text);
      const lanes = new Set(s.creeps.map((c) => c.lane));
      assert.equal(lanes.size, laneCount(map));
      const c = s.creeps.find((x) => x.lane === 1)!;
      c.dist = laneLength(map, 1) - 0.01;
      c.speed = 1;
      const lives = s.lives;
      step(s, 0.05, 1, text);
      assert.ok(s.lives < lives);
    });
  }
});

/** Any free cell. */
function freeCell(s: TdState): [number, number] {
  for (let c = 0; c < 9; c++) for (let r = 0; r < 9; r++) if (buildable(s.map, c, r)) return [c, r];
  throw new Error("no free cell");
}

describe("the rep controls' setup", () => {
  it("starts on batches of 10, with the tap button at the side, and checks a save", () => {
    const u = defaultRepUi();
    assert.equal(u.batch, 10);
    assert.ok(u.tap.on && u.tap.x > 0.5, "the tap button starts at the right side");
    assert.equal(u.coreTap, false);
    assert.equal(u.offTap, false);
    assert.equal(batchMs(10), 10 * V.repSeconds * 1000);
    const back = loadRepUi({
      batch: 17,
      win: { x: 2, y: -1, scale: 9, opacity: 0 },
      tap: { on: false, size: 5, opacity: 0.5, x: 0.05 },
      coreTap: true,
      offTap: "yes",
      phraseId: "a",
    });
    assert.equal(back.batch, 20, "the nearest batch there is");
    assert.deepEqual(back.win, { x: 1, y: 0, scale: 1.6, opacity: 0.15, min: false });
    assert.equal(back.tap.on, false);
    assert.equal(back.tap.size, 44);
    assert.equal(back.tap.x, 0.05);
    assert.equal(back.coreTap, true);
    assert.equal(back.offTap, false, "only true or false");
    assert.equal(back.phraseId, "a");
    assert.equal(clampBatch(1), 1);
  });
});
