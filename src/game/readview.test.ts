import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  clampFlashEvery,
  clampFlashMs,
  clampFlashSize,
  clampPanelOpacity,
  clampCopies,
  clampFlashChars,
  clampPerHit,
  clampPhraseChars,
  clampStreamMs,
  clampPlace,
  clampSilence,
  loadReader,
  newReader,
  nudge,
} from "./readtext.ts";
import {
  bytesPicture,
  flashPages,
  flashRounds,
  hitCount,
  hitWords,
  pixelCount,
  reversedPhrases,
  sideCounts,
  streamHit,
  streamStart,
  streamWords,
  wrapWords,
} from "./readview.ts";

const R = CONFIG.reader;

describe("read tab: look, background and flash", () => {
  it("starts from config.json and checks every look setting from a save", () => {
    const s = newReader();
    assert.equal(s.accent, R.accent);
    assert.equal(s.flashEvery, R.flashEvery);
    assert.equal(s.flashMs, R.flashMs);
    assert.equal(s.flashSize, R.flashSize);
    assert.equal(s.flashOpacity, R.flashOpacity);
    assert.deepEqual(s.layers, { rgb: R.bytesRgb, gray: R.bytesGray, bits: R.bytesBits });
    assert.equal(s.phraseChars, R.phraseChars);
    assert.equal(s.locked, true);
    const back = loadReader({
      accent: "nope",
      panelOpacity: 0,
      wordX: -3,
      phraseY: 0.61234,
      placesV: 2,
      layers: { rgb: 0.3, gray: -1, bits: "x" },
      phraseChars: 3,
      bytesOpacity: 7,
      flash: false,
      flashEvery: 0,
      flashMs: 9.94,
      flashSize: 200,
      tab: "flash",
      locked: false,
    });
    assert.equal(back.accent, s.accent, "an unknown colour keeps the default");
    assert.equal(back.panelOpacity, 0.1, "the panel never quite goes");
    assert.equal(back.wordX, 0.02);
    assert.equal(back.phraseY, 0.612);
    assert.equal(
      loadReader({ wordY: 0.9, phraseY: 0.1 }).wordY,
      s.wordY,
      "places kept the old way start from the defaults",
    );
    assert.deepEqual(back.layers, { rgb: 0.3, gray: 0, bits: s.layers.bits });
    assert.equal(back.phraseChars, 10);
    assert.equal(clampPhraseChars(45.4), 45);
    assert.equal(back.bytesOpacity, 1);
    assert.equal(back.flash, false);
    assert.equal(back.flashEvery, 0.5);
    assert.equal(back.flashMs, 9.9);
    assert.equal(back.flashSize, 48);
    assert.equal(back.tab, "flash");
    assert.equal(back.locked, false);
    assert.equal(clampFlashEvery(9.994), 9.99);
    assert.equal(clampFlashMs(0), 1);
    assert.equal(clampFlashSize(9.3), 9.5);
    assert.equal(clampPanelOpacity(0.364), 0.36);
    assert.equal(clampPlace(2), 0.98);
  });

  it("steps finely low down and coarsely higher up", () => {
    const bands: [number, number][] = [
      [10, 0.1],
      [100, 1],
      [Infinity, 10],
    ];
    assert.equal(nudge(9.9, 1, bands), 10);
    assert.equal(nudge(10, 1, bands), 11);
    assert.equal(nudge(10, -1, bands), 9.9, "down from an edge takes the smaller step");
    assert.equal(nudge(100, 1, bands), 110);
    assert.equal(nudge(100, -1, bands), 99);
    assert.equal(nudge(0.3, -1, [[1, 0.1]]), 0.2, "no float dust");
  });

  it("turns bytes into pixels, three, one or an eighth a pixel, filling the picture", () => {
    assert.equal(pixelCount(10, "rgb"), 4);
    assert.equal(pixelCount(10, "gray"), 10);
    assert.equal(pixelCount(10, "bits"), 80);
    assert.equal(pixelCount(0, "rgb"), 0);

    const bytes = new TextEncoder().encode("ABCDEF");
    const rgb = bytesPicture(bytes, "rgb", 1);
    assert.deepEqual([rgb.width, rgb.height], [1, 2]);
    assert.deepEqual([...rgb.data], [65, 66, 67, 255, 68, 69, 70, 255]);

    const gray = bytesPicture(new Uint8Array([10, 20, 30]), "gray", 1);
    assert.deepEqual([gray.width, gray.height], [2, 2]);
    // The fourth cell starts the bytes again: no empty corner.
    assert.deepEqual([gray.data[0], gray.data[4], gray.data[8], gray.data[12]], [10, 20, 30, 10]);

    const bits = bytesPicture(new Uint8Array([0b10100000]), "bits", 8);
    assert.deepEqual([bits.width, bits.height], [8, 1]);
    assert.deepEqual(
      Array.from({ length: 8 }, (_, i) => bits.data[i * 4]),
      [255, 0, 255, 0, 0, 0, 0, 0],
    );

    const wide = bytesPicture(new Uint8Array(3 * 600), "rgb", 0.5);
    assert.ok(wide.height > wide.width, "shaped like a tall phone screen");
    assert.ok(wide.width * wide.height >= 600);

    const capped = bytesPicture(new Uint8Array(1000), "bits", 1, 100);
    assert.ok(capped.width * capped.height < 120, "never more than the pixel cap (and a row)");
  });

  it("keeps silences, flash colour, column and reverse from a save, checked", () => {
    const s = newReader();
    assert.equal(s.silence, R.silence);
    assert.equal(s.phraseSilence, R.phraseSilence);
    assert.equal(s.flashColor, R.flashColor);
    assert.equal(s.flashReverse, R.flashReverse);
    assert.equal(s.centered, R.centered);
    const back = loadReader({
      silence: 0.3694,
      phraseSilence: -2,
      flashColor: "gold",
      flashChars: 5,
      flashReverse: "letters",
      flashAvoid: false,
      centered: false,
      miniAuto: true,
    });
    assert.equal(back.silence, 0.369, "to the millisecond");
    assert.equal(back.phraseSilence, 0);
    assert.equal(back.flashColor, "gold");
    assert.equal(back.flashChars, 0, "under 10 is the whole width");
    assert.equal(back.flashReverse, "letters");
    assert.equal(back.flashAvoid, false);
    assert.equal(back.centered, false);
    assert.equal(back.miniAuto, true);
    assert.equal(
      loadReader({ flashColor: "plaid", flashReverse: "sideways" }).flashColor,
      s.flashColor,
    );
    assert.equal(clampSilence(0.999), 0.999);
    assert.equal(clampFlashChars(45), 45);
    assert.equal(clampFlashChars(9999), 400);
    assert.equal(clampPerHit(9), 5);
    assert.equal(clampStreamMs(3), 16, "a frame at the least");
    assert.equal(clampCopies(0), 1);
    const st = loadReader({
      stream: false,
      streamPlace: "sides",
      streamFlow: "row",
      perHit: 3,
      streamColor: "pink",
    });
    assert.equal(st.stream, false);
    assert.equal(st.streamPlace, "sides");
    assert.equal(st.streamFlow, "row");
    assert.equal(st.perHit, 3);
    assert.equal(st.streamColor, "pink");
    assert.equal(loadReader({ streamPlace: "nowhere" }).streamPlace, newReader().streamPlace);
  });

  it("reverses the text for the flash's second round, then goes round again", () => {
    const phrases = ["abc def.", "ghi jkl."];
    assert.deepEqual(reversedPhrases(phrases, "off"), []);
    assert.deepEqual(reversedPhrases(phrases, "phrases"), ["ghi jkl.", "abc def."]);
    assert.deepEqual(reversedPhrases(phrases, "words"), ["jkl. ghi", "def. abc"]);
    assert.deepEqual(reversedPhrases(phrases, "letters"), [".lkj ihg", ".fed cba"]);
    assert.deepEqual(reversedPhrases(["héllo"], "letters"), ["olléh"]);
    assert.deepEqual(flashRounds(["A", "B"], ["b", "a"]), ["A", "B", "b", "a"]);
    assert.deepEqual(flashRounds(["A"], []), ["A"]);
  });

  it("shows 1, 2 or 3 words a hit, and streams the whole text round and round", () => {
    const words = ["a", "b", "c", "d", "e"];
    assert.equal(hitCount(5, 1), 5);
    assert.equal(hitCount(5, 2), 3);
    assert.equal(hitCount(5, 3), 2);
    assert.equal(hitCount(0, 2), 1);
    assert.deepEqual(hitWords(words, 0, 2), ["a", "b"]);
    assert.deepEqual(hitWords(words, 2, 2), ["e"], "the last hit may be shorter");
    assert.deepEqual(hitWords(words, 1, 3), ["d", "e"]);
    const phrases = ["one two three.", "four five.", "six."];
    const all = streamWords(phrases);
    assert.deepEqual(all, ["one", "two", "three.", "four", "five.", "six."]);
    assert.equal(streamStart(phrases, 0), 0);
    assert.equal(streamStart(phrases, 1), 3, "the stream starts at the phrase being read");
    assert.equal(streamStart(phrases, 2), 5);
    assert.equal(streamHit(all, 4, 3), "five. six. one", "round to the start");
    assert.equal(streamHit(all, 6, 1), "one");
    assert.equal(streamHit([], 0, 2), "");
    assert.deepEqual(sideCounts(3), { left: 2, right: 1 });
    assert.deepEqual(sideCounts(2), { left: 1, right: 1 });
    assert.deepEqual(sideCounts(1), { left: 1, right: 0 });
  });

  it("wraps a phrase between words, at most so many characters a line", () => {
    const words = "Oxygen biosynthesis pacemaker elements of the heart".split(" ");
    const lines = wrapWords(words, 20);
    assert.deepEqual(
      lines.map((l) => l.map((i) => words[i]).join(" ")),
      ["Oxygen biosynthesis", "pacemaker elements", "of the heart"],
    );
    assert.ok(lines.every((l) => l.map((i) => words[i]).join(" ").length <= 20));
    assert.deepEqual(
      lines.flat(),
      words.map((_, i) => i),
      "every word once, in order",
    );
    assert.deepEqual(wrapWords(["a", "verylongwordindeed", "b"], 5), [[0], [1], [2]]);
    assert.deepEqual(wrapWords(words, 999), [words.map((_, i) => i)]);
    assert.deepEqual(wrapWords([], 45), []);
  });

  it("cuts the whole text into screens of whole phrases, in order, each once", () => {
    const phrases = ["one two", "three four five", "six", "seven eight nine ten", "eleven"];
    const fits = (t: string) => t.length <= 20;
    const pages = flashPages(phrases, fits);
    assert.deepEqual(pages, ["one two", "three four five six", "seven eight nine ten", "eleven"]);
    assert.ok(pages.every(fits));
    assert.equal(pages.join(" "), phrases.join(" "), "nothing cut off, nothing twice");

    const long = flashPages(["a very long phrase that never fits", "ok"], (t) => t.length <= 10);
    assert.deepEqual(
      long,
      ["a very long phrase that never fits", "ok"],
      "too long: its own screen",
    );

    const many = Array.from({ length: 500 }, (_, i) => `p${i}`);
    let calls = 0;
    const all = flashPages(many, (t) => {
      calls += 1;
      return t.length <= 400;
    });
    assert.equal(all.join(" "), many.join(" "));
    assert.ok(all.every((p) => p.length <= 400));
    assert.ok(calls < 120, `few measurements (${calls})`);
    assert.deepEqual(flashPages([], fits), []);
  });
});
