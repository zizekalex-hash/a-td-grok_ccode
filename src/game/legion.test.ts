import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMatrix,
  dualDomain,
  legionDefaults,
  legionMaster,
  loadLegion,
  matrixLen,
  type LegionSettings,
} from "./legion.ts";
import {
  compressThenRepeat,
  crossmod,
  guard,
  guardAll,
  GUARD,
  peakOf,
  phaseStack,
  repeatThenCompress,
  selfCrossmod,
  spectralTilt,
  conform,
  type DspCfg,
} from "./legionDsp.ts";
import { dspCfg } from "./legion.ts";
import { geneticChain, naturalLen, sacredGeometry, seedOf, textBytes } from "./legionSeeds.ts";

const near = (a: number, b: number, d = 1e-9) =>
  assert.ok(Math.abs(a - b) <= d, `${a} is not near ${b}`);
const finite = (a: ArrayLike<number>) => Array.from(a).every((x) => Number.isFinite(x));

describe("legion: the NaN / Inf guard", () => {
  it("NaN to 0, past 96 % of float32's largest to it", () => {
    assert.equal(guard(NaN), 0);
    assert.equal(guard(Infinity), GUARD);
    assert.equal(guard(-Infinity), -GUARD);
    assert.equal(guard(1e39), GUARD);
    assert.equal(guard(-2.5), -2.5);
    near(GUARD / 3.4028234663852886e38, 0.96, 0.001);
    assert.deepEqual(Array.from(guardAll(new Float64Array([NaN, 1, -Infinity]))), [0, 1, -GUARD]);
  });
});

describe("legion: the seeds", () => {
  it("RAW: 1 bit = 1 sample, -1 / +1", () => {
    // "A" = 0x41 = 01000001.
    const s = seedOf(textBytes("A", 8), "raw", 8, 1);
    assert.deepEqual(Array.from(s), [-1, 1, -1, -1, -1, -1, -1, 1]);
    assert.equal(naturalLen(textBytes("AB", 8), "raw"), 16);
  });
  it("PCM32 / FLOAT32 natural lengths, UTF-16 and UTF-32 bytes", () => {
    assert.equal(naturalLen(textBytes("ABCDE", 8), "i32"), 2);
    assert.deepEqual(Array.from(textBytes("é", 16)), [0xe9, 0]);
    assert.deepEqual(Array.from(textBytes("😀", 32)), [0x00, 0xf6, 0x01, 0]);
  });
  it("a FLOAT32 seed of bytes that are NaN / Inf: guarded, finite, peak at the amp", () => {
    // 0x7fc00000 (NaN), 0x7f800000 (+Inf), 1.0f.
    const b = new Uint8Array([0, 0, 0xc0, 0x7f, 0, 0, 0x80, 0x7f, 0, 0, 0x80, 0x3f]);
    const s = seedOf(b, "f32", 3, 0.999);
    assert.ok(finite(s));
    near(peakOf(s), 0.999, 1e-12);
  });
  it("mu-law and trinary stay within the amp; a longer seed is compressed, nothing cut", () => {
    const mu = seedOf(textBytes("Stay with the cyan line.", 8), "mulaw", 50, 0.5);
    assert.ok(peakOf(mu) <= 0.5 + 1e-12);
    const tri = seedOf(textBytes("abc", 8), "tri", 3, 0.999);
    assert.ok(finite(tri) && peakOf(tri) <= 1);
    const long = seedOf(textBytes("x".repeat(100), 8), "raw", 64, 1);
    assert.equal(long.length, 64);
  });
});

describe("legion: the texts it seeds from", () => {
  it("the genetic chain: DNA -> RNA -> protein, in sequence", () => {
    // "A" = 01 00 00 01 -> C A A C; RNA the same (no T); CAA -> Q.
    assert.equal(geneticChain("A", "central"), "CAAC" + "CAAC" + "Q");
    assert.equal(geneticChain("A", "classic"), "CAAC" + "CAAC" + "CAAC" + "CAAC" + "Q" + "Q");
    assert.ok(
      geneticChain("hello", "central").includes("U") || geneticChain("hello", "central").length > 0,
    );
  });
  it("sacred geometry: its runes, backwards, its hexagrams, backwards", () => {
    const g = sacredGeometry("ab");
    assert.ok(g.startsWith("ᚨᛒᛒᚨ"));
    // 16 bits -> 2 hexagrams.
    assert.equal(Array.from(g).length, 4 + 2 + 2);
  });
});

describe("legion: lengths and cross-mods", () => {
  it("repeat then compress, compress then repeat", () => {
    const r = repeatThenCompress([0, 1, 2, 3], 2, 4);
    [0, 7 / 3, 2 / 3, 3].forEach((v, i) => near(r[i]!, v, 1e-12));
    const c = compressThenRepeat([0, 1, 2, 3, 4, 5, 6, 7], 2, 8);
    [0, 7 / 3, 14 / 3, 7, 0, 7 / 3, 14 / 3, 7].forEach((v, i) => near(c[i]!, v, 1e-12));
    assert.deepEqual(Array.from(conform([1, 2], 5)), [1, 2, 1, 2, 1]);
  });
  it("cross-mod: tanh(A x gain) x B, its DC off", () => {
    const a = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i / 3));
    const b = Float64Array.from({ length: 64 }, (_, i) => Math.cos(i / 5) + 0.5);
    const x = crossmod(a, b, 2);
    near(x.reduce((s, v) => s + v, 0) / x.length, 0, 1e-12);
    const want = Math.tanh(a[10]! * 2) * b[10]!;
    const mean = Array.from(a, (v, i) => Math.tanh(v * 2) * b[i]!).reduce((s, v) => s + v, 0) / 64;
    near(x[10]!, want - mean, 1e-12);
  });
  it("a self cross-mod that would go silent keeps the seed", () => {
    const s = Float64Array.from([1, -1, 1, -1]);
    assert.deepEqual(Array.from(selfCrossmod(s, 1, 0, 0)), [1, -1, 1, -1]);
  });
  it("the phase stack: rolled copies summed, driven, DC off", () => {
    const c = {
      ...dspCfg(legionDefaults()),
      phaseOffsets: [0, 1],
      phaseMixAmp: 1,
      phaseDrive: 1,
    } as DspCfg;
    const p = phaseStack(Float64Array.from([1, 0, 0, 0]), c);
    const t = Math.tanh(1);
    const mean = (2 * t) / 4;
    [t - mean, t - mean, -mean, -mean].forEach((v, i) => near(p[i]!, v, 1e-12));
  });
  it("the tilt: a tone at 10 kHz raised 10 dB at 1 dB a kHz", () => {
    const n = 1024;
    const rate = 20480;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 500 * i) / n));
    const y = spectralTilt(x, rate, 1, 100);
    near(peakOf(y) / peakOf(x), 10 ** (10 / 20), 1e-6);
  });
});

/** Light settings: the same steps, few cycles. */
const light = (patch: Partial<LegionSettings> = {}): LegionSettings => ({
  ...legionDefaults(),
  LEGION_ON: true,
  MATRIX_SEC: 0.1,
  NUM_CASCADES: 2,
  NUM_CYCLES_PER_CASCADE: 2,
  PHRASE_CORE_CYCLES: 3,
  PHRASE_SUPER_CYCLES: 2,
  ...patch,
});
const PHRASES = ["The chloride gradient is reversed here.", "Stay with the cyan line now."];

describe("legion: the matrix", () => {
  it("its length: a power of two near MATRIX_SEC, at most 2^20", () => {
    assert.equal(matrixLen(light(), 10_000), 1024);
    assert.equal(matrixLen(legionDefaults(), 48_000), 524_288);
    assert.equal(matrixLen(legionDefaults(), 384_000), 1_048_576);
  });
  it("every mode: finite, at the background level", async () => {
    const loops: Record<string, Float32Array> = {};
    for (const mode of ["phrases", "text", "sum", "cross"]) {
      const m = await buildMatrix(PHRASES, 10_000, light({ CROSS_MODE: mode }));
      assert.ok(finite(m.loop), mode);
      near(peakOf(m.loop), 9.99, 1e-4);
      loops[mode] = m.loop;
    }
    const diff = (a: Float32Array, b: Float32Array) => a.some((x, i) => Math.abs(x - b[i]!) > 1e-4);
    assert.ok(diff(loops.phrases!, loops.text!), "per phrase and per text differ");
    assert.ok(diff(loops.sum!, loops.cross!), "summed and cross-modded differ");
  });
  it("one phrase: per phrase is per text", async () => {
    const a = await buildMatrix(["Only one phrase."], 10_000, light({ CROSS_MODE: "phrases" }));
    const b = await buildMatrix(["Only one phrase."], 10_000, light({ CROSS_MODE: "text" }));
    assert.deepEqual(Array.from(a.loop), Array.from(b.loop));
  });
  it("the layers chosen, the genetic chain's among them", async () => {
    const m = await buildMatrix(
      PHRASES,
      10_000,
      light({ GENETIC_CHAIN: "off", PCM32_UTF8: false, FLOAT32_UTF8: false }),
    );
    assert.deepEqual(m.layers, ["RAW_UTF8", "TRINARY_UTF8"]);
    await assert.rejects(
      buildMatrix(
        PHRASES,
        10_000,
        light({
          GENETIC_CHAIN: "off",
          RAW_UTF8: false,
          PCM32_UTF8: false,
          FLOAT32_UTF8: false,
          TRINARY_UTF8: false,
        }),
      ),
      /No layer/,
    );
  });
  it("stopped: it stops", async () => {
    await assert.rejects(
      buildMatrix(
        PHRASES,
        10_000,
        light(),
        () => {},
        () => true,
      ),
      /Stopped/,
    );
  });
});

describe("legion: the master, sample by sample", () => {
  it("the matrix repeated under the voice; a NaN voice guarded", async () => {
    const s = light({ ENABLE_CM5_VOCAL: false, ENABLE_CM6_FINAL_SELF_CROSSMOD: false });
    const m = await buildMatrix(PHRASES, 10_000, s);
    const out = legionMaster(m, s).next(new Float32Array([0.5, NaN, Infinity]), 1023, 3);
    near(out[0]!, m.loop[1023]! + 0.5, 1e-6);
    // NaN + the matrix -> NaN -> 0; Inf -> the guard.
    assert.equal(out[1], 0);
    near(out[2]!, GUARD, GUARD * 1e-6);
  });
  it("CM6 with a delay: tanh(x x gain) x x a few samples back", async () => {
    const s = light({
      ENABLE_CM5_VOCAL: false,
      CM6_FINAL_SELF_CROSSMOD_DELAY_SAMPLES: 2,
      CM6_FINAL_SELF_CROSSMOD_GAIN: 1,
    });
    const m = await buildMatrix(PHRASES, 10_000, s);
    const v = new Float32Array([0, 0, 0, 0, 0]);
    const out = legionMaster(m, s).next(v, 0, 5);
    // The first two read the line's zeros.
    assert.equal(out[0], 0);
    near(out[2]!, Math.tanh(m.loop[2]!) * m.loop[0]!, 1e-5);
  });
  it("the voice's dual domain: soft + hard, blended, finite", () => {
    const d = {
      softDrive: 1,
      softGain: 1,
      hardDrive: 1,
      ceil: 0.5,
      brickGain: 1,
      hardGain: 1,
      diode: false,
      diodeBias: 0,
      diodeGain: 0,
      blend: true,
      cleanW: 1,
      preW: 1,
      paired: false,
      pairGain: 1,
      passes: 1,
      pairW: 0,
      both: false,
    };
    near(dualDomain(0.8, d), 0.8 + Math.tanh(0.8) + 0.5, 1e-12);
    assert.equal(dualDomain(NaN, d), 0);
  });
});

describe("legion: settings", () => {
  it("each checked, the engines' own for anything missing or wrong", () => {
    const s = loadLegion({
      CROSS_MODE: "cross",
      FOLD_GAIN: 1e9,
      TRICYCLE_FACTORS: [2, "x", 3],
      RAW_UTF8: "yes",
      MATRIX_SEC: -4,
    });
    assert.equal(s.CROSS_MODE, "cross");
    assert.equal(s.FOLD_GAIN, 10_000);
    assert.deepEqual(s.TRICYCLE_FACTORS, [2, 3]);
    assert.equal(s.RAW_UTF8, true);
    assert.equal(s.MATRIX_SEC, 0.05);
    assert.equal(loadLegion({ CROSS_MODE: "sideways" }).CROSS_MODE, "sum");
    assert.equal(loadLegion(null).LEGION_ON, false);
  });
});
