import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drawPhrase, hashOf, phraseUnits, progressOf } from "./bag.ts";
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
