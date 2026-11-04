import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  addItem,
  addMany,
  addReps,
  phraseIndex,
  pickBonus,
  nextPart,
  estimateReps,
  clampMinutes,
  phrasesFromText,
  cancelSet,
  clampSet,
  clearHistory,
  historyOf,
  localDay,
  clock,
  finishSet,
  grandTime,
  grandTotal,
  perRep,
  seconds,
  loadReps,
  newReps,
  removeItem,
  recordReps,
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
    assert.deepEqual(s.active, { id: "a", target: 100, since: T, mode: "count" });
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
    assert.deepEqual(s.active, { id: "a", target: 100, since: 1234, mode: "count" });
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

  it("keeps a history of every set and reset, that resets do not clear", () => {
    const DAY = 86_400_000;
    const T = 1_700_000_000_000;
    let s = addItem({ ...newReps(), set: 10 }, "xyz", 1, "a").state;
    s = addItem(s, "abc", 2, "b").state;
    s = finishSet(startSet(s, "a", T - DAY), T - DAY + 12_000); // yesterday: 10 xyz in 0:12
    s = finishSet(startSet(s, "a", T), T + 20_000); // today: 10 xyz in 0:20
    s = finishSet(startSet(s, "b", T + 60_000), T + 75_000); // today: 10 abc in 0:15
    assert.deepEqual(
      s.log.map((e) => [e.kind, e.text, e.reps, e.ms]),
      [
        ["set", "abc", 10, 15_000],
        ["set", "xyz", 10, 20_000],
        ["set", "xyz", 10, 12_000],
      ],
      "newest first",
    );
    s = resetAll(s, T + 90_000);
    assert.deepEqual(
      [s.log[0]!.kind, s.log[0]!.reps, s.log[0]!.ms],
      ["reset", 30, 47_000],
      "a reset is marked with what it cleared",
    );
    assert.equal(s.log.length, 4, "and the sets stay");
    const h = historyOf(s.log, T + 100_000);
    assert.deepEqual(h.all, { reps: 30, ms: 47_000, sets: 3 });
    assert.deepEqual(h.today, { reps: 20, ms: 35_000, sets: 2 });
    assert.deepEqual(
      h.phrases.map((p) => [p.text, p.reps, p.ms, p.sets]),
      [
        ["xyz", 20, 32_000, 2],
        ["abc", 10, 15_000, 1],
      ],
    );
    assert.deepEqual(
      h.days.map((d) => [d.day - localDay(T), d.reps, d.entries.length]),
      [
        [0, 20, 3],
        [-1, 10, 1],
      ],
      "days newest first, with the reset among today's lines",
    );
    // Deleting a phrase keeps its history; clearing the history clears the totals too (the phrases stay).
    s = finishSet(startSet(s, "a", T + 100_000), T + 112_000);
    s = removeItem(s, "b");
    assert.ok(s.log.some((e) => e.text === "abc"));
    const cleared = clearHistory(s);
    assert.equal(cleared.log.length, 0);
    assert.equal(cleared.items.length, s.items.length, "the phrases stay");
    assert.equal(cleared.items[0]!.text, s.items[0]!.text);
    assert.deepEqual(
      cleared.items.map((i) => [i.total, i.sets, i.ms, i.last]),
      cleared.items.map(() => [0, 0, 0, 0]),
      "History and Reps agree: both start from 0",
    );
    assert.equal(grandTotal(cleared), 0);
    // It reads back from a save.
    const back = loadReps(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back.log, s.log);
    assert.deepEqual(
      loadReps({ log: [{ kind: "set", at: 5, text: "x", reps: 2.5, ms: -1 }, { kind: "?" }, 7] })
        .log,
      [{ kind: "set", at: 5, text: "x", reps: 2, ms: 0 }],
    );
    // The history is capped.
    let big = addItem(newReps(), "q", 1, "q").state;
    big = { ...big, set: 1 };
    for (let i = 0; i < R.historyKeep + 5; i++)
      big = finishSet(startSet(big, "q", i * 10_000), i * 10_000 + 5000);
    assert.equal(big.log.length, R.historyKeep);
  });

  it("picks phrases out of a text, and knows which are on the list or done before", () => {
    const text = [
      "The light is a decision. Name the signal!  Name the signal!",
      "- Attention is a blade",
      "  2. keep it sharp   ",
      "",
      "...",
      "Why? Because.",
    ].join("\n");
    assert.deepEqual(phrasesFromText(text), [
      "The light is a decision.",
      "Name the signal!",
      "Attention is a blade",
      "keep it sharp",
      "Why?",
      "Because.",
    ]);
    assert.equal(phrasesFromText(text, 2).length, 2);
    assert.deepEqual(
      phrasesFromText("Name the signal. It loses its shadow.\n- xyz\n\nxyz", 50, false),
      ["Name the signal. It loses its shadow.", "xyz"],
      "a pasted list keeps each line whole",
    );
    // "name the signal!" is on the list, "Why?" was done before and deleted.
    let s = addItem({ ...newReps(), set: 10 }, "name the signal!", 1, "a").state;
    s = addItem(s, "Why?", 2, "b").state;
    s = finishSet(startSet(s, "b", 10), 20_000);
    s = finishSet(startSet(s, "a", 30_000), 45_000);
    s = removeItem(s, "b");
    const status = phraseIndex(s);
    const on = status("Name the signal!");
    assert.equal(on.kind, "on");
    assert.equal(on.kind === "on" && on.item.total, 10);
    assert.deepEqual(status("why?"), { kind: "done", reps: 10, ms: 19_990 });
    assert.deepEqual(status("Because."), { kind: "new" });
    // Adding several: the ones on the list are not added twice; the first picked is on top.
    const r = addMany(s, ["Attention is a blade", "NAME THE SIGNAL!", "keep it sharp"], 99);
    assert.equal(r.added, 2);
    assert.deepEqual(
      r.state.items.map((i) => i.text),
      ["Attention is a blade", "keep it sharp", "name the signal!"],
    );
    assert.equal(new Set(r.state.items.map((i) => i.id)).size, 3, "every id different");
  });

  it("picks a short word or phrase at random for a bonus set", () => {
    let s = addItem(newReps(), "one", 1, "a").state;
    s = addItem(s, "two words", 2, "b").state;
    s = addItem(s, "a phrase of more than nine words, long enough to leave out", 3, "c").state;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickBonus(s, () => i / 40, 9)!.id);
    assert.deepEqual([...seen].sort(), ["a", "b"], "only phrases of up to 9 words");
    assert.equal(pickBonus(s, () => 0.99, 9, "b")!.id, "a", "not the last one again");
    const long = addItem(
      newReps(),
      "a phrase of more than nine words, long enough to use anyway",
      1,
      "x",
    ).state;
    assert.equal(pickBonus(long, () => 0.5, 9)!.id, "x", "all of them when none is short");
    assert.equal(pickBonus(long, () => 0.5, 9, "x")!.id, "x", "the only one, again");
    assert.equal(
      pickBonus(newReps(), () => 0.5, 9),
      null,
    );
  });

  it("runs timed sets: repeat until the time is up, then the time (and, in both mode, the reps) count", () => {
    const T = 5_000_000;
    let s = addItem({ ...newReps(), mode: "timer" as const, minutes: 3 }, "xyz", 1, "a").state;
    s = startSet(s, "a", T);
    assert.deepEqual(s.active, { id: "a", target: 0, since: T, mode: "timer", duration: 180_000 });
    assert.equal(timeLeft(s.active!, T + 60_000), 120_000, "a countdown");
    assert.equal(finishSet(s, T + 179_999), s, "not before the time is up");
    s = finishSet(s, T + 400_000);
    assert.equal(s.items[0]!.total, 0, "a timer set adds no reps");
    assert.equal(s.items[0]!.ms, 180_000, "just its own three minutes, however late Done was");
    assert.equal(s.items[0]!.sets, 1);
    assert.deepEqual([s.log[0]!.reps, s.log[0]!.ms, s.log[0]!.timed], [0, 180_000, true]);
    // Both: the reps, then the timer, one after the other.
    let b = startSet({ ...s, set: 10 }, "a", T, { mode: "both", minutes: 2 });
    assert.equal(b.active!.part, 0);
    assert.equal(timeLeft(b.active!, T), 10_000, "the reps first: a second a rep");
    assert.equal(finishSet(b, T + 999_999), b, "not finished in the first part");
    assert.equal(nextPart(b, T + 9_000), b, "on to the timer only when the reps' time is up");
    b = nextPart(b, T + 15_000);
    assert.deepEqual(
      [b.active!.part, b.active!.partSince, b.active!.doneMs],
      [1, T + 15_000, 15_000],
    );
    assert.equal(timeLeft(b.active!, T + 15_000), 120_000, "then the timer");
    assert.equal(finishSet(b, T + 100_000), b, "not before the timer is up");
    const before = b.items[0]!;
    b = finishSet(b, T + 200_000);
    assert.equal(b.items[0]!.total, before.total + 10, "the reps count");
    assert.equal(b.items[0]!.ms, before.ms + 15_000 + 120_000, "the reps' time, then the timer's");
    assert.deepEqual([b.log[0]!.reps, b.log[0]!.ms, b.log[0]!.timed], [10, 135_000, true]);
    // The timer first, if chosen.
    let f = startSet({ ...s, set: 5, first: "timer" as const }, "a", T, {
      mode: "both",
      minutes: 1,
    });
    assert.equal(timeLeft(f.active!, T), 60_000, "the timer first");
    f = nextPart(f, T + 61_000);
    assert.equal(timeLeft(f.active!, T + 61_000), 5_000, "then the reps");
    f = finishSet(f, T + 70_000);
    assert.equal(f.log[0]!.ms, 60_000 + 9_000);
    assert.equal(estimateReps(120_000), 60);
    // A count set as given, whatever the mode.
    const c = startSet(s, "a", T, { mode: "count", target: 7 });
    assert.deepEqual(c.active, { id: "a", target: 7, since: T, mode: "count" });
    assert.equal(clampMinutes(0), 1);
    assert.equal(clampMinutes(1e6), R.timer.maxMinutes);
    // It reads back, mode and all.
    const back = loadReps(
      JSON.parse(JSON.stringify({ ...s, active: startSet(s, "a", T, { minutes: 4 }).active })),
    );
    assert.equal(back.mode, "timer");
    assert.equal(back.minutes, 3);
    assert.deepEqual(back.active, {
      id: "a",
      target: 0,
      since: T,
      mode: "timer",
      duration: 240_000,
    });
    assert.equal(back.log[0]!.timed, true);
    assert.equal(loadReps({ mode: "nonsense" }).mode, "count");
  });
});

describe("reps done elsewhere", () => {
  it("count into the phrase's total and the History, as one set", () => {
    const { state, id } = addItem(newReps(), "name the signal", 1);
    const s = recordReps(state, id, 12, 11_000, 5_000);
    assert.equal(s.items[0]!.total, 12);
    assert.equal(s.items[0]!.sets, 1);
    assert.equal(s.items[0]!.ms, 11_000);
    assert.deepEqual(s.log[0], {
      kind: "set",
      at: 5_000,
      text: "name the signal",
      reps: 12,
      ms: 11_000,
    });
    assert.equal(recordReps(s, "nope", 3, 1, 1), s, "an unknown phrase changes nothing");
    assert.equal(recordReps(s, id, 0, 1, 1), s);
  });
});
