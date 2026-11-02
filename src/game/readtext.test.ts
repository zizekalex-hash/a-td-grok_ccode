import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import { historyOf, loadReps, logRead, newReps } from "./reps.ts";
import {
  clampPasses,
  clampWordMs,
  loadReader,
  newReader,
  passAt,
  phrasesOfText,
  clampFps,
  clampSpeed,
  editPhrase,
  percentDone,
  placeOf,
  readUnits,
  setPlace,
  textKey,
} from "./readtext.ts";

const R = CONFIG.reader;

describe("read tab", () => {
  it("starts from config.json and keeps every setting in its bounds", () => {
    const s = newReader();
    assert.equal(s.wordMs, R.wordMs);
    assert.equal(s.passes, R.passes);
    assert.equal(clampWordMs(10), R.wordMsMin);
    assert.equal(clampWordMs(1e9), R.wordMsMax);
    assert.equal(clampWordMs(933), 930, "to 10 ms (a typed value stays)");
    assert.equal(clampPasses(0), 1);
    const back = loadReader({
      wordMs: 700,
      passes: 5,
      wordSize: 99,
      font: "mono",
      auto: true,
      at: { a: 4, b: -1, c: "x" },
    });
    assert.deepEqual(
      [back.wordMs, back.passes, back.wordSize, back.font, back.auto, back.at],
      [700, 5, 12, "mono", true, { a: 4 }],
    );
    assert.equal(loadReader("junk").font, newReader().font);
  });

  it("reads a text in order, phrase by phrase, and keeps your place", () => {
    const lines = ["The light is a decision. Name the signal. Go.", "Attention is a blade."];
    const phrases = phrasesOfText(lines);
    assert.deepEqual(phrases, [
      "The light is a decision.",
      "Name the signal. Go.",
      "Attention is a blade.",
    ]);
    const key = textKey("notes");
    assert.equal(
      placeOf({ ...newReader(), at: { "notes|abc": 1 } }, key, 3),
      1,
      "old places still count",
    );
    let s = newReader();
    assert.equal(placeOf(s, key, phrases.length), 0);
    s = setPlace(s, key, 2);
    assert.equal(placeOf(s, key, phrases.length), 2);
    assert.equal(placeOf(s, key, 2), 0, "past the end: from the top");
  });

  it("lights the words one at a time, then the pass is over", () => {
    assert.deepEqual(passAt(4, 900, 0), { word: 0, over: false, progress: 0 });
    assert.equal(passAt(4, 900, 1000).word, 1);
    assert.deepEqual(passAt(4, 900, 3600), { word: 3, over: true, progress: 1 });
  });

  it("puts readings in the history, apart from the reps' totals", () => {
    let s = logRead(newReps(), { at: 5, text: "notes", phrases: 12, ms: 60_000, done: true });
    assert.deepEqual(s.log[0], {
      kind: "read",
      at: 5,
      text: "notes",
      reps: 12,
      ms: 60_000,
      done: true,
    });
    s = loadReps(JSON.parse(JSON.stringify(s)));
    assert.equal(s.log[0]!.kind, "read");
    assert.equal(s.log[0]!.done, true);
    const h = historyOf(s.log, 10);
    assert.equal(h.all.reps, 0, "readings are not reps");
    assert.equal(h.days[0]!.entries.length, 1, "but they are in the day's lines");
  });

  it("rewrites a phrase in its line, and only there", () => {
    const lines = ["The light is a decision. Name the signal. Go.", "Attention is a blade."];
    const units = readUnits(lines);
    assert.deepEqual(
      units.map((u) => u.line),
      [0, 0, 1],
    );
    const fixed = editPhrase(lines, units[1]!, "Name  the  signal  now.");
    assert.deepEqual(fixed, [
      "The light is a decision. Name the signal now.",
      "Attention is a blade.",
    ]);
    assert.deepEqual(editPhrase(lines, units[2]!, ""), [lines[0]], "an emptied line goes");
    assert.deepEqual(
      readUnits(["Same. Same here, said twice. Same here, said twice."], 3).length,
      2,
    );
    assert.equal(percentDone(139, 172), "80.8");
    assert.equal(clampSpeed(9), 4);
    assert.equal(clampFps(0), 1);
  });
});
