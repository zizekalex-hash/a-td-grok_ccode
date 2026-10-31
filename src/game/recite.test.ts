import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { byName, gateOpen, readChunk, readPhrase, sectorWords, wrapped, type Cursor } from "./reader.ts";
import {
  coreDamageMultiplier,
  coreLevel,
  levelForXp,
  recallScore,
  recallXp,
  repAt,
  repXp,
  tapRep,
  wordIndexAt,
  xpForLevel,
  WORD_MS,
} from "./recite.ts";

describe("readChunk", () => {
  it("walks the text in order, whole words only, then wraps", () => {
    const lines = ["Attention is a blade. Keep it sharp.", "Name the signal."];
    const cur: Cursor = { line: 0, word: 0 };
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) seen.push(readChunk(lines, cur, 16));
    assert.ok(seen.every((t) => t.split(" ").every((w) => lines.join(" ").includes(w))));
    assert.equal(seen[0], "Attention is a");
    // Two sectors are short, so the reader must come back around to the start.
    assert.ok(seen.indexOf(seen[0] as string, 1) > 0);
  });

  it("returns the fallback word when there is no text", () => {
    assert.equal(readChunk([], { line: 0, word: 0 }, 10), "WAKE");
  });
});

describe("readPhrase", () => {
  it("returns whole sentences, each ending at its full stop, then moves on", () => {
    const lines = [
      "Attention is a blade. Keep it sharp!",
      "Name the signal and it loses its shadow.",
    ];
    const cur: Cursor = { line: 0, word: 0 };
    const seen = [
      readPhrase(lines, cur),
      readPhrase(lines, cur),
      readPhrase(lines, cur),
      readPhrase(lines, cur),
    ];
    assert.deepEqual(seen, [
      "Attention is a blade.",
      "Keep it sharp!",
      "Name the signal and it loses its shadow.",
      "Attention is a blade.",
    ]);
  });

  it("keeps a nine-word sentence together however long its words are", () => {
    const sentence = "Integrity is attention that refused to dim under pressure.";
    assert.equal(readPhrase([sentence], { line: 0, word: 0 }), sentence);
  });

  it("treats a sector without punctuation as one phrase, and counts quotes after the stop", () => {
    assert.equal(readPhrase(["no stop here at all"], { line: 0, word: 0 }), "no stop here at all");
    const cur: Cursor = { line: 0, word: 0 };
    assert.equal(readPhrase(['She said "wake." Then left.'], cur), 'She said "wake."');
    assert.equal(readPhrase(['She said "wake." Then left.'], cur), "Then left.");
  });

  it("only splits a phrase longer than the word cap", () => {
    const long = Array.from({ length: 10 }, (_, i) => `w${i}`).join(" ");
    const cur: Cursor = { line: 0, word: 0 };
    assert.equal(readPhrase([long], cur, 6), "w0 w1 w2 w3 w4 w5");
    assert.equal(readPhrase([long], cur, 6), "w6 w7 w8 w9");
  });
});

describe("sectorWords", () => {
  it("returns the words of one sector and wraps the index", () => {
    const lines = ["abc abc abc", "x y"];
    assert.deepEqual(sectorWords(lines, 0), ["abc", "abc", "abc"]);
    assert.deepEqual(sectorWords(lines, 2), ["abc", "abc", "abc"]);
  });
});

describe("skill levels", () => {
  it("uses the RuneScape curve: level 2 at 83 XP, level 99 at 13,034,431 XP", () => {
    assert.equal(xpForLevel(2), 83);
    assert.equal(xpForLevel(99), 13034431);
  });

  it("maps XP back to the level it reaches", () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(82), 1);
    assert.equal(levelForXp(83), 2);
    assert.equal(levelForXp(1e12), 99);
  });
});

describe("rhythm drill", () => {
  it("holds each word for 0.9 s, so 'abc abc abc' is one 2.7 s pass", () => {
    assert.equal(WORD_MS, 900);
    assert.equal(wordIndexAt(3, 0), 0);
    assert.equal(wordIndexAt(3, 900), 1);
    assert.equal(wordIndexAt(3, 1800), 2);
    assert.equal(wordIndexAt(3, 2700), 0);
    assert.equal(repAt(3, 2699), 0);
    assert.equal(repAt(3, 2700), 1);
  });

  it("counts one tap as one rep, and ignores extra taps in the same pass", () => {
    let state = { reps: 0, lastCountedRep: -1 };
    const first = tapRep(state, 0);
    assert.equal(first.counted, true);
    state = first.state;
    const again = tapRep(state, 0);
    assert.equal(again.counted, false);
    assert.equal(again.state.reps, 1);
    const next = tapRep(again.state, 1);
    assert.equal(next.counted, true);
    assert.equal(next.state.reps, 2);
  });

  it("pays XP per word for each completed rep", () => {
    assert.equal(repXp(3, 1), 6);
    assert.equal(repXp(3, 10), 60);
  });
});

describe("recall", () => {
  it("scores a perfect recall as 1 and ignores case and punctuation", () => {
    assert.equal(
      recallScore("attention is a blade keep it sharp", "Attention is a blade. Keep it sharp."),
      1,
    );
  });

  it("lowers the score when words are missing or out of order", () => {
    assert.equal(recallScore("abc", "abc def ghi"), 1 / 3);
    assert.equal(recallScore("def abc", "abc def"), 0.5);
  });

  it("turns the score into XP", () => {
    assert.equal(recallXp(3, 1), 18);
    assert.equal(recallXp(3, 0), 0);
    assert.equal(recallXp(3, 2), 18);
  });
});

describe("core level", () => {
  it("follows the recitation skill", () => {
    assert.equal(coreLevel({ recitation: 0, recall: 5000 }), 1);
    assert.equal(coreLevel({ recitation: xpForLevel(12), recall: 0 }), 12);
  });

  it("adds damage per level above one, up to the cap", () => {
    assert.equal(coreDamageMultiplier(1, 0.02, 0.5), 1);
    assert.ok(Math.abs(coreDamageMultiplier(11, 0.02, 0.5) - 1.2) < 1e-9);
    assert.equal(coreDamageMultiplier(99, 0.02, 0.5), 1.5);
    assert.equal(coreDamageMultiplier(0, 0.02, 0.5), 1);
  });
});

describe("reading through several texts", () => {
  it("knows when a read has finished the text and started it again", () => {
    const lines = ["One. Two.", "Three."];
    const cur: Cursor = { line: 0, word: 0 };
    const seen: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const before = { ...cur };
      readPhrase(lines, cur);
      seen.push(wrapped(before, cur, lines.length));
    }
    // One, Two, Three (end of the text), One, Two, Three (end again).
    assert.deepEqual(seen, [false, false, true, false, false, true]);
  });

  it("finishes a one-sector text on its last phrase only", () => {
    const lines = ["A b. C d."];
    const cur: Cursor = { line: 0, word: 0 };
    const before = { ...cur };
    readPhrase(lines, cur);
    assert.equal(wrapped(before, cur, 1), false);
    const mid = { ...cur };
    readPhrase(lines, cur);
    assert.equal(wrapped(mid, cur, 1), true);
  });

  it("orders files the way people number them", () => {
    assert.deepEqual(["10.txt", "2.txt", "1.txt", "b.txt", "A.txt"].sort(byName), ["1.txt", "2.txt", "10.txt", "A.txt", "b.txt"]);
  });
});

describe("pauses between phrases and texts", () => {
  it("keeps the least gap after a phrase, and waits out a text's pause", () => {
    const g = { until: 0, last: -Infinity };
    assert.ok(gateOpen(g, 0, 300), "the first phrase may come at once");
    g.last = 1000;
    assert.equal(gateOpen(g, 1200, 300), false, "too soon after the last");
    assert.ok(gateOpen(g, 1300, 300));
    assert.ok(gateOpen(g, 1001, 0), "no gap set");
    g.until = 5000;
    assert.equal(gateOpen(g, 4999, 0), false, "inside the pause between texts");
    assert.ok(gateOpen(g, 5000, 0));
  });
});
