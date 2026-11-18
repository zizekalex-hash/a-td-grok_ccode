/**
 * A whole figure, standing: the portrait's own head on a body drawn to the same
 * look, in the outfit it names. Its build is feminine or masculine, and the
 * Body page's sliders reshape it (height, build, chest, waist, hips, legs,
 * limbs, shoulders). Drawn in the portrait's units (the head is the portrait's,
 * as it is), feet on the floor at the bottom, so figures of any height stand on
 * the same ground. `step` lifts a foot and swings the arms, for walking.
 * Made in code, so it works offline. Pure, so the tests can load it.
 */

import { CONFIG, type CourtQueenKey } from "../config.ts";
import { outfitOf } from "./attire.ts";
import type { Mood } from "./hearts.ts";
import { headPieces, lookOf, looksRev, youLook, type Look, type ShapeKey } from "./portrait.ts";
import { f, gem, hex, shade } from "./svgkit.ts";

/** The figure's picture: 100 wide, from TOP down to a little under the floor. */
export const FIGURE_W = 100;
export const FIGURE_H = 332;
const TOP = -24;
const FLOOR = 302;

export interface FigureOptions {
  mood?: Mood;
  /** "dark" or "classic", as the portraits (court.portraits.style). */
  style?: string;
  /** Walking: -1 lifts the left foot, 1 the right, 0 stands. */
  step?: number;
}

/** A point of a limb or trunk: its middle, its height, its half-width. */
type P = [number, number, number];

/** A smooth outline down one side: through the middle of each pair of points, bending at the points. */
function run(pts: [number, number][]): string {
  let d = "";
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += ` Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const [lx, ly] = pts[pts.length - 1]!;
  return `${d} L${f(lx)} ${f(ly)}`;
}

/** A limb or a trunk as one closed shape: its half-widths at heights, smoothed. */
function limb(points: P[]): string {
  const left = points.map(([x, y, w]) => [x - w, y] as [number, number]);
  const right = points.map(([x, y, w]) => [x + w, y] as [number, number]).reverse();
  return `M${f(left[0]![0])} ${f(left[0]![1])}${run(left)} L${f(right[0]![0])} ${f(right[0]![1])}${run(right)} Z`;
}

/** Every point a little wider (clothes over a limb). */
const wider = (points: P[], by: number): P[] => points.map(([x, y, w]) => [x, y, w + by]);

/** The body's measures for a look: heights down the figure and half-widths at them. */
function measure(look: Look, step: number) {
  const reach = CONFIG.court.atelier.shape as Record<string, number>;
  const v = (key: ShapeKey) => {
    const n = look.shape?.[key];
    return typeof n === "number" && Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) * (reach[key] ?? 0) : 0;
  };
  const masc = look.body === "masculine";
  const b = 1 + v("build");
  const lim = (1 + v("limbs")) * (1 + v("build") * 0.6);
  const tall = 1 + v("height");
  // Heights: shoulders, armpits, chest, ribs, waist, hips, crotch; then knee, ankle, floor.
  const yS = 72.5;
  const trunk = (masc ? 90 : 87) * tall;
  const yA = yS + trunk * 0.19;
  const yB = yS + trunk * 0.3;
  const yR = yS + trunk * 0.42;
  const yW = yS + trunk * 0.56;
  const yH = yS + trunk * 0.82;
  const yC = yS + trunk;
  const leg = (masc ? 120 : 119) * tall * (1 + v("legs"));
  const yK = yC + leg * 0.46;
  const yN = yC + leg * 0.93;
  const yF = yC + leg;
  // Half-widths.
  const sh = (masc ? 29 : 23.5) * b * (1 + v("shoulders") * 1.2);
  const ch = (masc ? 21 : 17) * b;
  const chest = v("chest");
  const bust = masc ? 0.8 + chest * 1.6 : 2.4 + chest * 2.4;
  const wa = (masc ? 17 : 12.6) * b * (1 + v("waist"));
  const hp = (masc ? 17.2 : 19.6) * b * (1 + v("hips"));
  const thigh = (masc ? 8.8 : 9.4) * lim * (1 + v("hips") * 0.5);
  const knee = (masc ? 5.6 : 5) * lim;
  const calf = (masc ? 6.4 : 5.6) * lim;
  const ankle = (masc ? 3.5 : 3) * lim;
  const upper = (masc ? 5.6 : 4.2) * lim;
  const fore = (masc ? 4.6 : 3.5) * lim;
  const wrist = (masc ? 3 : 2.4) * lim;
  const neck = (masc ? 6.6 : 5.6) * (1 + v("neckWidth"));
  const torso: P[] = [
    [50, yS - 2.5, neck],
    [50, yS + 0.5, sh * 0.66],
    [50, yS + 5.5, sh],
    [50, yA, ch + 1.5],
    [50, yB, ch + bust],
    [50, yR, (ch + wa) / 2 + 0.4],
    [50, yW, wa],
    [50, (yW + yH) / 2 + 1, (wa + hp) / 2 + 0.8],
    [50, yH, hp],
    [50, yC - 2, hp * 0.97],
    [50, yC + 5, hp * 0.8],
  ];
  /** The trunk's half-width at a height. */
  const wide = (y: number): number => {
    for (let i = 1; i < torso.length; i++) {
      const [, y0, w0] = torso[i - 1]!;
      const [, y1, w1] = torso[i]!;
      if (y <= y1) return w0 + ((w1 - w0) * Math.max(0, y - y0)) / Math.max(0.001, y1 - y0);
    }
    return torso[torso.length - 1]![2];
  };
  /** A leg, hip to ankle; the stepping one lifts its knee and foot. */
  const legOf = (s: number): { pts: P[]; foot: [number, number] } => {
    const up = step === s ? 1 : 0;
    const xT = 50 + s * hp * 0.5;
    const xK = 50 + s * hp * 0.44;
    const xN = 50 + s * hp * 0.4;
    const k = yK - up * 5;
    const n = yN - up * 10;
    return {
      pts: [
        [xT, yH + 2, hp * 0.5],
        [xT - s * 0.5, yC + 8, Math.min(hp * 0.5, thigh * 1.02)],
        [(xT + xK) / 2, (yC + k) / 2 + 4, thigh * 0.86],
        [xK, k, knee],
        [xK + s * 0.3, k + (n - k) * 0.28, calf],
        [xN, n - 6, ankle * 1.15],
        [xN, n, ankle],
      ],
      foot: [xN, yF - up * 10],
    };
  };
  /** An arm, shoulder to wrist; walking, they swing against the legs. */
  const armOf = (s: number): { pts: P[]; hand: [number, number] } => {
    const swing = step ? (s === step ? -1 : 1) * 2.2 : 0;
    const ax = 50 + s * (sh - upper * 0.9);
    const yE = yW + 1;
    const yX = yC + 4;
    return {
      pts: [
        [ax, yS + 5, upper * 1.05],
        [ax + s * 1.2, yA + 6, upper],
        [ax + s * 2.6, yE, fore * 1.02],
        [ax + s * 3.6 + swing, yE + (yX - yE) * 0.5, fore * 0.92],
        [ax + s * 4.4 + swing * 1.6, yX, wrist],
      ],
      hand: [ax + s * 4.6 + swing * 1.6, yX + 5.5],
    };
  };
  return { masc, yS, yA, yB, yR, yW, yH, yC, yK, yN, yF, sh, ch, bust, wa, hp, wrist, ankle, lim, torso, wide, legOf, armOf };
}

type Body = ReturnType<typeof measure>;

/** The trunk between two heights, as clothes over it. */
function band(m: Body, top: number, bottom: number, by: number): string {
  const ys = [top, ...m.torso.map((p) => p[1]).filter((y) => y > top + 0.5 && y < bottom - 0.5), bottom];
  return limb(ys.map((y) => [50, y, m.wide(y) + by] as P));
}

/** A skirt from the waist: over the hips, out to its hem. */
function skirt(m: Body, hem: number, flare: number): string {
  const top = m.hp + 1.6;
  const end = m.hp + flare;
  return limb([
    [50, m.yW - 1.5, m.wa + 1],
    [50, m.yH, top],
    [50, (m.yH + hem) / 2, (top + end) / 2 + flare * 0.1],
    [50, hem, end],
  ]);
}

/** Folds down a skirt: a few soft lines from the hips to the hem. */
function folds(m: Body, hem: number, flare: number, color: string): string {
  const out: string[] = [];
  for (const t of [-0.62, -0.25, 0.2, 0.58]) {
    const x0 = 50 + t * m.hp * 0.8;
    const x1 = 50 + t * (m.hp + flare) * 0.92;
    out.push(`M${f(x0)} ${f(m.yH + 4)} Q${f((x0 + x1) / 2 + t * 2)} ${f((m.yH + hem) / 2)} ${f(x1)} ${f(hem - 1)}`);
  }
  return `<path d="${out.join(" ")}" fill="none" stroke="${color}" stroke-width="0.7" opacity="0.45" stroke-linecap="round"/>`;
}

/** A boot or shoe on a foot, and (for a boot) up the shin. */
function shoe(m: Body, s: number, color: string, boot: boolean): string {
  const leg = m.legOf(s);
  const [x, y] = leg.foot;
  const n = leg.pts[leg.pts.length - 1]!;
  const out = [
    `<path d="M${f(n[0] - n[2] - 0.6)} ${f(n[1] - 1)} L${f(n[0] + n[2] + 0.6)} ${f(n[1] - 1)} L${f(x + s * 5.6 + 0.2)} ${f(y - 0.6)} Q${f(x + s * 6)} ${f(y + 0.4)} ${f(x + s * 4)} ${f(y + 0.4)} L${f(x - s * 3.4)} ${f(y + 0.4)} Q${f(x - s * 4.4)} ${f(y - 1)} ${f(n[0] - s * (n[2] + 0.6))} ${f(n[1] - 1)} Z" fill="${color}"/>`,
  ];
  if (boot) out.push(`<path d="${limb(wider(leg.pts.slice(3), 0.9))}" fill="${color}"/>`);
  return out.join("");
}

/** What she wears, back to front: [behind the body, over the body]. */
function clothes(m: Body, look: Look, accent: string, rim: string): [string, string] {
  const kind = outfitOf(look.outfit);
  const dark = shade(accent, -0.5);
  const deep = shade(accent, -0.7);
  const light = shade(accent, 0.3);
  const leather = "#2a1d1a";
  const steel = "url(#fsteel)";
  const back: string[] = [];
  const out: string[] = [];
  const legs = (color: string) =>
    [-1, 1].map((s) => `<path d="${limb(wider(m.legOf(s).pts, 1.1))}" fill="${color}"/>`).join("") +
    `<path d="${band(m, m.yW - 1, m.yC + 5, 1)}" fill="${color}"/>`;
  const sleeves = (color: string, by = 1) =>
    [-1, 1].map((s) => `<path d="${limb(wider(m.armOf(s).pts, by))}" fill="${color}"/>`).join("");
  const boots = (color: string) => shoe(m, -1, color, true) + shoe(m, 1, color, true);
  const belt = (color: string) =>
    `<path d="${band(m, m.yW - 2.2, m.yW + 2.2, 1.4)}" fill="${color}"/>${gem(50, m.yW, 1.5, accent)}`;
  /** The low neckline of a gown: its top edge dips between the shoulders. */
  const lowTop = m.yA - 1;
  const dip = `<path d="M${f(50 - m.ch * 0.62)} ${f(lowTop - 0.4)} Q50 ${f(lowTop + 6.5)} ${f(50 + m.ch * 0.62)} ${f(lowTop - 0.4)} Z" fill="url(#fskin)"/>`;
  /** The line of the chest under cloth (a feminine build only). */
  const chestLine = m.masc
    ? ""
    : `<path d="M${f(50 - m.ch * 0.86)} ${f(m.yB + 1.5)} Q${f(50 - m.ch * 0.45)} ${f(m.yB + 5 + m.bust)} ${f(49.4)} ${f(m.yB + 1)} M${f(50 + m.ch * 0.86)} ${f(m.yB + 1.5)} Q${f(50 + m.ch * 0.45)} ${f(m.yB + 5 + m.bust)} ${f(50.6)} ${f(m.yB + 1)}" fill="none" stroke="#000000" stroke-width="0.8" opacity="0.22" stroke-linecap="round"/>`;
  const hem = m.yF - 1.5;
  const gown = (fill: string, flare: number, to = hem) =>
    `<path d="${skirt(m, to, flare)}" fill="${fill}"/>${folds(m, to, flare, deep)}` +
    `<path d="${band(m, lowTop, m.yW + 1, 1)}" fill="${fill}"/>${dip}${chestLine}`;
  const cape = (color: string, to: number) =>
    `<path d="M${f(50 - m.sh - 1)} ${f(m.yS + 3)} Q${f(50 - m.sh - 12)} ${f((m.yS + to) / 2)} ${f(50 - m.hp - 13)} ${f(to)} L${f(50 + m.hp + 13)} ${f(to)} Q${f(50 + m.sh + 12)} ${f((m.yS + to) / 2)} ${f(50 + m.sh + 1)} ${f(m.yS + 3)} Z" fill="${color}"/>`;
  if (look.headpiece === "hood") back.push(cape(shade(hex(accent, "#556070"), -0.6), m.yN - 8));
  switch (kind) {
    case "corset": {
      const to = m.yK + (m.yN - m.yK) * 0.55;
      out.push(shoe(m, -1, leather, false), shoe(m, 1, leather, false));
      out.push(`<path d="${skirt(m, to, 7)}" fill="url(#fcloth)"/>${folds(m, to, 7, deep)}`);
      out.push(`<path d="${band(m, lowTop, m.yW + 3, 1)}" fill="${dark}"/>${dip}${chestLine}`);
      // Lacing down the front.
      const lace: string[] = [];
      for (let y = lowTop + 8; y < m.yW; y += 4.4) lace.push(`M${f(47.4)} ${f(y)} L${f(52.6)} ${f(y + 2.2)} M${f(52.6)} ${f(y)} L${f(47.4)} ${f(y + 2.2)}`);
      out.push(`<path d="${lace.join(" ")}" fill="none" stroke="${light}" stroke-width="0.5"/>`);
      out.push(belt("url(#gold)"));
      break;
    }
    case "scales": {
      out.push(gown("url(#fcloth)", 2.5));
      // Rows of scales over the dress.
      const rows: string[] = [];
      for (let y = lowTop + 5, k = 0; y < hem - 3; y += 4.6, k++) {
        const w = (y < m.yW ? m.wide(y) : Math.min(m.hp + 2.5, m.wide(Math.min(y, m.yH)) + 1.5)) - 1;
        for (let x = -w + (k % 2 ? 2.2 : 0); x < w - 1; x += 4.4)
          rows.push(`M${f(50 + x)} ${f(y)} q2.2 3 4.4 0`);
      }
      out.push(`<path d="${rows.join(" ")}" fill="none" stroke="${light}" stroke-width="0.45" opacity="0.6"/>`);
      break;
    }
    case "regal":
      back.push(cape(dark, m.yF - 2));
      back.push(`<path d="M${f(50 - m.hp - 13)} ${f(m.yF - 2)} L${f(50 + m.hp + 13)} ${f(m.yF - 2)}" stroke="url(#gold)" stroke-width="2.2"/>`);
      out.push(gown("url(#fcloth)", 13));
      out.push(`<path d="M${f(50 - m.hp - 12.6)} ${f(hem - 2)} L${f(50 + m.hp + 12.6)} ${f(hem - 2)}" stroke="url(#gold)" stroke-width="1.8"/>`);
      out.push(belt("url(#gold)"));
      break;
    case "void": {
      const fill = shade(accent, -0.6);
      out.push(`<g filter="url(#glowSmall)"><path d="${skirt(m, hem, 11)}" fill="${rim}" opacity="0.35"/></g>`);
      out.push(gown(fill, 10));
      // A torn hem, lit from within.
      const teeth: string[] = [];
      for (let x = -(m.hp + 10); x < m.hp + 10; x += 5) teeth.push(`M${f(50 + x)} ${f(hem)} l2.5 5 l2.5 -5`);
      out.push(`<path d="${teeth.join(" ")}" fill="${fill}" stroke="${rim}" stroke-width="0.4"/>`);
      out.push(`<path d="M${f(50 - m.wa)} ${f(m.yW)} Q50 ${f(m.yW + 5)} ${f(50 + m.wa)} ${f(m.yW)}" fill="none" stroke="${rim}" stroke-width="0.7" filter="url(#glowSmall)"/>`);
      break;
    }
    case "robe":
      out.push(shoe(m, -1, leather, false), shoe(m, 1, leather, false));
      out.push(`<path d="${skirt(m, hem - 2, 5)}" fill="url(#fcloth)"/>${folds(m, hem - 2, 5, deep)}`);
      out.push(`<path d="${band(m, m.yS - 1, m.yW + 2, 1.6)}" fill="url(#fcloth)"/>${chestLine}`);
      out.push(sleeves("url(#fcloth)", 2.4));
      out.push(`<path d="M50 ${f(m.yS + 1)} L50 ${f(hem - 2)}" stroke="${deep}" stroke-width="0.7" opacity="0.6"/>`);
      out.push(belt(dark));
      break;
    case "coat": {
      const to = m.yK + 4;
      out.push(legs("#241c26"), boots(leather));
      out.push(`<path d="${band(m, m.yS - 1, m.yC, 1.4)}" fill="url(#fcloth)"/>`);
      // The coat's skirts, open at the front.
      out.push(`<path d="M${f(50 - m.wa - 1)} ${f(m.yW)} Q${f(50 - m.hp - 4)} ${f(m.yH)} ${f(50 - m.hp - 5)} ${f(to)} L${f(50 - 3.5)} ${f(to)} L${f(50 - 1.2)} ${f(m.yW)} Z M${f(50 + m.wa + 1)} ${f(m.yW)} Q${f(50 + m.hp + 4)} ${f(m.yH)} ${f(50 + m.hp + 5)} ${f(to)} L${f(50 + 3.5)} ${f(to)} L${f(50 + 1.2)} ${f(m.yW)} Z" fill="url(#fcloth)"/>`);
      out.push(sleeves("url(#fcloth)", 1.4));
      out.push(`<path d="M50 ${f(m.yS + 2)} L50 ${f(m.yW)}" stroke="${deep}" stroke-width="0.8"/>`);
      for (let y = m.yA; y < m.yW - 2; y += 7) out.push(gem(47.2, y, 0.7, "#e8c872") + gem(52.8, y, 0.7, "#e8c872"));
      out.push(chestLine, belt(dark));
      break;
    }
    case "armor": {
      out.push(legs("#221e2c"));
      out.push(shoe(m, -1, "#8f98ab", true), shoe(m, 1, "#8f98ab", true));
      out.push(sleeves("#2c2838", 0.8));
      // Breastplate, tassets, pauldrons and bracers.
      out.push(`<path d="${band(m, m.yS + 2, m.yW + 1, 1.6)}" fill="${steel}" stroke="#4a5266" stroke-width="0.5"/>`);
      out.push(`<path d="M50 ${f(m.yS + 6)} L50 ${f(m.yW)} M${f(50 - m.ch * 0.7)} ${f(m.yB + 2)} Q50 ${f(m.yB + 8)} ${f(50 + m.ch * 0.7)} ${f(m.yB + 2)}" fill="none" stroke="#4a5266" stroke-width="0.6"/>`);
      out.push(`<path d="${skirt(m, m.yC + 9, 1)}" fill="${steel}" stroke="#4a5266" stroke-width="0.5"/>`);
      for (const x of [-0.5, 0, 0.5]) out.push(`<path d="M${f(50 + x * m.hp)} ${f(m.yW + 2)} L${f(50 + x * m.hp * 1.1)} ${f(m.yC + 9)}" stroke="#4a5266" stroke-width="0.5"/>`);
      for (const s of [-1, 1]) {
        const a = m.armOf(s);
        out.push(`<ellipse cx="${f(a.pts[0]![0] + s * 0.6)}" cy="${f(m.yS + 6)}" rx="${f(a.pts[0]![2] + 3.4)}" ry="6.4" fill="${steel}" stroke="#4a5266" stroke-width="0.5"/>`);
        out.push(`<path d="${limb(wider(a.pts.slice(2), 1.5))}" fill="${steel}" stroke="#4a5266" stroke-width="0.4"/>`);
      }
      out.push(gem(50, m.yA + 2, 2.2, accent), belt(dark));
      break;
    }
    case "leather":
      out.push(legs("#2b2230"), boots(leather));
      out.push(`<path d="${band(m, m.yS - 1, m.yH - 2, 1.3)}" fill="${shade(accent, -0.62)}"/>`);
      out.push(sleeves(shade(accent, -0.66), 1));
      out.push(`<path d="M${f(50 - m.sh * 0.5)} ${f(m.yS + 2)} L50 ${f(m.yA + 6)} L${f(50 + m.sh * 0.5)} ${f(m.yS + 2)}" fill="none" stroke="${accent}" stroke-width="0.8" opacity="0.8"/>`);
      out.push(`<path d="M50 ${f(m.yA + 6)} L50 ${f(m.yH - 2)}" stroke="${accent}" stroke-width="0.5" opacity="0.6"/>`);
      out.push(chestLine, belt(leather));
      break;
    default:
      out.push(gown("url(#fcloth)", 14));
      out.push(belt("url(#gold)"));
  }
  return [back.join(""), out.join("")];
}

/**
 * A whole figure for a look, as an SVG document. `ring` is the colour that
 * rims her (a queen's own, or the look's accent).
 */
export function figureSvg(look: Look, ring: string, o: FigureOptions = {}): string {
  const style = o.style ?? CONFIG.court.portraits.style;
  const step = o.step === 1 || o.step === -1 ? o.step : 0;
  const head = headPieces(look, ring, { mood: o.mood, style });
  const m = measure(look, step);
  const skin = style === "dark" ? shade(hex(look.skin, "#f2c9a5"), -0.16) : hex(look.skin, "#f2c9a5");
  const accent = hex(look.accent, "#a855f7");
  const rim = hex(ring, accent);
  const [behind, worn] = clothes(m, look, accent, rim);
  const round = (id: string, base: string) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(base, -0.3)}"/><stop offset="0.35" stop-color="${base}"/><stop offset="0.55" stop-color="${shade(base, 0.14)}"/><stop offset="0.8" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.34)}"/></linearGradient>`;
  const body: string[] = [];
  for (const s of [-1, 1]) {
    const leg = m.legOf(s);
    const [fx, fy] = leg.foot;
    body.push(`<path d="${limb(leg.pts)}" fill="url(#fskin)"/>`);
    body.push(`<ellipse cx="${f(fx + s * 1.2)}" cy="${f(fy - 2.2)}" rx="4.6" ry="2.6" fill="url(#fskin)"/>`);
  }
  body.push(`<path d="${limb(m.torso)}" fill="url(#fskin)"/>`);
  // A hollow at the throat and the line of the collarbones.
  body.push(`<path d="M${f(50 - m.sh * 0.55)} ${f(m.yS + 6.5)} Q${f(50 - 6)} ${f(m.yS + 9)} ${f(49)} ${f(m.yS + 7.4)} M${f(50 + m.sh * 0.55)} ${f(m.yS + 6.5)} Q${f(50 + 6)} ${f(m.yS + 9)} ${f(51)} ${f(m.yS + 7.4)}" fill="none" stroke="${shade(skin, -0.3)}" stroke-width="0.6" opacity="0.6" stroke-linecap="round"/>`);
  const arms: string[] = [];
  for (const s of [-1, 1]) {
    const arm = m.armOf(s);
    arms.push(`<path d="${limb(arm.pts)}" fill="url(#fskin)"/>`);
    arms.push(`<ellipse cx="${f(arm.hand[0])}" cy="${f(arm.hand[1])}" rx="${f(m.wrist * 1.25)}" ry="5.6" fill="url(#fskin)"/>`);
  }
  const lift = FLOOR - m.yF;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${TOP} ${FIGURE_W} ${FIGURE_H}" width="${FIGURE_W * 2}" height="${FIGURE_H * 2}">`,
    `<defs>`,
    head.defs,
    round("fskin", skin),
    round("fcloth", accent),
    `<linearGradient id="fsteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d667a"/><stop offset="0.4" stop-color="#c9d1e0"/><stop offset="0.6" stop-color="#eef2fa"/><stop offset="1" stop-color="#5d667a"/></linearGradient>`,
    `</defs>`,
    `<ellipse cx="50" cy="${FLOOR + 1}" rx="${f(m.hp + 12)}" ry="3.4" fill="#000000" opacity="0.38"/>`,
    `<g transform="translate(0 ${f(lift)})">`,
    behind,
    head.back,
    body.join(""),
    // The arms over the body, sleeves over the arms (clothes are drawn after both).
    arms.join(""),
    worn,
    head.front,
    `</g>`,
    `</svg>`,
  ].join("");
}

/** The figure as a data URL, for an <img> or a canvas Image. */
export function figureUrl(look: Look, ring: string, o: FigureOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figureSvg(look, ring, o))}`;
}

const cache = new Map<string, string>();
let cachedAt = -1;

/** A figure made once for a look as it is now: forgotten when any look changes. */
function kept(key: string, make: () => string): string {
  if (cachedAt !== looksRev()) {
    cachedAt = looksRev();
    cache.clear();
  }
  let url = cache.get(key);
  if (!url) {
    url = make();
    cache.set(key, url);
  }
  return url;
}

/** A queen's whole figure, in a mood, standing or stepping. */
export function queenFigure(queen: CourtQueenKey, o: FigureOptions = {}): string {
  return kept(`${queen}|${o.mood ?? "smile"}|${o.step ?? 0}`, () =>
    figureUrl(lookOf(queen), CONFIG.court.queens[queen].color, o),
  );
}

/** Your own whole figure, standing or stepping. */
export function youFigure(o: FigureOptions = {}): string {
  return kept(`you|${o.mood ?? "smile"}|${o.step ?? 0}`, () => {
    const look = youLook();
    return figureUrl(look, look.accent, o);
  });
}
