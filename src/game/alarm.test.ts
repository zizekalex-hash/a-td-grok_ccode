import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import { alarmBits, alarmSamples, alarmSpec } from "./alarm.ts";
import { loadReps, newReps } from "./reps.ts";

describe("timed set alarm", () => {
  it("turns the phrase into bits, highest first, and stops at the most", () => {
    assert.deepEqual(alarmBits("A", 99), [0, 1, 0, 0, 0, 0, 0, 1]);
    assert.equal(alarmBits("name the signal", 20).length, 20);
    assert.equal(alarmBits("", 99).length, 32, 'an empty phrase still rings ("done")');
    assert.equal(alarmBits("é", 99).length, 16, "two bytes in UTF-8");
  });

  it("plays each bit as a quiet tone, the whole a few times over", () => {
    const spec = alarmSpec();
    assert.equal(spec.amp, CONFIG.reps.alarm.amp);
    const rate = 8000;
    const s = alarmSamples("Hi", rate, spec);
    const per = Math.round((rate * spec.bitMs) / 1000);
    const gap = Math.round((rate * spec.gapMs) / 1000);
    assert.equal(s.length, spec.repeats * 16 * per + (spec.repeats - 1) * gap);
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= spec.amp + 1e-6, `never louder than amp (${peak})`);
    assert.ok(peak > spec.amp * 0.8, "and close to it");
    // Silence between the repeats.
    const quiet = s.subarray(16 * per + 1, 16 * per + gap - 1);
    assert.ok(quiet.every((v) => v === 0));
    // A 1 is the high tone, a 0 the low one: more zero crossings for a 1.
    const crossings = (a: Float32Array) =>
      a.reduce((n, v, i) => n + (i && Math.sign(v) !== Math.sign(a[i - 1]!) ? 1 : 0), 0);
    const zero = s.subarray(0, per); // "H" = 0100 1000: first bit 0
    const one = s.subarray(per, 2 * per);
    assert.ok(crossings(one) > crossings(zero));
  });

  it("is on by default and kept with the reps", () => {
    assert.equal(newReps().alarm, CONFIG.reps.alarm.on);
    assert.equal(loadReps({ alarm: false }).alarm, false);
    assert.equal(loadReps({}).alarm, CONFIG.reps.alarm.on);
  });
});
