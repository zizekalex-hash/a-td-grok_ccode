import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { binWall, CHAR_W, LINE_H, toBits, type Wall, type WallSpec } from "./binwall.ts";

const SPEC: WallSpec = { minFont: 3, maxFont: 9, fallbackFont: 1.89, fill: 0.85 };
const PHONE = { w: 390, h: 844 };

/** Every character inside the screen, cells no narrower than the font, and the copies whole. */
function sound(wall: Wall, text: string, w: number, h: number) {
  const bits = toBits(text);
  assert.equal(wall.lines.join(""), bits.repeat(wall.copies), "whole copies, in order");
  assert.ok(wall.cellW >= wall.font * CHAR_W - 1e-9, "letters never overlap");
  assert.ok(wall.pitch >= wall.font * LINE_H - 1e-9, "lines never overlap");
  const longest = Math.max(...wall.lines.map((l) => l.length));
  const shortest = Math.min(...wall.lines.map((l) => l.length));
  assert.ok(longest - shortest <= 1, "lines share the text evenly");
  // The last character's cell ends at the right edge, the last line's at the bottom.
  assert.ok(wall.left - wall.cellW / 2 >= -1e-9);
  assert.ok(wall.left + (longest - 1) * wall.cellW + wall.cellW / 2 <= w + 1e-6);
  assert.ok(wall.top + (wall.lines.length - 1) * wall.pitch + wall.pitch / 2 <= h + 1e-6);
}

describe("binary wall", () => {
  it("turns a phrase into raw binary, eight bits a byte", () => {
    assert.equal(toBits("A"), "01000001");
    assert.equal(toBits("  A \n B "), toBits("A B"), "spaces fold to one");
    assert.equal(toBits("é").length, 16, "letters beyond ASCII are their UTF-8 bytes");
    assert.equal(toBits("   "), "");
  });

  it("fills a phone screen with whole copies of a short phrase, at the largest size", () => {
    const text = "name the signal";
    const wall = binWall(text, PHONE.w, PHONE.h, SPEC)!;
    assert.equal(wall.font, 9);
    assert.ok(wall.copies > 1);
    const filled =
      (wall.copies * toBits(text).length) /
      (Math.floor(PHONE.w / (9 * CHAR_W)) * Math.floor(PHONE.h / (9 * LINE_H)));
    assert.ok(filled >= SPEC.fill, "not too little");
    sound(wall, text, PHONE.w, PHONE.h);
  });

  it("goes smaller for a long phrase, staying between 3 and 9 px", () => {
    const text = "word ".repeat(300).trim();
    const wall = binWall(text, PHONE.w, PHONE.h, SPEC)!;
    assert.ok(wall.font < 9 && wall.font >= 3, `font ${wall.font}`);
    sound(wall, text, PHONE.w, PHONE.h);
  });

  it("falls back to 1.89 px when even 3 px is too big, and smaller still if it must", () => {
    const text = "x".repeat(7000);
    const wall = binWall(text, PHONE.w, PHONE.h, SPEC)!;
    assert.equal(wall.font, 1.89);
    sound(wall, text, PHONE.w, PHONE.h);
    const huge = binWall("y".repeat(20000), PHONE.w, PHONE.h, SPEC)!;
    assert.ok(huge.font < 1.89);
    sound(huge, "y".repeat(20000), PHONE.w, PHONE.h);
  });

  it("fits a wide screen too, and shows nothing for nothing", () => {
    const text = "The light is a decision";
    const wall = binWall(text, 1280, 720, SPEC)!;
    sound(wall, text, 1280, 720);
    assert.equal(binWall("  ", 390, 844, SPEC), null);
    assert.equal(binWall("a", 0, 844, SPEC), null);
  });
});
