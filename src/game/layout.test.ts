import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chunkWords,
  clampCenter,
  fitPhrase,
  fitSectors,
  flashUnits,
  layoutSectors,
  overlapArea,
  wordsOf,
  wrapWords,
  type Measure,
} from "./layout.ts";

// Monospace stand-in: each character is 0.6em wide.
const mono: Measure = (text, size) => text.length * size * 0.6;

const SECTORS = [
  "Attention is a blade. Keep it sharp.",
  "The wake core does not bargain with adenosine.",
  "Name the signal and it loses its shadow.",
];

describe("wrapWords", () => {
  it("keeps every word whole and in order", () => {
    const words = wordsOf(SECTORS[1] ?? "");
    const rows = wrapWords(words, 120, 10, mono);
    assert.ok(rows);
    assert.deepEqual(rows.join(" ").split(" "), words);
  });

  it("keeps every row inside the box width", () => {
    const rows = wrapWords(wordsOf(SECTORS[1] ?? ""), 120, 10, mono);
    assert.ok(rows);
    for (const row of rows) assert.ok(mono(row, 10) <= 120, row);
  });

  it("refuses when a single word is wider than the box, rather than cutting it", () => {
    assert.equal(wrapWords(["supercalifragilistic"], 40, 10, mono), null);
  });

  it("measures each word once instead of every growing row", () => {
    const measured: string[] = [];
    const counting: Measure = (text, size) => {
      measured.push(text);
      return mono(text, size);
    };
    const words = wordsOf(SECTORS.join(" "));
    wrapWords(words, 120, 10, counting);
    // One call per word plus one for the space.
    assert.equal(measured.length, words.length + 1);
    assert.ok(measured.every((text) => !text.includes(" ") || text === " "));
  });
});

describe("fitSectors", () => {
  it("shows all text at the largest size that fits", () => {
    const fit = fitSectors(SECTORS, { w: 300, h: 300 }, { min: 6, max: 24 }, mono);
    assert.ok(fit);
    assert.ok(fit.size <= 24 && fit.size >= 6);
    assert.ok(fit.height <= 300);
    const shown = fit.sectors.flat().join(" ").split(" ");
    assert.deepEqual(shown, SECTORS.join(" ").split(/\s+/).filter(Boolean));
  });

  it("returns null when even the minimum size cannot hold the text", () => {
    const huge = Array.from({ length: 400 }, () => SECTORS.join(" ")).join("\n");
    assert.equal(fitSectors([huge], { w: 200, h: 200 }, { min: 9, max: 24 }, mono), null);
  });

  it("does not grow past the maximum size even when there is room", () => {
    const fit = fitSectors(["short"], { w: 1000, h: 1000 }, { min: 6, max: 18 }, mono);
    assert.ok(fit);
    assert.ok(fit.size <= 18);
  });
});

describe("flashUnits", () => {
  it("covers every word once, in order, when joined back together", () => {
    const units = flashUnits(SECTORS, { w: 90, h: 60 }, 9, mono);
    assert.ok(units.length > 1);
    const all = SECTORS.map((s) => wordsOf(s).join(" "))
      .join(" ")
      .split(" ");
    assert.deepEqual(units.join(" ").split(" "), all);
  });

  it("makes each unit as long as it can be: one more word would not fit", () => {
    const box = { w: 90, h: 60 };
    const sector = SECTORS.join(" ");
    const units = flashUnits([sector], box, 9, mono);
    for (let i = 0; i + 1 < units.length; i++) {
      const next = wordsOf(units[i + 1] ?? "")[0] ?? "";
      const lay = layoutSectors([`${units[i]} ${next}`], box, 9, mono);
      assert.ok(!lay || lay.height > box.h, units[i]);
    }
  });

  it("gives a word too wide for the box its own unit instead of cutting it", () => {
    const units = flashUnits(["a supercalifragilistic word here"], { w: 60, h: 60 }, 9, mono);
    assert.deepEqual(units, ["a", "supercalifragilistic", "word here"]);
  });

  it("makes every unit fit the box at the minimum size", () => {
    const box = { w: 90, h: 60 };
    for (const unit of flashUnits(SECTORS, box, 9, mono)) {
      const lay = layoutSectors([unit], box, 9, mono);
      assert.ok(lay && lay.height <= box.h, unit);
    }
  });
});

describe("chunkWords", () => {
  it("takes whole words only and stays near the character cap", () => {
    const words = wordsOf("Attention is a blade. Keep it sharp.");
    const first = chunkWords(words, 0, 16);
    assert.equal(first.text, "Attention is a");
    assert.ok(first.text.length <= 16);
    const second = chunkWords(words, first.next, 16);
    assert.equal(second.text.split(" ")[0], words[first.next]);
  });

  it("always takes at least one word, even if it is longer than the cap", () => {
    const chunk = chunkWords(["extraordinarily"], 0, 4);
    assert.equal(chunk.text, "extraordinarily");
    assert.equal(chunk.next, 1);
  });
});

describe("clampCenter", () => {
  it("keeps a centered item fully inside its span", () => {
    // 100 px item centered at x=10 in a 0..390 span must start at 0, not -40.
    const c = clampCenter(10, 100, 0, 390);
    assert.equal(c - 50, 0);
    const d = clampCenter(385, 100, 0, 390);
    assert.equal(d + 50, 390);
  });

  it("leaves an item alone when it already fits", () => {
    assert.equal(clampCenter(200, 100, 0, 390), 200);
  });

  it("centers an item that is wider than the span", () => {
    assert.equal(clampCenter(10, 500, 0, 390), 195);
  });
});

describe("overlapArea", () => {
  it("measures the shared area of two boxes", () => {
    assert.equal(overlapArea(0, 0, 10, 10, 5, 5, 10, 10), 25);
  });

  it("is zero for boxes that only touch or are apart", () => {
    assert.equal(overlapArea(0, 0, 10, 10, 10, 0, 10, 10), 0);
    assert.equal(overlapArea(0, 0, 10, 10, 50, 50, 10, 10), 0);
  });
});

describe("fitPhrase", () => {
  const sentence = "Integrity is attention that refused to dim under pressure.";

  it("keeps a short phrase on one line at full size", () => {
    const fit = fitPhrase("Keep it sharp.", { w: 300, h: 40 }, { max: 12, min: 6 }, mono);
    assert.equal(fit.size, 12);
    assert.deepEqual(fit.rows, ["Keep it sharp."]);
  });

  it("shrinks and wraps a long phrase, keeping every word in order", () => {
    const box = { w: 120, h: 40 };
    const fit = fitPhrase(sentence, box, { max: 12, min: 6 }, mono);
    assert.ok(fit.size < 12 && fit.size >= 6);
    assert.deepEqual(fit.rows.join(" ").split(" "), wordsOf(sentence));
    for (const row of fit.rows) assert.ok(mono(row, fit.size) <= box.w, row);
    assert.ok(fit.height <= box.h);
  });

  it("never cuts a word, even one wider than the box", () => {
    const fit = fitPhrase(
      "a supercalifragilisticexpialidocious b",
      { w: 40, h: 10 },
      { max: 12, min: 6 },
      mono,
    );
    assert.deepEqual(fit.rows.join(" ").split(" "), [
      "a",
      "supercalifragilisticexpialidocious",
      "b",
    ]);
    for (const row of fit.rows) assert.ok(mono(row, fit.size) <= 40 + 1e-9, row);
  });
});
