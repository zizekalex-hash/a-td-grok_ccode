/**
 * The Legion engine's seeds: a text's bytes (UTF-8, UTF-16 or UTF-32) read as
 * a sound in each encoding of the user's legion9 engine (generate_matched_seed /
 * generate_trinary_seed): RAW bits (1 bit = 1 sample, -1 / +1), PCM 8 / 16 / 32
 * / 64, FLOAT 16 / 32 / 64 (their NaN / Inf caught), mu-law, A-law, signed and
 * unsigned bytes, trinary; and the text transforms it seeds from too (the
 * genetic chain DNA -> RNA -> protein, the sacred geometry runes + I Ching).
 * Pure: no page.
 */
import { aLaw, conform, guard, muLaw, peakOf, type Arr } from "./legionDsp.ts";

export type SeedKind =
  | "raw"
  | "pcm8"
  | "u8"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "f16"
  | "f32"
  | "f64"
  | "mulaw"
  | "alaw"
  | "tri";

export interface Encoding {
  id: string;
  utf: 8 | 16 | 32;
  kind: SeedKind;
  /** On to start (as in legion9). */
  on: boolean;
}

/** legion9's 21-layer pyramid and its other text encodings, in its order. */
export const ENCODINGS: Encoding[] = [
  { id: "RAW_UTF8", utf: 8, kind: "raw", on: true },
  { id: "RAW_UTF16", utf: 16, kind: "raw", on: false },
  { id: "RAW_UTF32", utf: 32, kind: "raw", on: false },
  { id: "PCM8_UTF8", utf: 8, kind: "pcm8", on: false },
  { id: "PCM16_UTF8", utf: 8, kind: "i16", on: false },
  { id: "PCM16_UTF16", utf: 16, kind: "i16", on: false },
  { id: "PCM32_UTF8", utf: 8, kind: "i32", on: true },
  { id: "PCM32_UTF16", utf: 16, kind: "i32", on: false },
  { id: "PCM32_UTF32", utf: 32, kind: "i32", on: false },
  { id: "PCM64_UTF8", utf: 8, kind: "i64", on: false },
  { id: "PCM64_UTF16", utf: 16, kind: "i64", on: false },
  { id: "PCM64_UTF32", utf: 32, kind: "i64", on: false },
  { id: "FLOAT16_UTF8", utf: 8, kind: "f16", on: false },
  { id: "FLOAT16_UTF16", utf: 16, kind: "f16", on: false },
  { id: "FLOAT32_UTF8", utf: 8, kind: "f32", on: true },
  { id: "FLOAT32_UTF16", utf: 16, kind: "f32", on: false },
  { id: "FLOAT32_UTF32", utf: 32, kind: "f32", on: false },
  { id: "FLOAT64_UTF8", utf: 8, kind: "f64", on: false },
  { id: "FLOAT64_UTF16", utf: 16, kind: "f64", on: false },
  { id: "FLOAT64_UTF32", utf: 32, kind: "f64", on: false },
  { id: "MULAW_UTF8", utf: 8, kind: "mulaw", on: false },
  { id: "ALAW_UTF8", utf: 8, kind: "alaw", on: false },
  { id: "RAW8_SIGNED", utf: 8, kind: "i8", on: false },
  { id: "RAW8_UNSIGNED", utf: 8, kind: "u8", on: false },
  { id: "TRINARY_UTF8", utf: 8, kind: "tri", on: true },
];

/** The text's bytes: UTF-8, or UTF-16 / UTF-32 little-endian (as Python's utf-16le / utf-32le). */
export function textBytes(text: string, utf: 8 | 16 | 32): Uint8Array {
  if (utf === 8) return new TextEncoder().encode(text);
  if (utf === 16) {
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      out[2 * i] = c & 255;
      out[2 * i + 1] = c >> 8;
    }
    return out;
  }
  const cps = Array.from(text, (ch) => ch.codePointAt(0) ?? 0);
  const out = new Uint8Array(cps.length * 4);
  cps.forEach((cp, i) => {
    out[4 * i] = cp & 255;
    out[4 * i + 1] = (cp >> 8) & 255;
    out[4 * i + 2] = (cp >> 16) & 255;
    out[4 * i + 3] = (cp >>> 24) & 255;
  });
  return out;
}

const SIZE: Record<SeedKind, number> = {
  raw: 1,
  pcm8: 1,
  u8: 1,
  i8: 1,
  tri: 1,
  i16: 2,
  f16: 2,
  i32: 4,
  f32: 4,
  mulaw: 4,
  alaw: 4,
  i64: 8,
  f64: 8,
};

/** Its natural length: RAW 8 samples a byte (a bit each), TRINARY one a byte, the others one a value. */
export function naturalLen(bytes: Uint8Array, kind: SeedKind): number {
  const n = Math.max(1, bytes.length);
  if (kind === "raw") return 8 * n;
  if (kind === "tri") return n;
  return Math.ceil(n / SIZE[kind]);
}

function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 31;
  const m = h & 1023;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/** The raw values (before any scaling), padded with zeros to a whole value. */
function values(bytes: Uint8Array, kind: SeedKind): Arr {
  const b = bytes.length ? bytes : new Uint8Array([0]);
  if (kind === "raw") {
    const out = new Float64Array(8 * b.length);
    for (let i = 0; i < out.length; i++) out[i] = (b[i >> 3]! >> (7 - (i & 7))) & 1 ? 1 : -1;
    return out;
  }
  const size = SIZE[kind];
  const padded = new Uint8Array(Math.ceil(b.length / size) * size);
  padded.set(b);
  const v = new DataView(padded.buffer);
  const n = padded.length / size;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const at = i * size;
    switch (kind) {
      case "pcm8":
        out[i] = padded[at]! / 128 - 1;
        break;
      case "u8":
      case "tri":
        out[i] = (padded[at]! - 128) / 128;
        break;
      case "i8":
        out[i] = v.getInt8(at) / 128;
        break;
      case "i16":
        out[i] = v.getInt16(at, true);
        break;
      case "i32":
        out[i] = v.getInt32(at, true);
        break;
      case "i64":
        out[i] = Number(v.getBigInt64(at, true));
        break;
      case "f16":
        out[i] = half(v.getUint16(at, true));
        break;
      case "f64":
        out[i] = v.getFloat64(at, true);
        break;
      default:
        out[i] = v.getFloat32(at, true);
    }
  }
  // NaN -> 0, +-Inf -> +-the largest finite value (generate_matched_seed's guard).
  let fin = 0;
  for (const x of out) if (Number.isFinite(x)) fin = Math.max(fin, Math.abs(x));
  if (!fin) fin = 1;
  for (let i = 0; i < n; i++) {
    const x = out[i]!;
    if (x !== x) out[i] = 0;
    else if (x === Infinity) out[i] = fin;
    else if (x === -Infinity) out[i] = -fin;
  }
  return out;
}

function tile(a: Arr, n: number): Arr {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i % a.length]!;
  return out;
}

/**
 * generate_trinary_seed: each byte % 3 - 1 (-1, 0, +1), repeated up to repeatTo
 * (if longer), brought to W, its mean off, silent -> 1, -1, peak to amp.
 */
export function trinarySeed(bytes: Uint8Array, W: number, amp: number, repeatTo = 0): Arr {
  const b = bytes.length ? bytes : new Uint8Array([0]);
  let trits: Arr = Float64Array.from(b, (x) => (x % 3) - 1);
  if (repeatTo > trits.length) trits = tile(trits, repeatTo);
  const t = conform(trits, W);
  let mean = 0;
  for (const x of t) mean += x;
  mean /= t.length || 1;
  for (let i = 0; i < t.length; i++) t[i] = t[i]! - mean;
  if (peakOf(t) < 1e-9) {
    t[0] = 1;
    if (t.length > 1) t[1] = -1;
  }
  const p = peakOf(t) + 1e-10;
  for (let i = 0; i < t.length; i++) t[i] = guard((t[i]! / p) * amp);
  return t;
}

/**
 * generate_matched_seed (natural length, nothing cut): the encoding's values,
 * repeated up to repeatTo (MATCH_RAW_LENGTH: its family's longest), brought to
 * W (compressed if longer, repeated if shorter), peak to 1, mu-law / A-law
 * companded for those, then peak to amp.
 */
export function seedOf(
  bytes: Uint8Array,
  kind: SeedKind,
  W: number,
  amp: number,
  triAmp = amp,
  repeatTo = 0,
): Arr {
  if (kind === "tri") return trinarySeed(bytes, W, triAmp, repeatTo);
  let b = bytes;
  let rep = repeatTo;
  if (kind === "raw" && rep > 8 * b.length && rep % 8 === 0) {
    // RAW repeated up to rep bits = its bytes repeated up to rep / 8.
    const nb = new Uint8Array(rep / 8);
    for (let i = 0; i < nb.length; i++) nb[i] = b[i % Math.max(1, b.length)] ?? 0;
    b = nb;
    rep = 0;
  }
  let s = values(b, kind);
  let p = peakOf(s);
  if (!(p > 0)) {
    s = tile(Float64Array.from([1, -1]), Math.max(1, s.length, rep));
    p = 1;
  }
  for (let i = 0; i < s.length; i++) s[i] = s[i]! / p;
  const out = rep > s.length ? conform(tile(s, rep), W) : conform(s, W);
  let q = peakOf(out);
  if (!(q > 0)) {
    out.set(tile(Float64Array.from([1, -1]), out.length));
    q = 1;
  }
  for (let i = 0; i < out.length; i++) {
    let x = out[i]! / q;
    if (kind === "mulaw") x = muLaw(x);
    else if (kind === "alaw") x = aLaw(x);
    out[i] = x;
  }
  const f = peakOf(out) || 1;
  for (let i = 0; i < out.length; i++) out[i] = guard((out[i]! / f) * amp);
  return out;
}

// ---- The texts it seeds from too ----

const CODONS: Record<string, string> = {
  AUA: "I",
  AUC: "I",
  AUU: "I",
  AUG: "M",
  ACA: "T",
  ACC: "T",
  ACG: "T",
  ACU: "T",
  AAC: "N",
  AAU: "N",
  AAA: "K",
  AAG: "K",
  AGC: "S",
  AGU: "S",
  AGA: "R",
  AGG: "R",
  CUA: "L",
  CUC: "L",
  CUG: "L",
  CUU: "L",
  CCA: "P",
  CCC: "P",
  CCG: "P",
  CCU: "P",
  CAC: "H",
  CAU: "H",
  CAA: "Q",
  CAG: "Q",
  CGA: "R",
  CGC: "R",
  CGG: "R",
  CGU: "R",
  GUA: "V",
  GUC: "V",
  GUG: "V",
  GUU: "V",
  GCA: "A",
  GCC: "A",
  GCG: "A",
  GCU: "A",
  GAC: "D",
  GAU: "D",
  GAA: "E",
  GAG: "E",
  GGA: "G",
  GGC: "G",
  GGG: "G",
  GGU: "G",
  UCA: "S",
  UCC: "S",
  UCG: "S",
  UCU: "S",
  UUC: "F",
  UUU: "F",
  UUA: "L",
  UUG: "L",
  UAC: "Y",
  UAU: "Y",
  UAA: "_",
  UAG: "_",
  UGC: "C",
  UGU: "C",
  UGA: "_",
  UGG: "W",
};

const rev = (s: string) => Array.from(s).reverse().join("");

/**
 * The genetic chain (genetic_chain_text), in sequence: "central" = the text's
 * bits as DNA (2 a base: 00 A, 01 C, 10 G, 11 T) -> its RNA (T -> U) -> the
 * protein it codes (the standard code, "_" stop); "classic" = DNA, DNA
 * backwards, RNA, RNA backwards, amino acids, amino acids backwards.
 */
export function geneticChain(text: string, kind: "central" | "classic"): string {
  const bytes = new TextEncoder().encode(text);
  let dna = "";
  for (const b of bytes) for (let s = 6; s >= 0; s -= 2) dna += "ACGT"[(b >> s) & 3];
  const rna = dna.replace(/T/g, "U");
  let amino = "";
  for (let i = 0; i + 2 < rna.length; i += 3) amino += CODONS[rna.slice(i, i + 3)] ?? "";
  return kind === "central"
    ? dna + rna + amino
    : dna + rev(dna) + rna + rev(rna) + amino + rev(amino);
}

const RUNES: Record<string, string> = {
  a: "ᚨ",
  b: "ᛒ",
  c: "ᚲ",
  d: "ᛞ",
  e: "ᛖ",
  f: "ᚠ",
  g: "ᚷ",
  h: "ᚺ",
  i: "ᛁ",
  j: "ᛃ",
  k: "ᛚ",
  m: "ᛗ",
  n: "ᚾ",
  o: "ᛟ",
  p: "ᛈ",
  q: "ᚴ",
  r: "ᚱ",
  s: "ᛊ",
  t: "ᛏ",
  u: "ᢢ",
  v: "ᚡ",
  w: "ᚹ",
  x: "ᛪ",
  y: "ᛃ",
  z: "ᛉ",
  " ": " ",
};

/** text_to_sacred_geometry: its runes, backwards, its bits as I Ching hexagrams (6 a sign), backwards. */
export function sacredGeometry(text: string): string {
  const runic = Array.from(text, (c) => RUNES[c.toLowerCase()] ?? c).join("");
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];
  for (const b of bytes) for (let s = 7; s >= 0; s--) bits.push((b >> s) & 1);
  let iching = "";
  for (let i = 0; i + 5 < bits.length; i += 6)
    iching += String.fromCodePoint(0x4dc0 + parseInt(bits.slice(i, i + 6).join(""), 2));
  return runic + rev(runic) + iching + rev(iching);
}
