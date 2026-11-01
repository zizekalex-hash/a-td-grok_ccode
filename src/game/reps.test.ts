import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  addItem,
  addReps,
  clampPace,
  clampSet,
  grandTotal,
  loadReps,
  msPerRep,
  newReps,
  removeItem,
  repsAt,
  resetAll,
  setXp,
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

  it("adds sets to the total: 100, then 100 more is 200", () => {
    let s = addItem(newReps(), "xyz", 1, "a").state;
    s = addReps(s, "a", 100);
    s = addReps(s, "a", 100);
    assert.equal(s.items[0]!.total, 200);
    assert.equal(s.items[0]!.sets, 2);
    assert.equal(addReps(s, "a", 0), s, "a set of 0 changes nothing");
    s = addItem(s, "abc", 2, "b").state;
    s = addReps(s, "b", 10);
    assert.equal(grandTotal(s), 210);
  });

  it("resets every count to 0 and keeps the words and phrases", () => {
    let s = addItem(newReps(), "xyz", 1, "a").state;
    s = addItem(s, "abc", 2, "b").state;
    s = addReps(addReps(s, "a", 100), "b", 50);
    const r = resetAll(s);
    assert.deepEqual(
      r.items.map((i) => [i.text, i.total, i.sets]),
      [
        ["abc", 0, 0],
        ["xyz", 0, 0],
      ],
    );
    assert.equal(s.items[0]!.total, 50, "the old state is left as it was");
    assert.equal(removeItem(r, "a").items.length, 1);
  });

  it("counts reps by time at the pace, up to the set's size", () => {
    assert.equal(wordsOf("one"), 1);
    assert.equal(wordsOf("  two  words "), 2);
    assert.equal(wordsOf(""), 1);
    assert.equal(msPerRep("a b c", 600), 1800);
    assert.equal(msPerRep("a", 100), R.minRepMs, "never shorter than minRepMs");
    assert.equal(repsAt(0, 1000, 100), 0);
    assert.equal(repsAt(2999, 1000, 100), 2);
    assert.equal(repsAt(1e9, 1000, 100), 100, "capped at the set");
    assert.equal(clampSet(0), 1);
    assert.equal(clampSet(250.4), 250);
    assert.equal(clampSet(1e9), R.maxSet);
    assert.equal(clampPace(640), 600);
    assert.equal(clampPace(1), R.wordMsMin);
    assert.equal(setXp("a b", 100), 200 * R.xpPerWordRep);
  });

  it("reads saves defensively", () => {
    const s = loadReps({
      set: 50,
      wordMs: 900,
      auto: false,
      items: [
        { id: "a", text: " xyz ", total: 120.7, sets: 2, at: 5 },
        { id: "a", text: "again", total: 1 },
        { id: "b", text: "", total: 3 },
        { id: "c", text: "abc", total: -4 },
        "junk",
      ],
    });
    assert.equal(s.set, 50);
    assert.equal(s.wordMs, 900);
    assert.equal(s.auto, false);
    assert.deepEqual(
      s.items.map((i) => [i.id, i.text, i.total]),
      [
        ["a", "xyz", 120],
        ["c", "abc", 0],
      ],
    );
    const fresh = loadReps(null);
    assert.equal(fresh.items.length, 0);
    assert.equal(fresh.set, R.set);
  });
});
