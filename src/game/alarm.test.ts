import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import {
  ALARM_RATE,
  alarmMs,
  NAG,
  alarmDb,
  alarmGain,
  alarmSamples,
  alarmSpec,
  MAX_ALARM_MS,
  pcm16,
  rungNote,
  setNote,
  toBase64,
} from "./alarm.ts";
import { clampAlarmVolume, loadReps, newReps } from "./reps.ts";
import { defaultSettings, phraseSignal } from "./rehearse.ts";

const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("timed set alarm", () => {
  it("is the phrase's own sound, as Rehearse makes it, a few times over", () => {
    const sound = defaultSettings();
    const spec = alarmSpec();
    assert.equal(spec.repeats, CONFIG.reps.alarm.repeats);
    const rate = 8000;
    const one = phraseSignal("Hold the line.", rate, sound);
    const s = alarmSamples("Hold the line.", rate, sound, spec);
    const gap = Math.round((rate * spec.gapMs) / 1000);
    assert.equal(s.length, spec.repeats * one.length + (spec.repeats - 1) * gap);
    assert.deepEqual(s.subarray(0, one.length), one, "the first time is the phrase's signal");
    assert.ok(
      s.subarray(one.length + 1, one.length + gap - 1).every((v) => v === 0),
      "silence between",
    );
    assert.ok(Math.abs(peak(s) - sound.amp) < 1e-6, "as loud as Rehearse's peak");
    // Quieter or louder with Rehearse's peak.
    assert.ok(
      Math.abs(peak(alarmSamples("x y", rate, { ...sound, amp: 0.36 }, spec)) - 0.36) < 1e-6,
    );
  });

  it("keeps to 8 s at most, with one play at least", () => {
    const long = { ...defaultSettings(), signalMs: 5000 };
    const s = alarmSamples("a long one", ALARM_RATE, long, { repeats: 3, gapMs: 350 });
    assert.ok(s.length <= (ALARM_RATE * MAX_ALARM_MS) / 1000);
    assert.equal(s.length, Math.round(ALARM_RATE * 5), "one play of 5 s");
    const huge = { ...defaultSettings(), signalMs: 10_000 };
    assert.equal(
      alarmSamples("x", 1000, huge, { repeats: 3, gapMs: 0 }).length,
      10_000,
      "one, even if longer",
    );
  });

  it("goes to the phone as 16-bit sound in base64", () => {
    const bytes = pcm16(new Float32Array([0, 1, -1, 0.5]));
    assert.deepEqual([...bytes], [0, 0, 0xff, 0x7f, 0x01, 0x80, 0x00, 0x40]);
    assert.equal(toBase64(new Uint8Array([104, 105])), "aGk=");
    const big = new Uint8Array(100_000).fill(65);
    assert.equal(toBase64(big).length, Math.ceil(100_000 / 3) * 4);
  });

  it("is on by default at 0.36 of the phone's alarm volume, kept with the reps", () => {
    assert.equal(newReps().alarm, CONFIG.reps.alarm.on);
    assert.equal(newReps().alarmVolume, 0.36);
    assert.equal(loadReps({ alarm: false }).alarm, false);
    assert.equal(loadReps({}).alarm, CONFIG.reps.alarm.on);
    assert.equal(loadReps({ alarmVolume: 0.5 }).alarmVolume, 0.5);
    assert.equal(loadReps({ alarmVolume: 7 }).alarmVolume, 1);
    assert.equal(clampAlarmVolume(0), 0.01);
  });

  it("is a knob in dB, and says how the Test rang", () => {
    assert.equal(Math.round(alarmDb(1)), 0);
    assert.equal(Math.round(alarmDb(0.36)), -18);
    assert.equal(Math.round(alarmDb(0.09)), -42);
    assert.equal(Math.round(alarmDb(0.03)), -61);
    assert.ok(Math.abs(alarmGain(0.36) - 0.1296) < 1e-4, "0.36 squared");
    assert.ok(alarmGain(0.09) < alarmGain(0.36) / 10, "0.09 far quieter than 0.36");
    const rang = { played: true, before: 11, want: 3, during: 3, max: 25, gain: 0.56 };
    assert.match(
      rungNote(rang, 0.09),
      /-42 dB below full: alarm volume 3\/25, the sound at 56%, back to 11\/25 after/,
    );
    assert.match(rungNote({ ...rang, during: 11 }, 0.09), /11\/25 \(the phone kept its own\)/);
    assert.match(rungNote(null, 0.36), /page, -18 dB below/);
    assert.match(
      rungNote({ ...rang, played: false, error: "busy" }, 0.36),
      /could not play it \(busy\)/,
    );
  });

  it("says how the alarm was set", () => {
    assert.match(
      setNote({ at: "13:46:00", way: "alarm clock", error: "" }),
      /13:46:00.*alarm clock and the app's timer/,
    );
    assert.match(setNote({ at: "13:46:00", way: "none", error: "denied" }), /failed \(denied\)/);
    assert.match(setNote(null), /could not be set/);
  });

  it("keeps calling after the first ring: 3 s then 0.3, 6 s then 0.6, 9 s then 0.9, round again", () => {
    assert.deepEqual(
      NAG.map((n) => [n.waitMs, n.volume]),
      [
        [3000, 0.3],
        [6000, 0.6],
        [9000, 0.9],
      ],
    );
    // Louder each time, whatever the setting was.
    assert.ok(NAG.every((n, i) => i === 0 || n.volume > NAG[i - 1]!.volume));
    // One ring's length, as the sound is made.
    const sound = defaultSettings();
    const spec = alarmSpec();
    const rate = 8000;
    const len = alarmSamples("Oxygenation", rate, sound, spec).length;
    assert.equal(alarmMs(sound, spec), Math.round((len / rate) * 1000));
    assert.equal(alarmMs({ ...sound, signalMs: 5000 }, { repeats: 3, gapMs: 350 }), 5000);
  });
});
