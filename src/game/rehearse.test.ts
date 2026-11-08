import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addPhrases,
  countRep,
  currentPhrase,
  defaultSettings,
  loadRehearse,
  newRehearse,
  phraseBytes,
  phraseSignal,
  phrasesOf,
  cycleSignal,
  cycleSpeeds,
  loadRehearse as load,
  rawSamples,
  soundOf,
  removePhrase,
  resetCount,
  resetCounts,
  signalFit,
  step,
  totalReps,
} from "./rehearse.ts";

const ids = (i: number) => `p${i}`;

describe("rehearse: phrases and their counts", () => {
  it("adds phrases once each, counts a rep a tap, resets one or all and keeps the phrases", () => {
    let s = newRehearse();
    const made = addPhrases(
      s,
      ["Stay with the cyan.", "  stay  WITH the cyan. ", "Keep it sharp", ""],
      1,
      ids,
    );
    assert.equal(made.added, 2, "the same phrase in other case or spacing is skipped");
    s = made.state;
    assert.equal(currentPhrase(s)?.text, "Stay with the cyan.");
    s = countRep(s, "p0", 10);
    s = countRep(s, "p0", 20);
    s = countRep(s, "p1", 30);
    assert.equal(s.items[0]!.count, 2);
    assert.equal(s.items[0]!.last, 20);
    assert.equal(totalReps(s), 3);
    s = resetCount(s, "p0");
    assert.equal(s.items[0]!.count, 0);
    assert.equal(s.items.length, 2, "the phrase stays");
    assert.equal(totalReps(s), 1);
    s = resetCounts(s);
    assert.equal(totalReps(s), 0);
    assert.equal(s.items.length, 2);
  });

  it("moves round the list, and removing the current phrase moves to the next", () => {
    let s = addPhrases(newRehearse(), ["a b", "c d", "e f"], 1, ids).state;
    s = step(s, -1);
    assert.equal(currentPhrase(s)?.id, "p2", "before the first is the last");
    s = step(s, 1);
    s = step(s, 1);
    assert.equal(currentPhrase(s)?.id, "p1");
    s = removePhrase(s, "p1");
    assert.equal(currentPhrase(s)?.id, "p2");
    s = removePhrase(s, "p2");
    assert.equal(currentPhrase(s)?.id, "p0");
  });

  it("takes phrases from a text, list marks off, and checks a save", () => {
    assert.deepEqual(phrasesOf("- One phrase. Two phrase!\n2. Three\n\n"), [
      "One phrase.",
      "Two phrase!",
      "Three",
    ]);
    assert.deepEqual(phrasesOf("Keep this. Whole", false), ["Keep this. Whole"]);
    const back = loadRehearse({
      items: [
        { id: "a", text: " x ", count: 4.7, last: 5, at: 1 },
        { id: "a", text: "dup id" },
        { id: "", text: "no id" },
        { id: "b", text: "" },
      ],
      current: "zzz",
      settings: {
        signalMs: 99_999,
        amp: 3,
        rawRate: 2,
        layers: { rgb: -1, gray: 0.5 },
        emit: "full",
        tapHeight: 1,
      },
    });
    assert.equal(back.items.length, 1);
    assert.deepEqual(back.items[0], { id: "a", text: "x", count: 4, last: 5, at: 1 });
    assert.equal(back.current, "", "an unknown current is dropped");
    assert.equal(back.settings.signalMs, 60_000);
    assert.equal(back.settings.amp, 1);
    assert.equal(back.settings.rawRate, 2, "below 1000 too");
    assert.equal(back.settings.mode, "steady");
    assert.equal(back.settings.nonstop, false);
    assert.deepEqual(back.settings.layers, { rgb: 0, gray: 0.5, bits: 0.36 });
    assert.equal(back.settings.emit, "full");
    assert.equal(back.settings.tapHeight, 15);
    const d = defaultSettings();
    assert.equal(d.signalMs, 900);
    assert.equal(d.amp, 0.9);
    assert.deepEqual(d.layers, { rgb: 0.36, gray: 0.36, bits: 0.36 });
  });
});

describe("rehearse: the phrase as sound", () => {
  it("is the phrase's own bytes, centred", () => {
    const raw = rawSamples(phraseBytes("abc"));
    assert.equal(raw.length, 3);
    const mean = raw.reduce((n, v) => n + v, 0) / raw.length;
    assert.ok(Math.abs(mean) < 1e-6, "no offset");
    assert.ok(raw[2]! > raw[1]! && raw[1]! > raw[0]!, "c above b above a");
    // Bytes all the same would be silent: their bits sound instead.
    const one = rawSamples(phraseBytes("I"));
    assert.equal(one.length, 8);
    assert.ok(one.some((v) => v !== 0));
  });

  it("repeats a short phrase to fill the time, and speeds up a long one to fit it", () => {
    // 800 bytes at 8000 a second last 0.1 s: 9 plays in 0.9 s, at speed 1.
    const short = signalFit(800, 8000, 900);
    assert.equal(Math.round(short.naturalMs), 100);
    assert.equal(short.speed, 1);
    assert.equal(Math.round(short.plays), 9);
    // 14 400 bytes last 1.8 s: twice as fast, played once.
    const long = signalFit(14_400, 8000, 900);
    assert.equal(long.speed, 2);
    assert.equal(Math.round(long.plays), 1);
  });

  it("lasts exactly the set time and peaks at the set loudness, whatever the phrase", () => {
    const opts = { signalMs: 900, amp: 0.9, rawRate: 8000 };
    for (const text of [
      "abc",
      "The chloride gradient is reversed.",
      "ü ñ ✓",
      "x".repeat(20_000) + "y",
    ]) {
      const s = phraseSignal(text, 48_000, opts);
      assert.equal(s.length, 43_200, text.slice(0, 20));
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(Math.abs(peak - 0.9) < 1e-6, `${text.slice(0, 20)}: peak ${peak}`);
    }
    const quiet = phraseSignal("abc", 8000, { ...opts, amp: 0.09 });
    assert.ok(Math.abs(quiet.reduce((m, v) => Math.max(m, Math.abs(v)), 0) - 0.09) < 1e-6);
    // At the raw rate itself, a short phrase is its bytes over and over.
    const raw = rawSamples(phraseBytes("abc"));
    const at = phraseSignal("abc", 8000, { ...opts, amp: 1 });
    const k = 1 / Math.max(...raw.map(Math.abs));
    for (let i = 0; i < 9; i++) assert.ok(Math.abs(at[i]! - raw[i % 3]! * k) < 1e-6);
    assert.equal(
      phraseSignal("abc", 8000, { ...opts, amp: 0 }).every((v) => v === 0),
      true,
    );
  });

  it("runs a rising cycle: plays from x1 to x9, each at the peak, in one length each", () => {
    assert.deepEqual(cycleSpeeds(9, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(cycleSpeeds(3, 5), [1, 3, 5]);
    const opts = { signalMs: 100, amp: 0.9, rawRate: 8000, plays: 9, topSpeed: 9 };
    const cyc = cycleSignal("Oxygenation", 48_000, opts);
    const n = 4800;
    assert.equal(cyc.length, 9 * n, "nine plays of 100 ms");
    for (let k = 0; k < 9; k++) {
      const part = cyc.subarray(k * n, (k + 1) * n);
      const peak = part.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(Math.abs(peak - 0.9) < 1e-6, `play ${k + 1} at the peak (${peak})`);
    }
    // Each play higher: the ninth crosses zero far more often than the first.
    const crossings = (a: Float32Array) =>
      a.reduce((m, v, i) => m + (i && Math.sign(v) !== Math.sign(a[i - 1]!) ? 1 : 0), 0);
    assert.ok(crossings(cyc.subarray(8 * n)) > crossings(cyc.subarray(0, n)) * 3);
    // Steady is the plain signal; a long cycle keeps within a minute.
    assert.deepEqual(
      soundOf("ab", 8000, { ...opts, mode: "steady" }),
      phraseSignal("ab", 8000, opts),
    );
    assert.equal(
      soundOf("ab", 100, { ...opts, mode: "cycle", signalMs: 60_000, plays: 10 }).length,
      10 * 600,
    );
    const back = load({ settings: { mode: "cycle", plays: 500, topSpeed: 0, nonstop: true } });
    assert.equal(back.settings.mode, "cycle");
    assert.equal(back.settings.plays, 99);
    assert.equal(back.settings.topSpeed, 1);
    assert.equal(back.settings.nonstop, true);
  });
});
