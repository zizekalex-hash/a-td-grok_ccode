import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIG } from "../config.ts";
import { choose, doing, isNight, loadLife, mark, PLANS, roamRadius, scores, stayFor, type LifeContext } from "./life.ts";
import { MOODS } from "./hearts.ts";
import { QUEEN_KEYS } from "./rules.ts";
import { rng } from "./svgkit.ts";

const L = CONFIG.court.life;
const ctx = (over: Partial<LifeContext> = {}): LifeContext => ({
  hour: 14, mood: "smile", tier: 2, outings: 20, places: true, friends: true, away: false, ...over,
});
const tally = (c: LifeContext, n = 4000) => {
  const rand = rng(11);
  const t: Record<string, number> = { home: 0, stroll: 0, visit: 0, call: 0, rest: 0 };
  for (let i = 0; i < n; i++) t[choose(c, rand)]! += 1;
  return t;
};

describe("a life of her own", () => {
  it("has a worth, a stay, a mark and words for everything she can do", () => {
    for (const p of PLANS) {
      assert.ok(L.weights[p]! > 0, `${p}: a worth`);
      assert.ok((L.stay[p]?.length ?? 0) === 2 && L.stay[p]![0]! <= L.stay[p]![1]!, `${p}: a stay`);
      assert.ok((L.doing[p]?.length ?? 0) > 0, `${p}: words`);
      assert.equal(typeof mark(p), "string");
      const s = stayFor(p, () => 0.5);
      assert.ok(s >= L.stay[p]![0]! && s <= L.stay[p]![1]!);
    }
    assert.ok(L.doing.walking!.length > 0);
    for (const m of Object.keys(L.moods)) assert.ok((MOODS as readonly string[]).includes(m), `mood ${m}`);
  });

  it("does everything by day, and mostly stays in at night", () => {
    const day = tally(ctx());
    for (const p of PLANS) assert.ok(day[p]! > 0, `${p} happens by day`);
    const night = tally(ctx({ hour: 2 }));
    assert.ok(isNight(2) && isNight(23) && !isNight(12));
    assert.ok(night.home! + night.rest! > night.stroll! + night.visit! + night.call!, "home and rest win at night");
    assert.ok(night.home! > day.home!);
  });

  it("grows into visits and calls, and never does what there is no one or nowhere for", () => {
    assert.equal(tally(ctx({ outings: 0 })).visit, 0);
    assert.equal(tally(ctx({ outings: 0 })).call, 0);
    assert.ok(tally(ctx({ outings: L.visitAfter })).visit! > 0);
    assert.equal(tally(ctx({ outings: L.callAfter - 1 })).call, 0);
    assert.ok(tally(ctx({ outings: L.callAfter })).call! > 0);
    assert.equal(tally(ctx({ friends: false })).call, 0);
    assert.equal(tally(ctx({ places: false })).visit, 0);
    assert.ok(roamRadius(0) === L.radius && roamRadius(10_000) === L.radiusMax);
    assert.ok(roamRadius(L.radiusEvery * 2) > roamRadius(0));
  });

  it("is moved by her mood and by you", () => {
    assert.ok(scores(ctx({ mood: "longing" })).call > scores(ctx()).call, "longing: she calls on a friend");
    assert.ok(scores(ctx({ mood: "jealous" })).stroll > scores(ctx()).stroll, "jealous: she walks it off");
    assert.ok(scores(ctx({ tier: 5 })).stroll > scores(ctx({ tier: 0 })).stroll, "fonder: out more");
    assert.ok(scores(ctx({ away: true })).home > scores(ctx()).home, "out: drawn home");
    for (const m of MOODS) for (const p of PLANS) assert.ok(scores(ctx({ mood: m }))[p] >= 0);
  });

  it("says what she is doing in whole words, and reads a save defensively", () => {
    for (const p of PLANS)
      for (const walking of [true, false])
        for (let seed = 0; seed < 4; seed++) {
          const line = doing(p, walking, { place: "the Moon Market", queen: "Ysera" }, seed);
          assert.ok(line.trim() && !/[{}]/.test(line), `${p}: "${line}"`);
          assert.ok(!/[{}]|undefined/.test(doing(p, walking, {}, seed)));
        }
    const life = loadLife({ jaina: 7.9, ysera: -3, azshara: "x", nobody: 4 }, QUEEN_KEYS);
    assert.equal(life.jaina, 7);
    assert.equal(life.ysera, 0);
    assert.equal(life.azshara, 0);
    assert.deepEqual(Object.keys(life).sort(), [...QUEEN_KEYS].sort());
    assert.equal(loadLife(null, QUEEN_KEYS).eltharia, 0);
  });
});
