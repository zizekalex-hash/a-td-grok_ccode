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
  renamePosture,
  pausePosture,
  resumePosture,
  applyPostureEvents,
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
      ["Headstand", "Quadstanding", "Standing"],
    );
    s = tapPosture(s, "headstand", noon);
    assert.deepEqual(s.running, { id: "headstand", since: noon, pausedAt: 0, pausedMs: 0 });
    assert.equal(runningMs(s, noon + 5 * MIN), 5 * MIN);
    s = tapPosture(s, "headstand", noon + 5 * MIN);
    assert.equal(s.running, null);
    assert.deepEqual(s.log, [{ id: "headstand", name: "Headstand", at: noon, ms: 5 * MIN }]);
  });
  it("another posture: the first stops (counted) and that one starts", () => {
    let s = tapPosture(newPostures(), "headstand", noon);
    s = tapPosture(s, "standing", noon + 3 * MIN);
    assert.deepEqual(s.running, {
      id: "standing",
      since: noon + 3 * MIN,
      pausedAt: 0,
      pausedMs: 0,
    });
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

describe("postures: paused, renamed, and the floating window's taps", () => {
  it("paused: its time stops (not counted), and goes on again", () => {
    let s = tapPosture(newPostures(), "headstand", noon);
    s = pausePosture(s, noon + 2 * MIN);
    assert.equal(runningMs(s, noon + 9 * MIN), 2 * MIN, "stopped while paused");
    assert.equal(pausePosture(s, noon + 3 * MIN), s, "paused already");
    s = resumePosture(s, noon + 5 * MIN);
    assert.equal(runningMs(s, noon + 6 * MIN), 3 * MIN);
    s = stopPosture(s, noon + 6 * MIN);
    assert.equal(s.log[0]!.ms, 3 * MIN);
    // Stopped while paused: what it had.
    let t = tapPosture(newPostures(), "fours", noon);
    t = pausePosture(t, noon + MIN);
    t = stopPosture(t, noon + 20 * MIN);
    assert.equal(t.log[0]!.ms, MIN);
  });
  it("renamed: its sittings too; never two of a name", () => {
    let s = tapPosture(newPostures(), "fours", noon);
    s = stopPosture(s, noon + MIN);
    s = renamePosture(s, "fours", "  Quad  stand ");
    assert.equal(s.postures[1]!.name, "Quad stand");
    assert.equal(s.log[0]!.name, "Quad stand");
    assert.equal(renamePosture(s, "fours", "headstand"), s, "taken by another");
    assert.equal(renamePosture(s, "fours", " "), s);
  });
  it("its first name, on all fours, becomes quadstanding (its sittings too)", () => {
    const old = loadPostures({
      postures: [{ id: "fours", name: "On all fours" }],
      log: [{ id: "fours", name: "On all fours", at: noon, ms: 5000 }],
    });
    assert.equal(old.postures[0]!.name, "Quadstanding");
    assert.equal(old.log[0]!.name, "Quadstanding");
    const mine = loadPostures({ postures: [{ id: "fours", name: "Cat pose" }] });
    assert.equal(mine.postures[0]!.name, "Cat pose", "a name of your own stays");
  });
  it("the window's taps, put on in the order they were made, at their own times", () => {
    const s = applyPostureEvents(newPostures(), [
      { kind: "tap", id: "standing", at: noon + 10 * MIN },
      { kind: "tap", id: "headstand", at: noon },
      { kind: "pause", at: noon + 4 * MIN },
      { kind: "resume", at: noon + 6 * MIN },
    ]);
    // Headstand: 0..10 min, 2 min of it paused; then standing from 10 min.
    assert.deepEqual(
      s.log.map((e) => [e.id, e.ms]),
      [["headstand", 8 * MIN]],
    );
    assert.equal(s.running!.id, "standing");
    const reset = applyPostureEvents(s, [{ kind: "reset", at: noon + 11 * MIN }]);
    assert.equal(reset.running, null);
    assert.equal(reset.log.length, 1);
  });
});
