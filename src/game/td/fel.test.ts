/**
 * The fel set (towers paid in dark energy) and the altar that makes it: trade,
 * sacrificed towers and sacrificed lives.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { buildable, pointAt } from "./map.ts";
import {
  ascendCost,
  ascensionsOf,
  barter,
  buildCost,
  CREEPS,
  currencyOf,
  CURRENCY_NAME,
  deReward,
  devour,
  FEL_PERK_KEYS,
  FEL_PERKS,
  felHaste,
  felPerkCost,
  felPerkMaxed,
  felPower,
  felReach,
  felTithe,
  FEL_TOWER_KEYS,
  isCreepKind,
  isFel,
  isSupport,
  isVoid,
  isWake,
  lifeValue,
  MAX_TOWER_LEVEL,
  nextSuper,
  noPerks,
  pathCost,
  pathsOf,
  sacrificeValue,
  supersFor,
  sellValue,
  TOWER_KEYS,
  TOWERS,
  tradePrice,
  tradeYield,
  towerStats,
  upgradeCost,
  waveSpec,
  VOID_TOWER_KEYS,
  WAKE_TOWER_KEYS,
  type TowerKey,
} from "./economy.ts";
import {
  build,
  buyFelPerk,
  chooseAscension,
  choosePath,
  createGame,
  refundFor,
  sacrifice,
  sacrificeableLives,
  sacrificeFor,
  sacrificeLives,
  sell,
  sendWave,
  step,
  towerAt,
  trade,
  tradeAll,
  upgrade,
  type TdState,
} from "./sim.ts";
import { restore, serialize } from "./save.ts";

const D = CONFIG.td.de;

/** A game with plenty of every currency but dark energy. */
function rich(): TdState {
  const s = createGame();
  s.gold = 1e7;
  s.flux = 1e7;
  s.atp = 1e7;
  s.de = 0;
  return s;
}

/** Free cells next to the lane, nearest the gate first. */
function free(s: TdState, n: number): [number, number][] {
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

describe("the fel set", () => {
  it("has ten towers, in no other set, each paid in dark energy", () => {
    assert.equal(FEL_TOWER_KEYS.length, 10);
    const all = [...TOWER_KEYS, ...VOID_TOWER_KEYS, ...WAKE_TOWER_KEYS, ...FEL_TOWER_KEYS];
    assert.equal(new Set(all).size, all.length, "no tower twice");
    assert.deepEqual(Object.keys(TOWERS).sort(), [...all].sort());
    for (const k of FEL_TOWER_KEYS) {
      assert.ok(isFel(k) && !isVoid(k) && !isWake(k), k);
      assert.equal(currencyOf(k), "de");
      assert.equal(pathsOf(k).length, 2, `${k}: two paths`);
      assert.equal(ascensionsOf(k).length, 2, `${k}: two Ascensions`);
      assert.ok(TOWERS[k].cost > 0 && Number.isInteger(TOWERS[k].cost), `${k}: a price`);
      assert.match(TOWERS[k].color, /^#[0-9a-f]{6}$/i);
      assert.ok(TOWERS[k].copy.length > 20 && TOWERS[k].label.length === 3, `${k}: its words`);
    }
    for (const k of [...TOWER_KEYS, ...VOID_TOWER_KEYS, ...WAKE_TOWER_KEYS]) assert.ok(!isFel(k), k);
    assert.equal(CURRENCY_NAME.de, "DE");
    // Ten different jobs: no two of them the same role.
    assert.equal(new Set(FEL_TOWER_KEYS.map((k) => TOWERS[k].role)).size, 10);
  });

  it("is built, upgraded, specialized and sold in dark energy, never in the others", () => {
    const s = rich();
    const [a] = free(s, 1);
    const key: TowerKey = "wrath";
    assert.equal(build(s, key, a![0], a![1]).ok, false, "no dark energy yet");
    s.de = 1e6;
    const gold = s.gold;
    const flux = s.flux;
    const atp = s.atp;
    const before = s.de;
    assert.ok(build(s, key, a![0], a![1]).ok);
    assert.equal(before - s.de, buildCost(key));
    const t = towerAt(s, a![0], a![1])!;
    while (t.level < MAX_TOWER_LEVEL) {
      const cost = upgradeCost(key, t.level);
      const had = s.de;
      assert.ok(upgrade(s, t.col, t.row).ok);
      assert.equal(had - s.de, cost);
    }
    let had = s.de;
    assert.ok(choosePath(s, t.col, t.row, 0).ok);
    assert.equal(had - s.de, pathCost(key));
    while (t.level < CONFIG.td.ascendLevel) upgrade(s, t.col, t.row);
    had = s.de;
    assert.ok(chooseAscension(s, t.col, t.row, 1).ok);
    assert.equal(had - s.de, ascendCost(key));
    assert.deepEqual([s.gold, s.flux, s.atp], [gold, flux, atp], "the others were never touched");
    // Sold (once it has fired, so it is not an undone build): dark energy back, at the usual share.
    t.shots = 1;
    const refund = refundFor(s, t);
    const mid = s.de;
    assert.ok(sell(s, t.col, t.row).ok);
    assert.equal(s.de - mid, refund);
    assert.equal(refund, sellValue(t.invested));
    assert.deepEqual([s.gold, s.flux, s.atp], [gold, flux, atp]);
  });

  it("is told what it costs when the dark energy is short", () => {
    const s = rich();
    const [a] = free(s, 1);
    s.de = buildCost("oblivion") - 1;
    const r = build(s, "oblivion", a![0], a![1]);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : "", /DE/);
  });

  it("gives every tower a job, and every path and Ascension a change", () => {
    for (const key of FEL_TOWER_KEYS) {
      const base = towerStats(key, MAX_TOWER_LEVEL);
      pathsOf(key).forEach((_, i) =>
        assert.notDeepEqual(towerStats(key, MAX_TOWER_LEVEL, noPerks(), i), base, `${key} path ${i}`),
      );
      for (const path of [0, 1]) {
        const at = towerStats(key, CONFIG.td.ascendLevel, noPerks(), path);
        for (const asc of [0, 1])
          assert.notDeepEqual(towerStats(key, CONFIG.td.ascendLevel, noPerks(), path, asc), at, `${key} ${path}/${asc}`);
      }
      const st = towerStats(key, 1);
      assert.ok(
        st.damage > 0 || st.burn > 0 || st.aura > 0 || st.haste > 0 || st.vuln > 0 || st.shred > 0 || st.mire > 0 || st.execute > 0,
        `${key} does something`,
      );
      if (!isSupport(key)) assert.ok(st.rate > 0 && st.range > 0, key);
    }
  });

  it("scales in price from its cheapest to its dearest, the beam the dearest", () => {
    const prices = FEL_TOWER_KEYS.map((k) => TOWERS[k].cost);
    assert.equal(Math.max(...prices), TOWERS.oblivion.cost);
    assert.equal(Math.min(...prices), TOWERS.cinder.cost);
  });
});

describe("the altar: trade", () => {
  it("costs what td.de.cost says, in whole dark energy", () => {
    for (const from of ["gold", "flux", "atp"] as const) {
      assert.equal(tradePrice(from, 3), 3 * D.cost[from]);
      assert.equal(tradeYield(from, D.cost[from] * 7 + (D.cost[from] - 1)), 7, "whole DE only");
      assert.equal(tradeYield(from, 0), 0);
      const s = rich();
      s[from] = 1000;
      const de = s.de;
      assert.ok(trade(s, from, 4).ok);
      assert.equal(s.de - de, 4);
      assert.equal(s[from], 1000 - 4 * D.cost[from]);
    }
  });

  it("refuses what cannot be paid, and a nothing", () => {
    const s = createGame();
    s.gold = D.cost.gold * 2 - 1;
    assert.equal(trade(s, "gold", 2).ok, false);
    assert.equal(s.gold, D.cost.gold * 2 - 1, "nothing was taken");
    assert.equal(s.de, 0);
    for (const n of [0, -3, 0.4, Number.NaN]) assert.equal(trade(s, "gold", n).ok, false, `${n}`);
    s.phase = "over";
    s.gold = 1e6;
    assert.equal(trade(s, "gold", 1).ok, false, "not once the rite is over");
  });

  it("trades everything that buys any, and says when it buys none", () => {
    const s = createGame();
    s.atp = D.cost.atp * 5 + 1;
    const r = tradeAll(s, "atp");
    assert.ok(r.ok && r.de === 5);
    assert.equal(s.de, 5);
    assert.ok(s.atp < D.cost.atp, "less than one DE's worth left");
    assert.equal(tradeAll(s, "atp").ok, false);
  });
});

describe("the altar: sacrifice", () => {
  it("takes a tower for the dark energy of what was put into it, more than selling it", () => {
    const s = rich();
    const [a] = free(s, 1);
    assert.ok(build(s, "verse", a![0], a![1]).ok);
    const t = towerAt(s, a![0], a![1])!;
    while (t.level < 4) upgrade(s, t.col, t.row);
    const worth = sacrificeFor(s, t);
    assert.equal(worth, sacrificeValue(t.key, t.invested));
    assert.equal(worth, Math.floor((t.invested / D.cost.gold) * D.offering + 1e-9));
    // At the sale's rate the same O/I would be worth less dark energy than the sacrifice gives.
    assert.ok(worth > Math.floor(sellValue(t.invested) / D.cost.gold), "sacrifice beats selling then trading");
    const gold = s.gold;
    const r = sacrifice(s, t.col, t.row);
    assert.ok(r.ok && r.de === worth);
    assert.equal(s.de, worth);
    assert.equal(s.gold, gold, "no O/I back: it was given");
    assert.equal(towerAt(s, a![0], a![1]), undefined, "the tower is gone");
    assert.ok(s.events.some((e) => e.type === "altar" && e.what === "tower" && e.de === worth));
    // What it did is kept for the run's report.
    assert.ok(s.retired.verse);
  });

  it("values a void or wake tower in its own currency's dark energy price", () => {
    const s = rich();
    const [a, b] = free(s, 2);
    assert.ok(build(s, "railgun", a![0], a![1]).ok);
    assert.ok(build(s, "glutamate", b![0], b![1]).ok);
    const railgun = towerAt(s, a![0], a![1])!;
    const glut = towerAt(s, b![0], b![1])!;
    assert.equal(sacrificeFor(s, railgun), Math.floor((railgun.invested / D.cost.flux) * D.offering + 1e-9));
    assert.equal(sacrificeFor(s, glut), Math.floor((glut.invested / D.cost.atp) * D.offering + 1e-9));
    const flux = s.flux;
    assert.ok(sacrifice(s, railgun.col, railgun.row).ok);
    assert.equal(s.flux, flux, "no flux back");
  });

  it("is not for a fel tower, nor for a tower worth less than one DE", () => {
    const s = rich();
    s.de = 1e6;
    const [a, b] = free(s, 2);
    assert.ok(build(s, "cinder", a![0], a![1]).ok);
    const r = sacrifice(s, a![0], a![1]);
    assert.equal(r.ok, false);
    assert.equal(sacrificeFor(s, towerAt(s, a![0], a![1])!), 0);
    assert.ok(towerAt(s, a![0], a![1]), "it stays");
    // A tower with next to nothing in it.
    assert.ok(build(s, "ink", b![0], b![1]).ok);
    const ink = towerAt(s, b![0], b![1])!;
    ink.invested = D.cost.gold - 1;
    assert.equal(sacrifice(s, ink.col, ink.row).ok, false);
    assert.equal(sacrifice(s, 0, 0).ok, false, "an empty cell");
  });

  it("gives lives for dark energy, never the last", () => {
    const s = createGame();
    assert.equal(s.lives, 20);
    assert.equal(sacrificeableLives(s), 20 - D.minLives);
    const r = sacrificeLives(s, 3);
    assert.ok(r.ok && r.de === lifeValue(3));
    assert.equal(r.de, 3 * D.life);
    assert.equal(s.lives, 17);
    assert.equal(s.de, 3 * D.life);
    assert.ok(s.events.some((e) => e.type === "altar" && e.what === "life"));
    assert.equal(sacrificeLives(s, 17).ok, false, "all of them would be the last");
    assert.equal(s.lives, 17, "nothing was taken");
    assert.ok(sacrificeLives(s, 17 - D.minLives).ok);
    assert.equal(s.lives, D.minLives);
    assert.equal(sacrificeableLives(s), 0);
    assert.equal(sacrificeLives(s, 1).ok, false);
    assert.equal(sacrificeLives(s, 0).ok, false);
    assert.equal(sacrificeLives(s, -2).ok, false);
    assert.equal(sacrificeLives(s, 1.5).ok, false);
  });
});

describe("dark energy in a saved run", () => {
  it("is kept, and a run from before it starts with none", () => {
    const s = rich();
    s.de = 123;
    const back = restore(serialize(s));
    assert.equal(back?.de, 123);
    const old = JSON.parse(serialize(s));
    delete old.state.de;
    assert.equal(restore(JSON.stringify(old))?.de, 0);
    old.state.de = "lots";
    assert.equal(restore(JSON.stringify(old))?.de, 0);
    old.state.de = -5;
    assert.equal(restore(JSON.stringify(old))?.de, 0);
  });

  it("keeps a fel tower, its path and Ascension", () => {
    const s = rich();
    s.de = 1e6;
    const [a] = free(s, 1);
    build(s, "maw", a![0], a![1]);
    const t = towerAt(s, a![0], a![1])!;
    while (t.level < MAX_TOWER_LEVEL) upgrade(s, t.col, t.row);
    choosePath(s, t.col, t.row, 1);
    const back = restore(serialize(s));
    const u = back && towerAt(back, a![0], a![1]);
    assert.equal(u?.key, "maw");
    assert.equal(u?.path, 1);
  });
});

const text = () => "A phrase to type.";
const F = CONFIG.td.fel;

/** A creep of a kind with no life left, standing at the start of the lane, for the next step to pay out. */
function fallen(s: TdState, kind: keyof typeof CREEPS, wave: number) {
  s.creeps.push({
    id: s.nextId++,
    kind,
    wave,
    hp: 0,
    maxHp: 100,
    dist: 1,
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
    stun: 0,
    stunGrace: 0,
    block: 0,
    age: 0,
    faded: false,
    guard: 0,
    mire: 0,
    jamTimer: 0,
  });
}

describe("the fel upgrades: endless, bought with dark energy", () => {
  it("cost the base price, then more each level, and Hellfire never ends", () => {
    assert.deepEqual([...FEL_PERK_KEYS].sort(), Object.keys(FEL_PERKS).sort());
    for (const key of FEL_PERK_KEYS) {
      const spec = FEL_PERKS[key];
      assert.equal(felPerkCost(key, 0), Math.round(spec.baseCost), key);
      assert.equal(felPerkCost(key, 5), Math.round(spec.baseCost * spec.growth ** 5), key);
      assert.ok(spec.growth > 1 && spec.amount > 0 && spec.copy.length > 10, `${key}: its numbers and words`);
      for (let l = 0; l < 30; l++) assert.ok(felPerkCost(key, l + 1) > felPerkCost(key, l), `${key}: dearer each level`);
      if (spec.max > 0) {
        assert.equal(felPerkMaxed(key, spec.max), true, `${key} stops at its limit`);
        assert.equal(felPerkMaxed(key, spec.max - 1), false);
      }
    }
    assert.equal(FEL_PERKS.power.max, 0, "Hellfire has no limit");
    assert.equal(felPerkMaxed("power", 100_000), false);
  });

  it("are bought with dark energy alone, a level at a time, and not past a limit", () => {
    const s = rich();
    s.de = 0;
    assert.equal(buyFelPerk(s, "power").ok, false, "no dark energy");
    s.de = felPerkCost("power", 0) + felPerkCost("power", 1);
    const gold = s.gold;
    assert.ok(buyFelPerk(s, "power").ok);
    assert.ok(buyFelPerk(s, "power").ok);
    assert.equal(s.felPerks.power, 2);
    assert.equal(s.de, 0, "exactly what they cost");
    assert.equal(s.gold, gold, "no O/I");
    assert.equal(buyFelPerk(s, "power").ok, false, "the next is dearer than what is left");
    s.de = 1e12;
    s.felPerks.reach = FEL_PERKS.reach.max;
    const r = buyFelPerk(s, "reach");
    assert.equal(r.ok, false);
    assert.equal(s.felPerks.reach, FEL_PERKS.reach.max, "never past its limit");
    for (let i = 0; i < 60; i++) assert.ok(buyFelPerk(s, "power").ok, "Hellfire goes on");
    assert.equal(s.felPerks.power, 62);
  });

  it("make every fel tower hit harder, fire faster and reach further, and no other tower", () => {
    const s = rich();
    s.de = 1e9;
    const [a, b, c] = free(s, 3);
    assert.ok(build(s, "siphon", a![0], a![1]).ok);
    assert.ok(build(s, "entangler", b![0], b![1]).ok);
    assert.ok(build(s, "ink", c![0], c![1]).ok);
    const fel = towerAt(s, a![0], a![1])!;
    const voided = towerAt(s, b![0], b![1])!;
    const plain = towerAt(s, c![0], c![1])!;
    const before = { fel: { ...fel.stats }, voided: { ...voided.stats }, plain: { ...plain.stats } };
    for (let i = 0; i < 3; i++) buyFelPerk(s, "power");
    for (let i = 0; i < 2; i++) buyFelPerk(s, "haste");
    for (let i = 0; i < 4; i++) buyFelPerk(s, "reach");
    assert.ok(Math.abs(fel.stats.damage / before.fel.damage - (1 + FEL_PERKS.power.amount) ** 3) < 1e-9, "Hellfire, level on level");
    assert.ok(Math.abs(fel.stats.rate / before.fel.rate - (1 + FEL_PERKS.haste.amount) ** 2) < 1e-9, "Cinderwind");
    assert.ok(Math.abs(fel.stats.range - before.fel.range - FEL_PERKS.reach.amount * 4) < 1e-9, "Abyssal reach");
    assert.ok(Math.abs(felPower(s.felPerks) - fel.stats.damage / before.fel.damage) < 1e-9);
    assert.ok(Math.abs(felHaste(s.felPerks) - fel.stats.rate / before.fel.rate) < 1e-9);
    assert.ok(Math.abs(felReach(s.felPerks) - 0.48) < 1e-9);
    assert.deepEqual(voided.stats, before.voided, "a void tower does not feel it");
    assert.deepEqual(plain.stats, before.plain, "nor does a tower of O/I");
    // A tower built afterwards has them from the start.
    const [d] = free(s, 4).slice(3);
    assert.ok(build(s, "siphon", d![0], d![1]).ok);
    assert.equal(towerAt(s, d![0], d![1])!.stats.damage, fel.stats.damage);
  });

  it("hit as hard as the void towers of their job, for the price, before any upgrade", () => {
    const s = rich();
    for (const [voided, fel] of [
      ["entangler", "siphon"],
      ["railgun", "wrath"],
    ] as const) {
      const v = towerStats(voided, 1);
      const f = towerStats(fel, 1, noPerks(), -1, -1, s.voidPerks, s.felPerks);
      const reach = (x: { damage: number; rate: number; chain: number }) => x.damage * x.rate * (1 + x.chain * 0.5);
      assert.ok(reach(f) >= 0.9 * reach(v), `${fel} against ${voided}: ${reach(f)} and ${reach(v)}`);
      // And what it costs in flux, at the altar's rate, is no more.
      assert.ok(TOWERS[fel].cost * D.cost.flux <= TOWERS[voided].cost * 1.01, `${fel} costs ${TOWERS[fel].cost} DE`);
    }
    assert.equal(towerStats("siphon", 1).damage, TOWERS.siphon.damage * F.damage, "the fel set's own multiplier");
  });

  it("Barter makes the altar cheaper and Devour makes an offering richer", () => {
    const s = rich();
    s.de = 0;
    s.felPerks.barter = 5;
    const share = barter(s.felPerks);
    assert.ok(Math.abs(share - (1 - FEL_PERKS.barter.amount * 5)) < 1e-9 && share < 1);
    assert.equal(tradePrice("flux", 10, s.felPerks), Math.ceil(10 * D.cost.flux * share - 1e-9));
    assert.ok(tradePrice("flux", 10, s.felPerks) < tradePrice("flux", 10));
    assert.ok(tradeYield("flux", 1000, s.felPerks) > tradeYield("flux", 1000));
    const flux = s.flux;
    assert.ok(trade(s, "flux", 10).ok);
    assert.equal(s.flux, flux - tradePrice("flux", 10, s.felPerks), "the sim charges the cheaper price");
    // The whole of a currency buys more dark energy.
    const all = tradeAll(s, "atp");
    assert.equal(all.de, tradeYield("atp", 1e7, s.felPerks));
    // Devour on top of Barter: more for a sacrificed tower, and more than without either.
    const [a] = free(s, 1);
    assert.ok(build(s, "ink", a![0], a![1]).ok);
    const ink = towerAt(s, a![0], a![1])!;
    ink.invested = 1000;
    const plain = sacrificeValue("ink", 1000);
    s.felPerks.devour = 4;
    assert.ok(devour(s.felPerks) > 1);
    assert.equal(sacrificeFor(s, ink), sacrificeValue("ink", 1000, s.felPerks));
    assert.ok(sacrificeFor(s, ink) > plain * devour(s.felPerks) - 1 && sacrificeFor(s, ink) > plain);
    // Never cheaper than a fifth.
    s.felPerks.barter = 1000;
    assert.equal(barter(s.felPerks), 0.2);
  });

  it("Soul tithe pays dark energy for every wave cleared, more at higher waves", () => {
    for (const wave of [1, 40, 100]) {
      const s = createGame();
      s.de = 0;
      s.felPerks.tithe = 4;
      s.wave = wave - 1;
      sendWave(s);
      s.spawners[0]!.queue = [];
      s.creeps = [];
      step(s, 0.06, 1, text);
      assert.equal(s.cleared, wave);
      assert.equal(s.de, felTithe(s.felPerks, wave), `wave ${wave}`);
      assert.equal(s.de, Math.round(FEL_PERKS.tithe.amount * 4 * wave));
    }
    const none = createGame();
    none.wave = 9;
    sendWave(none);
    none.spawners[0]!.queue = [];
    none.creeps = [];
    step(none, 0.06, 1, text);
    assert.equal(none.de, 0, "nothing without the perk");
  });

  it("are kept in a saved run, bounded, and a save from before has none", () => {
    const s = rich();
    s.de = 1e9;
    const [a] = free(s, 1);
    assert.ok(build(s, "siphon", a![0], a![1]).ok);
    for (let i = 0; i < 6; i++) buyFelPerk(s, "power");
    buyFelPerk(s, "tithe");
    const back = restore(serialize(s))!;
    assert.equal(back.felPerks.power, 6);
    assert.equal(back.felPerks.tithe, 1);
    const tower = towerAt(back, a![0], a![1])!;
    assert.equal(tower.stats.damage, towerAt(s, a![0], a![1])!.stats.damage, "its stats are worked out again with them");
    const old = JSON.parse(serialize(s));
    old.state.felPerks = { power: 4, reach: 9999, haste: -3, tithe: "x" };
    const odd = restore(JSON.stringify(old))!;
    assert.equal(odd.felPerks.power, 4);
    assert.equal(odd.felPerks.reach, FEL_PERKS.reach.max, "never past a limit");
    assert.equal(odd.felPerks.haste, 0);
    assert.equal(odd.felPerks.tithe, 0);
    delete old.state.felPerks;
    assert.deepEqual(restore(JSON.stringify(old))!.felPerks, createGame().felPerks);
  });
});

describe("the fel super bosses", () => {
  it("come from their first wave, every so many waves, in turn, and more of them later", () => {
    const S = F.supers;
    assert.ok(S.kinds.length >= 3 && S.kinds.every((k) => isCreepKind(k)));
    for (const k of S.kinds) {
      const spec = CREEPS[k as keyof typeof CREEPS];
      assert.equal(spec.boss, true, `${k} is a boss`);
      assert.ok((spec.de ?? 0) > 0, `${k} pays dark energy`);
      assert.ok(spec.hp > CREEPS.nyx.hp, `${k}: more life than the dream bosses`);
      assert.match(spec.color, /^#[0-9a-f]{6}$/i);
      assert.equal(spec.label.length, 3);
    }
    assert.deepEqual(supersFor(S.from - 1), []);
    assert.deepEqual(supersFor(S.from + 1), []);
    assert.equal(supersFor(S.from).length, 1);
    const seen: string[] = [];
    for (let i = 0; i < S.kinds.length * 2; i++) seen.push(supersFor(S.from + i * S.every)[0]!);
    assert.deepEqual(seen, [...S.kinds, ...S.kinds], "the kinds in turn");
    // One more for every extraEvery waves, on the waves that are theirs.
    const late = S.from + Math.ceil((S.extraEvery * 2) / S.every) * S.every;
    assert.ok(supersFor(late).length >= 3, `wave ${late}: ${supersFor(late).length}`);
    assert.equal(supersFor(late - 1).length, 0);
  });

  it("close their waves with the boss they are", () => {
    const S = F.supers;
    assert.ok(waveSpec(S.from).kinds.includes(supersFor(S.from)[0]!));
    assert.ok(!waveSpec(S.from + 1).kinds.some((k) => S.kinds.includes(k)));
    const last = waveSpec(S.from).kinds;
    assert.ok(CREEPS[last[last.length - 1]!].boss, "bosses come last");
    const nxt = nextSuper(S.from - 5);
    assert.equal(nxt.wave, S.from);
    assert.deepEqual(nxt.kinds, supersFor(S.from));
    assert.equal(nextSuper(S.from).wave, S.from + S.every, "the one after the one now");
    assert.equal(nextSuper(S.from + S.every + 3).wave, S.from + 2 * S.every);
  });

  it("pay dark energy when slain, more each wave and with Soul tithe", () => {
    const kind = F.supers.kinds[0] as keyof typeof CREEPS;
    assert.equal(deReward("adenosine", 50), 0, "an ordinary creep pays none");
    assert.equal(deReward("nyx", 50), 0, "nor do the dream bosses");
    assert.ok(deReward(kind, 100) > deReward(kind, 40), "more at a later wave");
    const s = createGame();
    s.felPerks.tithe = 6;
    assert.ok(deReward(kind, 40, s.felPerks) > deReward(kind, 40), "more with Soul tithe");
    assert.equal(deReward(kind, 40), Math.round(CREEPS[kind].de! * (1 + F.deScale * 40)));
    // In the sim: the dead boss pays, and the event says so.
    const g = createGame();
    g.de = 0;
    g.wave = 40;
    fallen(g, kind, 40);
    step(g, 0.01, 1, text);
    assert.equal(g.de, deReward(kind, 40, g.felPerks));
    const e = g.events.find((x) => x.type === "bossKilled");
    assert.ok(e && e.type === "bossKilled" && e.de === deReward(kind, 40, g.felPerks) && e.kind === kind);
    // A regular boss pays none.
    const h = createGame();
    h.de = 0;
    fallen(h, "nyx", 40);
    step(h, 0.01, 1, text);
    assert.equal(h.de, 0);
  });
});
