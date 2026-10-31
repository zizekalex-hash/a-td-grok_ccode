import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_SIDE, rawPixels, rawSide } from "./rawimage.ts";

describe("raw text image", () => {
  it("picks the smallest square that holds every byte", () => {
    assert.equal(rawSide(0), 1);
    assert.equal(rawSide(3), 1);
    assert.equal(rawSide(4), 2);
    assert.equal(rawSide(12), 2);
    assert.equal(rawSide(13), 3);
    assert.equal(rawSide(10_000_000), MAX_SIDE);
  });

  it("turns each three bytes into one opaque pixel, in order", () => {
    const bytes = new TextEncoder().encode("ABCDEFG");
    const side = rawSide(bytes.length);
    const px = rawPixels(bytes, side);
    assert.equal(px.length, side * side * 4);
    assert.deepEqual([...px.slice(0, 8)], [65, 66, 67, 255, 68, 69, 70, 255]);
    // "G" fills the red of the third pixel; the rest of it, and the last pixel, are black.
    assert.deepEqual([...px.slice(8, 16)], [71, 0, 0, 255, 0, 0, 0, 255]);
  });
});
