import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwarm, type SwarmLayer } from "./swarmMix.ts";
import { ttsSource, type TtsSource } from "./ttsRender.ts";

const layer = (o: Partial<SwarmLayer>): SwarmLayer => ({
  voices: [{ at: 0, speed: 1, gain: 1 }],
  mode: "phrase",
  loop: true,
  gapSec: 0,
  reverse: false,
  robot: 0,
  robotHz: 50,
  panHz: 0,
  voice: 0,
  ...o,
});

/** A saying of n samples, each `v` (at rate). */
const flat = (n: number, v: number, rate = 1000): TtsSource =>
  ttsSource(new Float32Array(n).fill(v), rate);

describe("swarm: background voices mixed into one", () => {
  it("each voice from its start, at its speed and loudness, added up, the same both sides", () => {
    const src = flat(100, 0.5);
    const sw = createSwarm(
      [
        layer({
          voices: [
            { at: 0, speed: 1, gain: 1 },
            { at: 0.05, speed: 2, gain: 0.5 },
          ],
          loop: false,
        }),
      ],
      1,
      1000,
    );
    const p = sw.mix(200, () => src);
    // 0..49: the first alone; 50..99: both (the second 50 frames long at ×2); 100..: none.
    assert.ok(Math.abs(p.left[10]! - 0.5) < 1e-6);
    assert.ok(Math.abs(p.left[60]! - 0.75) < 1e-6);
    assert.ok(Math.abs(p.left[99]! - 0.75) < 1e-6);
    assert.equal(p.left[100], 0);
    assert.equal(p.left[150], 0);
    assert.deepEqual(Array.from(p.left), Array.from(p.right));
    assert.ok(Math.abs(p.peak - 0.75) < 1e-6);
    assert.equal(sw.at(), 200);
  });
  it("over and over with its silence after each saying (a faster voice's silence shorter)", () => {
    const src = flat(10, 1);
    const sw = createSwarm(
      [layer({ gapSec: 0.01, voices: [{ at: 0, speed: 2, gain: 1 }] })],
      1,
      1000,
    );
    const p = sw.mix(30, () => src);
    // At ×2: 5 frames sounding, 5 silent (10 ms / 2), and again.
    const on = Array.from(p.left, (x) => (x > 0.5 ? 1 : 0)).join("");
    assert.equal(on.slice(0, 20), "11111000001111100000");
  });
  it("reading the whole text: phrase after phrase, its own silence between, then round again", () => {
    const srcs = [flat(4, 0.1), flat(4, 0.2), flat(4, 0.3)];
    const sw = createSwarm([layer({ mode: "text", gapSec: 0.002 })], 3, 1000);
    const p = sw.mix(24, (_v, ph) => srcs[ph]!);
    const vals = Array.from(p.left, (x) => Math.round(x * 10));
    assert.deepEqual(vals.slice(0, 18), [1, 1, 1, 1, 0, 0, 2, 2, 2, 2, 0, 0, 3, 3, 3, 3, 0, 0]);
    assert.deepEqual(vals.slice(18, 22), [1, 1, 1, 1]);
  });
  it("a saying not here yet: that voice waits (wanted, soonest first), the rest go on", () => {
    let have = false;
    const src = flat(50, 0.25);
    const sw = createSwarm(
      [layer({ mode: "text" }), layer({ voice: 1, voices: [{ at: 0, speed: 1, gain: 1 }] })],
      2,
      1000,
    );
    const p1 = sw.mix(20, (v) => (v === 1 || have ? src : null));
    assert.ok(Math.abs(p1.left[5]! - 0.25) < 1e-6);
    assert.deepEqual(sw.wanted(), [{ voice: 0, phrase: 0, at: 0 }]);
    assert.equal(sw.stats().waiting, 1);
    have = true;
    const p2 = sw.mix(20, () => src);
    // Here now: it starts at once (both sound).
    assert.ok(Math.abs(p2.left[1]! - 0.5) < 1e-6);
    assert.equal(sw.stats().waiting, 0);
  });
  it("a new phrase: the phrase-saying voices start again on it, from that frame", () => {
    const srcs = [flat(100, 0.1), flat(100, 0.9)];
    const sw = createSwarm([layer({})], 2, 1000);
    sw.mix(30, (_v, ph) => srcs[ph]!);
    sw.restart(40, 1);
    assert.equal(sw.at(), 40);
    const p = sw.mix(10, (_v, ph) => srcs[ph]!);
    assert.ok(Math.abs(p.left[0]! - 0.9) < 1e-6);
  });
  it("reversed: each saying half and half with itself backwards", () => {
    const d = new Float32Array([1, 0, 0, 0]);
    const sw = createSwarm([layer({ reverse: true, loop: false })], 1, 4);
    const p = sw.mix(4, () => ttsSource(d, 4));
    assert.deepEqual(
      Array.from(p.left, (x) => Math.round(x * 100) / 100),
      [0.5, 0, 0, 0.5],
    );
  });
  it("rung by its robot, and turned left-right (equal power)", () => {
    const src = flat(1000, 1);
    const sw = createSwarm([layer({ robot: 1, robotHz: 250, panHz: 0 })], 1, 1000);
    const p = sw.mix(8, () => src);
    // Fully rung at 250 Hz, 1000 Hz rate: 0, 1, 0, -1 …
    assert.deepEqual(
      Array.from(p.left.slice(0, 4), (x) => Math.round(x)),
      [0, 1, 0, -1],
    );
    const turned = createSwarm([layer({ panHz: 1 })], 1, 1000).mix(4, () => src);
    // At the start in the middle: 0.707 each side.
    assert.ok(Math.abs(turned.left[0]! - Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(turned.right[0]! - Math.SQRT1_2) < 1e-6);
  });
  it("hundreds of voices in one piece, and very fast ones (no voice left out)", () => {
    const src = flat(2400, 0.001, 24_000);
    const voices = Array.from({ length: 300 }, (_, k) => ({
      at: k * 0.001,
      speed: 1.05 ** k,
      gain: 0.01,
    }));
    const sw = createSwarm([layer({ voices })], 1, 48_000);
    const t = Date.now();
    const p = sw.mix(48_000, () => src);
    assert.equal(sw.stats().voices, 300);
    assert.ok(p.peak > 0);
    assert.ok(Date.now() - t < 5000, "a second of 300 voices mixed in good time");
  });
});
