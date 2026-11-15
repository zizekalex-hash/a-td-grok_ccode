import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addPosture,
  clearPostureLog,
  loadPostures,
  newPostures,
  postureStats,
  postureToday,
  removePosture,
  resetPosture,
  runningMs,
  stopPosture,
  tapPosture,
  MIN_SITTING_MS,
} from "./postures.ts";

const MIN = 60_000;
// Noon today (local), so a few hours either way stays today.
const noon = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();

describe("postures: the timer", () => {
  it("three to start; a tap starts one, a tap again stops it (counted)", () => {
    let s = newPostures();
    assert.deepEqual(
      s.postures.map((p) => p.name),
      ["Headstand", "On all fours", "Standing"],
    );
    s = tapPosture(s, "headstand", noon);
    assert.deepEqual(s.running, { id: "headstand", since: noon });
    assert.equal(runningMs(s, noon + 5 * MIN), 5 * MIN);
    s = tapPosture(s, "headstand", noon + 5 * MIN);
    assert.equal(s.running, null);
    assert.deepEqual(s.log, [{ id: "headstand", name: "Headstand", at: noon, ms: 5 * MIN }]);
  });
  it("another posture: the first stops (counted) and that one starts", () => {
    let s = tapPosture(newPostures(), "headstand", noon);
    s = tapPosture(s, "standing", noon + 3 * MIN);
    assert.deepEqual(s.running, { id: "standing", since: noon + 3 * MIN });
    assert.equal(s.log[0]!.id, "headstand");
    assert.equal(s.log[0]!.ms, 3 * MIN);
  });
  it("reset: fell asleep, the one going is not counted", () => {
    let s = tapPosture(newPostures(), "fours", noon);
    s = resetPosture(s);
    assert.equal(s.running, null);
    assert.equal(s.log.length, 0);
  });
  it("a tap too many is not kept", () => {
    let s = tapPosture(newPostures(), "fours", noon);
    s = stopPosture(s, noon + MIN_SITTING_MS - 1);
    assert.equal(s.log.length, 0);
  });
});

describe("postures: your own, and the stats", () => {
  it("adds and takes off postures (the one going stops first, counted; its sittings stay)", () => {
    let s = addPosture(newPostures(), "  Lotus   pose ", noon);
    assert.equal(s.postures.at(-1)!.name, "Lotus pose");
    assert.equal(addPosture(s, "lotus POSE", noon).postures.length, 4, "none twice");
    assert.equal(addPosture(s, "   ", noon).postures.length, 4);
    const lotus = s.postures.at(-1)!.id;
    s = tapPosture(s, lotus, noon);
    s = removePosture(s, lotus, noon + 2 * MIN);
    assert.equal(s.running, null);
    assert.equal(s.postures.length, 3);
    assert.deepEqual(
      s.log.map((e) => [e.name, e.ms]),
      [["Lotus pose", 2 * MIN]],
    );
  });
  it("today, all time, sittings, the longest; the one going counted as far as it has gone", () => {
    let s = newPostures();
    const day = 86_400_000;
    s = { ...s, log: [{ id: "headstand", name: "Headstand", at: noon - 2 * day, ms: 20 * MIN }] };
    s = tapPosture(s, "headstand", noon);
    s = tapPosture(s, "headstand", noon + 4 * MIN);
    s = tapPosture(s, "headstand", noon + 10 * MIN);
    const head = postureStats(s, noon + 16 * MIN)[0]!;
    assert.equal(head.todayMs, 4 * MIN + 6 * MIN);
    assert.equal(head.totalMs, 20 * MIN + 4 * MIN + 6 * MIN);
    assert.equal(head.sittings, 3);
    assert.equal(head.longestMs, 20 * MIN);
    assert.equal(postureToday(s, noon + 16 * MIN), 10 * MIN);
    assert.equal(clearPostureLog(s).log.length, 0);
    assert.ok(clearPostureLog(s).running, "the one going goes on");
  });
  it("kept and loaded as it was; anything odd left out; nothing saved: the three", () => {
    let s = addPosture(newPostures(), "Lotus", noon);
    s = tapPosture(s, "standing", noon);
    s = stopPosture(s, noon + MIN);
    s = tapPosture(s, "fours", noon + 2 * MIN);
    const back = loadPostures(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back, s);
    const odd = loadPostures({
      postures: [{ id: "a", name: "A" }, { id: "a", name: "Again" }, { name: "no id" }, 7],
      running: { id: "gone", since: 5 },
      log: [
        { id: "a", name: "A", at: 0, ms: 5 },
        { id: "a", name: "A", at: noon, ms: 9000 },
      ],
    });
    assert.deepEqual(odd.postures, [{ id: "a", name: "A" }]);
    assert.equal(odd.running, null);
    assert.equal(odd.log.length, 1);
    assert.equal(loadPostures(null).postures.length, 3);
    assert.equal(loadPostures({ postures: [] }).postures.length, 0, "all taken off stays so");
  });
});
