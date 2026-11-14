import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VOICE_PRESETS, type VoiceShape } from "./rehearse.ts";
import {
  FLOAT_WAV_HEADER,
  floatWavBytes,
  floatWavHeader,
  MAX_WAV_BYTES,
  reverseMix,
  stereoFrom,
  ttsMixer,
  ttsPlan,
  ttsSource,
  wavMono,
  type TtsLayer,
  type TtsPlan,
} from "./ttsRender.ts";

const shape = (s: Partial<VoiceShape>): VoiceShape => ({
  ...VOICE_PRESETS[0]!.shape,
  voiceSpreadMs: 0,
  voiceGapMs: 0,
  ...s,
});
const layer = (s: Partial<VoiceShape>, whole = false): TtsLayer => ({ shape: shape(s), whole });
const near = (a: number, b: number, d = 1e-6) =>
  assert.ok(Math.abs(a - b) <= d, `${a} is not near ${b}`);
const starts = (p: TtsPlan) => p.plays.map((x) => +x.t0.toFixed(4));

describe("tts plan: one phrase", () => {
  it("copies loop till the slowest has said it once, with its gap", () => {
    const p = ttsPlan(
      [layer({ voiceCopies: 3, voiceSpreadMs: 100, voiceSpeedUp: 2, voiceGapMs: 500 })],
      [[1]],
      false,
    );
    // Span 1.5 s: speeds 1, 2, 4 starting at 0, 0.1, 0.2.
    near(p.total, 1.5);
    assert.deepEqual(starts(p), [0, 0.1, 0.2, 0.575, 0.85, 0.95, 1.325]);
    assert.ok(p.plays.every((x) => near(x.tEnd, 1.5) === undefined));
    assert.equal(p.skipped, 0);
  });
  it("not looping: each copy says it once", () => {
    const p = ttsPlan(
      [layer({ voiceCopies: 3, voiceSpeedUp: 2, voiceGapMs: 500, voiceLoop: false })],
      [[1]],
      false,
    );
    assert.deepEqual(starts(p), [0, 0, 0]);
    near(p.total, 1.5);
  });
  it("the main voice and the copies at their own volumes; silent ones left out", () => {
    const p = ttsPlan(
      [layer({ voiceCopies: 3, voiceSpeedUp: 1, voiceVolume: 2.5, voiceCopiesVolume: 0.4 })],
      [[1]],
      false,
    );
    assert.deepEqual(
      p.plays.map((x) => x.gain),
      [2.5, 0.4, 0.4],
    );
    const q = ttsPlan([layer({ voiceCopies: 3, voiceCopiesVolume: 0 })], [[1]], false);
    assert.equal(q.plays.length, 1);
  });
  it("copies too fast are left out", () => {
    const p = ttsPlan([layer({ voiceCopies: 6, voiceSpeedUp: 4 })], [[1]], false);
    // 1, 4, 16, 64, 256 kept; 1024 left out.
    assert.equal(p.skipped, 1);
  });
  it("on one phrase, a whole-text layer says the phrase too", () => {
    const p = ttsPlan([layer({}), layer({ voiceCopies: 2 }, true)], [[1], [2]], false);
    near(p.total, 2);
    // The first loops in the 2 s turn (twice); the other two copies say it once.
    assert.equal(p.plays.length, 2 + 2);
  });
});

describe("tts plan: a whole text", () => {
  it("the phrases in turn: each turn till every layer has said it", () => {
    const p = ttsPlan(
      [layer({ voiceGapMs: 500 }), layer({ voiceGapMs: 0, voiceLoop: false })],
      [
        [1, 2],
        [3, 0.5],
      ],
      true,
    );
    // Turns: max(1.5, 3) = 3, then max(2.5, 0.5) = 2.5.
    near(p.total, 5.5);
    const second = p.plays.filter((x) => x.phrase === 1);
    assert.ok(second.every((x) => x.t0 >= 3 - 1e-9));
    assert.ok(p.plays.filter((x) => x.phrase === 0).every((x) => near(x.tEnd, 3) === undefined));
    // The first layer loops in its 3 s turn: 0 and 1.5.
    assert.deepEqual(
      p.plays.filter((x) => x.layer === 0 && x.phrase === 0).map((x) => x.t0),
      [0, 1.5],
    );
  });
  it("a layer saying the whole text: each copy reads it through at its speed", () => {
    const p = ttsPlan(
      [layer({ voiceCopies: 2, voiceSpeedUp: 2, voiceGapMs: 500 }, true)],
      [[1, 2]],
      true,
    );
    // The text: 1.5 + 2.5 = 4 s; the fast copy reads it twice in that time.
    near(p.total, 4);
    assert.deepEqual(starts(p), [0, 0, 0.75, 1.5, 2, 2.75]);
    const once = ttsPlan(
      [layer({ voiceCopies: 2, voiceSpeedUp: 2, voiceGapMs: 500, voiceLoop: false }, true)],
      [[1, 2]],
      true,
    );
    assert.deepEqual(starts(once), [0, 0, 0.75, 1.5]);
  });
  it("both kinds at once: as long as the longer", () => {
    const p = ttsPlan(
      [layer({}), layer({ voiceSpeedUp: 1, voiceRate: 1 }, true)],
      [
        [1, 1],
        [3, 3],
      ],
      true,
    );
    near(p.total, 6);
    const turns = p.plays.filter((x) => x.layer === 0);
    assert.deepEqual(
      turns.map((x) => x.t0),
      [0, 1],
    );
  });
  it("only whole-text layers: no turns", () => {
    const p = ttsPlan([layer({}, true)], [[2, 2, 2]], true);
    near(p.total, 6);
    assert.deepEqual(starts(p), [0, 2, 4]);
  });
});

describe("tts plan: who leads a phrase's turn", () => {
  const two = [
    layer({ voiceGapMs: 500 }),
    layer({ voiceGapMs: 0, voiceLoop: false, voiceCopies: 2, voiceSpeedUp: 0.5 }),
  ];
  const lens = [
    [1, 2],
    [1, 1],
  ];
  it("every copy (all): the turn waits for the slowest", () => {
    const p = ttsPlan(two, lens, true, "all");
    // Phrase 1: max(1.5, 1 / 0.5 = 2) = 2; phrase 2: max(2.5, 2) = 2.5.
    near(p.total, 4.5);
    assert.deepEqual(p.turns, [0, 2]);
  });
  it("the main voice (captain): the first layer's first copy, its saying and gap", () => {
    const p = ttsPlan(two, lens, true, "captain");
    near(p.total, 1.5 + 2.5);
    assert.deepEqual(p.turns, [0, 1.5]);
    // The slower copy is cut where the main voice's turn ends.
    assert.ok(p.plays.filter((x) => x.phrase === 0).every((x) => near(x.tEnd, 1.5) === undefined));
  });
  it("only layers reading the whole text: the turns where the first one reads each phrase", () => {
    const p = ttsPlan([layer({ voiceGapMs: 250 }, true)], [[1, 2, 3]], true, "captain");
    assert.deepEqual(p.turns, [0, 1.25, 3.5]);
  });
  it("one phrase: one turn, at 0", () => {
    assert.deepEqual(ttsPlan([layer({})], [[2]], false, "captain").turns, [0]);
  });
});

describe("reversed, half and half", () => {
  it("each sample with its mirror", () => {
    const r = reverseMix(ttsSource(new Float32Array([1, 2, 3, 6]), 1000));
    assert.equal(r.length, 4);
    assert.deepEqual(Array.from(r.data.subarray(1, 5)), [3.5, 2.5, 2.5, 3.5]);
  });
});

describe("tts mixer", () => {
  const flat = (v: number, n: number) => new Float32Array(n).fill(v);
  it("plays a saying at its gain, values above 1 kept", () => {
    const src = ttsSource(flat(0.5, 1000), 1000);
    const layers = [layer({ voiceVolume: 3 })];
    const plan = ttsPlan(layers, [[1]], false);
    const mix = ttsMixer(plan, layers, () => src, 2000);
    assert.equal(mix.frames, 2000);
    const out = mix.next(5000);
    assert.equal(out.length, 2000);
    near(out[10]!, 1.5, 1e-6);
    near(out[1990]!, 1.5, 1e-6);
    assert.equal(mix.next(10).length, 0);
  });
  it("in pieces, the same as at once", () => {
    const ramp = new Float32Array(800).map((_, i) => Math.sin(i / 7));
    const src = ttsSource(ramp, 8000);
    const layers = [
      layer({
        voiceCopies: 4,
        voiceSpreadMs: 13,
        voiceSpeedUp: 1.37,
        voiceGapMs: 31,
        voiceRobot: 0.5,
      }),
      layer({ voiceCopies: 2, voiceSpeedUp: 2.2, voicePanHz: 5 }),
    ];
    const plan = ttsPlan(layers, [[0.1], [0.1]], false);
    const whole = ttsMixer(plan, layers, () => src, 44100).next(1e9);
    const parts = ttsMixer(plan, layers, () => src, 44100);
    const got: number[] = [];
    for (let piece = parts.next(997); piece.length; piece = parts.next(997)) got.push(...piece);
    assert.equal(got.length, whole.length);
    for (let i = 0; i < whole.length; i += 37) near(got[i]!, whole[i]!, 1e-6);
  });
  it("sped up: through it in half the time; its samples met exactly", () => {
    const ramp = new Float32Array(1000).map((_, i) => i / 1000);
    const src = ttsSource(ramp, 1000);
    const layers = [layer({ voiceSpeedUp: 1 })];
    const plan: TtsPlan = {
      plays: [{ layer: 0, phrase: 0, t0: 0, speed: 2, gain: 1, tEnd: 1 }],
      total: 1,
      skipped: 0,
      turns: [0],
    };
    const out = ttsMixer(plan, layers, () => src, 1000).next(1000);
    near(out[100]!, 0.2, 1e-6);
    near(out[250]!, 0.5, 1e-6);
    assert.equal(out[600], 0);
    // A rate four times the samples': in between, on the line through them.
    const up = ttsMixer(plan, layers, () => src, 4000).next(4000);
    near(up[401]!, 0.2005, 1e-6);
  });
  it("one channel all the way: a layer's turning is live only", () => {
    const src = ttsSource(flat(0.25, 100), 100);
    const layers = [layer({ voicePanHz: 2 })];
    const mix = ttsMixer(ttsPlan(layers, [[1]], false), layers, () => src, 100);
    const out = mix.next(1000);
    assert.equal(out.length, mix.frames);
    near(out[20]!, 0.25);
  });
  it("ahead: the sayings each piece starts, asked for just then (a long text never all read at once)", () => {
    const ramp = new Float32Array(900).map((_, i) => Math.cos(i / 11));
    const layers = [
      layer({ voiceCopies: 3, voiceSpreadMs: 17, voiceSpeedUp: 1.5, voiceGapMs: 40 }),
      layer({ voiceCopies: 2, voiceSpeedUp: 2 }, true),
    ];
    const lens = [Array(12).fill(0.09), Array(12).fill(0.09)];
    const plan = ttsPlan(layers, lens, true, "captain");
    const all = ttsMixer(plan, layers, () => ttsSource(ramp, 10000), 8000).next(1e9);
    // Each piece: only the sources ahead() named are there; the same sound as at once.
    const m = ttsMixer(plan, layers, (l, p) => ready.get(`${l}:${p}`) ?? null, 8000);
    const ready = new Map<string, ReturnType<typeof ttsSource>>();
    const got: number[] = [];
    let asked = 0;
    for (;;) {
      ready.clear();
      for (const p of m.ahead(613)) {
        ready.set(`${p.layer}:${p.phrase}`, ttsSource(ramp, 10000));
        asked += 1;
      }
      const piece = m.next(613);
      if (!piece.length) break;
      got.push(...piece);
    }
    assert.equal(asked, plan.plays.length);
    assert.equal(got.length, all.length);
    for (let i = 0; i < all.length; i += 29) near(got[i]!, all[i]!, 1e-6);
  });
  it("the robot: its loudness rung against the tone", () => {
    const src = ttsSource(flat(1, 1000), 1000);
    const layers = [layer({ voiceRobot: 1, voiceRobotHz: 1 })];
    const out = ttsMixer(ttsPlan(layers, [[1]], false), layers, () => src, 1000).next(1000);
    near(out[250]!, 1, 1e-6);
    near(out[750]!, -1, 1e-6);
    near(out[500]!, 0, 1e-6);
  });
});

describe("two channels, at the very end", () => {
  const mono = new Float32Array([0.5, -2, 1, 0.25]);
  it("the same both sides: one channel twice, as loud", () => {
    assert.deepEqual(
      Array.from(stereoFrom(mono, 0, 48000, "same", 0)),
      [0.5, 0.5, -2, -2, 1, 1, 0.25, 0.25],
    );
  });
  it("bridged: the right side flipped", () => {
    assert.deepEqual(
      Array.from(stereoFrom(mono, 0, 48000, "bridged", 0)),
      [0.5, -0.5, -2, 2, 1, -1, 0.25, -0.25],
    );
  });
  it("turned left-right: equal power, the middle at 0.707 each side", () => {
    const one = new Float32Array(1000).fill(1);
    const out = stereoFrom(one, 0, 1000, "same", 1);
    // Frame 0: the middle; frame 250: all the way right; 750: all the way left.
    near(out[0]!, Math.SQRT1_2);
    near(out[1]!, Math.SQRT1_2);
    near(out[500]!, 0);
    near(out[501]!, 1);
    near(out[1500]!, 1);
    near(out[1501]!, 0);
    for (let m = 0; m < 1000; m += 50) near(out[2 * m]! ** 2 + out[2 * m + 1]! ** 2, 1, 1e-6);
    // Bridged and turned: the right side the opposite.
    near(stereoFrom(one, 0, 1000, "bridged", 1)[501]!, -1);
  });
  it("in pieces: the turning goes on from where it was", () => {
    const one = new Float32Array(600).fill(1);
    const whole = stereoFrom(one, 0, 1000, "same", 3);
    const later = stereoFrom(one.subarray(0, 200), 400, 1000, "same", 3);
    for (let m = 0; m < 200; m += 13) near(later[2 * m]!, whole[2 * (400 + m)]!);
  });
});

describe("float32 .wav", () => {
  it("its header, read back with the sound (above 1 kept)", () => {
    const sound = new Float32Array([0, 0.5, -1, 2.5, -3.25, 0.25]);
    const head = floatWavHeader(3, 2, 384000);
    assert.equal(head.length, FLOAT_WAV_HEADER);
    const file = new Uint8Array(head.length + sound.byteLength);
    file.set(head);
    file.set(new Uint8Array(sound.buffer), head.length);
    const back = wavMono(file);
    assert.ok(back);
    assert.equal(back.rate, 384000);
    assert.deepEqual(Array.from(back.samples), [0.25, 0.75, -1.5]);
    assert.equal(new DataView(file.buffer).getUint32(4, true), file.length - 8);
    assert.equal(floatWavBytes(3, 2), file.length);
  });
  it("no more than a .wav can hold", () => {
    assert.ok(floatWavBytes(2 ** 29, 2) > MAX_WAV_BYTES);
    assert.throws(() => floatWavHeader(2 ** 29, 2, 48000));
    assert.doesNotThrow(() => floatWavHeader(2 ** 28, 2, 48000));
  });
  it("the phone's sayings: 16-bit, stereo averaged, 24-bit", () => {
    const pcm = (bits: number, channels: number, values: number[]) => {
      const width = bits / 8;
      const b = new Uint8Array(44 + values.length * width);
      const v = new DataView(b.buffer);
      const tag = (at: number, s: string) =>
        [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
      tag(0, "RIFF");
      v.setUint32(4, b.length - 8, true);
      tag(8, "WAVE");
      tag(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, channels, true);
      v.setUint32(24, 22050, true);
      v.setUint16(34, bits, true);
      tag(36, "data");
      v.setUint32(40, values.length * width, true);
      values.forEach((x, i) => {
        if (bits === 16) v.setInt16(44 + i * 2, x, true);
        else {
          b[44 + i * 3] = x & 255;
          b[45 + i * 3] = (x >> 8) & 255;
          b[46 + i * 3] = (x >> 16) & 255;
        }
      });
      return b;
    };
    const m = wavMono(pcm(16, 1, [16384, -32768]));
    assert.deepEqual(Array.from(m!.samples), [0.5, -1]);
    assert.equal(m!.rate, 22050);
    assert.deepEqual(
      Array.from(wavMono(pcm(16, 2, [16384, 0, -16384, -16384]))!.samples),
      [0.25, -0.5],
    );
    assert.deepEqual(Array.from(wavMono(pcm(24, 1, [4194304, -8388608]))!.samples), [0.5, -1]);
    assert.equal(wavMono(new Uint8Array(60)), null);
  });
});
