import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bitAt, textBytes } from "./binary.ts";
import {
  cooldownMultiplier,
  damageMultiplier,
  POTIONS,
  potionSpec,
  UPGRADES,
  upgradeSpec,
  verseChars,
} from "./upgrades.ts";

describe("armory", () => {
  it("makes each upgrade more expensive at each level", () => {
    for (const u of UPGRADES) {
      for (let level = 0; level < u.max; level++) {
        assert.ok(u.cost(level + 1) > u.cost(level), `${u.key} ${level}`);
      }
    }
  });

  it("looks up every upgrade and potion by key", () => {
    for (const u of UPGRADES) assert.equal(upgradeSpec(u.key), u);
    for (const p of POTIONS) assert.equal(potionSpec(p.key), p);
  });

  it("scales damage, pace and verse length with the upgrade levels", () => {
    assert.equal(damageMultiplier(0), 1);
    assert.ok(damageMultiplier(5) > damageMultiplier(4));
    assert.equal(cooldownMultiplier(0), 1);
    assert.ok(cooldownMultiplier(3) < 1);
    assert.equal(cooldownMultiplier(99), 0.5);
    assert.equal(verseChars(0), 22);
    assert.equal(verseChars(2), 42);
  });
});

describe("binary source", () => {
  it("reads the uploaded text's own bits, most significant first", () => {
    const bytes = textBytes(["A"]);
    // "A" is 0x41 = 0100 0001
    const bits = Array.from({ length: 8 }, (_, i) => bitAt(bytes, i)).join("");
    assert.equal(bits, "01000001");
  });

  it("wraps around the text instead of falling back to noise", () => {
    const bytes = textBytes(["A"]);
    assert.equal(bitAt(bytes, 8), bitAt(bytes, 0));
    assert.equal(bitAt(new Uint8Array(0), 3), 0);
  });
});
