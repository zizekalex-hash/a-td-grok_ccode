/**
 * The Atelier: every queen's look, and your own, changed by hand. A look is what
 * a portrait is drawn from (portrait.ts Look): traits (hair, eyes, ears,
 * headpiece, outfit, adornment, marking), colours, and a shape, sliders from -1
 * to 1 that widen a jaw, lift a brow or lengthen a neck. What you change is kept
 * on the device (LOOKS_KEY) and laid over config.json's looks, which are never
 * touched: they are the originals. This file is the lists the Atelier offers,
 * and the checks a saved look goes through. Pure, so the tests can load it.
 */

import { CONFIG, type CourtQueenKey } from "../config.ts";
import { BODIES, HAIR_STYLES, LASHES, SHAPE_KEYS, type Look, type ShapeKey } from "./portrait.ts";
import { ADORNMENTS, OUTFITS } from "./attire.ts";

/** Where the looks made by hand are kept on the device. */
export const LOOKS_KEY = "azshara-court-looks-v1";

/** Whose look: a queen's, or your own. */
export type Who = CourtQueenKey | "you";

/** Everything made in the Atelier. */
export interface Looks {
  /** Each queen's look, if it was changed. */
  queens: Partial<Record<CourtQueenKey, Look>>;
  /** Your own look, if it was changed. */
  you: Look | null;
  /** The name over your figure on the map. */
  name: string;
}

/** A trait and what it can be: each value with the word shown for it. */
export type TraitKey =
  | "hairStyle"
  | "eyeStyle"
  | "lashes"
  | "ears"
  | "headpiece"
  | "marking"
  | "outfit"
  | "adorn"
  | "body";

const named = (values: readonly string[], names: Record<string, string>) =>
  values.map((v) => [v, names[v] ?? v.charAt(0).toUpperCase() + v.slice(1)] as [string, string]);

export const TRAITS: Record<TraitKey, { name: string; options: [string, string][] }> = {
  hairStyle: { name: "Hair", options: named(HAIR_STYLES, {}) },
  eyeStyle: {
    name: "Eyes",
    options: named(["open", "glow", "closed"], { glow: "Glowing", closed: "Dreaming" }),
  },
  lashes: { name: "Lids", options: named(LASHES, { full: "Winged liner", none: "Plain" }) },
  ears: { name: "Ears", options: named(["round", "elf"], {}) },
  headpiece: {
    name: "On her head",
    options: named(["none", "crown", "voidcrown", "tiara", "circlet", "hood"], {
      voidcrown: "Void crown",
    }),
  },
  marking: {
    name: "Marking",
    options: named(["", "moon", "tattoo", "runes", "beauty"], { "": "None", beauty: "Beauty mark" }),
  },
  outfit: { name: "Outfit", options: named(OUTFITS, { armor: "Armour" }) },
  adorn: { name: "In her hair", options: named(["none", ...ADORNMENTS], {}) },
  body: { name: "Body", options: named(BODIES, {}) },
};

/** A colour of a look: where it is kept, what the Atelier calls it, its swatches, and whether it may be left to itself. */
export type ColourKey = "skin" | "hair" | "sheen" | "eyes" | "shadow" | "lips" | "horns" | "accent";

export const COLOURS: Record<
  ColourKey,
  { name: string; palette: keyof typeof CONFIG.court.atelier.palettes; none?: string }
> = {
  skin: { name: "Skin", palette: "skin" },
  hair: { name: "Hair", palette: "hair" },
  sheen: { name: "Hair's shine", palette: "hair", none: "As the hair" },
  eyes: { name: "Eyes", palette: "eyes" },
  shadow: { name: "Eyeshadow", palette: "accent", none: "As the dress" },
  lips: { name: "Lips", palette: "lips" },
  horns: { name: "Horns", palette: "horns", none: "No horns" },
  accent: { name: "Dress and jewels", palette: "accent" },
};

/** A slider: what it is called, and what its two ends mean. */
export const SLIDERS: Record<ShapeKey, { name: string; low: string; high: string }> = {
  headWidth: { name: "Head width", low: "narrow", high: "wide" },
  headLength: { name: "Head length", low: "short", high: "long" },
  jaw: { name: "Jaw", low: "narrow", high: "wide" },
  chin: { name: "Chin", low: "short", high: "long" },
  cheeks: { name: "Cheeks", low: "lean", high: "full" },
  blush: { name: "Blush", low: "pale", high: "rosy" },
  earSize: { name: "Ears", low: "small", high: "large" },
  eyeSize: { name: "Eye size", low: "small", high: "large" },
  eyeSpace: { name: "Eyes apart", low: "close", high: "wide" },
  eyeHeight: { name: "Eye height", low: "low", high: "high" },
  eyeTilt: { name: "Eye tilt", low: "down", high: "up" },
  browHeight: { name: "Brow height", low: "low", high: "high" },
  browThick: { name: "Brow weight", low: "thin", high: "thick" },
  browArch: { name: "Brow arch", low: "flat", high: "arched" },
  noseSize: { name: "Nose size", low: "small", high: "large" },
  noseLength: { name: "Nose length", low: "short", high: "long" },
  lipWidth: { name: "Lip width", low: "narrow", high: "wide" },
  lipFull: { name: "Lip fullness", low: "thin", high: "full" },
  mouthHeight: { name: "Mouth height", low: "low", high: "high" },
  hairVolume: { name: "Hair volume", low: "sleek", high: "full" },
  hornSize: { name: "Horn size", low: "small", high: "large" },
  neckLength: { name: "Neck length", low: "short", high: "long" },
  neckWidth: { name: "Neck width", low: "slender", high: "thick" },
  shoulders: { name: "Shoulders", low: "narrow", high: "broad" },
  figure: { name: "How near", low: "far", high: "near" },
  height: { name: "Height", low: "short", high: "tall" },
  build: { name: "Build", low: "slight", high: "sturdy" },
  chest: { name: "Chest", low: "flat", high: "full" },
  waist: { name: "Waist", low: "narrow", high: "wide" },
  hips: { name: "Hips", low: "narrow", high: "wide" },
  legs: { name: "Legs", low: "short", high: "long" },
  limbs: { name: "Arms and legs", low: "slender", high: "strong" },
};

/** The Atelier's pages: what each lets you change, in order. */
export interface Page {
  id: string;
  name: string;
  traits: TraitKey[];
  colours: ColourKey[];
  sliders: ShapeKey[];
  /** The background's two colours are chosen here. */
  bg?: boolean;
}

export const PAGES: Page[] = [
  {
    id: "face",
    name: "Face",
    traits: ["ears", "marking"],
    colours: ["skin"],
    sliders: ["headWidth", "headLength", "jaw", "chin", "cheeks", "blush", "earSize"],
  },
  {
    id: "eyes",
    name: "Eyes",
    traits: ["eyeStyle", "lashes"],
    colours: ["eyes", "shadow"],
    sliders: ["eyeSize", "eyeSpace", "eyeHeight", "eyeTilt", "browHeight", "browThick", "browArch"],
  },
  {
    id: "mouth",
    name: "Nose & lips",
    traits: [],
    colours: ["lips"],
    sliders: ["noseSize", "noseLength", "lipWidth", "lipFull", "mouthHeight"],
  },
  {
    id: "hair",
    name: "Hair",
    traits: ["hairStyle", "adorn"],
    colours: ["hair", "sheen", "horns"],
    sliders: ["hairVolume", "hornSize"],
  },
  {
    id: "body",
    name: "Body",
    traits: ["body"],
    colours: [],
    sliders: [
      "height",
      "build",
      "shoulders",
      "chest",
      "waist",
      "hips",
      "legs",
      "limbs",
      "neckLength",
      "neckWidth",
      "figure",
    ],
  },
  {
    id: "dress",
    name: "Dress",
    traits: ["outfit", "headpiece"],
    colours: ["accent"],
    sliders: [],
    bg: true,
  },
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** The longest name you can give yourself. */
export const NAME_MAX = 12;

/** A name as it may be: letters, numbers, spaces and a few marks, trimmed; the start's name when nothing is left. */
export function cleanName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const kept = Array.from(text.replace(/[^\p{L}\p{N} .'_-]/gu, ""))
    .slice(0, NAME_MAX)
    .join("")
    .trim();
  return kept || CONFIG.court.atelier.you.name;
}

/** A shape as it may be: each known slider from -1 to 1, to two places; a slider at 0 is left out. */
export function cleanShape(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const key of SHAPE_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const n = Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
    if (n !== 0) out[key] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A look as it may be, whatever was saved: each trait one of those there are,
 * each colour a colour, each slider in range. Anything else falls back to
 * `base` (the original look), so an old or damaged save still draws.
 */
export function cleanLook(raw: unknown, base: Look): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const trait = (key: TraitKey, fallback: string): string => {
    const v = r[key];
    return typeof v === "string" && TRAITS[key].options.some(([o]) => o === v) ? v : fallback;
  };
  /** A colour that must be one. */
  const colour = (key: "skin" | "hair" | "eyes" | "accent"): string =>
    isHex(r[key]) ? (r[key] as string) : base[key];
  /** A colour that may be left to itself (""). */
  const loose = (key: "sheen" | "shadow" | "lips" | "horns"): string =>
    isHex(r[key]) || r[key] === "" ? (r[key] as string) : (base[key] ?? "");
  const bg = Array.isArray(r.bg) && r.bg.length >= 2 && isHex(r.bg[0]) && isHex(r.bg[1])
    ? [r.bg[0] as string, r.bg[1] as string]
    : [base.bg[0] ?? "#2a1840", base.bg[1] ?? "#0b0614"];
  const look: Look = {
    skin: colour("skin"),
    hair: colour("hair"),
    sheen: loose("sheen"),
    hairStyle: trait("hairStyle", base.hairStyle),
    eyes: colour("eyes"),
    eyeStyle: trait("eyeStyle", base.eyeStyle),
    shadow: loose("shadow"),
    lips: loose("lips"),
    ears: trait("ears", base.ears),
    horns: loose("horns"),
    headpiece: trait("headpiece", base.headpiece),
    accent: colour("accent"),
    bg,
    marking: trait("marking", base.marking),
    outfit: trait("outfit", base.outfit ?? "gown"),
    adorn: trait("adorn", base.adorn ?? "none"),
    lashes: trait("lashes", base.lashes ?? "full"),
    body: trait("body", base.body ?? "feminine"),
  };
  const shape = cleanShape(r.shape);
  if (shape) look.shape = shape;
  return look;
}

/** Whether two looks draw the same picture. */
export function sameLook(a: Look, b: Look): boolean {
  return JSON.stringify(cleanLook(a, a)) === JSON.stringify(cleanLook(b, b));
}

/** The looks kept on the device, checked: whatever is wrong or unknown is left out. */
export function loadLooks(data: unknown): Looks {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const queens: Looks["queens"] = {};
  const saved = (d.queens && typeof d.queens === "object" ? d.queens : {}) as Record<string, unknown>;
  for (const q of Object.keys(CONFIG.court.queens) as CourtQueenKey[]) {
    const raw = saved[q];
    if (!raw || typeof raw !== "object") continue;
    const base = CONFIG.court.queens[q].look;
    const look = cleanLook(raw, base);
    // The same as the original: nothing to keep.
    if (!sameLook(look, base)) queens[q] = look;
  }
  const mine = CONFIG.court.atelier.you.look;
  const you = d.you && typeof d.you === "object" ? cleanLook(d.you, mine) : null;
  return { queens, you: you && !sameLook(you, mine) ? you : null, name: cleanName(d.name) };
}

/** The original look: a queen's from config.json, or the one you start with. */
export function originalLook(who: Who): Look {
  return who === "you" ? CONFIG.court.atelier.you.look : CONFIG.court.queens[who].look;
}

/** Whose look, in a word: her name, or You. */
export function whoName(who: Who): string {
  return who === "you" ? "You" : CONFIG.court.queens[who].name;
}

/**
 * A look thrown together: every trait and colour picked from those offered, and
 * every slider pushed a little (as far as court.atelier.random lets it). rand
 * gives numbers from 0 to 1.
 */
export function randomLook(rand: () => number = Math.random): Look {
  const A = CONFIG.court.atelier;
  const pick = <T>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))]!;
  const option = (key: TraitKey) => pick(TRAITS[key].options)[0];
  const bg = pick(A.palettes.bg);
  const shape: Record<string, number> = {};
  for (const key of SHAPE_KEYS) {
    // Where she stands is left as it is: a random distance reads as a mistake.
    if (key === "figure") continue;
    shape[key] = (rand() * 2 - 1) * A.random;
  }
  const look: Look = {
    skin: pick(A.palettes.skin),
    hair: pick(A.palettes.hair),
    sheen: "",
    hairStyle: option("hairStyle"),
    eyes: pick(A.palettes.eyes),
    // Mostly open eyes: glowing and dreaming ones are rarer.
    eyeStyle: rand() < 0.7 ? "open" : option("eyeStyle"),
    shadow: rand() < 0.5 ? "" : pick(A.palettes.accent),
    lips: pick(A.palettes.lips),
    ears: option("ears"),
    horns: rand() < 0.25 ? pick(A.palettes.horns) : "",
    headpiece: option("headpiece"),
    accent: pick(A.palettes.accent),
    bg: [bg[0] ?? "#2a1840", bg[1] ?? "#0b0614"],
    marking: rand() < 0.5 ? "" : option("marking"),
    outfit: option("outfit"),
    adorn: option("adorn"),
    lashes: rand() < 0.8 ? "full" : "none",
    body: rand() < 0.8 ? "feminine" : "masculine",
    shape,
  };
  return cleanLook(look, look);
}

/** A look with one slider set (0 takes it out). */
export function withShape(look: Look, key: ShapeKey, value: number): Look {
  const shape = cleanShape({ ...look.shape, [key]: value });
  const next: Look = { ...look };
  if (shape) next.shape = shape;
  else delete next.shape;
  return next;
}
