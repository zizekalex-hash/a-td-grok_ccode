/**
 * What every Legion setting does, in full, for its ⓘ: its own note, what its
 * kind of setting means (a gain, a weight, passes …), what its stage of the
 * engine does, its range and first value, and its name in the engines. Pure.
 */
import type { LegionField } from "@/game/legion";

/** What each stage of the engine does. */
const SECTION_INFO: Record<string, string> = {
  Legion:
    "The matrix itself: whether it is made, what it is made from (the text's bytes), whether the voice is on top of it or it plays alone, and how long one round of it is before it repeats.",
  Layers:
    "The seeds: the text's bytes read as sound, once for each encoding switched on (each a layer of legion9's pyramid), plus the genetic chain and sacred geometry. More layers: a thicker matrix, slower to make.",
  "Root seed":
    "Before the cascades: each seed is cross-modulated with a shifted copy of itself, pass after pass, and a clean copy is blended with the pre-modulated one, the two cross-modulated with each other.",
  Cycles:
    "The cascades: each seed run through cycles of tri-cycles (copies sped up and slowed down), a phase stack (copies offset in time, driven) and the seed mash, summed cycle after cycle; per text (all of it at once) and per phrase (each alone), then Tier 3 on the matrix.",
  Folds:
    "Wave folding in the cascades: the signal folded back on itself (a sine, or a triangle), its folds accumulating, low-passed every few iterations to keep it from turning to noise; the super fold folds the lows, mids and highs apart.",
  "Cross-mods":
    "Signals multiplied with each other (tanh(a × gain) × b, added on): the cascades in pairs, the phrases with the whole text, the layers with each other, the voice with the matrix (CM5) and, last, the whole with a delayed copy of itself (CM6).",
  "Voice (dual domain)":
    "The voice on top, shaped before it meets the matrix: soft and hard clipping, a brick-wall ceiling, a diode's one-sided bend, a clean and pre-shaped blend, and their cross-mod.",
  Master:
    "The finish: the levels of each part, saturation over all of it, a spectral tilt, the background matrix's and the voice's peaks, the ultrasonic smasher, the neuro basher's bursts, and the file's own peak.",
};

/** What a kind of setting means, from its name in the engines. */
function hint(key: string, kind: LegionField["kind"]): string {
  if (kind === "toggle") {
    if (key.endsWith("_BIDIRECTIONAL"))
      return "Both ways: A cross-modulated by B and B by A, both added on; off, one way only.";
    if (/_UTF(8|16|32)$|^RAW8_|^GEN_/.test(key)) return "";
    return "On: this part of the engine runs; off: it is skipped (the rest goes on without it).";
  }
  if (kind === "list")
    return "Numbers apart (commas or spaces), one for each copy; taken when you leave the box or press Enter.";
  if (kind === "choice") return "";
  if (/_GAIN$/.test(key))
    return "How hard it drives the cross-mod: the signal times this before its curve (tanh), so higher is harsher and denser; 0 does nothing; below 0 flips it.";
  if (/_WEIGHT$/.test(key))
    return "Its share where it is mixed with the rest: 0 leaves it out, 1 as it is, above 1 more of it.";
  if (/_PASSES$|_ITER$/.test(key))
    return "How many times in a row it is done, each on the last one's result: more is denser and slower to make.";
  if (/MIX_AMP$|_AMP$/.test(key)) return "A level: what it makes is multiplied by this.";
  if (/_DRIVE$|DRIVE_MULT$/.test(key))
    return "How hard it is pushed into its curve: more is more bent (distorted).";
  if (/CUTOFF$/.test(key))
    return "Where its filter turns: 1 is half the sample rate (the highest pitch there is).";
  if (/_DB/.test(key)) return "In decibels.";
  if (/SAMPLES$|SHIFT_ELEMENTS$|DELAY/.test(key)) return "In samples, at the file's rate.";
  if (/_SEC$|INTERVAL$|BURST$/.test(key)) return "In seconds.";
  if (/^NUM_|CASCADES$|CYCLES$/.test(key)) return "How many: more is denser and slower to make.";
  if (/CEILING$/.test(key))
    return "The highest the voice may go: anything above is cut flat there.";
  if (/BIAS$/.test(key)) return "Where the diode starts to pass: the bend's centre.";
  if (/_FACTOR$|_MULT$|_RATE$|_BASE$/.test(key)) return "A multiplier in its sum.";
  if (/FRACTION$/.test(key)) return "A share of the sample rate.";
  return "";
}

/** What an encoding layer reads the text's bytes as. */
function encodingInfo(key: string): string {
  const utf = /_UTF(8|16|32)$/.exec(key)?.[1];
  const from = utf ? `the text as UTF-${utf} bytes` : "the text's bytes";
  if (key.startsWith("RAW_"))
    return `RAW: ${from}, one bit a sample (1 high, 0 low): the text's own bit pattern, as sound.`;
  if (key.startsWith("PCM8")) return `PCM8: ${from}, a byte a sample (0..255 around the middle).`;
  const pcm = /^PCM(16|32|64)/.exec(key)?.[1];
  if (pcm)
    return `PCM${pcm}: ${from}, read ${Number(pcm) / 8} bytes at a time as whole numbers (${pcm}-bit samples).`;
  const fl = /^FLOAT(16|32|64)/.exec(key)?.[1];
  if (fl)
    return `FLOAT${fl}: ${from}, read ${Number(fl) / 8} bytes at a time as floating-point numbers (wild values, guarded: NaN to 0, ±Inf to the limit).`;
  if (key.startsWith("MULAW")) return `μ-law: ${from}, each byte expanded as telephone μ-law.`;
  if (key.startsWith("ALAW")) return `A-law: ${from}, each byte expanded as telephone A-law.`;
  if (key === "RAW8_SIGNED") return "Signed bytes: the text's bytes as −128..127 samples.";
  if (key === "RAW8_UNSIGNED")
    return "Unsigned bytes: the text's bytes as 0..255 samples, centred.";
  if (key.startsWith("TRINARY")) return `TRINARY: ${from} in base 3, a digit a sample (−1, 0, +1).`;
  if (key.startsWith("GEN_"))
    return "The genetic chain's own layer in this encoding (the chain itself is chosen above).";
  return "";
}

/** A setting's range and first value, in words. */
function rangeOf(f: LegionField): string {
  if (f.kind === "toggle") return `${f.def === true ? "On" : "Off"} to start (the engines' own).`;
  if (f.kind === "choice") {
    const first = f.choices?.find(([id]) => id === f.def)?.[1];
    return `Choices: ${(f.choices ?? []).map(([, t]) => t).join(" · ")}.${first ? ` ${first} to start.` : ""}`;
  }
  if (f.kind === "list")
    return `To start: ${Array.isArray(f.def) ? f.def.join(", ") : String(f.def)}${f.min !== undefined && f.max !== undefined ? ` (each ${f.min} to ${f.max})` : ""}.`;
  return `${f.min} to ${f.max}${f.step && f.step >= 1 ? " (whole numbers)" : ""}; ${String(f.def)} to start (the engines' own).`;
}

/** Every paragraph of a setting's ⓘ, in order. */
export function legionInfo(f: LegionField): string[] {
  const out: string[] = [];
  if (f.help) out.push(f.help);
  const enc = f.section === "Layers" ? encodingInfo(f.key) : "";
  if (enc) out.push(enc);
  const h = hint(f.key, f.kind);
  if (h) out.push(h);
  const sec = SECTION_INFO[f.section];
  if (sec) out.push(`${f.section}: ${sec}`);
  out.push(rangeOf(f));
  out.push(`Its name in the engines (legion9 / expand): ${f.key}.`);
  return out;
}
