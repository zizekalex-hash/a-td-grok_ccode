import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import { isHttpUrl } from "../lib/narrator/narrator.ts";

/** Checks on config.json, so a typo shows up in `npm test` rather than in the game. */

const positive = (label: string, n: number) =>
  assert.ok(Number.isFinite(n) && n > 0, `${label} must be above 0, got ${n}`);

describe("config.json", () => {
  it("starts every setting inside its slider range", () => {
    for (const [key, range] of Object.entries(CONFIG.settingLimits)) {
      const value = CONFIG.settings[key as keyof typeof CONFIG.settingLimits];
      assert.ok(range.min < range.max, `${key}: min must be below max`);
      positive(`${key} step`, range.step);
      assert.ok(
        value >= range.min && value <= range.max,
        `${key} = ${value} is outside ${range.min}..${range.max}`,
      );
    }
    assert.ok(
      ["field", "chaos", "sphere"].includes(CONFIG.settings.mode),
      `mode must be field, chaos or sphere`,
    );
  });

  it("has a usable default text", () => {
    assert.ok(CONFIG.textPool.length > 0, "textPool needs at least one line");
    for (const line of CONFIG.textPool)
      assert.ok(line.trim().length > 4, `textPool line too short: "${line}"`);
  });

  it("has rain and field sizes that can be drawn", () => {
    positive("rain.fontSize", CONFIG.rain.fontSize);
    assert.ok(
      CONFIG.rain.rowStep >= CONFIG.rain.fontSize,
      "rain.rowStep must be at least rain.fontSize, or digits overlap",
    );
    positive("rain.speed", CONFIG.rain.speed);
    assert.ok(CONFIG.rain.reducedMotionSpeed >= 0);
    assert.ok(CONFIG.rain.streakMin >= 2 && CONFIG.rain.streakMax >= CONFIG.rain.streakMin);
    positive("field.minSize", CONFIG.field.minSize);
    assert.ok(
      CONFIG.field.maxSize >= CONFIG.field.minSize,
      "field.maxSize must be at least field.minSize",
    );
  });

  it("has positive enemy stats and spawn timings in every mode", () => {
    for (const [kind, stats] of Object.entries(CONFIG.arcade.enemies)) {
      for (const [stat, n] of Object.entries(stats)) positive(`arcade.enemies.${kind}.${stat}`, n);
    }
    for (const rule of CONFIG.arcade.spawnRules) {
      assert.ok(
        rule.kind in CONFIG.arcade.enemies,
        `spawn rule kind "${rule.kind}" is not an enemy`,
      );
      assert.ok(rule.chance >= 0 && rule.chance <= 1, `spawn rule chance must be 0..1`);
    }
    for (const mode of ["arcade", "td"] as const) {
      const w = CONFIG[mode].waves;
      positive(`${mode}.waves.baseCount`, w.baseCount);
      positive(`${mode}.waves.minInterval`, w.minInterval);
      assert.ok(
        w.baseInterval >= w.minInterval,
        `${mode}.waves.baseInterval must be at least minInterval`,
      );
    }
  });

  it("has towers, creeps, bosses and perks the tower defense can use", () => {
    const td = CONFIG.td;
    for (const [key, t] of Object.entries(td.towers)) {
      positive(`td.towers.${key}.cost`, t.cost);
      if (t.rate > 0) {
        positive(`td.towers.${key}.damage`, t.damage);
        positive(`td.towers.${key}.range`, t.range);
      } else {
        assert.ok(t.aura || t.income || t.vuln || t.shred, `td.towers.${key} neither fires nor helps`);
        if (t.aura || t.vuln || t.shred) positive(`td.towers.${key}.range`, t.range);
      }
    }
    for (const [kind, c] of Object.entries(td.creeps)) {
      for (const stat of ["hp", "speed", "gold", "leak", "size", "sides"] as const)
        positive(`td.creeps.${kind}.${stat}`, c[stat]);
      if (c.split) assert.ok(c.split in td.creeps, `td.creeps.${kind}.split is not a creep`);
      if (c.summon) assert.ok(c.summon in td.creeps, `td.creeps.${kind}.summon is not a creep`);
    }
    for (const kind of Object.keys(td.waves.unlocks))
      assert.ok(kind in td.creeps, `unlock "${kind}" is not a creep`);
    assert.ok(td.waves.unlocks.adenosine === 1, "something must walk in wave 1");
    for (const kind of td.bosses) {
      assert.ok(kind in td.creeps, `boss "${kind}" is not a creep`);
      assert.ok(
        td.creeps[kind as keyof typeof td.creeps].boss,
        `boss "${kind}" is not marked boss`,
      );
    }
    for (const [key, perk] of Object.entries(td.perks)) {
      positive(`td.perks.${key}.max`, perk.max);
      positive(`td.perks.${key}.baseCost`, perk.baseCost);
    }
    assert.ok(
      td.masteryCostGrowth > 1,
      "mastery must get dearer, or upgrades never run out of value",
    );
    positive("td.maxActiveWaves", td.maxActiveWaves);
  });

  it("has tower paths, spells and difficulties that can be played", () => {
    const td = CONFIG.td;
    const mults = ["damage", "rate", "burn"];
    const adds = ["range", "splash", "slow", "slowTime", "chain", "burn", "burnTime", "pierce", "ramp", "maxRamp", "aura", "income", "haste", "bounty", "vuln", "shred"];
    for (const [key, tower] of Object.entries(td.towers)) {
      assert.equal(tower.paths?.length, 2, `td.towers.${key}.paths needs two paths`);
      for (const [i, p] of (tower.paths ?? []).entries()) {
        assert.ok(p.name.trim() && p.copy.trim(), `td.towers.${key}.paths.${i} needs a name and copy`);
        for (const [stat, v] of Object.entries(p.mult ?? {})) {
          assert.ok(mults.includes(stat), `td.towers.${key}.paths.${i}.mult.${stat} is not a stat a path can scale`);
          positive(`td.towers.${key}.paths.${i}.mult.${stat}`, v as number);
        }
        for (const stat of Object.keys(p.add ?? {}))
          assert.ok(adds.includes(stat), `td.towers.${key}.paths.${i}.add.${stat} is not a stat a path can add to`);
      }
    }
    positive("td.pathCostFactor", td.pathCostFactor);
    positive("td.ascendCostFactor", td.ascendCostFactor);
    assert.ok(td.ascendLevel > td.maxLevel, "td.ascendLevel must come after the top level, where paths open");
    for (const [key, tower] of Object.entries(td.towers)) {
      assert.equal(tower.ascend?.length, 2, `td.towers.${key}.ascend needs two Ascensions`);
      for (const [i, p] of (tower.ascend ?? []).entries()) {
        assert.ok(p.name.trim() && p.copy.trim(), `td.towers.${key}.ascend.${i} needs a name and copy`);
        for (const [stat, v] of Object.entries(p.mult ?? {})) {
          assert.ok(mults.includes(stat), `td.towers.${key}.ascend.${i}.mult.${stat} is not a stat it can scale`);
          positive(`td.towers.${key}.ascend.${i}.mult.${stat}`, v as number);
        }
        for (const stat of Object.keys(p.add ?? {}))
          assert.ok(adds.includes(stat), `td.towers.${key}.ascend.${i}.add.${stat} is not a stat it can add to`);
      }
    }
    positive("td.maxSupportRange", td.maxSupportRange);
    assert.ok(td.medals.length === 3 && td.medals.every((n, i) => n > (td.medals[i - 1] ?? 0)), "td.medals: three rising waves");
    assert.ok(td.maxBounty >= 0);
    positive("td.spells.storm.cooldown", td.spells.storm.cooldown);
    positive("td.spells.storm.damage", td.spells.storm.damage);
    positive("td.spells.still.cooldown", td.spells.still.cooldown);
    assert.ok(td.spells.still.slow > 0 && td.spells.still.slow < 1, "td.spells.still.slow must be between 0 and 1");
    for (const [key, d] of Object.entries(td.difficulties)) {
      positive(`td.difficulties.${key}.hp`, d.hp);
      positive(`td.difficulties.${key}.gold`, d.gold);
      positive(`td.difficulties.${key}.lives`, d.lives);
    }
    assert.ok(td.difficulties.easy.hp < td.difficulties.hard.hp, "easy creeps must be softer than hard ones");
  });

  it("has auto chess pieces, odds and enemies that can be played", () => {
    const ch = CONFIG.chess;
    const kinds = ["pawn", "knight", "bishop", "rook", "queen", "king"];
    assert.deepEqual(Object.keys(ch.pieces).sort(), [...kinds].sort());
    for (const [key, p] of Object.entries(ch.pieces)) {
      for (const stat of ["cost", "hp", "maxHit", "acc", "def", "speed", "range", "moveTicks"] as const)
        positive(`chess.pieces.${key}.${stat}`, p[stat]);
      assert.ok(Number.isInteger(p.tier) && p.tier >= 1 && p.tier <= 5, `chess.pieces.${key}.tier must be 1 to 5`);
      assert.ok(p.ability.mana >= 0 && p.ability.power > 0, `chess.pieces.${key}.ability`);
    }
    assert.ok(ch.levelXp.length >= 1 && ch.levelXp.every((n) => n > 0), "chess.levelXp must be above 0");
    assert.equal(ch.odds.length, ch.levelXp.length + 1, "chess.odds needs a row for every level");
    for (const [i, row] of ch.odds.entries()) {
      assert.equal(row.length, 5, `chess.odds row ${i + 1} needs five tiers`);
      assert.ok(row.every((n) => n >= 0) && row.some((n) => n > 0), `chess.odds row ${i + 1} must offer something`);
    }
    for (const n of ["shopSize", "benchSize", "startHp", "startLevel", "tickSeconds", "maxTicks", "starGrowth"] as const)
      positive(`chess.${n}`, ch[n]);
    assert.ok(ch.maxStars >= 1 && ch.maxStars <= 3, "chess.maxStars is 1 to 3");
    assert.ok(ch.overtimeFrom < ch.maxTicks, "overtime must start before the tick limit");
    for (const b of ch.enemy.bosses) assert.ok(kinds.includes(b.kind), `boss kind "${b.kind}" is not a piece`);
    for (const [key, t] of Object.entries(ch.traits)) {
      assert.ok(kinds.includes(key), `trait ${key} is not a piece`);
      assert.ok(["hp", "maxHit", "acc", "def"].includes(t.stat), `chess.traits.${key}.stat must be hp, maxHit, acc or def`);
      assert.ok(t.steps.length > 0 && t.steps.every((st) => st.need > 0), `chess.traits.${key}.steps`);
    }
  });

  it("has a narrator that can be pointed at a server", () => {
    const n = CONFIG.narrator;
    assert.ok(isHttpUrl(n.baseUrl), "narrator.baseUrl must be an http or https address");
    assert.ok(n.name.trim() && n.model.trim() && n.systemPrompt.trim());
    positive("narrator.maxTokens", n.maxTokens);
    positive("narrator.timeoutMs", n.timeoutMs);
    assert.ok(n.cooldownMs >= 0);
    for (const event of n.priorityEvents)
      assert.ok(event in n.events, `priority event "${event}" is not in narrator.events`);
  });
});
