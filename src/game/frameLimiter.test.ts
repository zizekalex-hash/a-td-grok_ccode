import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FrameLimiter, renderDpr, UNCAPPED_FPS } from "./frameLimiter.ts";

/** Frames drawn per second, over ten seconds of a display refreshing at hz, for a cap. */
function drawn(hz: number, cap: number): number {
  const limiter = new FrameLimiter();
  let n = 0;
  // Display timestamps start well after zero, as they do in a browser.
  for (let i = 0; i < hz * 10; i++) if (limiter.ready(1000 + (i * 1000) / hz, cap)) n++;
  return n / 10;
}

describe("FrameLimiter", () => {
  it("draws the first frame at once", () => {
    assert.equal(new FrameLimiter().ready(5000, 15), true);
  });

  it("draws every frame when uncapped", () => {
    assert.equal(drawn(60, UNCAPPED_FPS), 60);
    assert.equal(drawn(120, UNCAPPED_FPS), 120);
  });

  it("holds the cap on a 60 Hz display, including caps that do not divide 60", () => {
    for (const cap of [15, 20, 30, 45]) {
      const n = drawn(60, cap);
      assert.ok(Math.abs(n - cap) <= 0.5, `cap ${cap} drew ${n}`);
    }
  });

  it("caps a 120 Hz display at 60", () => {
    const n = drawn(120, 60);
    assert.ok(Math.abs(n - 60) <= 0.5, `drew ${n}`);
  });
});

describe("renderDpr", () => {
  it("scales the device ratio, capped at 2 and never below 0.5", () => {
    assert.equal(renderDpr(3, 100), 2);
    assert.equal(renderDpr(3, 50), 1);
    assert.equal(renderDpr(1, 40), 0.5);
    assert.equal(renderDpr(2, 75), 1.5);
    assert.equal(renderDpr(0, 100), 1);
  });
});
