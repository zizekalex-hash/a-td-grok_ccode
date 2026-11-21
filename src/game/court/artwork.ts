/**
 * Picture art for the Court's portraits: a picture you bring (made anywhere, in
 * any style) shown as someone's portrait in the round frame, laid over the drawn
 * one (portrait.ts) which stays underneath, always there to go back to. Pure, so
 * the tests can load it: what a kept picture may be, where it sits in the frame,
 * and the portrait as an SVG (the picture inside, so it works anywhere an <img>
 * does, as the drawn ones do).
 */

import { CONFIG, type CourtQueenKey } from "../config.ts";

/** Where the pictures are kept on the device. */
export const ART_KEY = "azshara-court-art-v1";
/** The longest edge a picture is kept at (px), and the most one may take (characters of its data URL). */
export const ART_MAX_EDGE = 720;
export const ART_MAX_CHARS = 700_000;

export interface Art {
  /** The picture, as a data URL (jpeg, png or webp). */
  src: string;
  /** Its size (px). */
  w: number;
  h: number;
  /** The point of the picture (0 to 1 across and down) that sits in the middle of the frame. */
  fx: number;
  fy: number;
  /** How much larger than just filling the frame it is shown, 1 to 4. */
  zoom: number;
  /** How much of the picture shows over the drawn portrait: 0 (the drawn one) to 1 (the picture alone). */
  mix: number;
}

export interface Arts {
  queens: Partial<Record<CourtQueenKey, Art>>;
  you: Art | null;
}

const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const round = (v: number, n = 1000) => Math.round(v * n) / n;

/** A kept picture, checked (null: none, or not one that can be kept). */
export function cleanArt(raw: unknown): Art | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const src = r.src;
  if (typeof src !== "string" || src.length > ART_MAX_CHARS || !DATA_URL.test(src)) return null;
  const w = Math.round(num(r.w, 0));
  const h = Math.round(num(r.h, 0));
  if (w < 1 || h < 1 || w > 8192 || h > 8192) return null;
  return {
    src,
    w,
    h,
    fx: round(clamp(num(r.fx, 0.5), 0, 1)),
    fy: round(clamp(num(r.fy, 0.35), 0, 1)),
    zoom: round(clamp(num(r.zoom, 1), 1, 4), 100),
    mix: round(clamp(num(r.mix, 1), 0, 1), 100),
  };
}

/** What was kept, each picture checked; the queens it does not know are left out. */
export function loadArts(data: unknown): Arts {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const out: Arts = { queens: {}, you: cleanArt(d.you) };
  const q = d.queens && typeof d.queens === "object" ? (d.queens as Record<string, unknown>) : {};
  for (const key of Object.keys(CONFIG.court.queens) as CourtQueenKey[]) {
    const a = cleanArt(q[key]);
    if (a) out.queens[key] = a;
  }
  return out;
}

/** Where the picture sits in the 100 x 100 frame: it always covers it, whatever the point and zoom. */
export function artFrame(a: Pick<Art, "w" | "h" | "fx" | "fy" | "zoom">): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const z = clamp(a.zoom, 1, 4);
  const ratio = a.w / Math.max(1, a.h);
  const height = ratio >= 1 ? 100 * z : (100 * z) / ratio;
  const width = ratio >= 1 ? 100 * z * ratio : 100 * z;
  return {
    x: clamp(50 - clamp(a.fx, 0, 1) * width, 100 - width, 0),
    y: clamp(50 - clamp(a.fy, 0, 1) * height, 100 - height, 0),
    width,
    height,
  };
}

/**
 * The portrait as an SVG document, in the round frame the drawn ones have: the
 * drawn portrait (a data URL; none: a dark disc) underneath, the picture over it
 * as much as `mix` says, a dark edge so it sits in the UI, and a ring in her colour.
 */
export function artSvg(a: Art, ring: string, under = ""): string {
  const f = artFrame(a);
  const colour = /^#[0-9a-f]{3,8}$/i.test(ring) ? ring : "#a855f7";
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" width="240" height="240">`,
    `<defs><clipPath id="d"><circle cx="50" cy="50" r="48"/></clipPath>`,
    `<radialGradient id="v" cx="50%" cy="50%" r="50%"><stop offset="68%" stop-color="#05020c" stop-opacity="0"/><stop offset="100%" stop-color="#05020c" stop-opacity="0.6"/></radialGradient></defs>`,
    `<circle cx="50" cy="50" r="48" fill="#05020c"/>`,
    `<g clip-path="url(#d)">`,
    under && DATA_URL_SVG.test(under)
      ? `<image xlink:href="${under}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>`
      : "",
    `<image xlink:href="${a.src}" x="${n(f.x)}" y="${n(f.y)}" width="${n(f.width)}" height="${n(f.height)}" preserveAspectRatio="none" opacity="${n(clamp(a.mix, 0, 1))}"/>`,
    `<circle cx="50" cy="50" r="48" fill="url(#v)"/>`,
    `</g>`,
    `<circle cx="50" cy="50" r="48" fill="none" stroke="${colour}" stroke-width="1.6"/>`,
    `</svg>`,
  ].join("");
}

/** The drawn portrait passed in as the picture underneath: an SVG data URL, and nothing else. */
const DATA_URL_SVG = /^data:image\/svg\+xml;charset=utf-8,[A-Za-z0-9%._~!*'()-]+$/;

/** The picture's portrait as a data URL, for an <img> or a canvas Image. */
export function artUrl(a: Art, ring: string, under = ""): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSvg(a, ring, under))}`;
}
