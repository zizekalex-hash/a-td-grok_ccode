/**
 * The dark fantasy look for the queens' portraits (court.portraits.style
 * "dark"): a near-black scene lit from behind in her colour, a glowing rune
 * circle behind her head, wild flowing hair with light in it, rim-lit skin,
 * glowing eyes, a spiked crown and golden chains with gems. Each part is an SVG
 * string in the portrait's 0–100 space; the face itself is drawn as in the
 * classic look. Pure, with relative imports, so the tests can load it.
 */

import { f, gem, shade } from "./svgkit.ts";

/** Gradients and filters the dark look uses. */
export function darkDefs(accent: string): string {
  return (
    `<radialGradient id="backlight" cx="50%" cy="38%" r="52%"><stop offset="0" stop-color="${shade(accent, 0.15)}" stop-opacity="0.75"/><stop offset="0.45" stop-color="${accent}" stop-opacity="0.32"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="shadeFace" cx="44%" cy="36%" r="68%"><stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#05000c" stop-opacity="0.42"/></radialGradient>` +
    `<radialGradient id="vignetteDark" cx="50%" cy="44%" r="58%"><stop offset="0.45" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#020006" stop-opacity="0.85"/></radialGradient>` +
    `<linearGradient id="goldDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.45" stop-color="#c8922a"/><stop offset="1" stop-color="#5a3608"/></linearGradient>` +
    `<filter id="bloom" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.2"/></filter>`
  );
}

/** The scene sunk into the night, and her colour glowing from behind her. */
export function darkScene(): string {
  return (
    `<rect x="0" y="0" width="100" height="100" fill="#04010a" opacity="0.64"/>` +
    `<circle cx="50" cy="38" r="44" fill="url(#backlight)"/>`
  );
}

/** A circle of runes behind her head, glowing in her colour. */
export function arcaneCircle(accent: string, rand: () => number): string {
  const cx = 50;
  const cy = 37;
  const lines: string[] = [];
  for (const [r, w] of [
    [43, 0.6],
    [40.2, 0.32],
    [37, 0.5],
    [33.5, 0.25],
  ] as const)
    lines.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${w}"/>`);
  // Ticks between the outer rings, and runes made of a few strokes each.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 40.2 : 41.6;
    lines.push(
      `<path d="M${f(cx + Math.cos(a) * r0)} ${f(cy + Math.sin(a) * r0)} L${f(cx + Math.cos(a) * 43)} ${f(cy + Math.sin(a) * 43)}" stroke-width="0.25"/>`,
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 38.6;
    const y = cy + Math.sin(a) * 38.6;
    const k = Math.floor(rand() * 4);
    const glyph = [
      `M${f(x - 0.7)} ${f(y - 0.8)} L${f(x)} ${f(y + 0.8)} L${f(x + 0.7)} ${f(y - 0.8)}`,
      `M${f(x)} ${f(y - 0.9)} L${f(x)} ${f(y + 0.9)} M${f(x - 0.7)} ${f(y - 0.2)} L${f(x + 0.7)} ${f(y + 0.3)}`,
      `M${f(x - 0.7)} ${f(y + 0.8)} L${f(x)} ${f(y - 0.8)} L${f(x + 0.7)} ${f(y + 0.8)} M${f(x - 0.4)} ${f(y + 0.1)} L${f(x + 0.4)} ${f(y + 0.1)}`,
      `M${f(x - 0.6)} ${f(y - 0.8)} Q${f(x + 0.9)} ${f(y)} ${f(x - 0.6)} ${f(y + 0.8)}`,
    ][k];
    lines.push(`<path d="${glyph}" stroke-width="0.3"/>`);
  }
  // A six-pointed star inside, faint.
  const tri = (rot: number) =>
    [0, 1, 2]
      .map((j) => {
        const a = rot + (j / 3) * Math.PI * 2 - Math.PI / 2;
        return `${j ? "L" : "M"}${f(cx + Math.cos(a) * 33.5)} ${f(cy + Math.sin(a) * 33.5)}`;
      })
      .join(" ") + " Z";
  lines.push(`<path d="${tri(0)} ${tri(Math.PI)}" stroke-width="0.22" opacity="0.6"/>`);
  const body = lines.join("");
  // The glow is a wide, faint copy of the rings under the sharp ones (cheaper than a blur).
  const rings = [43, 37]
    .map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="2.4"/>`)
    .join("");
  return (
    `<g fill="none" stroke="${shade(accent, 0.25)}" opacity="0.22">${rings}</g>` +
    `<g fill="none" stroke="${shade(accent, 0.6)}" opacity="0.75">${body}</g>`
  );
}

/** Glowing dust in the air: her colour, and a little white. */
export function dust(accent: string, rand: () => number, n = 34): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = rand() * 100;
    const y = rand() * 100;
    const r = 0.18 + rand() * 0.5;
    const col = rand() > 0.7 ? "#ffffff" : shade(accent, 0.45);
    if (r > 0.45)
      out.push(
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="${col}" opacity="0.12"/>`,
      );
    out.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${col}" opacity="${f(0.3 + rand() * 0.6)}"/>`,
    );
  }
  return out.join("");
}

/**
 * Wild locks flowing out from behind her head and down past her shoulders:
 * tapered shapes in her hair colour with a lit edge, a few catching her colour.
 */
export function wildHair(
  rand: () => number,
  hair: string,
  hairDark: string,
  sheen: string,
  accent: string,
  n = 18,
  /** Locks falling forward over her shoulders, instead of out from behind her head. */
  front = false,
): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    // Behind: roots hidden in the hair round her head; in front: from beside her jaw.
    const y0 = front ? 44 + rand() * 12 : 14 + rand() * 36;
    const x0 = 50 + side * (front ? 17 + rand() * 6 : 12 + rand() * 8);
    const len = front ? 26 + rand() * 18 : 34 + rand() * 36;
    const swing = side * (front ? 3 + rand() * 6 : 7 + rand() * 13);
    const w = front ? 1.2 + rand() * 1.4 : 1.8 + rand() * 2.8;
    // An S: out, further out, then curling back in at the tip.
    const p1 = [x0 + swing * 0.9, y0 + len * 0.28];
    const p2 = [x0 + swing * 1.7 + (rand() - 0.5) * 4, y0 + len * 0.62];
    const tip = [x0 + swing * 1.05 + (rand() - 0.5) * 6, Math.min(108, y0 + len)];
    // One edge out and the other back, so the lock tapers to its tip.
    const d =
      `M${f(x0 - w / 2)} ${f(y0)} ` +
      `C${f(p1[0]! - w / 2)} ${f(p1[1]!)} ${f(p2[0]! - w * 0.35)} ${f(p2[1]!)} ${f(tip[0]!)} ${f(tip[1]!)} ` +
      `C${f(p2[0]! + w * 0.35)} ${f(p2[1]!)} ${f(p1[0]! + w / 2)} ${f(p1[1]!)} ${f(x0 + w / 2)} ${f(y0)} Z`;
    const edge = `M${f(x0 + (side * w) / 3)} ${f(y0)} C${f(p1[0]! + (side * w) / 3)} ${f(p1[1]!)} ${f(p2[0]!)} ${f(p2[1]!)} ${f(tip[0]!)} ${f(tip[1]!)}`;
    const glint = i % 4 === 0;
    out.push(
      `<path d="${d}" fill="${i % 3 === 0 ? hairDark : hair}" opacity="${f(0.75 + rand() * 0.25)}"/>`,
    );
    if (glint)
      out.push(
        `<path d="${edge}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.18"/>`,
      );
    out.push(
      `<path d="${edge}" fill="none" stroke="${glint ? accent : sheen}" stroke-width="${f(glint ? 0.4 : 0.3)}" opacity="${f(glint ? 0.85 : 0.45)}"/>`,
    );
  }
  return out.join("");
}

/** Light along the edge of her face and shoulders, in her colour, and a deeper shade on her skin. */
export function rimLight(face: string, accent: string): string {
  return (
    `<path d="${face}" fill="url(#shadeFace)"/>` +
    `<path d="M62.6 33 C66 42 63.4 52 58.6 59.4 C55.4 63.3 52.6 65.6 50 66" fill="none" stroke="${shade(accent, 0.3)}" stroke-width="0.8" opacity="0.55" filter="url(#glowSmall)"/>` +
    `<path d="M37.4 33 C34.6 41 35.6 49 38.6 55" fill="none" stroke="${shade(accent, 0.3)}" stroke-width="0.5" opacity="0.32" filter="url(#glowSmall)"/>`
  );
}

/** Rim light on the shoulders, and a sheen on the collarbones. */
export function shoulderLight(accent: string): string {
  return (
    `<path d="M14 98 C17 84 29 76 42 72.6" fill="none" stroke="${shade(accent, 0.35)}" stroke-width="0.9" opacity="0.45" filter="url(#glowSmall)"/>` +
    `<path d="M86 98 C83 84 71 76 58 72.6" fill="none" stroke="${shade(accent, 0.35)}" stroke-width="0.9" opacity="0.5" filter="url(#glowSmall)"/>` +
    `<ellipse cx="42" cy="80" rx="3" ry="0.6" fill="#ffffff" opacity="0.16"/><ellipse cx="58" cy="80" rx="3" ry="0.6" fill="#ffffff" opacity="0.16"/>`
  );
}

/** Light glowing out of her eyes; stronger for eyes that glow. */
export function eyeGlow(iris: string, glowing: boolean, shut: boolean): string {
  if (shut) return "";
  const op = glowing ? 0.8 : 0.42;
  const rx = glowing ? 6.4 : 5.4;
  const ry = glowing ? 3.8 : 3;
  return (
    `<radialGradient id="eyeGlow"><stop offset="0" stop-color="${iris}" stop-opacity="1"/><stop offset="1" stop-color="${iris}" stop-opacity="0"/></radialGradient>` +
    `<ellipse cx="43" cy="44.8" rx="${rx}" ry="${ry}" fill="url(#eyeGlow)" opacity="${op}"/>` +
    `<ellipse cx="57" cy="44.8" rx="${rx}" ry="${ry}" fill="url(#eyeGlow)" opacity="${op}"/>`
  );
}

/** Golden chains draped over her shoulders and chest, with gems hanging from them. */
export function chains(accent: string): string {
  const link = (d: string, w = 0.55) =>
    `<path d="${d}" fill="none" stroke="#3a2306" stroke-width="${f(w + 0.3)}" opacity="0.6"/>` +
    `<path d="${d}" fill="none" stroke="url(#goldDark)" stroke-width="${f(w)}" stroke-dasharray="0.75 0.35"/>` +
    `<path d="${d}" fill="none" stroke="#fff3c4" stroke-width="0.18" stroke-dasharray="0.3 0.8" opacity="0.8"/>`;
  return (
    link("M22 88 Q36 84.5 44 90.5 Q50 94 56 90.5 Q64 84.5 78 88") +
    link("M28 82 Q40 87.5 50 88 Q60 87.5 72 82", 0.45) +
    link("M17 93 Q20 88 25 86.5 M83 93 Q80 88 75 86.5", 0.6) +
    `<path d="M50 94 q-1.4 2.6 0 4.2 q1.4 -1.6 0 -4.2 Z" fill="${accent}" stroke="#ffe9a8" stroke-width="0.35"/>` +
    gem(44, 90.6, 0.8, accent) +
    gem(56, 90.6, 0.8, accent) +
    gem(39.5, 86.4, 0.6, accent) +
    gem(60.5, 86.4, 0.6, accent) +
    `<circle cx="50" cy="94" r="1.6" fill="${accent}" opacity="0.5" filter="url(#bloom)"/>`
  );
}

/** A tall crown of golden spikes with gems, glowing behind. */
export function spikeCrown(accent: string): string {
  const spikes: string[] = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 33.5 + t * 33;
    // The band curves up in the middle; the spikes are tallest at the centre.
    const base = 28.6 - Math.sin(Math.PI * t) * 4.2;
    const h = 6 + Math.sin(Math.PI * t) * 15 * (i % 2 ? 0.62 : 1);
    const lean = (t - 0.5) * 7;
    const w = i % 2 ? 0.9 : 1.3;
    spikes.push(
      `<path d="M${f(x - w)} ${f(base)} L${f(x + lean)} ${f(base - h)} L${f(x + w)} ${f(base)} Z" fill="url(#goldDark)" stroke="#4a2c06" stroke-width="0.3"/>`,
    );
    if (i % 2 === 0)
      spikes.push(`<circle cx="${f(x + lean)}" cy="${f(base - h)}" r="0.45" fill="#fff3c4"/>`);
  }
  return (
    `<path d="M33 29 Q50 15 67 29 L67 22 Q50 8 33 22 Z" fill="${accent}" opacity="0.45" filter="url(#bloom)"/>` +
    spikes.join("") +
    `<path d="M32.6 29.4 Q50 23.4 67.4 29.4 L67 27 Q50 21.2 33 27 Z" fill="url(#goldDark)" stroke="#4a2c06" stroke-width="0.35"/>` +
    `<path d="M33.6 28 Q50 22.4 66.4 28" fill="none" stroke="#fff3c4" stroke-width="0.3" stroke-dasharray="0.4 0.6" opacity="0.8"/>` +
    gem(50, 22.6, 2.6, accent) +
    gem(42.4, 24.6, 1.2, accent) +
    gem(57.6, 24.6, 1.2, accent) +
    `<circle cx="50" cy="22.6" r="2.6" fill="${accent}" opacity="0.6" filter="url(#bloom)"/>`
  );
}

/** Fine golden spikes rising from a circlet or tiara. */
export function filigree(y: number): string {
  const out: string[] = [];
  for (const [dx, h] of [
    [-8, 2.4],
    [-4, 3.6],
    [0, 5.4],
    [4, 3.6],
    [8, 2.4],
  ] as const) {
    const x = 50 + dx;
    const base = y + Math.abs(dx) * 0.22;
    out.push(
      `<path d="M${f(x - 0.55)} ${f(base)} L${f(x + dx * 0.05)} ${f(base - h)} L${f(x + 0.55)} ${f(base)} Z" fill="url(#goldDark)" stroke="#4a2c06" stroke-width="0.2"/>`,
    );
  }
  return out.join("");
}
