import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  clampFlashEvery,
  clampFlashMs,
  clampFlashSize,
  clampPanelOpacity,
  clampPlace,
  loadReader,
  newReader,
  nudge,
} from "./readtext.ts";
import { bytesPicture, flashPages, pixelCount } from "./readview.ts";

const R = CONFIG.reader;

describe("read tab: look, background and flash", () => {
  it("starts from config.json and checks every look setting from a save", () => {
    const s = newReader();
    assert.equal(s.accent, R.accent);
    assert.equal(s.flashEvery, R.flashEvery);
    assert.equal(s.flashMs, R.flashMs);
    assert.equal(s.flashSize, R.flashSize);
    assert.equal(s.flashOpacity, R.flashOpacity);
    assert.equal(s.bytesMode, R.bytesMode);
    assert.equal(s.locked, true);
    const back = loadReader({
      accent: "nope",
      panelOpacity: 0,
      wordX: -3,
      phraseY: 0.61234,
      bytesMode: "bits",
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
    assert.equal(back.bytesMode, "bits");
    assert.equal(back.bytesOpacity, 1);
    assert.equal(back.flash, false);
    assert.equal(back.flashEvery, 0.5);
    assert.equal(back.flashMs, 9.9);
    assert.equal(back.flashSize, 48);
    assert.equal(back.tab, "flash");
    assert.equal(back.locked, false);
    assert.equal(clampFlashEvery(9.94), 9.9);
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
