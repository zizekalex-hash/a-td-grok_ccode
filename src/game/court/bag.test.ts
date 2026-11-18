import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearTexts,
  deckTexts,
  drawPhrase,
  hashOf,
  percentOf,
  phraseUnits,
  pickFresh,
  progressOf,
  reciteDone,
  type DeckText,
} from "./bag.ts";
import { wordsIn } from "./rules.ts";

function seq(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

const TEXT = [
  [
    "The light is a decision. Name the signal and it loses its shadow. Go.",
    "Attention is a blade, keep it sharp. Integrity is attention that refused to dim.",
    "Why? Because. The wake core does not bargain with adenosine.",
  ],
];

describe("court phrase deck", () => {
  it("splits the texts into whole phrases, each once, covering every word", () => {
    const units = phraseUnits(TEXT, 3);
    assert.deepEqual(units, [
      "The light is a decision.",
      "Name the signal and it loses its shadow. Go.",
      "Attention is a blade, keep it sharp.",
      "Integrity is attention that refused to dim.",
      "Why? Because. The wake core does not bargain with adenosine.",
    ]);
    const words = (xs: string[]) => xs.flatMap((x) => wordsIn(x)).length;
    assert.equal(words(units), words(TEXT.flat()), "nothing left out");
    assert.equal(
      phraseUnits([[...TEXT[0]!, TEXT[0]![0]!]], 3).length,
      5,
      "the same phrase twice is one",
    );
  });

  it("deals every phrase once, at random, before any comes again", () => {
    const units = phraseUnits(TEXT, 3);
    const used = new Set<string>();
    const rand = seq(3);
    const first = Array.from({ length: units.length }, () => drawPhrase(units, used, rand)!);
    assert.equal(new Set(first.map((d) => d.phrase)).size, units.length, "no repeats");
    assert.ok(first.every((d) => !d.cycled));
    assert.deepEqual(progressOf(units, used), { done: units.length, total: units.length });
    assert.notDeepEqual(
      first.map((d) => d.phrase),
      units,
      "not in the text's order",
    );
    // All done: a new round, not starting with the one that came last.
    const last = first[first.length - 1]!.phrase;
    const again = drawPhrase(units, used, () => 0.99, last)!;
    assert.ok(again.cycled);
    assert.notEqual(again.phrase, last);
    assert.equal(progressOf(units, used).done, 1);
  });

  it("carries on when a text is added, without repeating what came", () => {
    const units = phraseUnits(TEXT, 3);
    const used = new Set<string>();
    const rand = seq(9);
    const came = [drawPhrase(units, used, rand)!.phrase, drawPhrase(units, used, rand)!.phrase];
    // Kept as hashes between visits.
    const kept = new Set([...used]);
    const more = phraseUnits([...TEXT, ["A new text arrives here. It brings two phrases."]], 3);
    const rest = Array.from(
      { length: more.length - 2 },
      () => drawPhrase(more, kept, rand)!.phrase,
    );
    for (const c of came) assert.ok(!rest.includes(c), c);
    assert.equal(new Set(rest).size, rest.length);
    assert.ok(rest.includes("A new text arrives here."));
    assert.equal(hashOf("x"), hashOf("x"));
    assert.equal(drawPhrase([], new Set(), rand), null);
  });
});

describe("texts recited through", () => {
  const lines = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `The ${tag} sentence number ${i + 1} reads just like this one does.`);
  const lib = [
    { key: "a", name: "Gates", lines: lines(10, "gate") },
    { key: "b", name: "Lamps", lines: lines(4, "lamp"), folder: "Zip" },
  ];
  const seeded = (seed: number) => {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  };

  it("counts a text's phrases, from what was done before", () => {
    const first = deckTexts(lib, 3, new Set());
    assert.equal(first[0]!.hashes.size, 10);
    assert.equal(first[1]!.folder, "Zip");
    assert.equal(first[0]!.done, 0);
    const some = new Set(first[0]!.units.slice(0, 3).map(hashOf));
    const again = deckTexts(lib, 3, some);
    assert.equal(again[0]!.done, 3);
    assert.equal(again[1]!.done, 0);
    assert.equal(percentOf(3, 10), 30);
    assert.equal(percentOf(0, 0), 0);
    assert.equal(percentOf(999, 1000), 99, "not 100 until it is");
    assert.equal(percentOf(1000, 1000), 100);
  });

  it("recites a text through at random: 10 of 100 is 10%, the 100th finishes it, and it begins fresh", () => {
    const big = [{ key: "big", name: "Big", lines: lines(100, "big") }];
    const done = new Set<string>();
    const texts = deckTexts(big, 3, done);
    const t = texts[0]!;
    assert.equal(t.hashes.size, 100);
    const rand = seeded(5);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const p = pickFresh(t.units, done, rand, [])!;
      assert.ok(!seen.has(p), "never the same phrase twice in a round");
      seen.add(p);
      assert.deepEqual(reciteDone(texts, done, p), []);
    }
    assert.equal(t.done, 10);
    assert.equal(percentOf(t.done, t.hashes.size), 10, "10 of 100 is 10%");
    assert.equal(done.size, 10);
    // Random: not in the text's own order.
    assert.notDeepEqual([...seen], t.units.slice(0, 10));
    let finished: DeckText[] = [];
    for (let i = 10; i < 100; i++) {
      const p = pickFresh(t.units, done, rand, [])!;
      assert.ok(!seen.has(p));
      seen.add(p);
      finished = reciteDone(texts, done, p);
      if (i < 99) assert.deepEqual(finished, [], `phrase ${i + 1}`);
    }
    assert.equal(seen.size, 100, "every phrase came exactly once");
    assert.deepEqual(finished.map((f) => f.key), ["big"], "the 100th finishes it");
    assert.equal(t.done, 0, "and a fresh round begins");
    assert.equal(done.size, 0);
    assert.ok(pickFresh(t.units, done, rand, []), "phrases come again");
  });

  it("finishes each text by itself when several are mixed, leaving the others as they are", () => {
    const done = new Set<string>();
    const texts = deckTexts(lib, 3, done);
    const [gates, lamps] = texts as [DeckText, DeckText];
    for (const p of gates.units.slice(0, 5)) reciteDone(texts, done, p);
    assert.equal(gates.done, 5);
    let finished: DeckText[] = [];
    for (const p of lamps.units) finished = reciteDone(texts, done, p);
    assert.deepEqual(finished.map((f) => f.key), ["b"]);
    assert.equal(lamps.done, 0);
    assert.equal(gates.done, 5, "the other text keeps what it had");
    assert.equal(done.size, 5);
  });

  it("counts a phrase two texts share for both, and clears it from both", () => {
    const shared = "The very same sentence is found in two different texts here.";
    const two = [
      { key: "x", name: "X", lines: [shared] },
      { key: "y", name: "Y", lines: [shared, "And Y has one more sentence that X does not have at all."] },
    ];
    const done = new Set<string>();
    const texts = deckTexts(two, 3, done);
    assert.deepEqual(reciteDone(texts, done, shared).map((t) => t.key), ["x"], "X is only that sentence");
    assert.equal(texts[1]!.done, 0, "cleared from Y too: it begins again with the rest");
    assert.equal(done.size, 0);
  });

  it("does not bring a skipped phrase straight back, and never runs dry", () => {
    const units = ["one one one", "two two two", "three three three"];
    const done = new Set<string>();
    const rand = seeded(9);
    for (let i = 0; i < 30; i++) {
      const p = pickFresh(units, done, rand, ["one one one", "two two two"])!;
      assert.equal(p, "three three three", "the others were avoided while there was another");
    }
    // Everything avoided: one of them anyway.
    assert.ok(units.includes(pickFresh(units, done, rand, units)!));
    // Everything done: the deck still gives a phrase.
    for (const u of units) done.add(hashOf(u));
    assert.ok(units.includes(pickFresh(units, done, rand, [])!));
    assert.equal(pickFresh([], done, rand), null);
  });

  it("starts a text again from nothing", () => {
    const done = new Set<string>();
    const texts = deckTexts(lib, 3, done);
    for (const p of texts[0]!.units.slice(0, 4)) reciteDone(texts, done, p);
    assert.equal(texts[0]!.done, 4);
    clearTexts(texts, done, [texts[0]!]);
    assert.equal(texts[0]!.done, 0);
    assert.equal(done.size, 0);
  });
});
