/**
 * What the tower-defense game writes: phrases of the loaded text, cut to size,
 * shuffled, each once before any comes again.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkPhrase, textKey, WriteDeck, writingOf } from "./writer.ts";

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

const TEXT = [
  "Name the signal and it loses its shadow. Light is a decision you repeat.",
  "GABA is a velvet drag, do not take its hand, and do not ask it for more time than the tide allows, because the tide always collects what it lends. Sleep.",
  "Integrity is attention that refused to die!",
  "A sphere of rest is a door.",
];

describe("tower-defense writing: phrases of the text", () => {
  it("cuts a long phrase into the fewest pieces of near one size, none over the limit, no word lost", () => {
    const long =
      "GABA is a velvet drag, do not take its hand, and do not ask it for more time than the tide allows, because the tide always collects what it lends.";
    for (const max of [4, 6, 9, 12, 30]) {
      const parts = chunkPhrase(long, max);
      assert.equal(parts.join(" "), long, `max ${max}: the pieces make the phrase`);
      for (const p of parts) assert.ok(words(p).length <= max, `max ${max}: "${p}"`);
      assert.equal(parts.length, Math.ceil(words(long).length / max), `max ${max}: as few as will do`);
    }
    // Broken after a comma when one is near.
    const two = chunkPhrase("The first part is here, and the second part comes after it", 8);
    assert.deepEqual(two, ["The first part is here,", "and the second part comes after it"]);
    assert.deepEqual(chunkPhrase("short one", 5), ["short one"]);
    assert.deepEqual(chunkPhrase("   ", 5), []);
    assert.deepEqual(chunkPhrase("one two three", 0).join(" "), "one two three", "a limit under 1 is 1");
  });

  it("makes every phrase of a text, in order, whole sentences (the very short joined to the next)", () => {
    const all = writingOf(TEXT, 40);
    assert.equal(all[0], "Name the signal and it loses its shadow.");
    assert.equal(all[1], "Light is a decision you repeat.");
    assert.ok(all.some((p) => p.startsWith("GABA is a velvet drag")));
    // Nothing lost, nothing added: the same words, in the same order.
    assert.deepEqual(words(all.join(" ")), words(TEXT.join(" ")));
    // A sentence shorter than min words has the next one on.
    const joined = writingOf(["Yes. No. Maybe so, then, it seems."], 40, 3);
    assert.deepEqual(joined, ["Yes. No. Maybe so, then, it seems."]);
    // Sized: nothing longer than the limit.
    for (const p of writingOf(TEXT, 8)) assert.ok(words(p).length <= 8, p);
    assert.deepEqual(writingOf([], 8), []);
    assert.deepEqual(writingOf(["", "  "], 8), []);
    // A text with no full stop at all is still cut into phrases.
    const flat = writingOf(["one two three four five six seven eight nine ten eleven twelve"], 5);
    assert.ok(flat.length >= 3 && flat.every((p) => words(p).length <= 5));
  });

  it("knows one text from another cheaply", () => {
    assert.equal(textKey(TEXT), textKey([...TEXT]));
    assert.notEqual(textKey(TEXT), textKey(TEXT.slice(1)));
    assert.notEqual(textKey(TEXT), textKey([...TEXT, "One more line."]));
  });
});

describe("tower-defense writing: the deck", () => {
  it("deals every phrase once in a round, in random order, then again, and never opens a round with the last one", () => {
    const rand = seeded(5);
    const deck = new WriteDeck();
    const all = writingOf(TEXT, 8);
    const n = all.length;
    assert.ok(n >= 6, `a text of ${n} phrases`);
    let last = "";
    const orders: string[][] = [];
    for (let round = 0; round < 4; round++) {
      const got: string[] = [];
      for (let i = 0; i < n; i++) {
        const p = deck.next(TEXT, 8, rand);
        assert.ok(p, "a phrase");
        got.push(p!);
        assert.equal(deck.left(), n - 1 - i, "the round counts down");
      }
      assert.deepEqual([...got].sort(), [...all].sort(), `round ${round}: each phrase exactly once`);
      if (round > 0) assert.notEqual(got[0], last, "a new round does not open with the phrase that closed the last");
      last = got[n - 1]!;
      orders.push(got);
    }
    assert.ok(new Set(orders.map((o) => o.join("|"))).size > 1, "the order is random, round to round");
    assert.notDeepEqual(orders[0], all, "and not the text's own order");
  });

  it("starts afresh for another text or another size, and says nothing of an empty one", () => {
    const rand = seeded(9);
    const deck = new WriteDeck();
    deck.next(TEXT, 8, rand);
    deck.next(TEXT, 8, rand);
    const left = deck.left();
    assert.ok(left > 0);
    // Another size: a new round of it.
    deck.next(TEXT, 5, rand);
    assert.equal(deck.left(), writingOf(TEXT, 5).length - 1);
    // Another text: a new round of it.
    const other = ["Only this line, and its twin."];
    const p = deck.next(other, 8, rand);
    assert.equal(p, "Only this line, and its twin.");
    assert.equal(deck.next([], 8, rand), null);
    assert.equal(deck.next(["", ""], 8, rand), null);
    // One phrase alone comes round and round.
    const solo = new WriteDeck();
    assert.equal(solo.next(["Alone."], 8, rand), "Alone. ".trim());
    assert.equal(solo.next(["Alone."], 8, rand), "Alone.");
  });
});
