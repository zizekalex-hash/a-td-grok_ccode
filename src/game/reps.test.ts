import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  addItem,
  addReps,
  cancelSet,
  clampSet,
  clock,
  finishSet,
  grandTime,
  grandTotal,
  perRep,
  seconds,
  loadReps,
  newReps,
  removeItem,
  resetAll,
  setMs,
  setTime,
  setXp,
  startSet,
  timeLeft,
  wordsOf,
} from "./reps.ts";

const R = CONFIG.reps;

describe("reps", () => {
  it("adds words and phrases once, newest first, and ignores empty ones", () => {
    let s = newReps();
    const a = addItem(s, "  xyz  ", 1, "a");
    s = a.state;
    assert.equal(a.id, "a");
    s = addItem(s, "the quick   fox", 2, "b").state;
    assert.deepEqual(
      s.items.map((i) => i.text),
      ["the quick fox", "xyz"],
    );
    const again = addItem(s, "XYZ", 3, "c");
    assert.equal(again.id, "a", "the same text is the one already there");
    assert.equal(again.state.items.length, 2);
    const empty = addItem(s, "   ", 4, "d");
    assert.equal(empty.id, "");
    assert.equal(empty.state, s);
  });

  it("a set of 100 takes at least 100 s, then Done adds all 100: 100, then 200", () => {
    const T = 1_000_000;
    let s = addItem({ ...newReps(), set: 100 }, "xyz", 1, "a").state;
    s = startSet(s, "a", T);
    assert.deepEqual(s.active, { id: "a", target: 100, since: T });
    assert.equal(setMs(100), 100 * R.secondsPerRep * 1000);
    assert.equal(timeLeft(s.active!, T + 40_000), setMs(100) - 40_000);
    // Too soon: nothing changes.
    assert.equal(finishSet(s, T + setMs(100) - 1), s);
    assert.equal(setTime(s.active!, T + 5000), 5000, "a stopwatch from the start");
    // 100 reps in 5:33.
    s = finishSet(s, T + 333_000);
    assert.equal(s.active, null);
    assert.equal(s.items[0]!.total, 100);
    assert.equal(s.items[0]!.ms, 333_000);
    assert.equal(s.items[0]!.last, 333_000);
    assert.equal(seconds(s.items[0]!.ms), 333);
    // Another 100 in 4:27: 200 in 10:00.
    s = finishSet(startSet(s, "a", T), T + 267_000);
    assert.equal(s.items[0]!.total, 200);
    assert.equal(s.items[0]!.sets, 2);
    assert.equal(s.items[0]!.ms, 600_000);
    assert.equal(s.items[0]!.last, 267_000);
    assert.equal(perRep(s.items[0]!), 3);
    assert.equal(grandTime(s), 600_000);
    // A cancelled set adds nothing.
    s = cancelSet(startSet(s, "a", T));
    assert.equal(s.active, null);
    assert.equal(s.items[0]!.total, 200);
    assert.equal(startSet(s, "nobody", T), s, "only a phrase in the list");
  });

  it("resets every count to 0 and keeps the words and phrases", () => {
    let s = addItem(newReps(), "xyz", 1, "a").state;
    s = addItem(s, "abc", 2, "b").state;
    s = addReps(addReps(s, "a", 100, 300_000), "b", 50, 90_000);
    assert.equal(grandTotal(s), 150);
    assert.equal(grandTime(s), 390_000);
    const r = resetAll(s);
    assert.deepEqual(
      r.items.map((i) => [i.text, i.total, i.sets, i.ms, i.last]),
      [
        ["abc", 0, 0, 0, 0],
        ["xyz", 0, 0, 0, 0],
      ],
    );
    assert.equal(s.items[0]!.total, 50, "the old state is left as it was");
    const gone = removeItem(startSet(r, "a", 5), "a");
    assert.equal(gone.items.length, 1);
    assert.equal(gone.active, null, "deleting a phrase ends its set");
  });

  it("knows its sizes, clock and XP", () => {
    assert.equal(wordsOf("one"), 1);
    assert.equal(wordsOf("  two  words "), 2);
    assert.equal(wordsOf(""), 1);
    assert.equal(clampSet(0), 1);
    assert.equal(clampSet(250.4), 250);
    assert.equal(clampSet(1e9), R.maxSet);
    assert.equal(clock(100_000), "1:40");
    assert.equal(clock(4_200), "0:04", "a stopwatch rounds down");
    assert.equal(clock(4_200, true), "0:05", "a countdown rounds up");
    assert.equal(clock(3_723_000), "1:02:03");
    assert.equal(clock(-5), "0:00");
    assert.equal(setXp("a b", 100), 200 * R.xpPerWordRep);
  });

  it("reads saves defensively, with a set in progress", () => {
    const s = loadReps({
      set: 50,
      active: { id: "a", target: 100, since: 1234 },
      items: [
        { id: "a", text: " xyz ", total: 120.7, sets: 2, ms: 61_000.5, last: "x", at: 5 },
        { id: "a", text: "again", total: 1 },
        { id: "b", text: "", total: 3 },
        { id: "c", text: "abc", total: -4 },
        "junk",
      ],
    });
    assert.equal(s.set, 50);
    assert.deepEqual(s.active, { id: "a", target: 100, since: 1234 });
    assert.deepEqual(
      s.items.map((i) => [i.id, i.text, i.total, i.ms, i.last]),
      [
        ["a", "xyz", 120, 61_000, 0],
        ["c", "abc", 0, 0, 0],
      ],
    );
    assert.equal(loadReps({ items: [], active: { id: "x", target: 5, since: 1 } }).active, null);
    const fresh = loadReps(null);
    assert.equal(fresh.items.length, 0);
    assert.equal(fresh.set, R.set);
  });
});
