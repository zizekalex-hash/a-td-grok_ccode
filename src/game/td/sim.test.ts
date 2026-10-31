import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import {
  buildable,
  COLS,
  DEFAULT_MAP,
  inGrid,
  MAP_KEYS,
  MAPS,
  mapFor,
  onPath,
  pointAt,
  ROWS,
  type TdMap,
} from "./map.ts";
import {
  bossesFor,
  buildCost,
  CREEPS,
  earlyBonus,
  MAX_TOWER_LEVEL,
  ascendCost,
  ascensionsOf,
  noPerks,
  pathCost,
  pathsOf,
  perkCost,
  poolFor,
  sellValue,
  START_GOLD,
  START_LIVES,
  TOWERS,
  towerStats,
  upgradeCost,
  waveBonus,
  wavePreview,
  waveSpec,
  type CreepKind,
} from "./economy.ts";
import { restore, serialize, summarize } from "./save.ts";
import {
  auraBonus,
  bountyBonus,
  build,
  buyPerk,
  castSpell,
  chooseAscension,
  choosePath,
  createGame,
  cycleTargeting,
  damageReport,
  hasteBonus,
  leadBoss,
  maxUpgrades,
  refundFor,
  undoable,
  upgradeMax,
  pickTarget,
  sell,
  sendWave,
  setAuto,
  step,
  towerAt,
  upgrade,
  type TdCreep,
  type TdState,
} from "./sim.ts";

const text = () => "word";

function runUntilClear(s: TdState, dt = 0.05, limit = 40000) {
  for (let i = 0; i < limit && s.phase === "wave"; i++) step(s, dt, 1, text);
}

/** A creep placed straight on the lane, outside any wave, for testing one rule at a time. */
function put(s: TdState, kind: CreepKind, dist: number, hp?: number): TdCreep {
  const p = pointAt(s.map, dist);
  const spec = CREEPS[kind];
  const c: TdCreep = {
    id: s.nextId++,
    kind,
    wave: 999,
    hp: hp ?? spec.hp,
    maxHp: hp ?? spec.hp,
    dist,
    x: p.x,
    y: p.y,
    speed: 0,
    armor: spec.armor ?? 0,
    gold: spec.gold,
    regen: spec.regen ?? 0,
    heal: spec.heal ?? 0,
    slow: 0,
    slowTime: 0,
    burn: 0,
    burnTime: 0,
    summonTimer: spec.summonEvery ?? 0,
    hit: 0,
    leaked: false,
    lastHit: 0,
    burnBy: 0,
    vuln: 0,
    shred: 0,
  };
  s.creeps.push(c);
  return c;
}

/** n free cells in a row, left to right. */
function freeRow(s: TdState, n: number): [number, number][] {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c + n <= COLS; c++) {
      const cells = Array.from({ length: n }, (_, i) => [c + i, r] as [number, number]);
      if (cells.every(([x, y]) => buildable(s.map, x, y))) return cells;
    }
  }
  throw new Error(`no ${n} free cells in a row`);
}

/** Free cells next to the lane, nearest the gate first. */
function nearLane(s: TdState, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0.5; d < s.map.length && out.length < n; d += 0.5) {
    const p = pointAt(s.map, d);
    for (const [dc, dr] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const c = Math.floor(p.x) + dc;
      const r = Math.floor(p.y) + dr;
      if (buildable(s.map, c, r) && !out.some(([x, y]) => x === c && y === r)) out.push([c, r]);
      if (out.length >= n) break;
    }
  }
  return out;
}

describe("maps", () => {
  const all: TdMap[] = MAP_KEYS.map((key) => MAPS[key] as TdMap);

  it("offers a choice, with the configured default first in line", () => {
    assert.ok(all.length >= 2);
    assert.equal(DEFAULT_MAP.key, CONFIG.td.defaultMap);
    assert.equal(mapFor("no such map"), DEFAULT_MAP);
    assert.equal(createGame().map, DEFAULT_MAP);
  });

  for (const map of all) {
    describe(map.name, () => {
      it("runs straight between waypoints that stay on the grid", () => {
        assert.ok(map.waypoints.length >= 2);
        map.waypoints.forEach(([c, r], i) => {
          assert.ok(inGrid(c, r), `waypoint ${i} is off the grid`);
          const prev = map.waypoints[i - 1];
          if (prev) assert.ok(prev[0] === c || prev[1] === r, `waypoint ${i} is not in line`);
        });
      });

      it("is a connected lane: every step goes to a neighbouring cell", () => {
        for (let i = 1; i < map.path.length; i++) {
          const a = map.path[i - 1] as readonly [number, number];
          const b = map.path[i] as readonly [number, number];
          assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1, `gap at ${i}`);
        }
        assert.equal(map.path.length, map.length + 1);
      });

      it("runs from the gate to the core", () => {
        assert.deepEqual(map.path[0], map.gate);
        assert.deepEqual(map.path[map.path.length - 1], map.core);
      });

      it("never allows a tower on the lane or on the core, and leaves room to build", () => {
        let free = 0;
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            if (onPath(map, c, r) || (c === map.core[0] && r === map.core[1])) {
              assert.equal(buildable(map, c, r), false);
            } else if (buildable(map, c, r)) free++;
          }
        }
        assert.ok(free >= 20, `${free} free cells`);
        assert.equal(buildable(map, -1, 0), false);
      });

      it("walks the lane from the gate to the core", () => {
        assert.deepEqual(pointAt(map, 0), { x: map.gate[0] + 0.5, y: map.gate[1] + 0.5 });
        assert.deepEqual(pointAt(map, map.length), { x: map.core[0] + 0.5, y: map.core[1] + 0.5 });
      });

      it("starts a game on itself, with its own starting O/I", () => {
        const s = createGame(map);
        assert.equal(s.map, map);
        assert.equal(s.gold, map.startGold);
      });

      it("costs a life when a creep reaches its core", () => {
        const s = createGame(map);
        const c = put(s, "adenosine", map.length - 0.01);
        c.speed = 1;
        step(s, 0.1, 1, text);
        assert.equal(s.lives, START_LIVES - CREEPS.adenosine.leak);
      });
    });
  }

  it("lets the Crossing lane cross itself, so one tower can hit a creep twice", () => {
    const map = MAPS.crossing;
    assert.ok(map);
    assert.ok(new Set(map.path.map(([c, r]) => `${c},${r}`)).size < map.path.length);
  });
});

describe("phrases on shots", () => {
  function shotTexts(every: number): string[] {
    const s = createGame();
    s.gold = 10_000;
    assert.ok(build(s, "ink", 1, 1).ok);
    let n = 0;
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      // A fresh target each time, so each shot is a new one.
      s.creeps = [];
      s.shots = [];
      put(s, "adenosine", 1, 1e9);
      const tower = s.towers[0]!;
      tower.cooldown = 0;
      step(s, 0.01, 1, () => `phrase ${++n}`, every);
      seen.push(s.shots[0]?.text ?? "none");
    }
    return seen;
  }

  it("puts a phrase on every shot by default", () => {
    assert.ok(shotTexts(1).every((t) => t.startsWith("phrase")));
  });

  it("puts one on the first shot and every third after it, and reads the text in order", () => {
    assert.deepEqual(shotTexts(3), [
      "phrase 1",
      "",
      "",
      "phrase 2",
      "",
      "",
      "phrase 3",
      "",
      "",
    ]);
  });
});

describe("waves", () => {
  it("never run out, and every one is well formed", () => {
    for (const n of [1, 7, 30, 99, 250, 1000]) {
      const spec = waveSpec(n);
      assert.ok(spec.kinds.length > 0, `wave ${n} is empty`);
      for (const v of [
        spec.interval,
        spec.hpScale,
        spec.speedScale,
        spec.goldScale,
        spec.bossScale,
      ]) {
        assert.ok(Number.isFinite(v) && v > 0, `wave ${n} has a bad number`);
      }
    }
  });

  it("get harder faster than linearly", () => {
    const a = waveSpec(1).hpScale;
    const b = waveSpec(21).hpScale;
    const c = waveSpec(41).hpScale;
    assert.ok(c - b > b - a, "hit points accelerate");
    assert.ok(waveSpec(40).kinds.length >= waveSpec(10).kinds.length);
    assert.ok(waveSpec(60).speedScale > waveSpec(1).speedScale);
    assert.ok(waveSpec(40).armorBonus > 0 && waveSpec(10).armorBonus === 0);
  });

  it("are the same every time they are called", () => {
    assert.deepEqual(waveSpec(17), waveSpec(17));
  });

  it("start with adenosine alone and bring in new kinds as they unlock", () => {
    assert.ok(waveSpec(1).kinds.every((k) => k === "adenosine"));
    const kinds = poolFor(30).map((p) => p.kind);
    for (const k of ["gaba", "vlpo", "melatonin", "galanin", "theta", "rem", "glycine"])
      assert.ok(kinds.includes(k as CreepKind));
    assert.ok(!poolFor(3).some((p) => p.kind === "galanin"));
    assert.ok(!kinds.includes("spindle"), "spindles only come from splits");
  });

  it("bring a rotating boss every fifth wave, and an extra one every 25th", () => {
    assert.deepEqual(bossesFor(4), []);
    assert.deepEqual(bossesFor(5), ["pressure"]);
    assert.deepEqual(bossesFor(10), ["circadian"]);
    assert.deepEqual(bossesFor(15), ["somnus"]);
    assert.equal(bossesFor(25).length, 2);
    assert.equal(bossesFor(50).length, 3);
    assert.ok(waveSpec(50).bossScale > waveSpec(5).bossScale);
    assert.equal(waveSpec(5).kinds.at(-1), "pressure");
  });
});

describe("towers and prices", () => {
  it("grow with each level and with the perks", () => {
    const one = towerStats("ink", 1);
    const five = towerStats("ink", MAX_TOWER_LEVEL);
    assert.ok(five.damage > one.damage && five.rate > one.rate && five.range > one.range);
    assert.equal(towerStats("echo", 1).chain, 2);
    assert.equal(towerStats("echo", 3).chain, 3);
    assert.equal(towerStats("echo", 5).chain, 4);
    const perks = { ...noPerks(), damage: 2, range: 1 };
    assert.ok(towerStats("ink", 1, perks).damage > one.damage);
    assert.ok(towerStats("ink", 1, perks).range > one.range);
    assert.equal(
      towerStats("muse", 1, perks).range,
      TOWERS.muse.range,
      "range perks do not stretch auras",
    );
  });

  it("cost more to upgrade each level, less with thrift, and refund part on sale", () => {
    assert.ok(upgradeCost("verse", 2) > upgradeCost("verse", 1));
    assert.ok(buildCost("verse", { ...noPerks(), thrift: 2 }) < buildCost("verse"));
    assert.equal(sellValue(100), Math.round(100 * CONFIG.td.sellRefund));
    assert.ok(perkCost("damage", 3) > perkCost("damage", 0));
    assert.ok(waveBonus(10) > waveBonus(1) && earlyBonus(10) > earlyBonus(1));
  });
});

describe("building", () => {
  it("takes the cost and places a tower on a free cell", () => {
    const s = createGame();
    assert.equal(build(s, "ink", 1, 4).ok, true);
    assert.equal(s.gold, START_GOLD - TOWERS.ink.cost);
    assert.ok(towerAt(s, 1, 4));
  });

  it("refuses the lane, an occupied cell, and a purse that is too small", () => {
    const s = createGame();
    assert.equal(build(s, "ink", 0, 0).ok, false);
    build(s, "ink", 1, 4);
    assert.equal(build(s, "ink", 1, 4).ok, false);
    s.gold = 0;
    assert.equal(build(s, "ink", 1, 5).ok, false);
  });

  it("upgrades past the top level as mastery, at a growing price, and refunds part on sale", () => {
    const s = createGame();
    s.gold = 1_000_000;
    build(s, "verse", 1, 4);
    for (let i = 1; i < MAX_TOWER_LEVEL + 3; i++) assert.equal(upgrade(s, 1, 4).ok, true);
    assert.equal(towerAt(s, 1, 4)?.level, MAX_TOWER_LEVEL + 3);
    const a = upgradeCost("verse", MAX_TOWER_LEVEL + 1);
    const b = upgradeCost("verse", MAX_TOWER_LEVEL + 2);
    assert.ok(
      Math.abs(b / a - CONFIG.td.masteryCostGrowth) < 0.02,
      "each mastery level costs more by a fixed factor",
    );
    assert.ok(
      towerStats("verse", MAX_TOWER_LEVEL + 3).damage > towerStats("verse", MAX_TOWER_LEVEL).damage,
    );
    const invested = towerAt(s, 1, 4)?.invested ?? 0;
    // Once a wave has been called, a sale refunds only part.
    sendWave(s);
    const gold = s.gold;
    assert.equal(sell(s, 1, 4).ok, true);
    assert.equal(s.gold, gold + sellValue(invested));
  });

  it("cycles through the targeting rules", () => {
    const s = createGame();
    build(s, "ink", 1, 4);
    const seen = [towerAt(s, 1, 4)?.targeting];
    for (let i = 0; i < 4; i++) {
      cycleTargeting(s, 1, 4);
      seen.push(towerAt(s, 1, 4)?.targeting);
    }
    assert.deepEqual(seen, ["first", "last", "strong", "close", "first"]);
  });
});

describe("calling waves", () => {
  it("clears a wave, pays its bonus and goes back to building", () => {
    const s = createGame();
    build(s, "verse", 1, 1);
    assert.equal(sendWave(s).ok, true);
    const before = s.gold;
    runUntilClear(s);
    assert.equal(s.phase, "build");
    assert.equal(s.cleared, 1);
    assert.ok(s.kills > 0);
    assert.ok(s.gold >= before + waveBonus(1));
    assert.ok(s.events.some((e) => e.type === "waveCleared" && e.wave === 1));
  });

  it("stacks waves called while one is running and pays for calling early", () => {
    const s = createGame();
    sendWave(s);
    step(s, 0.5, 1, text);
    const gold = s.gold;
    assert.equal(sendWave(s).ok, true);
    assert.equal(s.spawners.length, 2);
    assert.equal(s.gold, gold + earlyBonus(2));
    assert.equal(sendWave(s).ok, true);
    assert.equal(s.wave, 3);
  });

  it("pays no early bonus between waves", () => {
    const s = createGame();
    const gold = s.gold;
    sendWave(s);
    assert.equal(s.gold, gold);
  });

  it("caps how many waves can run at once", () => {
    const s = createGame();
    for (let i = 0; i < CONFIG.td.maxActiveWaves; i++) assert.equal(sendWave(s).ok, true);
    assert.equal(sendWave(s).ok, false);
  });

  it("goes on past the old last wave", () => {
    const s = createGame();
    s.wave = 15;
    assert.equal(sendWave(s).ok, true);
    assert.equal(s.wave, 16);
    s.spawners[0]!.queue = [];
    step(s, 0.05, 1, text);
    assert.equal(s.phase, "build");
    assert.equal(s.cleared, 16);
  });

  it("calls the next wave by itself on auto", () => {
    const s = createGame();
    setAuto(s, true);
    for (let i = 0; i < 200; i++) step(s, 0.05, 1, text);
    assert.ok(s.wave >= 1);
    assert.ok(s.events.some((e) => e.type === "waveSent" && e.auto));
  });

  it("costs lives for creeps that reach the core, and ends at zero", () => {
    const s = createGame();
    sendWave(s);
    runUntilClear(s);
    const leaked = waveSpec(1).kinds.reduce((sum, k) => sum + CREEPS[k].leak, 0);
    assert.equal(s.lives, START_LIVES - leaked);
    const t = createGame();
    t.lives = 1;
    sendWave(t);
    runUntilClear(t);
    assert.equal(t.phase, "over");
    assert.equal(build(t, "ink", 1, 4).ok, false);
    assert.equal(sendWave(t).ok, false);
  });
});

describe("tower effects", () => {
  it("splash hits every creep near the impact", () => {
    const s = createGame();
    const a = put(s, "adenosine", 10, 50);
    const b = put(s, "adenosine", 10, 50);
    s.shots.push({
      id: 900,
      key: "sigil",
      from: 0,
      target: a.id,
      fromX: a.x,
      fromY: a.y,
      x: a.x,
      y: a.y,
      tx: a.x,
      ty: a.y,
      travel: 0.001,
      total: 0.25,
      damage: 20,
      splash: 0.9,
      slow: 0,
      slowTime: 0,
      burn: 0,
      burnTime: 0,
      pierce: 0,
      text: "x",
    });
    step(s, 0.01, 1, text);
    assert.equal(a.hp, 30);
    assert.equal(b.hp, 30);
  });

  it("armor shrugs off damage, and pierce cuts through it", () => {
    const s = createGame();
    const plain = put(s, "galanin", 10, 100);
    const pierced = put(s, "galanin", 10, 100);
    const shot = (target: number, pierce: number, id: number) => ({
      id,
      key: "ink" as const,
      from: 0,
      target,
      fromX: 0,
      fromY: 0,
      x: 0,
      y: 0,
      tx: plain.x,
      ty: plain.y,
      travel: 0.001,
      total: 0.25,
      damage: 10,
      splash: 0,
      slow: 0,
      slowTime: 0,
      burn: 0,
      burnTime: 0,
      pierce,
      text: "x",
    });
    s.shots.push(shot(plain.id, 0, 901), shot(pierced.id, 1, 902));
    step(s, 0.01, 1, text);
    assert.equal(plain.hp, 100 - 10 * (1 - (CREEPS.galanin.armor ?? 0)));
    assert.equal(pierced.hp, 90);
  });

  it("Comma slows a creep, and a boss feels only half of it", () => {
    const s = createGame();
    build(s, "comma", 1, 1);
    const creep = put(s, "adenosine", 1, 1000);
    const boss = put(s, "pressure", 1.2, 100000);
    step(s, 0.6, 1, text);
    assert.ok(creep.slowTime > 0 || boss.slowTime > 0, "something got slowed");
    const t = createGame();
    build(t, "comma", 1, 1);
    const b = put(t, "pressure", 1.5, 100000);
    const tower = towerAt(t, 1, 1)!;
    tower.targeting = "strong";
    step(t, 0.6, 1, text);
    assert.ok(Math.abs(b.slow - tower.stats.slow * (1 - CONFIG.td.bossSlowResist)) < 1e-9);
  });

  it("Cipher burns through armor over time", () => {
    const s = createGame();
    const c = put(s, "galanin", 10, 1000);
    c.burn = 10;
    c.burnTime = 2;
    step(s, 1, 1, text);
    assert.ok(Math.abs(c.hp - 990) < 1e-6);
  });

  it("Echo jumps to nearby creeps, losing some damage each jump", () => {
    const s = createGame();
    build(s, "echo", 1, 1);
    const a = put(s, "adenosine", 1.0, 1000);
    const b = put(s, "adenosine", 1.4, 1000);
    const c = put(s, "adenosine", 1.8, 1000);
    step(s, 0.01, 1, text);
    const hits = [a, b, c].map((x) => 1000 - x.hp).sort((p, q) => q - p);
    const dmg = towerStats("echo", 1).damage;
    assert.ok(Math.abs(hits[0]! - dmg) < 1e-6);
    assert.ok(Math.abs(hits[1]! - dmg * 0.8) < 1e-6);
    assert.ok(Math.abs(hits[2]! - dmg * 0.64) < 1e-6);
    assert.ok(s.beams.length > 0);
  });

  it("Focus hits harder the longer it holds a target", () => {
    const s = createGame();
    build(s, "focus", 1, 1);
    const c = put(s, "adenosine", 1.5, 100000);
    const first = 100000;
    step(s, 0.01, 1, text);
    const hit1 = first - c.hp;
    for (let i = 0; i < 20; i++) step(s, 0.2, 1, text);
    const before = c.hp;
    step(s, 0.2, 1, text);
    assert.ok(before - c.hp > hit1 * 2, "later hits are much stronger");
  });

  it("Muse raises the damage of towers next to it", () => {
    const s = createGame();
    build(s, "ink", 1, 4);
    const ink = towerAt(s, 1, 4)!;
    assert.equal(auraBonus(s, ink), 1);
    s.gold = 1000;
    build(s, "muse", 1, 5);
    assert.ok(Math.abs(auraBonus(s, ink) - 1 - (TOWERS.muse.aura ?? 0)) < 1e-9);
  });

  it("Muse boosts exactly the towers inside the circle it draws, which grows with level", () => {
    const s = createGame();
    s.gold = 1e7;
    // A row of free cells: the Muse, then towers one, two and three cells away.
    const row = freeRow(s, 4);
    const [mc, mr] = row[0]!;
    build(s, "muse", mc, mr);
    for (const [c, r] of row.slice(1)) build(s, "ink", c, r);
    const muse = towerAt(s, mc, mr)!;
    const at = (d: number) => towerAt(s, mc + d, mr)!;
    const check = () => {
      for (const d of [1, 2, 3]) {
        const inside = d <= muse.stats.range;
        assert.equal(auraBonus(s, at(d)) > 1, inside, `level ${muse.level}, ${d} away, circle ${muse.stats.range}`);
      }
    };
    check();
    assert.equal(auraBonus(s, at(2)), 1, "two away is outside at first");
    while (muse.stats.range < 2) upgrade(s, mc, mr);
    check();
    assert.ok(auraBonus(s, at(2)) > 1, "the grown circle reaches two away");
    for (let i = 0; i < 40; i++) upgrade(s, mc, mr);
    assert.ok(muse.stats.range <= CONFIG.td.maxSupportRange, "the circle stops growing");
    check();
  });

  it("Muse also boosts the burn a shot leaves", () => {
    const s = createGame();
    s.gold = 1e6;
    // The Cipher beside the lane near the gate, the Muse on any free cell touching it.
    const [a] = nearLane(s, 1);
    build(s, "cipher", a![0], a![1]);
    const cipher = towerAt(s, a![0], a![1])!;
    const spot = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(([dc, dr]) => buildable(s.map, a![0] + dc!, a![1] + dr!))!;
    build(s, "muse", a![0] + spot[0]!, a![1] + spot[1]!);
    const aura = auraBonus(s, cipher);
    assert.ok(aura > 1);
    // A target in reach that does not move; fire once and let the shot land.
    const target = put(s, "adenosine", 0.5, 1e9);
    assert.ok(Math.hypot(target.x - cipher.col - 0.5, target.y - cipher.row - 0.5) <= cipher.stats.range);
    step(s, 0.3, 1, text);
    assert.ok(target.burn > 0, "the shot landed");
    assert.ok(Math.abs(target.burn - cipher.stats.burn * aura) < 1e-9, `burn ${target.burn}`);
  });

  it("Archive pays when a wave clears", () => {
    const s = createGame();
    s.gold = 1000;
    build(s, "archive", 1, 4);
    sendWave(s);
    s.spawners[0]!.queue = [];
    const gold = s.gold;
    step(s, 0.05, 1, text);
    assert.equal(s.gold, gold + waveBonus(1) + (TOWERS.archive.income ?? 0));
  });

  it("each rule picks the right target", () => {
    const s = createGame();
    build(s, "ink", 1, 1);
    const tower = towerAt(s, 1, 1)!;
    const lead = put(s, "adenosine", 2.5, 10);
    const back = put(s, "adenosine", 0.5, 10);
    const tough = put(s, "adenosine", 1.3, 500);
    tower.targeting = "first";
    assert.equal(pickTarget(s, tower), lead);
    tower.targeting = "last";
    assert.equal(pickTarget(s, tower), back);
    tower.targeting = "strong";
    assert.equal(pickTarget(s, tower), tough);
    tower.targeting = "close";
    assert.equal(pickTarget(s, tower), tough);
  });
});

describe("creep traits", () => {
  it("Theta splits into spindles when it dies", () => {
    const s = createGame();
    const c = put(s, "theta", 10, 1);
    c.hp = 0;
    step(s, 0.01, 1, text);
    assert.equal(s.creeps.filter((x) => x.kind === "spindle").length, CREEPS.theta.splitCount);
  });

  it("Glycine heals the creeps around it, REM heals itself", () => {
    const s = createGame();
    put(s, "glycine", 10, 100);
    const hurtOne = put(s, "adenosine", 10.3, 100);
    hurtOne.hp = 50;
    const rem = put(s, "rem", 30, 100);
    rem.hp = 50;
    step(s, 1, 1, text);
    assert.ok(hurtOne.hp > 50);
    assert.ok(rem.hp > 50);
  });

  it("Circadian Tide calls up melatonin as it walks", () => {
    const s = createGame();
    const boss = put(s, "circadian", 5, 100000);
    boss.speed = 0.1;
    step(s, (CREEPS.circadian.summonEvery ?? 1) + 0.1, 1, text);
    assert.ok(s.creeps.some((c) => c.kind === "melatonin"));
  });
});

describe("perks", () => {
  it("cost O/I, stop at their limit and take effect at once", () => {
    const s = createGame();
    s.gold = 100000;
    build(s, "ink", 1, 4);
    const dmg = towerAt(s, 1, 4)!.stats.damage;
    assert.equal(buyPerk(s, "damage").ok, true);
    assert.ok(towerAt(s, 1, 4)!.stats.damage > dmg);
    const lives = s.lives;
    buyPerk(s, "lives");
    assert.equal(s.lives, lives + CONFIG.td.perks.lives.amount);
    assert.equal(s.maxLives, START_LIVES + CONFIG.td.perks.lives.amount);
    for (let i = 0; i < 20; i++) buyPerk(s, "range");
    assert.equal(s.perks.range, CONFIG.td.perks.range.max);
    assert.equal(buyPerk(s, "range").ok, false);
  });

  it("interest pays a share of unspent O/I when a wave clears", () => {
    const s = createGame();
    s.gold = 1000;
    buyPerk(s, "interest");
    sendWave(s);
    s.spawners[0]!.queue = [];
    const gold = s.gold;
    step(s, 0.05, 1, text);
    const expected = Math.min(
      CONFIG.td.perks.interest.cap ?? Infinity,
      Math.floor(gold * CONFIG.td.perks.interest.amount),
    );
    assert.equal(s.gold, gold + waveBonus(1) + expected);
  });
});

describe("tower paths", () => {
  it("open at the top level, cost O/I once, and change the tower", () => {
    const s = createGame();
    s.gold = 100_000;
    assert.ok(build(s, "ink", 1, 1).ok);
    const t = towerAt(s, 1, 1)!;
    assert.equal(choosePath(s, 1, 1, 0).ok, false, "not before the top level");
    while (t.level < MAX_TOWER_LEVEL) upgrade(s, 1, 1);
    const before = { ...t.stats };
    const gold = s.gold;
    assert.ok(choosePath(s, 1, 1, 0).ok);
    assert.equal(s.gold, gold - pathCost("ink"));
    assert.ok(t.stats.rate > before.rate, "Torrent fires faster");
    assert.equal(choosePath(s, 1, 1, 1).ok, false, "only one path");
    assert.ok(upgrade(s, 1, 1).ok, "mastery goes on after a path");
    assert.ok(t.stats.rate > before.rate, "and keeps the path");
  });

  it("gives every tower two paths that each change something", () => {
    for (const key of Object.keys(TOWERS) as (keyof typeof TOWERS)[]) {
      const paths = pathsOf(key);
      assert.equal(paths.length, 2, key);
      const base = towerStats(key, MAX_TOWER_LEVEL);
      paths.forEach((_, i) => {
        const st = towerStats(key, MAX_TOWER_LEVEL, noPerks(), i);
        assert.notDeepEqual(st, base, `${key} path ${i}`);
      });
    }
  });

  it("Tempo Muse speeds up its neighbours, Scriptorium raises kill pay", () => {
    const s = createGame();
    s.gold = 100_000;
    build(s, "ink", 1, 1);
    build(s, "muse", 2, 1);
    build(s, "archive", 5, 5);
    const ink = towerAt(s, 1, 1)!;
    assert.equal(hasteBonus(s, ink), 1);
    for (const [c, r] of [
      [2, 1],
      [5, 5],
    ]) {
      while (towerAt(s, c!, r!)!.level < MAX_TOWER_LEVEL) upgrade(s, c!, r!);
      assert.ok(choosePath(s, c!, r!, 1).ok);
    }
    assert.ok(hasteBonus(s, ink) > 1);
    assert.ok(bountyBonus(s) > 0 && bountyBonus(s) <= CONFIG.td.maxBounty);
    // A creep already finished: the step pays for it.
    const c = put(s, "adenosine", 2, 1);
    c.hp = 0;
    const gold = s.gold;
    step(s, 0.01, 1, text);
    assert.equal(s.gold - gold, Math.round(c.gold * (1 + bountyBonus(s))));
  });
});

describe("spells", () => {
  it("Ink Storm strikes every creep, bosses less, then waits out its cooldown", () => {
    const s = createGame();
    assert.equal(castSpell(s, "storm").ok, false, "nothing to hit");
    const a = put(s, "galanin", 3, 1000);
    const b = put(s, "pressure", 4, 1000);
    const r = castSpell(s, "storm", () => "storm words.");
    assert.ok(r.ok);
    const dmg = CONFIG.td.spells.storm.damage;
    assert.equal(a.hp, 1000 - dmg, "through armor");
    assert.equal(b.hp, 1000 - dmg * CONFIG.td.spells.storm.bossShare);
    assert.equal(castSpell(s, "storm").ok, false, "cooling down");
    const ev = s.events.find((e) => e.type === "spell");
    assert.ok(ev && ev.type === "spell" && ev.text === "storm words." && ev.hit === 2);
    step(s, CONFIG.td.spells.storm.cooldown + 0.1, 1, text);
    assert.equal(s.spells.storm, 0);
  });

  it("Stillness slows every creep for a while", () => {
    const s = createGame();
    const a = put(s, "adenosine", 3, 1000);
    assert.ok(castSpell(s, "still").ok);
    assert.equal(a.slow, CONFIG.td.spells.still.slow);
    assert.equal(a.slowTime, CONFIG.td.spells.still.time);
  });
});

describe("difficulty", () => {
  it("changes creep life, starting O/I and lives", () => {
    const easy = createGame(DEFAULT_MAP, "easy");
    const hard = createGame(DEFAULT_MAP, "hard");
    const normal = createGame(DEFAULT_MAP, "normal");
    assert.ok(easy.gold > normal.gold && normal.gold > hard.gold);
    assert.ok(easy.lives > normal.lives && normal.lives > hard.lives);
    for (const s of [easy, normal, hard]) sendWave(s);
    for (const s of [easy, normal, hard]) step(s, 1.2, 1, text);
    const hp = (s: TdState) => s.creeps[0]!.maxHp;
    assert.ok(hp(easy) < hp(normal) && hp(normal) < hp(hard));
  });
});

describe("tower records and the wave preview", () => {
  it("credits damage and kills to the tower that dealt them, burns included", () => {
    const s = createGame();
    s.gold = 10_000;
    // Two free cells beside the lane, near the gate.
    const [a, b] = nearLane(s, 2);
    assert.ok(build(s, "ink", a![0], a![1]).ok && build(s, "cipher", b![0], b![1]).ok);
    sendWave(s);
    runUntilClear(s);
    const ink = towerAt(s, a![0], a![1])!;
    const cipher = towerAt(s, b![0], b![1])!;
    assert.ok(ink.dealt > 0 && cipher.dealt > 0);
    assert.equal(ink.kills + cipher.kills, s.kills, "every kill has a tower");
  });

  it("shows what the next wave brings, bosses included", () => {
    const five = wavePreview(5);
    const total = five.reduce((n, r) => n + r.count, 0);
    assert.equal(total, waveSpec(5).kinds.length);
    assert.ok(five.some((r) => r.boss));
    assert.ok(!wavePreview(4).some((r) => r.boss));
  });
});

describe("saving a run", () => {
  it("picks up exactly where it left off, mid-wave included", () => {
    const s = createGame(MAPS.spiral as TdMap, "hard");
    s.gold = 10_000;
    build(s, "ink", 1, 1);
    build(s, "verse", 2, 1);
    upgrade(s, 1, 1);
    cycleTargeting(s, 2, 1);
    buyPerk(s, "damage");
    sendWave(s);
    sendWave(s);
    step(s, 3, 1, text);
    castSpell(s, "still");
    const back = restore(serialize(s));
    assert.ok(back);
    assert.equal(back.map.key, "spiral");
    assert.equal(back.difficulty, "hard");
    for (const k of ["gold", "lives", "wave", "cleared", "kills", "nextId"] as const) assert.equal(back[k], s[k], k);
    assert.deepEqual(back.perks, s.perks);
    assert.deepEqual(
      back.towers.map((t) => [t.key, t.col, t.row, t.level, t.targeting, t.stats]),
      s.towers.map((t) => [t.key, t.col, t.row, t.level, t.targeting, t.stats]),
    );
    assert.equal(back.creeps.length, s.creeps.length);
    assert.deepEqual(back.spawners.map((sp) => sp.queue), s.spawners.map((sp) => sp.queue));
    assert.ok(Math.abs(back.spells.still - s.spells.still) < 1e-9);
    // Both carry on the same way.
    step(s, 5, 1, text);
    step(back, 5, 1, text);
    assert.equal(back.kills, s.kills);
    assert.equal(back.lives, s.lives);
  });

  it("ignores saves that are broken, finished or from another version", () => {
    assert.equal(restore(null), null);
    assert.equal(restore("{not json"), null);
    const s = createGame();
    const good = JSON.parse(serialize(s));
    assert.ok(restore(JSON.stringify(good)));
    assert.equal(restore(JSON.stringify({ ...good, v: 99 })), null);
    assert.equal(restore(JSON.stringify({ ...good, map: "nowhere" })), null);
    assert.equal(restore(JSON.stringify({ ...good, state: { ...good.state, lives: 0 } })), null);
    // A tower on the lane or of an unknown kind is dropped, not trusted.
    const lane = [...s.map.lane][0]!.split(",").map(Number);
    const bad = {
      ...good,
      state: {
        ...good.state,
        towers: [
          { id: 1, key: "ink", col: lane[0], row: lane[1], level: 1 },
          { id: 2, key: "laser", col: 1, row: 1, level: 1 },
        ],
      },
    };
    assert.equal(restore(JSON.stringify(bad))?.towers.length, 0);
  });

  it("summarizes a save for the title screen", () => {
    const s = createGame();
    sendWave(s);
    const sum = summarize(serialize(s, 1234));
    assert.deepEqual(sum, { map: s.map.key, difficulty: "normal", wave: 1, cleared: 0, lives: s.lives, savedAt: 1234 });
  });
});

describe("round three", () => {
  it("Eraser makes creeps in its circle take more damage; Strike-through strips armor", () => {
    const s = createGame();
    s.gold = 1e6;
    const [a] = nearLane(s, 1);
    build(s, "eraser", a![0], a![1]);
    const eraser = towerAt(s, a![0], a![1])!;
    const inside = put(s, "galanin", 0.5, 1000);
    const outside = put(s, "galanin", s.map.length - 0.5, 1000);
    assert.ok(Math.hypot(inside.x - eraser.col - 0.5, inside.y - eraser.row - 0.5) <= eraser.stats.range);
    step(s, 0.01, 1, text);
    assert.equal(inside.vuln, eraser.stats.vuln);
    assert.equal(outside.vuln, 0);
    castSpell(s, "storm");
    const dealtIn = 1000 - inside.hp;
    const dealtOut = 1000 - outside.hp;
    assert.ok(Math.abs(dealtIn - dealtOut * (1 + eraser.stats.vuln)) < 1e-6, "the storm hits marked creeps harder");
    while (eraser.level < MAX_TOWER_LEVEL) upgrade(s, eraser.col, eraser.row);
    assert.ok(choosePath(s, eraser.col, eraser.row, 1).ok);
    step(s, 0.01, 1, text);
    assert.equal(inside.shred, 0.5);
  });

  it("an unused tower sells back in full until the next wave is called", () => {
    const s = createGame();
    const gold = s.gold;
    const [a] = nearLane(s, 1);
    build(s, "ink", a![0], a![1]);
    assert.ok(undoable(s, towerAt(s, a![0], a![1])!));
    sell(s, a![0], a![1]);
    assert.equal(s.gold, gold, "a mistaken build costs nothing");
    build(s, "ink", a![0], a![1]);
    sendWave(s);
    const t = towerAt(s, a![0], a![1])!;
    assert.equal(undoable(s, t), false);
    assert.equal(refundFor(s, t), sellValue(t.invested));
  });

  it("Max buys every level the O/I allows", () => {
    const s = createGame();
    s.gold = 5000;
    const [a] = nearLane(s, 1);
    build(s, "verse", a![0], a![1]);
    const t = towerAt(s, a![0], a![1])!;
    const plan = maxUpgrades(s, t);
    assert.ok(plan.levels > 1);
    const gold = s.gold;
    const r = upgradeMax(s, a![0], a![1]);
    assert.ok(r.ok && r.levels === plan.levels);
    assert.equal(gold - s.gold, plan.cost);
    assert.ok(s.gold < upgradeCost("verse", t.level), "nothing more affordable");
    assert.equal(upgradeMax(s, a![0], a![1]).ok, false);
  });

  it("reports damage by tower kind, sold towers included, and survives a save", () => {
    const s = createGame();
    s.gold = 10_000;
    const [a, b] = nearLane(s, 2);
    build(s, "ink", a![0], a![1]);
    build(s, "verse", b![0], b![1]);
    sendWave(s);
    runUntilClear(s);
    const before = damageReport(s);
    assert.ok(before.length >= 1);
    const inkDealt = towerAt(s, a![0], a![1])!.dealt;
    sell(s, a![0], a![1]);
    const after = damageReport(s);
    assert.equal(after.find((r) => r.key === "ink")?.dealt, inkDealt, "sold towers still count");
    assert.deepEqual(damageReport(restore(serialize(s))!), after);
    for (let i = 1; i < after.length; i++) assert.ok(after[i - 1]!.dealt >= after[i]!.dealt);
  });

  it("finds the boss furthest along the lane", () => {
    const s = createGame();
    assert.equal(leadBoss(s), undefined);
    put(s, "pressure", 2, 100);
    const far = put(s, "somnus", 5, 100);
    put(s, "adenosine", 9, 100);
    assert.equal(leadBoss(s), far);
  });
});

describe("Ascensions", () => {
  it("open at the Ascension level after a path, once, and stack on the path", () => {
    const s = createGame();
    s.gold = 1e7;
    const [a] = nearLane(s, 1);
    build(s, "ink", a![0], a![1]);
    const t = towerAt(s, a![0], a![1])!;
    while (t.level < CONFIG.td.ascendLevel) upgrade(s, t.col, t.row);
    assert.equal(chooseAscension(s, t.col, t.row, 0).ok, false, "a path comes first");
    assert.ok(choosePath(s, t.col, t.row, 0).ok);
    const withPath = { ...t.stats };
    const gold = s.gold;
    assert.ok(chooseAscension(s, t.col, t.row, 0).ok);
    assert.equal(gold - s.gold, ascendCost("ink"));
    assert.ok(t.stats.damage > withPath.damage && t.stats.rate > withPath.rate, "Fountain Pen on top of Torrent");
    assert.equal(chooseAscension(s, t.col, t.row, 1).ok, false, "only one");
    assert.deepEqual(restore(serialize({ ...s, wave: 1 }))!.towers[0]!.stats, t.stats, "kept in a save");
  });

  it("are refused below the Ascension level", () => {
    const s = createGame();
    s.gold = 1e7;
    const [a] = nearLane(s, 1);
    build(s, "verse", a![0], a![1]);
    const t = towerAt(s, a![0], a![1])!;
    while (t.level < MAX_TOWER_LEVEL) upgrade(s, t.col, t.row);
    choosePath(s, t.col, t.row, 1);
    assert.equal(chooseAscension(s, t.col, t.row, 0).ok, false);
  });

  it("change every tower, both ways", () => {
    for (const key of Object.keys(TOWERS) as (keyof typeof TOWERS)[]) {
      assert.equal(ascensionsOf(key).length, 2, key);
      for (const path of [0, 1]) {
        const before = towerStats(key, CONFIG.td.ascendLevel, noPerks(), path);
        for (const asc of [0, 1]) {
          assert.notDeepEqual(towerStats(key, CONFIG.td.ascendLevel, noPerks(), path, asc), before, `${key} ${path}/${asc}`);
        }
      }
    }
  });
});
