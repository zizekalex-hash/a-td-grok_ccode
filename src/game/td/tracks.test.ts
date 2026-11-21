/** Each tower's own endless upgrades (its signature tracks). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { buildable, pointAt } from "./map.ts";
import {
  TOWER_KEYS,
  TOWERS,
  TRACK_COUNT,
  trackCost,
  tracksOf,
  towerStats,
  type TowerKey,
} from "./economy.ts";
import { build, createGame, towerAt, upgradeTrack, type TdState } from "./sim.ts";
import { restore, serialize } from "./save.ts";

const ALL = Object.keys(TOWERS) as TowerKey[];

function cell(s: TdState): [number, number] {
  for (let d = 0.5; d < s.map.length; d += 0.5) {
    const p = pointAt(s.map, d);
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const c = Math.floor(p.x) + dc;
      const r = Math.floor(p.y) + dr;
      if (buildable(s.map, c, r)) return [c, r];
    }
  }
  throw new Error("no cell");
}

describe("tower signature upgrades", () => {
  it("gives every tower three of its own, named for it, none alike", () => {
    assert.ok(ALL.length >= 40 && TOWER_KEYS.length > 0 && CONFIG.td.maxLevel > 0);
    const names = new Set<string>();
    for (const key of ALL) {
      const tr = tracksOf(key);
      assert.equal(tr.length, TRACK_COUNT, key);
      for (const t of tr) {
        assert.ok(t.name.startsWith(TOWERS[key].name), `${key}: ${t.name}`);
        assert.ok(!names.has(t.name), `${t.name} is the only one`);
        names.add(t.name);
      }
    }
    // They follow what the tower is: a Reactor's is its flux, not its damage.
    assert.equal(tracksOf("reactor")[0]!.stat, "fluxIncome");
  });

  it("have no top: every rank raises the tower, and costs more", () => {
    for (const key of ALL) {
      let last = towerStats(key, 1, undefined, -1, -1, undefined, undefined, [0, 0, 0]);
      for (let i = 0; i < TRACK_COUNT; i++) {
        const r = [0, 0, 0];
        r[i] = 40;
        const hi = towerStats(key, 1, undefined, -1, -1, undefined, undefined, r);
        assert.notDeepEqual(hi, last, `${key} upgrade ${i}`);
        r[i] = 46;
        assert.notDeepEqual(towerStats(key, 1, undefined, -1, -1, undefined, undefined, r), hi, `${key} rank 46`);
        assert.ok(trackCost(key, 41) > trackCost(key, 40), `${key} costs more`);
      }
      last = hi0(key);
      assert.deepEqual(last, towerStats(key, 1));
    }
  });

  it("are bought in the tower's own currency and kept in a save", () => {
    const s = createGame();
    s.gold = 1e9;
    const [c, r] = cell(s);
    assert.equal(build(s, "ink", c, r).ok, true);
    const t = towerAt(s, c, r)!;
    const before = t.stats.damage + t.stats.rate;
    const gold = s.gold;
    for (let i = 0; i < 5; i++) assert.equal(upgradeTrack(s, c, r, 0).ok, true);
    assert.ok(gold - s.gold >= trackCost("ink", 0) + trackCost("ink", 1));
    assert.equal(t.tracks[0], 5);
    assert.ok(t.stats.damage + t.stats.rate > before);
    assert.equal(upgradeTrack(s, c, r, 9).ok, false);
    s.gold = 0;
    assert.equal(upgradeTrack(s, c, r, 1).ok, false);
    const back = restore(serialize(s))!;
    assert.deepEqual(towerAt(back, c, r)!.tracks, [5]);
    assert.equal(towerAt(back, c, r)!.stats.damage, t.stats.damage);
  });
});

function hi0(key: TowerKey) {
  return towerStats(key, 1, undefined, -1, -1, undefined, undefined, []);
}
