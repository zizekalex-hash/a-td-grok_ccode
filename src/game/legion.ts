/**
 * The Legion engine: the user's legion9 / expand Python matrix, in the app.
 * A phrase or a whole text is read as sound in each chosen encoding of its bytes
 * (legionSeeds.ts), each seed cross-modulated with itself (the root seed), then
 * cascaded at its natural length (tri-cycles, phase stack, seed mash, folds);
 * PER PHRASE (each phrase alone, then all of them MIXED) and PER TEXT (the
 * whole text at once), used alone, summed, or cross-modulated with each other
 * (CROSS_MODE); then cascaded again on the matrix (Tier 3), the layers cross-
 * modulated with each other, mixed, saturated, tilted and brought to the
 * background level. Under the voice (CON TTS, on top) it is repeated for the
 * whole file, with the master steps (vocal cross-mod, smasher, basher, the
 * final self cross-mod) and the NaN / Inf guard on every sample.
 * Every setting is the engines' own, by its name. Pure: no page.
 */
import {
  accumulativeCascade,
  blendCleanPre,
  butter,
  coreCascade,
  crossmod,
  filter,
  fold,
  guard,
  guardAll,
  hardAmp,
  pairedCrossmod,
  peakOf,
  removeDc,
  selfCrossmod,
  spectralTilt,
  conform,
  type Arr,
  type DspCfg,
} from "./legionDsp.ts";
import {
  ENCODINGS,
  geneticChain,
  naturalLen,
  sacredGeometry,
  seedOf,
  textBytes,
  type SeedKind,
} from "./legionSeeds.ts";

// ---- Settings: each the engines' own, by its name ----

export type LegionValue = number | boolean | string | number[];

export interface LegionField {
  key: string;
  label: string;
  section: string;
  kind: "toggle" | "num" | "choice" | "list";
  def: LegionValue;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  choices?: readonly (readonly [string, string])[];
  help?: string;
}

const tog = (
  section: string,
  key: string,
  label: string,
  def: boolean,
  help?: string,
): LegionField => ({
  section,
  key,
  label,
  kind: "toggle",
  def,
  help,
});
const num = (
  section: string,
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step = 0.001,
  help?: string,
): LegionField => ({
  section,
  key,
  label,
  kind: "num",
  def,
  min,
  max,
  step,
  digits: step >= 1 ? 0 : step >= 0.1 ? 2 : 3,
  help,
});
const whole = (
  section: string,
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  help?: string,
) => num(section, key, label, def, min, max, 1, help);
const list = (
  section: string,
  key: string,
  label: string,
  def: number[],
  min: number,
  max: number,
  help?: string,
): LegionField => ({
  section,
  key,
  label,
  kind: "list",
  def,
  min,
  max,
  help,
});

export const CROSS_MODES = [
  ["phrases", "Per phrase (mixed)"],
  ["text", "Per text"],
  ["sum", "Both, summed"],
  ["cross", "Both, cross-modded"],
] as const;
export type CrossMode = (typeof CROSS_MODES)[number][0];

export const LEGION_SECTIONS = [
  "Legion",
  "Layers",
  "Root seed",
  "Cycles",
  "Folds",
  "Cross-mods",
  "Voice (dual domain)",
  "Master",
] as const;

const S = LEGION_SECTIONS;
const AMP = 10_000;

export const LEGION_FIELDS: LegionField[] = [
  tog(
    S[0],
    "LEGION_ON",
    "Legion matrix in the .tts.wav",
    false,
    "Made into the phrase's (or text's) .tts.wav, under the voice.",
  ),
  {
    section: S[0],
    key: "CROSS_MODE",
    label: "Per phrase (mixed) or per text",
    kind: "choice",
    def: "sum",
    choices: CROSS_MODES,
    help: "Per phrase: each phrase cascaded alone, all of them mixed. Per text: the whole text at once. Both: summed (legion9's dual-core fusion), or cross-modulated with each other (tanh(phrases x gain) x text, and back).",
  },
  tog(
    S[0],
    "CON_TTS",
    "The voice on top (CON TTS)",
    true,
    "Off: the matrix alone, MATRIX_ONLY_SEC long.",
  ),
  num(
    S[0],
    "MATRIX_SEC",
    "Matrix length (s), repeated under it",
    9.9,
    0.05,
    60,
    0.1,
    "Rounded to a power of two of samples (at most 1,048,576).",
  ),
  num(S[0], "MATRIX_ONLY_SEC", "Length without the voice (s)", 60, 1, 3600, 1),
  tog(S[0], "MATCH_RAW_LENGTH", "Each encoding as long as its RAW", true),
  tog(S[0], "ENABLE_MAX_FLOAT_OVERCHARGE", "Max-float (x amp, never normalised)", true),
  ...ENCODINGS.map((e) => tog(S[1], e.id, e.id, e.on)),
  {
    section: S[1],
    key: "GENETIC_CHAIN",
    label: "Genetic chain (its own layers)",
    kind: "choice",
    def: "central",
    choices: [
      ["off", "Off"],
      ["central", "DNA → RNA → protein"],
      ["classic", "Classic (+ backwards)"],
    ],
  },
  tog(S[1], "GEN_RAW", "Genetic RAW", true),
  tog(S[1], "GEN_PCM32", "Genetic PCM32", false),
  tog(S[1], "GEN_TRINARY", "Genetic TRINARY", true),
  tog(S[1], "ENABLE_SACRED_GEOMETRY", "Sacred geometry (runes + I Ching) RAW", false),
  tog(S[2], "ENABLE_ROOT_DUAL_TIER_SEED_SELF_CROSSMOD", "Root seed self cross-mod", true),
  num(S[2], "ROOT_SEED_SELF_CROSSMOD_GAIN", "Self cross-mod gain", 0.999, -AMP, AMP),
  whole(S[2], "ROOT_SEED_SHIFT_ELEMENTS", "Shifted by (samples)", 1, 0, 100_000),
  whole(S[2], "ROOT_SEED_PHRASE_SELF_CROSSMOD_PASSES", "Passes, per phrase", 1, 1, 64),
  whole(S[2], "ROOT_SEED_DOCUMENT_SELF_CROSSMOD_PASSES", "Passes, per text", 1, 1, 64),
  tog(S[2], "ENABLE_ROOT_SEED_CLEAN_PRE_BLEND", "Clean + pre-modulated blend", true),
  num(S[2], "ROOT_SEED_CLEAN_WEIGHT", "Clean weight", 0.999, 0, AMP),
  num(S[2], "ROOT_SEED_PREMOD_WEIGHT", "Pre-modulated weight", 0.999, 0, AMP),
  tog(S[2], "ENABLE_ROOT_SEED_PAIRED_CROSSMOD", "Paired cross-mod (clean ↔ pre)", true),
  num(S[2], "ROOT_SEED_PAIR_CROSSMOD_GAIN", "Paired gain", 0.999, -AMP, AMP),
  whole(S[2], "ROOT_SEED_PAIR_CROSSMOD_PASSES", "Paired passes", 1, 1, 64),
  num(S[2], "ROOT_SEED_PAIR_CROSSMOD_WEIGHT", "Paired weight", 0.999, 0, AMP),
  tog(S[2], "ROOT_SEED_PAIR_CROSSMOD_BIDIRECTIONAL", "Paired both ways", true),
  whole(S[3], "NUM_CASCADES", "Cascades, per text", 3, 0, 36),
  whole(S[3], "NUM_CYCLES_PER_CASCADE", "Cycles a cascade, per text", 9, 1, 360),
  whole(S[3], "PHRASE_CORE_CASCADES", "Cascades, per phrase", 1, 0, 36),
  whole(S[3], "PHRASE_CORE_CYCLES", "Cycles a cascade, per phrase", 36, 1, 360),
  whole(S[3], "PHRASE_SUPER_CASCADES", "Tier 3 cascades (on the matrix)", 1, 0, 36),
  whole(S[3], "PHRASE_SUPER_CYCLES", "Tier 3 cycles", 9, 1, 360),
  tog(S[3], "ENABLE_TRICYCLE", "Tri-cycles", true),
  list(S[3], "TRICYCLE_FACTORS", "Tri-cycle factors", [9.99, 6.66, 3.69], 0.01, 10_000),
  list(S[3], "TRICYCLE_WEIGHTS", "Tri-cycle weights", [0.999, 0.999, 0.999], -AMP, AMP),
  num(S[3], "TRICYCLE_MIX_AMP", "Tri-cycle mix amp", 0.999, -AMP, AMP),
  tog(S[3], "TRICYCLE_REVERSE", "Tri-cycles reversed too", false),
  num(S[3], "CASCADE_FALLBACK_SPEED", "Speed without tri-cycles", 9.99, 0.01, 10_000, 0.01),
  tog(S[3], "ENABLE_PHASE_STACK", "Phase stack", true),
  list(
    S[3],
    "PHASE_OFFSETS",
    "Phase offsets (samples)",
    [0, 9, 36, 99, 288, 696, 1569, 4320, 9999],
    -1e9,
    1e9,
  ),
  num(S[3], "PHASE_STACK_DRIVE", "Phase stack drive", 0.999, -AMP, AMP),
  num(S[3], "PHASE_STACK_MIX_AMP", "Phase stack mix amp", 0.999, -AMP, AMP),
  num(S[3], "MASH_SEED_FACTOR", "Seed mash factor", 0.999, -AMP, AMP),
  num(S[3], "CASCADE_CURRENT_WEIGHT", "Current weight", 0.999, -AMP, AMP),
  num(S[3], "CASCADE_INITIAL_WEIGHT", "Initial weight", 0.999, -AMP, AMP),
  num(S[3], "CASCADE_CYCLE_MIX_AMP", "Cycle sum mix amp, per text", 0.999, -AMP, AMP),
  num(S[3], "PHRASE_CORE_CYCLE_MIX_AMP", "Cycle sum mix amp, per phrase", 0.999, -AMP, AMP),
  tog(S[3], "ENABLE_PER_CYCLE_FOLD", "A fold every cycle", false),
  whole(S[3], "PER_CYCLE_FOLD_ITER", "Its iterations", 1, 1, 36),
  whole(S[4], "FOLD_ITER", "Fold iterations", 1, 1, 36),
  num(S[4], "FOLD_GAIN", "Fold gain", 0.999, -AMP, AMP),
  num(S[4], "FOLD_DRIVE_MULT", "Drive mult", 0.999, -AMP, AMP),
  num(S[4], "FOLD_SINE_MULT", "Sine mult", 0.999, -AMP, AMP),
  num(S[4], "FOLD_ACCUM_BASE", "Accumulate base", 0.999, -AMP, AMP),
  num(S[4], "FOLD_ACCUM_RATE", "Accumulate rate", 0.999, -AMP, AMP),
  num(S[4], "FOLD_BLEND", "Fold blend", 0.999, -AMP, AMP),
  num(S[4], "FOLD_FEEDBACK", "Feedback", 0.963, -AMP, AMP),
  num(S[4], "ALIEN_WARP_PI", "Warp π", 1.6180339887, -AMP, AMP, 0.0001),
  tog(S[4], "ENABLE_TRIANGLE_FOLD", "Triangle fold", true),
  num(S[4], "TRIANGLE_FOLD_PHASE", "Triangle phase", 1, -AMP, AMP),
  tog(S[4], "ENABLE_SEED_MODULATED_FOLD", "Seed-modulated fold", true),
  num(S[4], "SEED_MODULATION_FACTOR", "Seed modulation", 0.999, -AMP, AMP),
  whole(S[4], "FOLD_LOWPASS_EVERY", "Low-pass every (iterations)", 3, 1, 36),
  num(S[4], "FOLD_LOWPASS_CUTOFF", "Low-pass cut-off (1 = half the rate)", 0.369, 0.001, 0.999),
  tog(S[4], "ENABLE_SUPER_FOLD", "Super fold (lows / mids / highs)", true),
  whole(S[4], "SUPER_FOLD_MULT", "Super fold mult", 1, 1, 36),
  num(S[4], "SUPER_FOLD_LOW_CUTOFF", "Lows below", 0.1, 0.001, 0.999),
  num(S[4], "SUPER_FOLD_HIGH_CUTOFF", "Highs above", 0.3, 0.001, 0.999),
  num(S[4], "CASCADE_CLEAN_MIX_WEIGHT", "Clean mix weight", 0.999, -AMP, AMP),
  num(S[4], "CASCADE_DIRTY_MIX_WEIGHT", "Dirty mix weight", 0.999, -AMP, AMP),
  num(S[5], "CROSSMOD_GAIN", "Cross-mod gain (mash, folds)", 0.999, -AMP, AMP),
  whole(S[5], "CROSSMOD_PASSES", "Cross-mod passes", 1, 1, 64),
  num(S[5], "CASCADE_PAIR_CROSSMOD_GAIN", "Cascade pairs cross-mod gain", 0.999, -AMP, AMP),
  num(S[5], "CASCADE_PAIR_MIX_AMP", "Cascade pairs mix amp", 0.999, -AMP, AMP),
  num(S[5], "PHRASE_ENC_PHRASES_MIX_AMP", "All phrases mixed, x", 0.999, -AMP, AMP),
  num(S[5], "SUPER_ENC_BLEND", "Phrases + text blend", 0.999, -AMP, AMP),
  num(S[5], "PHRASE_TEXT_CROSSMOD_GAIN", "Phrases × text cross-mod gain", 0.999, -AMP, AMP),
  whole(S[5], "PHRASE_TEXT_CROSSMOD_PASSES", "Phrases × text passes", 1, 1, 64),
  num(S[5], "PHRASE_TEXT_CROSSMOD_WEIGHT", "Phrases × text weight", 0.999, -AMP, AMP),
  tog(S[5], "PHRASE_TEXT_CROSSMOD_BIDIRECTIONAL", "Phrases × text both ways", true),
  tog(S[5], "ENABLE_LAYER_CROSSMOD", "Layers cross-modded with each other", true),
  num(S[5], "LAYER_CROSSMOD_GAIN", "Layer cross-mod gain", 0.999, -AMP, AMP),
  whole(S[5], "LAYER_CROSSMOD_PASSES", "Layer cross-mod passes", 1, 1, 64),
  num(S[5], "LAYER_CROSSMOD_MIX_WEIGHT", "Layer cross-mod weight", 0.999, -AMP, AMP),
  tog(S[5], "LAYER_CROSSMOD_BIDIRECTIONAL", "Layer cross-mods both ways", true),
  num(S[5], "LAYER_CROSSMOD_PAIRS_MIX_AMP", "Layer cross-mod pairs mix amp", 0.999, -AMP, AMP),
  tog(S[5], "ENABLE_CM5_VOCAL", "CM5: the voice × the matrix", true),
  num(S[5], "CM5_VOCAL_GAIN", "CM5 gain", 0.999, -AMP, AMP),
  num(S[5], "VOCAL_CROSSMOD_SCALE", "CM5 level", 0.999, -AMP, AMP),
  tog(S[5], "ENABLE_CM6_FINAL_SELF_CROSSMOD", "CM6: final self cross-mod", true),
  num(S[5], "CM6_FINAL_SELF_CROSSMOD_GAIN", "CM6 gain", 0.999, -AMP, AMP),
  whole(S[5], "CM6_FINAL_SELF_CROSSMOD_PASSES", "CM6 passes", 1, 1, 64),
  whole(S[5], "CM6_FINAL_SELF_CROSSMOD_DELAY_SAMPLES", "CM6 delay (samples)", 0, 0, 1_000_000),
  tog(S[6], "ENABLE_DUAL_DOMAIN_DSP", "Dual domain on the voice", true),
  num(S[6], "DUAL_DOMAIN_SOFT_DRIVE", "Soft drive", 0.999, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_SOFT_GAIN", "Soft gain", 0.999, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_HARD_DRIVE", "Hard drive", 0.999, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_BRICK_CEILING", "Brick ceiling", 0.999, 0, AMP),
  num(S[6], "DUAL_DOMAIN_BRICK_GAIN", "Brick gain", 0.369, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_HARD_GAIN", "Hard gain", 0.369, -AMP, AMP),
  tog(S[6], "DUAL_DOMAIN_DIODE_ENABLED", "Diode", false),
  num(S[6], "DUAL_DOMAIN_DIODE_BIAS", "Diode bias", 0, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_DIODE_GAIN", "Diode gain", 0.1, -AMP, AMP),
  tog(S[6], "ENABLE_DUAL_DOMAIN_CLEAN_PRE_BLEND", "Clean + pre blend", true),
  num(S[6], "DUAL_DOMAIN_CLEAN_WEIGHT", "Clean weight", 0.999, -AMP, AMP),
  num(S[6], "DUAL_DOMAIN_PREMOD_WEIGHT", "Pre weight", 0.999, -AMP, AMP),
  tog(S[6], "ENABLE_DUAL_DOMAIN_PAIRED_CROSSMOD", "Paired cross-mod", true),
  num(S[6], "DUAL_DOMAIN_PAIRED_CROSSMOD_GAIN", "Paired gain", 0.999, -AMP, AMP),
  whole(S[6], "DUAL_DOMAIN_PAIRED_CROSSMOD_PASSES", "Paired passes", 1, 1, 64),
  num(S[6], "DUAL_DOMAIN_PAIRED_CROSSMOD_WEIGHT", "Paired weight", 0.999, -AMP, AMP),
  tog(S[6], "DUAL_DOMAIN_PAIRED_CROSSMOD_BIDIRECTIONAL", "Paired both ways", true),
  num(S[7], "PROCESSING_AMP", "Processing amp", 0.999, -AMP, AMP),
  num(S[7], "ENCODING_AMP", "Encoding amp", 0.999, -AMP, AMP),
  num(S[7], "TRINARY_AMP", "Trinary amp", 0.999, -AMP, AMP),
  num(S[7], "MATRIX_FAMILY_MIX_AMP", "Layers mixed, x", 0.999, -AMP, AMP),
  tog(S[7], "ENABLE_GLOBAL_MASTER_SATURATION", "Master saturation", true),
  num(S[7], "GLOBAL_MASTER_SATURATION_DRIVE", "Saturation drive", 0.999, -AMP, AMP),
  tog(S[7], "ENABLE_FOLDBACK_TILT", "Spectral tilt", true),
  num(S[7], "FOLDBACK_TILT_DB_PER_KHZ", "Tilt dB a kHz", 0.369, -1000, 1000),
  num(S[7], "FOLDBACK_TILT_MAX_DB", "Tilt at most (dB)", 36.9, -1000, 1000, 0.1),
  num(S[7], "BACKGROUND_MATRIX_AMP", "Background matrix peak", 9.99, 0, AMP, 0.01),
  num(S[7], "CONSCIOUS_AMP", "Voice peak (on top)", 18.9, 0, AMP, 0.1),
  tog(S[7], "ENABLE_RAW_OVERDRIVE_WALL", "Raw overdrive wall (voice + master amp)", true),
  num(S[7], "FINAL_MIX_AMP", "Master peak (the file)", 36.9, 0.001, AMP, 0.1),
  tog(S[7], "MASTER_NORMALIZE", "File peak brought to the master peak", true),
  tog(S[7], "ENABLE_ULTRASONIC_SMASHER", "Ultrasonic smasher", false),
  num(S[7], "SMASHER_AMP", "Smasher amp", 3.69, -AMP, AMP, 0.01),
  num(S[7], "SMASHER_CARRIER_FRACTION", "Smasher carrier (x the rate)", 0.45, 0, 0.5),
  tog(S[7], "ENABLE_NEURO_BASHER", "Neuro basher", false),
  num(S[7], "NEURO_BASHER_INTERVAL", "Basher every (s)", 36.9, 0.1, 3600, 0.1),
  num(S[7], "NEURO_BASHER_BURST", "Burst (s)", 0.09, 0.001, 10),
  num(S[7], "NEURO_BASHER_HPF_CUTOFF", "Burst high-pass (1 = half the rate)", 0.85, 0.001, 0.999),
];

export type LegionSettings = Record<string, LegionValue>;

export const LEGION_KEY = "azshara-legion-v1";

export function legionDefaults(): LegionSettings {
  return Object.fromEntries(
    LEGION_FIELDS.map((f) => [f.key, Array.isArray(f.def) ? [...f.def] : f.def]),
  );
}

/** One value checked against its field (its default if it does not fit). */
export function legionValue(f: LegionField, v: unknown): LegionValue {
  const clamp = (x: number) => Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, x));
  switch (f.kind) {
    case "toggle":
      return typeof v === "boolean" ? v : f.def;
    case "choice":
      return typeof v === "string" && f.choices?.some(([id]) => id === v) ? v : f.def;
    case "list":
      if (!Array.isArray(v)) return f.def;
      {
        const xs = v
          .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
          .slice(0, 64);
        return xs.length ? xs.map(clamp) : f.def;
      }
    default:
      return typeof v === "number" && Number.isFinite(v) ? clamp(v) : f.def;
  }
}

/** Saved settings, each value checked (the defaults for anything missing). */
export function loadLegion(raw: unknown): LegionSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(LEGION_FIELDS.map((f) => [f.key, legionValue(f, r[f.key])]));
}

export const n = (s: LegionSettings, k: string) => Number(s[k]);
export const on = (s: LegionSettings, k: string) => s[k] === true;
const nums = (s: LegionSettings, k: string) => (Array.isArray(s[k]) ? (s[k] as number[]) : []);

export function dspCfg(s: LegionSettings): DspCfg {
  return {
    maxFloat: on(s, "ENABLE_MAX_FLOAT_OVERCHARGE"),
    processingAmp: n(s, "PROCESSING_AMP"),
    crossmodGain: n(s, "CROSSMOD_GAIN"),
    crossmodPasses: n(s, "CROSSMOD_PASSES"),
    tricycle: on(s, "ENABLE_TRICYCLE"),
    triFactors: nums(s, "TRICYCLE_FACTORS"),
    triWeights: nums(s, "TRICYCLE_WEIGHTS"),
    triMixAmp: n(s, "TRICYCLE_MIX_AMP"),
    triReverse: on(s, "TRICYCLE_REVERSE"),
    fallbackSpeed: n(s, "CASCADE_FALLBACK_SPEED"),
    phaseStack: on(s, "ENABLE_PHASE_STACK"),
    phaseOffsets: nums(s, "PHASE_OFFSETS"),
    phaseDrive: n(s, "PHASE_STACK_DRIVE"),
    phaseMixAmp: n(s, "PHASE_STACK_MIX_AMP"),
    mashFactor: n(s, "MASH_SEED_FACTOR"),
    currentWeight: n(s, "CASCADE_CURRENT_WEIGHT"),
    initialWeight: n(s, "CASCADE_INITIAL_WEIGHT"),
    cycleMixAmp: n(s, "CASCADE_CYCLE_MIX_AMP"),
    foldIter: n(s, "FOLD_ITER"),
    foldGain: n(s, "FOLD_GAIN"),
    foldDriveMult: n(s, "FOLD_DRIVE_MULT"),
    foldSineMult: n(s, "FOLD_SINE_MULT"),
    foldAccumBase: n(s, "FOLD_ACCUM_BASE"),
    foldAccumRate: n(s, "FOLD_ACCUM_RATE"),
    foldBlend: n(s, "FOLD_BLEND"),
    foldFeedback: n(s, "FOLD_FEEDBACK"),
    warpPi: n(s, "ALIEN_WARP_PI"),
    triangleFold: on(s, "ENABLE_TRIANGLE_FOLD"),
    trianglePhase: n(s, "TRIANGLE_FOLD_PHASE"),
    seedModFold: on(s, "ENABLE_SEED_MODULATED_FOLD"),
    seedModFactor: n(s, "SEED_MODULATION_FACTOR"),
    foldLowpassEvery: n(s, "FOLD_LOWPASS_EVERY"),
    foldLowpassCutoff: n(s, "FOLD_LOWPASS_CUTOFF"),
    perCycleFold: on(s, "ENABLE_PER_CYCLE_FOLD"),
    perCycleFoldIter: n(s, "PER_CYCLE_FOLD_ITER"),
    superFold: on(s, "ENABLE_SUPER_FOLD"),
    superFoldMult: n(s, "SUPER_FOLD_MULT"),
    superLow: n(s, "SUPER_FOLD_LOW_CUTOFF"),
    superHigh: n(s, "SUPER_FOLD_HIGH_CUTOFF"),
    cleanMixWeight: n(s, "CASCADE_CLEAN_MIX_WEIGHT"),
    dirtyMixWeight: n(s, "CASCADE_DIRTY_MIX_WEIGHT"),
    pairCrossmodGain: n(s, "CASCADE_PAIR_CROSSMOD_GAIN"),
    pairMixAmp: n(s, "CASCADE_PAIR_MIX_AMP"),
  };
}

// ---- The matrix ----

/** The matrix's length: MATRIX_SEC at the rate, to the nearest power of two (seamless when repeated, the tilt exact), at most 2^20. */
export function matrixLen(s: LegionSettings, rate: number): number {
  const want = Math.max(1024, n(s, "MATRIX_SEC") * rate);
  const p = Math.round(Math.log2(want));
  return 2 ** Math.min(20, Math.max(10, p));
}

/** A layer: an encoding of the text's bytes (or of a text made from it, like the genetic chain). */
interface LayerSpec {
  id: string;
  kind: SeedKind;
  utf: 8 | 16 | 32;
  /** What it reads instead of the phrase / text itself. */
  from?: (text: string) => string;
}

export function layersOf(s: LegionSettings): LayerSpec[] {
  const out: LayerSpec[] = ENCODINGS.filter((e) => on(s, e.id)).map((e) => ({
    id: e.id,
    kind: e.kind,
    utf: e.utf,
  }));
  const gen = String(s.GENETIC_CHAIN);
  if (gen === "central" || gen === "classic") {
    const from = (t: string) => geneticChain(t, gen);
    if (on(s, "GEN_RAW")) out.push({ id: "GEN_COMBINED_RAW", kind: "raw", utf: 8, from });
    if (on(s, "GEN_PCM32")) out.push({ id: "GEN_COMBINED_PCM32", kind: "i32", utf: 8, from });
    if (on(s, "GEN_TRINARY")) out.push({ id: "GEN_COMBINED_TRINARY", kind: "tri", utf: 8, from });
  }
  if (on(s, "ENABLE_SACRED_GEOMETRY"))
    out.push({ id: "SACRED_GEOMETRY_RAW", kind: "raw", utf: 8, from: sacredGeometry });
  return out;
}

/** The root seed pipeline: self cross-mod, blended with the clean seed, plus the paired cross-mod. */
export function rootSeed(clean: Arr, passes: number, s: LegionSettings): Arr {
  if (!on(s, "ENABLE_ROOT_DUAL_TIER_SEED_SELF_CROSSMOD")) return clean;
  const pre = selfCrossmod(
    clean,
    passes,
    n(s, "ROOT_SEED_SELF_CROSSMOD_GAIN"),
    n(s, "ROOT_SEED_SHIFT_ELEMENTS"),
  );
  let base = on(s, "ENABLE_ROOT_SEED_CLEAN_PRE_BLEND")
    ? blendCleanPre(clean, pre, n(s, "ROOT_SEED_CLEAN_WEIGHT"), n(s, "ROOT_SEED_PREMOD_WEIGHT"))
    : pre;
  const w = n(s, "ROOT_SEED_PAIR_CROSSMOD_WEIGHT");
  if (on(s, "ENABLE_ROOT_SEED_PAIRED_CROSSMOD") && w > 0) {
    const pair = pairedCrossmod(
      clean,
      pre,
      n(s, "ROOT_SEED_PAIR_CROSSMOD_GAIN"),
      n(s, "ROOT_SEED_PAIR_CROSSMOD_PASSES"),
      on(s, "ROOT_SEED_PAIR_CROSSMOD_BIDIRECTIONAL"),
    );
    base = Float64Array.from(base, (x, i) => guard(x + pair[i]! * w));
  }
  return base;
}

/** acc += a repeated end to end (its length any), x w. */
function tileAdd(acc: Arr, a: ArrayLike<number>, w = 1) {
  const L = a.length;
  if (!L) return;
  for (let i = 0; i < acc.length; i++) acc[i] = acc[i]! + a[i % L]! * w;
}

export interface LegionStep {
  (note: string, part: number): void;
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** One unit (a phrase, or the whole text) in one layer, at its natural length (compressed if longer than the matrix). */
function unitSeed(
  text: string,
  layer: LayerSpec,
  all: LayerSpec[],
  M: number,
  s: LegionSettings,
): { seed: Arr; natural: boolean } | null {
  const src = layer.from ? layer.from(text) : text;
  const bytes = textBytes(src, layer.utf);
  if (!bytes.length) return null;
  const own = naturalLen(bytes, layer.kind);
  // MATCH_RAW_LENGTH: the family (this unit's layers made from the same text) as long as its longest.
  let N = own;
  if (on(s, "MATCH_RAW_LENGTH"))
    for (const o of all)
      if ((o.from ? o.from(text) : text) === src)
        N = Math.max(N, naturalLen(textBytes(src, o.utf), o.kind));
  const W = Math.min(N, M);
  const seed = seedOf(
    bytes,
    layer.kind,
    W,
    n(s, "PROCESSING_AMP"),
    n(s, "TRINARY_AMP"),
    N > own ? N : 0,
  );
  return { seed, natural: N <= M };
}

export interface LegionMatrix {
  /** One loop of the matrix (length a power of two), at the background level. */
  loop: Float32Array;
  rate: number;
  layers: string[];
  /** The neuro basher's burst (empty: off). */
  burst: Float32Array;
}

/**
 * Builds the matrix for these phrases (the text's units, in order; a single
 * phrase alone) at `rate`. step: what it is doing, 0..1. stopped: asked to stop.
 */
export async function buildMatrix(
  phrases: string[],
  rate: number,
  s: LegionSettings,
  step: LegionStep = () => {},
  stopped: () => boolean = () => false,
): Promise<LegionMatrix> {
  const units = phrases.map((p) => p.trim()).filter(Boolean);
  const text = units.join("\n");
  if (!units.length) throw new Error("Nothing to make the matrix from");
  const c = dspCfg(s);
  const M = matrixLen(s, rate);
  const layers = layersOf(s);
  if (!layers.length) throw new Error("No layer is on (Layers)");
  const mode = String(s.CROSS_MODE) as CrossMode;
  const usePhrases = mode !== "text" && units.length > 1;
  const useText = mode !== "phrases" || units.length === 1;
  // The master seed (legion9's raw seed): the whole text's RAW bits.
  const masterBytes = textBytes(text, 8);
  const master = seedOf(
    masterBytes,
    "raw",
    Math.min(8 * masterBytes.length, M),
    n(s, "PROCESSING_AMP"),
  );
  const out: Arr[] = [];
  const total = layers.length;
  const halt = () => {
    if (stopped()) throw new Error("Stopped");
  };
  for (const [li, layer] of layers.entries()) {
    const at = (part: number) => (li + part) / total;
    let micro: Arr | null = null;
    if (usePhrases) {
      micro = new Float64Array(M);
      // Phrases of the same length are summed first, then repeated once.
      const byLen = new Map<number, Arr>();
      for (const [pi, unit] of units.entries()) {
        if (pi % 8 === 0) {
          halt();
          step(
            `Legion ${layer.id}: phrase ${pi + 1} of ${units.length}…`,
            at((0.6 * pi) / units.length),
          );
          await pause();
        }
        const u = unitSeed(unit, layer, layers, M, s);
        if (!u) continue;
        let arr = rootSeed(u.seed, n(s, "ROOT_SEED_PHRASE_SELF_CROSSMOD_PASSES"), s);
        arr = coreCascade(
          arr,
          n(s, "PHRASE_CORE_CASCADES"),
          n(s, "PHRASE_CORE_CYCLES"),
          c,
          n(s, "PHRASE_CORE_CYCLE_MIX_AMP"),
          u.natural ? "rtc" : "ctr",
        );
        if (n(s, "PHRASE_SUPER_CASCADES") > 0) {
          arr = fold(arr, arr, c);
          arr = fold(arr, master, c);
        }
        const sum = byLen.get(arr.length);
        if (sum) for (let i = 0; i < arr.length; i++) sum[i] = sum[i]! + arr[i]!;
        else byLen.set(arr.length, arr);
      }
      for (const a of byLen.values()) tileAdd(micro, a);
      const w = n(s, "PHRASE_ENC_PHRASES_MIX_AMP");
      for (let i = 0; i < M; i++) micro[i] = guard(micro[i]! * w);
    }
    let macro: Arr | null = null;
    if (useText) {
      halt();
      step(`Legion ${layer.id}: the whole text…`, at(0.6));
      await pause();
      const u = unitSeed(text, layer, layers, M, s);
      if (u) {
        let arr = rootSeed(u.seed, n(s, "ROOT_SEED_DOCUMENT_SELF_CROSSMOD_PASSES"), s);
        arr = accumulativeCascade(
          hardAmp(arr, n(s, "PROCESSING_AMP"), c.maxFloat),
          arr,
          n(s, "NUM_CASCADES"),
          n(s, "NUM_CYCLES_PER_CASCADE"),
          c,
          u.natural ? "rtc" : "ctr",
        );
        macro = conform(arr, M);
      }
    }
    // Per phrase and per text: alone, summed, or cross-modded.
    let layerOut: Arr;
    if (micro && macro) {
      const b = n(s, "SUPER_ENC_BLEND");
      layerOut = hardAmp(
        Float64Array.from(micro, (x, i) => (x + macro![i]!) * b),
        n(s, "PROCESSING_AMP"),
        c.maxFloat,
      );
      if (mode === "cross") {
        const g = n(s, "PHRASE_TEXT_CROSSMOD_GAIN");
        const passes = n(s, "PHRASE_TEXT_CROSSMOD_PASSES");
        const w = n(s, "PHRASE_TEXT_CROSSMOD_WEIGHT");
        const fwd = crossmod(micro, macro, g, passes);
        const back = on(s, "PHRASE_TEXT_CROSSMOD_BIDIRECTIONAL")
          ? crossmod(macro, micro, g, passes)
          : null;
        for (let i = 0; i < M; i++)
          layerOut[i] = guard(layerOut[i]! + (fwd[i]! + (back ? back[i]! : 0)) * w);
      }
    } else layerOut = micro ?? macro ?? new Float64Array(M);
    // Tier 3: the layer cascaded again on the matrix (compress, then repeat).
    if (n(s, "PHRASE_SUPER_CASCADES") > 0) {
      halt();
      step(`Legion ${layer.id}: Tier 3 cascades…`, at(0.8));
      await pause();
      layerOut = accumulativeCascade(
        layerOut,
        conform(master, M),
        n(s, "PHRASE_SUPER_CASCADES"),
        n(s, "PHRASE_SUPER_CYCLES"),
        c,
        "ctr",
      );
    }
    out.push(layerOut);
  }
  // The layers cross-modded with each other (each product added onto the layer).
  let mixed = out;
  if (on(s, "ENABLE_LAYER_CROSSMOD") && out.length > 1) {
    step("Legion: the layers cross-modded…", 0.97);
    await pause();
    const g = n(s, "LAYER_CROSSMOD_GAIN");
    const passes = n(s, "LAYER_CROSSMOD_PASSES");
    const both = on(s, "LAYER_CROSSMOD_BIDIRECTIONAL");
    const amp = n(s, "LAYER_CROSSMOD_PAIRS_MIX_AMP") * n(s, "LAYER_CROSSMOD_MIX_WEIGHT");
    mixed = out.map((a, i) => {
      const acc = Float64Array.from(a);
      for (const [j, b] of out.entries()) {
        if (i === j) continue;
        const p = crossmod(a, b, g, passes);
        const q = both ? crossmod(b, a, g, passes) : null;
        for (let x = 0; x < M; x++) acc[x] = guard(acc[x]! + (p[x]! + (q ? q[x]! : 0)) * amp);
      }
      return acc;
    });
  }
  // The mix: summed x its amp, saturated, tilted, its DC off, brought to the background level.
  let m: Arr = new Float64Array(M);
  const fam = n(s, "MATRIX_FAMILY_MIX_AMP");
  for (const a of mixed) for (let i = 0; i < M; i++) m[i] = m[i]! + a[i]! * fam;
  m = hardAmp(m, n(s, "ENCODING_AMP"), c.maxFloat);
  if (on(s, "ENABLE_GLOBAL_MASTER_SATURATION")) {
    const p = peakOf(m) + 1e-10;
    const d = n(s, "GLOBAL_MASTER_SATURATION_DRIVE");
    m = removeDc(Float64Array.from(m, (x) => Math.tanh((x / p) * d) * p));
  }
  if (on(s, "ENABLE_FOLDBACK_TILT"))
    m = spectralTilt(m, rate, n(s, "FOLDBACK_TILT_DB_PER_KHZ"), n(s, "FOLDBACK_TILT_MAX_DB"));
  m = removeDc(m);
  const bp = peakOf(m) + 1e-12;
  const bg = n(s, "BACKGROUND_MATRIX_AMP");
  const loop = guardAll(Float32Array.from(m, (x) => (x / bp) * bg));
  // The neuro basher's burst: the matrix squeezed into the burst, high-passed, x the master amp.
  let burst = new Float32Array(0);
  if (on(s, "ENABLE_NEURO_BASHER")) {
    const len = Math.max(1, Math.round(n(s, "NEURO_BASHER_BURST") * rate));
    const sq = conform(m, len);
    const hp = filter(
      butter(2, n(s, "NEURO_BASHER_HPF_CUTOFF"), "high"),
      filter(butter(2, n(s, "NEURO_BASHER_HPF_CUTOFF"), "high"), sq),
    );
    burst = guardAll(Float32Array.from(hardAmp(hp, n(s, "FINAL_MIX_AMP"), c.maxFloat)));
  }
  return { loop, rate, layers: layers.map((l) => l.id), burst };
}

// ---- Under the voice, for the whole file: the master steps, sample by sample ----

/** The voice's dual-domain step (no oversampling): soft + hard (+ diode), blended with the clean, plus the paired cross-mod. */
export function dualDomain(x: number, s: DualCfg): number {
  const soft = Math.tanh(x * s.softDrive) * s.softGain;
  let hard = Math.min(s.ceil, Math.max(-s.ceil, x * s.hardDrive)) * s.brickGain;
  if (s.diode) hard += (Math.max(0, x * s.hardDrive) - s.diodeBias) * s.diodeGain;
  const pre = guard(soft + hard * s.hardGain);
  let fused = s.blend ? x * s.cleanW + pre * s.preW : pre;
  if (s.paired && s.pairW > 0) {
    let f = x;
    let r = pre;
    for (let k = 0; k < s.passes; k++) {
      f = guard(Math.tanh(f * s.pairGain) * pre);
      if (s.both) r = guard(Math.tanh(r * s.pairGain) * x);
    }
    fused += (f + (s.both ? r : 0)) * s.pairW;
  }
  return guard(fused);
}

export interface DualCfg {
  softDrive: number;
  softGain: number;
  hardDrive: number;
  ceil: number;
  brickGain: number;
  hardGain: number;
  diode: boolean;
  diodeBias: number;
  diodeGain: number;
  blend: boolean;
  cleanW: number;
  preW: number;
  paired: boolean;
  pairGain: number;
  passes: number;
  pairW: number;
  both: boolean;
}

export function dualCfg(s: LegionSettings): DualCfg | null {
  if (!on(s, "ENABLE_DUAL_DOMAIN_DSP")) return null;
  return {
    softDrive: n(s, "DUAL_DOMAIN_SOFT_DRIVE"),
    softGain: n(s, "DUAL_DOMAIN_SOFT_GAIN"),
    hardDrive: n(s, "DUAL_DOMAIN_HARD_DRIVE"),
    ceil: n(s, "DUAL_DOMAIN_BRICK_CEILING"),
    brickGain: n(s, "DUAL_DOMAIN_BRICK_GAIN"),
    hardGain: n(s, "DUAL_DOMAIN_HARD_GAIN"),
    diode: on(s, "DUAL_DOMAIN_DIODE_ENABLED"),
    diodeBias: n(s, "DUAL_DOMAIN_DIODE_BIAS"),
    diodeGain: n(s, "DUAL_DOMAIN_DIODE_GAIN"),
    blend: on(s, "ENABLE_DUAL_DOMAIN_CLEAN_PRE_BLEND"),
    cleanW: n(s, "DUAL_DOMAIN_CLEAN_WEIGHT"),
    preW: n(s, "DUAL_DOMAIN_PREMOD_WEIGHT"),
    paired: on(s, "ENABLE_DUAL_DOMAIN_PAIRED_CROSSMOD"),
    pairGain: n(s, "DUAL_DOMAIN_PAIRED_CROSSMOD_GAIN"),
    passes: Math.max(1, n(s, "DUAL_DOMAIN_PAIRED_CROSSMOD_PASSES")),
    pairW: n(s, "DUAL_DOMAIN_PAIRED_CROSSMOD_WEIGHT"),
    both: on(s, "DUAL_DOMAIN_PAIRED_CROSSMOD_BIDIRECTIONAL"),
  };
}

/** The voice before it is brought to its level: its dual-domain step, in place. */
export function voiceStep(v: Float32Array, d: DualCfg | null): Float32Array {
  if (d) for (let i = 0; i < v.length; i++) v[i] = dualDomain(v[i]!, d);
  else guardAll(v);
  return v;
}

/** The voice's level on top: CONSCIOUS_AMP (+ the master amp with the overdrive wall). */
export function voicePower(s: LegionSettings): number {
  return n(s, "CONSCIOUS_AMP") + (on(s, "ENABLE_RAW_OVERDRIVE_WALL") ? n(s, "FINAL_MIX_AMP") : 0);
}

export interface LegionMaster {
  /** The next piece (frames from `from`): the matrix repeated, the voice (already brought to its level) on top, the master steps. */
  next(voice: Float32Array | null, from: number, frames: number): Float32Array;
}

/**
 * The master, piece after piece (its states carried over): matrix + voice, CM5
 * (the voice x the matrix, its DC blocked), the ultrasonic smasher, the neuro
 * basher's bursts, CM6 (the final self cross-mod, delayed), the guard.
 */
export function legionMaster(mx: LegionMatrix, s: LegionSettings): LegionMaster {
  const loop = mx.loop;
  const L = loop.length;
  const cm5 = on(s, "ENABLE_CM5_VOCAL");
  const g5 = n(s, "CM5_VOCAL_GAIN");
  const w5 = n(s, "VOCAL_CROSSMOD_SCALE");
  const smash = on(s, "ENABLE_ULTRASONIC_SMASHER");
  const sAmp = n(s, "SMASHER_AMP");
  const ws = 2 * Math.PI * n(s, "SMASHER_CARRIER_FRACTION");
  const bash = mx.burst.length > 0;
  const every = Math.max(1, Math.round(n(s, "NEURO_BASHER_INTERVAL") * mx.rate));
  const cm6 = on(s, "ENABLE_CM6_FINAL_SELF_CROSSMOD");
  const g6 = n(s, "CM6_FINAL_SELF_CROSSMOD_GAIN");
  const p6 = Math.max(1, n(s, "CM6_FINAL_SELF_CROSSMOD_PASSES"));
  const d6 = Math.max(0, Math.round(n(s, "CM6_FINAL_SELF_CROSSMOD_DELAY_SAMPLES")));
  // CM6's delay lines (one a pass), and CM5's DC blocker (a one-pole high-pass at ~5 Hz).
  const lines = Array.from({ length: p6 }, () => new Float64Array(Math.max(1, d6)));
  let lineAt = 0;
  const r = Math.exp((-2 * Math.PI * 5) / mx.rate);
  let x1 = 0;
  let y1 = 0;
  return {
    next(voice, from, frames) {
      const out = new Float32Array(frames);
      for (let k = 0; k < frames; k++) {
        const j = from + k;
        const m = loop[j % L]!;
        const v = voice ? voice[k]! : 0;
        let x = m + v;
        if (cm5 && voice) {
          const c = Math.tanh(v * g5) * m;
          const y = c - x1 + r * y1;
          x1 = c;
          y1 = y;
          x += y * w5;
        }
        if (smash) x += x * Math.sin(ws * j) * sAmp;
        if (bash) {
          const b = j % every;
          if (j >= every && b < mx.burst.length) x += mx.burst[b]!;
        }
        if (cm6) {
          for (let p = 0; p < p6; p++) {
            let other = x;
            if (d6) {
              const line = lines[p]!;
              other = line[lineAt]!;
              line[lineAt] = x;
            }
            x = guard(Math.tanh(x * g6) * other);
          }
          if (d6) lineAt = (lineAt + 1) % d6;
        }
        out[k] = guard(x);
      }
      return out;
    },
  };
}
