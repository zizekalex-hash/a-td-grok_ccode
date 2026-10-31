import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyOverrides,
  bootCfg,
  bootDone,
  check,
  cvars,
  flatten,
  loadOverrides,
  parse,
  sanitize,
  saveOverrides,
  show,
} from "./cfg.ts";
import { CFG_STATUS, DEFAULT_CONFIG } from "./config.ts";

const sample = {
  _about: "notes are left out",
  settings: { flashMs: 120 },
  narrator: { model: "x" },
  td: { startGold: 150, towers: { ink: { cost: 40, name: "Ink", splash: false } }, bosses: ["a", "b"] },
  hero: { xpLevels: [0, 200, 500], camps: [{ x: 28, y: 46, units: ["big"] }] },
};

describe("cfg", () => {
  it("lists every number, switch and name by path, but not settings, notes or name lists", () => {
    const flat = flatten(sample);
    assert.deepEqual([...flat.keys()].sort(), [
      "hero.camps.0.x",
      "hero.camps.0.y",
      "hero.xpLevels",
      "td.startGold",
      "td.towers.ink.cost",
      "td.towers.ink.name",
      "td.towers.ink.splash",
    ]);
  });

  it("reads typed values for each kind", () => {
    assert.deepEqual(parse("number", " 42 "), { ok: true, value: 42 });
    assert.equal(parse("number", "abc").ok, false);
    assert.deepEqual(parse("boolean", "on"), { ok: true, value: true });
    assert.deepEqual(parse("numbers", "1, 2 3"), { ok: true, value: [1, 2, 3] });
    assert.equal(parse("numbers", "1, x").ok, false);
    assert.equal(show([1, 2]), "1, 2");
  });

  it("refuses values that would break the game", () => {
    assert.equal(check(150, 200), null);
    assert.ok(check(150, 0));
    assert.ok(check(0, -1));
    assert.equal(check(0, 0), null);
    assert.ok(check(150, "lots"));
    assert.ok(check([0, 200, 500], [0, 200]));
    assert.ok(check("Ink", " "));
  });

  it("keeps only overrides that name a real value, fit it and change it", () => {
    const clean = sanitize(sample, {
      "td.startGold": 300,
      "td.towers.ink.cost": 40,
      "td.nope": 1,
      "settings.flashMs": 20,
      "hero.xpLevels": [0, 100, 200],
      "td.towers.ink.splash": "yes",
    });
    assert.deepEqual(clean, { "td.startGold": 300, "hero.xpLevels": [0, 100, 200] });
  });

  it("writes overrides into a config in place", () => {
    const config = structuredClone(sample);
    const n = applyOverrides(config, { "td.startGold": 999, "hero.camps.0.x": 30, "td.bad": 1 });
    assert.equal(n, 2);
    assert.equal(config.td.startGold, 999);
    assert.equal(config.hero.camps[0]?.x, 30);
    const list = cvars(sample, { "td.startGold": 999 });
    assert.equal(list.find((c) => c.path === "td.startGold")?.value, 999);
    assert.equal(list.find((c) => c.path === "td.startGold")?.def, 150);
  });

  it("turns saved changes off after a start that never finished, until they are applied again", () => {
    const data = new Map<string, string>();
    const fake = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const g = globalThis as { localStorage?: unknown };
    const before = g.localStorage;
    g.localStorage = fake;
    try {
      saveOverrides({ "td.startGold": 500 });
      assert.deepEqual(loadOverrides(), { "td.startGold": 500 });
      // A start that reaches the game.
      let config = structuredClone(sample);
      assert.deepEqual(bootCfg(config), { active: 1, paused: false });
      assert.equal(config.td.startGold, 500);
      bootDone();
      // A start that crashes before bootDone: the next one runs without the changes.
      config = structuredClone(sample);
      bootCfg(config);
      config = structuredClone(sample);
      assert.deepEqual(bootCfg(config), { active: 0, paused: true });
      assert.equal(config.td.startGold, 150);
      // Applying them again turns them back on.
      saveOverrides({ "td.startGold": 400 });
      config = structuredClone(sample);
      assert.deepEqual(bootCfg(config), { active: 1, paused: false });
      assert.equal(config.td.startGold, 400);
    } finally {
      g.localStorage = before;
    }
  });

  it("leaves the real config alone where there is no device storage", () => {
    assert.deepEqual(CFG_STATUS, { active: 0, paused: false });
    assert.ok(flatten(DEFAULT_CONFIG).size > 300);
  });
});
