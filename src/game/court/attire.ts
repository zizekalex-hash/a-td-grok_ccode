/**
 * What a queen wears and where she stands, for her portrait: the scenery of her
 * place behind her, her outfit, and adornments in her hair. All SVG in the
 * portrait's 100 x 100 space. Pure, so the tests can load it.
 */

import { f, gem, hex, shade, star } from "./svgkit.ts";

// ---- Scenery ----

/** A soft round glow. */
function glow(x: number, y: number, r: number, color: string, a = 0.6): string {
  const id = `g${Math.round(x * 7 + y * 13 + r * 31)}`;
  return (
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/>`
  );
}

/** An arched window, glass lit by the moon, with its frame and bars. */
function archWindow(
  x: number,
  y: number,
  w: number,
  h: number,
  glass: string,
  frame: string,
): string {
  const r = w / 2;
  return (
    `<path d="M${f(x)} ${f(y + h)} L${f(x)} ${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} L${f(x + w)} ${f(y + h)} Z" fill="${glass}" stroke="${frame}" stroke-width="1.2"/>` +
    `<path d="M${f(x + r)} ${f(y)} L${f(x + r)} ${f(y + h)} M${f(x)} ${f(y + h * 0.55)} L${f(x + w)} ${f(y + h * 0.55)}" stroke="${frame}" stroke-width="0.6"/>`
  );
}

/** A column with a capital and a base. */
function column(x: number, top: number, bottom: number, w: number, stone: string): string {
  return (
    `<rect x="${f(x)}" y="${f(top)}" width="${f(w)}" height="${f(bottom - top)}" fill="${stone}"/>` +
    `<rect x="${f(x - 1)}" y="${f(top)}" width="${f(w + 2)}" height="2" fill="${shade(stone, 0.2)}"/>` +
    `<path d="M${f(x + w * 0.3)} ${f(top + 2)} L${f(x + w * 0.3)} ${f(bottom)} M${f(x + w * 0.7)} ${f(top + 2)} L${f(x + w * 0.7)} ${f(bottom)}" stroke="${shade(stone, -0.25)}" stroke-width="0.4"/>`
  );
}

function lantern(x: number, y: number, light: string): string {
  return (
    `<path d="M${f(x)} 0 L${f(x)} ${f(y - 3)}" stroke="#2a1a10" stroke-width="0.5"/>` +
    glow(x, y, 9, light, 0.55) +
    `<path d="M${f(x - 2)} ${f(y - 3)} L${f(x + 2)} ${f(y - 3)} L${f(x + 2.6)} ${f(y + 2.5)} L${f(x - 2.6)} ${f(y + 2.5)} Z" fill="${light}" stroke="#2a1a10" stroke-width="0.6"/>` +
    `<path d="M${f(x)} ${f(y - 3)} L${f(x)} ${f(y + 2.5)}" stroke="#2a1a10" stroke-width="0.4"/>`
  );
}

/**
 * The scenery of a queen's place, behind her: her palace, inn, harbor, temple or
 * forge, and so on, in her background's colours. A region's own scene for places
 * without one.
 */
export function scene(place: string, region: string, bg0: string, accent: string): string {
  const dark = shade(bg0, -0.45);
  const mid = shade(bg0, -0.15);
  const light = shade(bg0, 0.35);
  const out: string[] = [];
  switch (place) {
    case "palace": {
      out.push(glow(50, 4, 22, shade(accent, 0.4), 0.5));
      out.push(
        archWindow(3, 14, 15, 56, "url(#sceneGlass)", dark),
        archWindow(82, 14, 15, 56, "url(#sceneGlass)", dark),
      );
      out.push(column(20, 8, 90, 4, light), column(76, 8, 90, 4, light));
      out.push(
        `<linearGradient id="sceneGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(accent, 0.55)}" stop-opacity="0.7"/><stop offset="1" stop-color="${shade(accent, -0.4)}" stop-opacity="0.35"/></linearGradient>`,
      );
      for (const [x, y] of [
        [8, 26],
        [14, 36],
        [86, 30],
        [91, 42],
      ] as const)
        out.push(star(x, y, 0.9, "#ffffff", 'opacity="0.8"'));
      break;
    }
    case "inn": {
      out.push(
        `<rect x="0" y="5" width="100" height="4" fill="#3a2414"/><rect x="0" y="17" width="100" height="3" fill="#3a2414" opacity="0.9"/>`,
        `<rect x="6" y="0" width="4" height="100" fill="#2e1c10"/><rect x="90" y="0" width="4" height="100" fill="#2e1c10"/>`,
      );
      out.push(lantern(18, 30, "#ffc46b"), lantern(82, 34, "#ffb347"));
      // Shelves of bottles.
      out.push(
        `<rect x="74" y="54" width="26" height="1.4" fill="#4a2e18"/><rect x="0" y="58" width="22" height="1.4" fill="#4a2e18"/>`,
      );
      const bottles = ["#2f8a46", "#a8562a", "#6b3fa0", "#c9a227"];
      bottles.forEach((col, i) => {
        out.push(
          `<rect x="${76 + i * 5.5}" y="47" width="3" height="7" rx="1" fill="${col}" opacity="0.85"/><rect x="${76.9 + i * 5.5}" y="45" width="1.2" height="2.4" fill="${col}"/>`,
        );
        out.push(
          `<rect x="${2 + i * 5}" y="51" width="3" height="7" rx="1" fill="${bottles[(i + 2) % 4]}" opacity="0.85"/>`,
        );
      });
      break;
    }
    case "shire": {
      out.push(
        `<linearGradient id="sceneSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb37a" stop-opacity="0.55"/><stop offset="1" stop-color="#ff6f91" stop-opacity="0"/></linearGradient><rect width="100" height="70" fill="url(#sceneSky)"/>`,
      );
      out.push(
        glow(80, 22, 16, "#ffe08a", 0.7),
        `<circle cx="80" cy="22" r="6" fill="#fff1c4" opacity="0.9"/>`,
      );
      out.push(
        `<path d="M0 74 Q20 60 42 72 Q60 64 100 72 L100 100 L0 100 Z" fill="#2f7a3a" opacity="0.9"/>`,
      );
      out.push(`<path d="M0 84 Q30 72 60 86 Q80 78 100 84 L100 100 L0 100 Z" fill="#24602e"/>`);
      out.push(
        `<circle cx="12" cy="76" r="3" fill="#2f8a46" stroke="#c9a227" stroke-width="0.6"/><circle cx="12" cy="76" r="0.6" fill="#ffd36b"/>`,
      );
      for (let i = 0; i < 12; i++) {
        const x = 3 + ((i * 37) % 95);
        const y = 78 + ((i * 13) % 14);
        out.push(
          `<circle cx="${x}" cy="${y}" r="0.9" fill="${["#ff9ecf", "#ffd36b", "#ffffff"][i % 3]}"/>`,
        );
      }
      break;
    }
    case "void": {
      for (const [d, col] of [
        ["M-5 30 C20 10 40 40 30 60 C24 74 8 70 2 60", "#7a3cff"],
        ["M105 20 C80 6 62 34 72 54 C80 70 96 66 102 54", "#3cc8ff"],
        ["M10 100 C26 82 50 92 60 104", "#ff4fd8"],
      ] as const)
        out.push(
          `<path d="${d}" fill="none" stroke="${col}" stroke-width="7" opacity="0.18"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.4" opacity="0.4"/>`,
        );
      for (let i = 0; i < 24; i++)
        out.push(
          `<circle cx="${(i * 41) % 100}" cy="${(i * 23) % 100}" r="${i % 4 ? 0.4 : 0.8}" fill="#ffffff" opacity="0.8"/>`,
        );
      out.push(
        `<path d="M84 12 a8 8 0 1 0 6 13 a6.5 6.5 0 1 1 -6 -13 Z" fill="#e8f4ff" opacity="0.8"/>`,
      );
      break;
    }
    case "mine": {
      out.push(`<path d="M0 0 L26 0 L20 18 L24 34 L14 52 L18 72 L8 100 L0 100 Z" fill="${dark}"/>`);
      out.push(
        `<path d="M100 0 L74 0 L80 16 L76 36 L86 54 L80 76 L92 100 L100 100 Z" fill="${dark}"/>`,
      );
      for (const [x, y, s] of [
        [10, 86, 1],
        [16, 92, 0.7],
        [88, 84, 1.1],
        [83, 92, 0.8],
        [6, 40, 0.6],
      ] as const) {
        out.push(glow(x, y, 9 * s, accent, 0.5));
        out.push(
          `<path d="M${x} ${y - 7 * s} L${x + 2.4 * s} ${y} L${x} ${y + 2 * s} L${x - 2.4 * s} ${y} Z" fill="${shade(accent, 0.3)}" stroke="${shade(accent, 0.6)}" stroke-width="0.4"/>`,
        );
      }
      out.push(lantern(30, 16, "#ffd27a"));
      break;
    }
    case "harbor": {
      out.push(
        `<linearGradient id="sceneSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a6fb0"/><stop offset="1" stop-color="#0d2f5a"/></linearGradient><rect x="0" y="62" width="100" height="38" fill="url(#sceneSea)" opacity="0.85"/>`,
      );
      out.push(`<path d="M0 62 L100 62" stroke="#bfe3ff" stroke-width="0.5" opacity="0.6"/>`);
      for (let i = 0; i < 6; i++)
        out.push(
          `<path d="M${(i * 19) % 100} ${66 + (i % 3) * 4} q3 -1.2 6 0" fill="none" stroke="#cfeaff" stroke-width="0.4" opacity="0.6"/>`,
        );
      // Ships' masts and sails.
      for (const [x, s] of [
        [12, 1],
        [86, 0.85],
      ] as const) {
        out.push(`<path d="M${x} ${62 - 34 * s} L${x} 62" stroke="${dark}" stroke-width="0.9"/>`);
        out.push(
          `<path d="M${x + 0.6} ${62 - 32 * s} Q${x + 10 * s} ${62 - 24 * s} ${x + 0.6} ${62 - 14 * s} Z" fill="#f2eee4" opacity="0.85"/>`,
        );
        out.push(
          `<path d="M${x - 0.6} ${62 - 26 * s} Q${x - 8 * s} ${62 - 20 * s} ${x - 0.6} ${62 - 10 * s} Z" fill="#e6e0d2" opacity="0.8"/>`,
        );
        out.push(
          `<path d="M${x - 8 * s} 62 L${x + 9 * s} 62 L${x + 6 * s} ${62 + 3 * s} L${x - 6 * s} ${62 + 3 * s} Z" fill="#5a3a22"/>`,
        );
      }
      out.push(
        `<path d="M24 18 q2 -1.5 4 0 q2 -1.5 4 0 M70 12 q1.6 -1.2 3.2 0 q1.6 -1.2 3.2 0" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.8"/>`,
      );
      break;
    }
    case "temple": {
      out.push(
        glow(80, 20, 22, "#dfe6ff", 0.5),
        `<circle cx="80" cy="20" r="11" fill="#eef2ff" opacity="0.9"/>`,
      );
      out.push(
        `<circle cx="76" cy="17" r="2" fill="#c9d3ee" opacity="0.7"/><circle cx="83" cy="24" r="1.4" fill="#c9d3ee" opacity="0.7"/><circle cx="84" cy="15" r="1" fill="#c9d3ee" opacity="0.7"/>`,
      );
      out.push(column(4, 20, 100, 5, light), column(16, 26, 100, 4, mid));
      out.push(`<path d="M0 18 L28 18 L26 22 L0 22 Z" fill="${light}"/>`);
      for (const [x, y] of [
        [40, 8],
        [58, 6],
        [94, 40],
        [66, 36],
      ] as const)
        out.push(star(x, y, 0.8, "#ffffff", 'opacity="0.8"'));
      break;
    }
    case "spire": {
      out.push(
        glow(82, 18, 18, "#d6e4ff", 0.45),
        `<circle cx="82" cy="18" r="7" fill="#e6edff" opacity="0.85"/>`,
      );
      out.push(
        `<path d="M0 78 L14 56 L24 70 L36 58 L48 74 L48 100 L0 100 Z" fill="${mid}" opacity="0.8"/>`,
      );
      out.push(
        `<path d="M8 72 L8 26 L11 14 L14 26 L14 72 Z" fill="${dark}"/><path d="M11 14 L11 6" stroke="${dark}" stroke-width="0.6"/><path d="M11 6 L15 7.5 L11 9 Z" fill="${accent}"/>`,
      );
      out.push(`<rect x="10" y="34" width="2" height="3" fill="#ffd27a" opacity="0.9"/>`);
      out.push(
        `<path d="M60 40 q8 -2 16 0 M70 48 q10 -2 20 0 M18 22 q6 -1.5 12 0" fill="none" stroke="#ffffff" stroke-width="0.4" opacity="0.35"/>`,
      );
      break;
    }
    case "forge": {
      out.push(glow(12, 92, 26, "#ff7a2e", 0.7), glow(90, 90, 14, "#ffb347", 0.45));
      for (const x of [20, 28, 74, 82]) {
        const len = 18 + ((x * 7) % 14);
        out.push(
          `<path d="M${x} 0 L${x} ${len}" stroke="#2a2222" stroke-width="0.8" stroke-dasharray="1.6 0.8"/><path d="M${x - 1.6} ${len} q1.6 3 3.2 0" fill="none" stroke="#2a2222" stroke-width="0.9"/>`,
        );
      }
      out.push(
        `<path d="M78 80 L96 80 L94 84 L88 84 L90 92 L84 92 L86 84 L80 84 Z" fill="#1a1414" stroke="#3a3030" stroke-width="0.5"/>`,
      );
      for (let i = 0; i < 10; i++)
        out.push(
          `<circle cx="${8 + ((i * 29) % 30)}" cy="${60 + ((i * 17) % 32)}" r="0.6" fill="#ffd27a" opacity="0.9"/>`,
        );
      break;
    }
    case "arena": {
      for (let i = 0; i < 7; i++) {
        const x = i * 16 - 4;
        out.push(
          `<path d="M${x} 76 L${x} 64 A6 6 0 0 1 ${x + 12} 64 L${x + 12} 76 Z" fill="${dark}" stroke="${light}" stroke-width="0.6"/>`,
        );
      }
      out.push(`<rect x="0" y="76" width="100" height="24" fill="${mid}"/>`);
      for (let i = 0; i < 30; i++)
        out.push(
          `<circle cx="${(i * 37) % 100}" cy="${54 + (i % 3) * 2.4}" r="0.9" fill="${["#e8c872", accent, "#ffffff"][i % 3]}" opacity="0.55"/>`,
        );
      for (const [x, col] of [
        [10, accent],
        [28, "#e8c872"],
        [72, accent],
        [90, "#e8c872"],
      ] as const)
        out.push(
          `<path d="M${x} 0 L${x} 22 M${x} 2 L${x + 7} 2 L${x + 7} 18 L${x + 3.5} 15 L${x} 18 Z" fill="${col}" stroke="#2a1a10" stroke-width="0.5" opacity="0.9"/>`,
        );
      break;
    }
    case "sanctum": {
      for (const [d, w] of [
        ["M-4 100 C10 70 0 50 14 34 C22 24 18 12 26 4", 6],
        ["M104 100 C88 74 100 54 86 38 C78 28 84 14 76 6", 6],
        ["M-4 20 C8 26 12 40 6 52", 3.5],
        ["M104 70 C94 66 90 54 96 44", 3.5],
      ] as const)
        out.push(
          `<path d="${d}" fill="none" stroke="#12001f" stroke-width="${w}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="${f(w * 0.18)}" opacity="0.8"/>`,
        );
      // An eye sigil, watching.
      out.push(glow(80, 16, 12, accent, 0.6));
      out.push(
        `<path d="M72 16 Q80 9 88 16 Q80 23 72 16 Z" fill="#0a0012" stroke="${accent}" stroke-width="0.7"/><circle cx="80" cy="16" r="2.4" fill="${accent}"/><circle cx="80" cy="16" r="1" fill="#ffffff"/>`,
      );
      for (const [x, y] of [
        [10, 14],
        [20, 60],
        [92, 58],
        [64, 8],
      ] as const)
        out.push(
          `<path d="M${x} ${y - 1.6} l1.2 1.6 l-1.2 1.6 l-1.2 -1.6 Z" fill="${accent}" opacity="0.8"/>`,
        );
      break;
    }
    default: {
      // A region's own scene.
      if (region === "isles") {
        out.push(
          `<rect x="0" y="64" width="100" height="36" fill="#1d5a8a" opacity="0.8"/><path d="M0 64 L100 64" stroke="#cfeaff" stroke-width="0.5" opacity="0.6"/>`,
        );
        out.push(
          `<path d="M10 64 Q14 40 22 30 M22 30 q-8 -2 -14 4 M22 30 q-2 -7 -10 -8 M22 30 q6 -5 12 -2 M22 30 q8 2 10 9" fill="none" stroke="#2f7a3a" stroke-width="1.4"/>`,
        );
        out.push(glow(80, 20, 14, "#ffe08a", 0.6));
      } else if (region === "peaks") {
        out.push(
          `<path d="M0 80 L22 38 L32 50 L46 30 L60 52 L74 36 L100 76 L100 100 L0 100 Z" fill="${dark}"/>`,
        );
        out.push(
          `<path d="M44 34 L46 30 L48 34 L47 40 L45 40 Z" fill="#ff7a2e"/>`,
          glow(46, 30, 12, "#ff7a2e", 0.6),
        );
      } else {
        out.push(
          `<path d="M0 82 Q24 66 50 78 Q76 68 100 80 L100 100 L0 100 Z" fill="#24602e" opacity="0.9"/>`,
        );
        out.push(
          `<path d="M70 70 L70 52 L74 52 L74 46 L78 52 L82 46 L86 52 L86 70 Z" fill="${dark}"/><path d="M78 40 L78 52" stroke="${dark}" stroke-width="0.6"/><path d="M78 40 L82 41.5 L78 43 Z" fill="${accent}"/>`,
        );
        out.push(glow(20, 18, 14, "#ffe08a", 0.5));
      }
    }
  }
  return `<g opacity="0.85">${out.join("")}</g>`;
}

// ---- Outfits ----

export const OUTFITS = [
  "gown",
  "corset",
  "scales",
  "regal",
  "void",
  "robe",
  "coat",
  "armor",
  "leather",
] as const;
export type Outfit = (typeof OUTFITS)[number];

export function outfitOf(kind: string | undefined): Outfit {
  return (OUTFITS as readonly string[]).includes(kind ?? "") ? (kind as Outfit) : "gown";
}

/** Outfits that close at the throat: no necklace shows over them. */
export function closedOutfit(kind: Outfit): boolean {
  return kind === "leather";
}

/** The off-shoulder gown's line, which most outfits share. */
const GOWN = "M10 100 C15 87 30 83 50 85.5 C70 83 85 87 90 100 Z";
const NECKLINE = "M13 95 C21 87.5 34 84.6 50 86.6 C66 84.6 79 87.5 87 95";

/** The gown's details: folds, a lace edge, embroidery and a brooch. */
function gownDetail(accent: string): string {
  const out: string[] = [];
  out.push(
    `<path d="M22 100 C24 94 27 91 31 89.5 M36 100 C37 95 38.5 92 40.5 89 M64 100 C63 95 61.5 92 59.5 89 M78 100 C76 94 73 91 69 89.5" fill="none" stroke="${shade(accent, -0.5)}" stroke-width="0.9" opacity="0.55"/>`,
    `<path d="M29 100 C30 95 32 92 35 90 M71 100 C70 95 68 92 65 90" fill="none" stroke="${shade(accent, 0.45)}" stroke-width="0.5" opacity="0.5"/>`,
  );
  const lace: string[] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const x = 12 + t * 76;
    const y = 95.5 - Math.sin(Math.PI * t) * 9.6 + Math.abs(t - 0.5) * 0.6;
    lace.push(`M${f(x - 1.7)} ${f(y)} a1.7 1.4 0 0 0 3.4 0`);
  }
  out.push(
    `<path d="${lace.join(" ")}" fill="none" stroke="#fff3c4" stroke-width="0.4" opacity="0.75"/>`,
  );
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    out.push(
      `<circle cx="${f(14 + t * 72)}" cy="${f(98 - Math.sin(Math.PI * t) * 8.4)}" r="0.42" fill="#e8c872" opacity="0.9"/>`,
    );
  }
  out.push(gem(50, 90.6, 1.9, accent));
  return out.join("");
}

/** What stands behind the neck: a regal fan collar, or the void's spikes. Drawn before the neck. */
export function outfitBack(kind: Outfit, accent: string): string {
  if (kind === "regal") {
    const out: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.08 + (i / 10) * 0.84);
      const x = 50 + Math.cos(a) * 21;
      const y = 74 + Math.sin(a) * 17;
      out.push(
        `<path d="M50 74 L${f(x - 2.6)} ${f(y + 1)} Q${f(x)} ${f(y - 2.4)} ${f(x + 2.6)} ${f(y + 1)} Z" fill="url(#gold)" stroke="#7a560e" stroke-width="0.35"/>`,
      );
      out.push(`<circle cx="${f(x)}" cy="${f(y + 0.6)}" r="0.7" fill="${accent}"/>`);
    }
    return `<g opacity="0.95">${out.join("")}</g>`;
  }
  if (kind === "void") {
    const out: string[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1.1 + (i / 8) * 0.8);
      const x = 50 + Math.cos(a) * 20;
      const y = 74 + Math.sin(a) * 18;
      out.push(
        `<path d="M${f(50 + Math.cos(a) * 9)} ${f(74 + Math.sin(a) * 6)} L${f(x)} ${f(y)} L${f(50 + Math.cos(a + 0.12) * 9)} ${f(74 + Math.sin(a + 0.12) * 6)} Z" fill="#14081f" stroke="${accent}" stroke-width="0.4"/>`,
      );
    }
    return out.join("");
  }
  return "";
}

/** Her outfit over the shoulders. */
export function outfitFront(kind: Outfit, accent: string, skinDark: string): string {
  const deep = shade(accent, -0.55);
  const out: string[] = [];
  switch (kind) {
    case "corset": {
      // A white blouse off the shoulders, a laced bodice in her colour.
      for (const s of [-1, 1]) {
        const x = (v: number) => f(50 + s * v);
        out.push(
          `<path d="M${x(40)} 100 C${x(38)} 90 ${x(32)} 85 ${x(23)} 84 C${x(19)} 86 ${x(17)} 92 ${x(17)} 100 Z" fill="#f4ecdc"/>`,
        );
        out.push(
          `<path d="M${x(36)} 92 Q${x(30)} 88 ${x(24)} 88 M${x(34)} 97 Q${x(28)} 93 ${x(21)} 94" fill="none" stroke="#c9bca4" stroke-width="0.5"/>`,
        );
      }
      out.push(
        `<path d="M30 100 C32 92 38 88.5 50 89.5 C62 88.5 68 92 70 100 Z" fill="url(#gown)"/>`,
      );
      out.push(
        `<path d="M31 93 C36 89 44 88.4 50 89.5 C56 88.4 64 89 69 93" fill="none" stroke="#f4ecdc" stroke-width="1.2"/>`,
      );
      const lace: string[] = [];
      for (let y = 91; y < 100; y += 2)
        lace.push(`M47.5 ${y} L52.5 ${y + 2} M52.5 ${y} L47.5 ${y + 2}`);
      out.push(`<path d="${lace.join(" ")}" stroke="#e8c872" stroke-width="0.5"/>`);
      out.push(
        `<path d="M38 100 L39.5 91 M62 100 L60.5 91" stroke="${deep}" stroke-width="0.8" opacity="0.7"/>`,
      );
      break;
    }
    case "scales": {
      out.push(`<clipPath id="gownClip"><path d="${GOWN}"/></clipPath>`);
      out.push(`<path d="${GOWN}" fill="url(#gown)"/>`);
      const scales: string[] = [];
      for (let row = 0, y = 86; y < 101; y += 2.3, row++) {
        for (let x = 8 + (row % 2) * 1.6; x < 92; x += 3.2)
          scales.push(`M${f(x - 1.6)} ${f(y)} a1.6 1.6 0 0 0 3.2 0`);
      }
      out.push(
        `<g clip-path="url(#gownClip)"><path d="${scales.join(" ")}" fill="none" stroke="${shade(accent, 0.35)}" stroke-width="0.4" opacity="0.8"/></g>`,
      );
      out.push(`<path d="${NECKLINE}" fill="none" stroke="#e8c872" stroke-width="0.7"/>`);
      for (const s of [-1, 1]) {
        const x = (v: number) => f(50 + s * v);
        out.push(
          `<path d="M${x(26)} 88 L${x(31)} 81 L${x(30)} 88.5 M${x(31)} 90 L${x(37)} 84 L${x(35)} 90" fill="${deep}" stroke="${shade(accent, 0.3)}" stroke-width="0.4"/>`,
        );
      }
      out.push(gem(50, 90.6, 1.9, accent));
      break;
    }
    case "regal":
    case "gown": {
      out.push(`<path d="${GOWN}" fill="url(#gown)"/>`);
      out.push(
        `<path d="${NECKLINE}" fill="none" stroke="#fff3c4" stroke-width="0.6" opacity="0.65"/>`,
      );
      out.push(gownDetail(accent));
      if (kind === "regal") {
        // Gold embroidery climbing the bodice.
        out.push(
          `<path d="M50 92 C46 94 44 97 44 100 M50 92 C54 94 56 97 56 100 M40 93 q-3 3 -2 7 M60 93 q3 3 2 7" fill="none" stroke="url(#gold)" stroke-width="0.8"/>`,
        );
        out.push(`<path d="${NECKLINE}" fill="none" stroke="url(#gold)" stroke-width="1.1"/>`);
      }
      break;
    }
    case "void": {
      out.push(`<path d="${GOWN}" fill="#14081f"/>`);
      out.push(
        `<path d="${NECKLINE}" fill="none" stroke="${accent}" stroke-width="0.9" opacity="0.9"/>`,
      );
      out.push(
        `<path d="M24 100 C28 92 36 92 38 96 C40 100 44 98 44 94 M76 100 C72 92 64 92 62 96 C60 100 56 98 56 94 M50 88 C48 92 52 94 50 100" fill="none" stroke="${accent}" stroke-width="0.6" opacity="0.75"/>`,
      );
      for (const x of [30, 40, 60, 70])
        out.push(`<path d="M${x} 95 l0.9 1.4 l-0.9 1.4 l-0.9 -1.4 Z" fill="${accent}"/>`);
      out.push(gem(50, 90.6, 1.9, accent));
      break;
    }
    case "robe": {
      out.push(
        `<path d="M8 100 C11 84 26 76 41 72.5 L50 88 L59 72.5 C74 76 89 84 92 100 Z" fill="url(#gown)"/>`,
      );
      out.push(
        `<path d="M41 72.5 L50 88 L59 72.5" fill="none" stroke="#e8c872" stroke-width="1.4"/>`,
      );
      out.push(
        `<path d="M41 72.5 L50 88 L59 72.5" fill="none" stroke="${deep}" stroke-width="0.4" stroke-dasharray="0.8 0.8"/>`,
      );
      // Embroidered leaves down the trim.
      for (const t of [0.25, 0.5, 0.75]) {
        out.push(
          `<ellipse cx="${f(41 + 9 * t - 1.6)}" cy="${f(72.5 + 15.5 * t)}" rx="1.2" ry="0.6" fill="#8ae36a" transform="rotate(-30 ${f(41 + 9 * t - 1.6)} ${f(72.5 + 15.5 * t)})"/>`,
        );
        out.push(
          `<ellipse cx="${f(59 - 9 * t + 1.6)}" cy="${f(72.5 + 15.5 * t)}" rx="1.2" ry="0.6" fill="#8ae36a" transform="rotate(30 ${f(59 - 9 * t + 1.6)} ${f(72.5 + 15.5 * t)})"/>`,
        );
      }
      out.push(
        `<path d="M24 100 C26 92 30 86 36 82 M76 100 C74 92 70 86 64 82" fill="none" stroke="${deep}" stroke-width="0.8" opacity="0.6"/>`,
      );
      break;
    }
    case "coat": {
      out.push(
        `<path d="M8 100 C11 84 26 76 40 73 L46 84 L50 100 L54 84 L60 73 C74 76 89 84 92 100 Z" fill="url(#gown)"/>`,
      );
      // Lapels folded back, gold-edged; buttons and epaulettes.
      out.push(
        `<path d="M40 73 L46 84 L43 86 L37 76 Z M60 73 L54 84 L57 86 L63 76 Z" fill="${shade(accent, 0.3)}" stroke="#e8c872" stroke-width="0.5"/>`,
      );
      for (const y of [89, 93, 97])
        out.push(
          `<circle cx="45.6" cy="${y}" r="0.8" fill="url(#gold)"/><circle cx="54.4" cy="${y}" r="0.8" fill="url(#gold)"/>`,
        );
      for (const s of [-1, 1]) {
        const x = (v: number) => f(50 + s * v);
        out.push(
          `<path d="M${x(20)} 82 Q${x(28)} 78 ${x(34)} 80 L${x(33)} 83 Q${x(27)} 82 ${x(21)} 85 Z" fill="url(#gold)"/>`,
        );
        out.push(
          `<path d="M${x(21)} 85 l0 3 M${x(24)} 84 l0 3 M${x(27)} 83 l0 3 M${x(30)} 82.6 l0 3" stroke="#c99212" stroke-width="0.6"/>`,
        );
      }
      break;
    }
    case "armor": {
      const metal = shade(accent, 0.25);
      out.push(
        `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(metal, 0.5)}"/><stop offset="0.5" stop-color="${metal}"/><stop offset="1" stop-color="${shade(metal, -0.5)}"/></linearGradient>`,
      );
      out.push(`<path d="${GOWN}" fill="${deep}"/>`);
      out.push(
        `<path d="M28 100 C30 91 39 87 50 88 C61 87 70 91 72 100 Z" fill="url(#metal)" stroke="${shade(metal, -0.4)}" stroke-width="0.5"/>`,
      );
      out.push(`<path d="M50 88 L50 100" stroke="${shade(metal, 0.5)}" stroke-width="0.7"/>`);
      out.push(gem(50, 92.5, 1.6, accent));
      for (const s of [-1, 1]) {
        const x = (v: number) => f(50 + s * v);
        out.push(
          `<path d="M${x(42)} 98 C${x(43)} 86 ${x(34)} 79 ${x(22)} 80 C${x(18)} 85 ${x(18)} 92 ${x(22)} 98 Z" fill="url(#metal)" stroke="${shade(metal, -0.45)}" stroke-width="0.6"/>`,
        );
        out.push(
          `<path d="M${x(40)} 92 C${x(38)} 86 ${x(31)} 83 ${x(24)} 84" fill="none" stroke="${shade(metal, -0.4)}" stroke-width="0.5"/>`,
        );
        out.push(
          `<path d="M${x(41)} 96 C${x(39.5)} 90 ${x(32)} 87 ${x(24)} 88" fill="none" stroke="#e8c872" stroke-width="0.5"/>`,
        );
        for (const [rx, ry] of [
          [37, 83.4],
          [30, 82.4],
        ] as const)
          out.push(`<circle cx="${x(rx)}" cy="${ry}" r="0.5" fill="${shade(metal, 0.6)}"/>`);
      }
      break;
    }
    case "leather": {
      const hide = shade(accent, -0.62);
      out.push(
        `<path d="M10 100 C13 86 28 78 42 73.5 L58 73.5 C72 78 87 86 90 100 Z" fill="${hide}"/>`,
      );
      out.push(
        `<path d="M42 73.5 C46 76 54 76 58 73.5 L58 70.5 C54 72.4 46 72.4 42 70.5 Z" fill="${shade(hide, 0.15)}" stroke="${shade(accent, -0.2)}" stroke-width="0.5"/>`,
      );
      // Straps crossing, buckles, and a guard on one shoulder.
      out.push(
        `<path d="M26 82 L62 100 M74 82 L38 100" stroke="${shade(hide, -0.3)}" stroke-width="2.4"/>`,
      );
      out.push(
        `<path d="M26 82 L62 100 M74 82 L38 100" stroke="${shade(accent, -0.2)}" stroke-width="0.4" stroke-dasharray="1 1"/>`,
      );
      out.push(
        `<rect x="48.4" y="89.6" width="3.2" height="2.6" fill="none" stroke="#c9b26a" stroke-width="0.6"/>`,
      );
      out.push(
        `<path d="M14 92 C16 84 22 79 30 79 L31 83 C24 83 19 87 17 94 Z M17 96 C19 89 24 85 31 85 L31.5 88.5 C25 89 21 92 20 98 Z" fill="${shade(hide, 0.2)}" stroke="${shade(accent, -0.25)}" stroke-width="0.5"/>`,
      );
      out.push(
        `<path d="M36 76 L40 100 M64 76 L60 100" stroke="${shade(hide, 0.25)}" stroke-width="0.5" opacity="0.6"/>`,
      );
      break;
    }
  }
  void skinDark;
  // Open necklines sit a little higher, so the bodice shows even in a small portrait.
  const lift = kind === "robe" || kind === "coat" || kind === "leather" ? 0 : -4;
  return lift ? `<g transform="translate(0 ${lift})">${out.join("")}</g>` : out.join("");
}

// ---- Adornments ----

export const ADORNMENTS = ["flowers", "pearls", "feathers", "leaves", "chains", "beads"] as const;

/** Something in her hair: flowers, pearls, feathers, a leafy vine, fine chains or beads. */
export function adornment(kind: string | undefined, accent: string): string {
  const col = hex(accent, "#a855f7");
  const out: string[] = [];
  switch (kind) {
    case "flowers": {
      out.push(
        `<ellipse cx="31.5" cy="31" rx="2.2" ry="0.9" fill="#3f9a4a" transform="rotate(-30 31.5 31)"/><ellipse cx="39.5" cy="26" rx="2" ry="0.8" fill="#3f9a4a" transform="rotate(20 39.5 26)"/>`,
      );
      for (const [x, y, r, petal] of [
        [35, 30, 1.5, shade(col, 0.55)],
        [38.6, 27.6, 1.2, "#ff9ecf"],
        [32.2, 27.4, 1.1, "#ffffff"],
      ] as const) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          out.push(
            `<circle cx="${f(x + Math.cos(a) * r)}" cy="${f(y + Math.sin(a) * r)}" r="${f(r * 0.75)}" fill="${petal}"/>`,
          );
        }
        out.push(`<circle cx="${x}" cy="${y}" r="${f(r * 0.5)}" fill="#ffd36b"/>`);
      }
      break;
    }
    case "pearls": {
      const pearls: string[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const x = 36 + t * 28;
        const y = 24.6 - Math.sin(Math.PI * t) * 3.2;
        pearls.push(
          `<circle cx="${f(x)}" cy="${f(y)}" r="0.75" fill="#f6f2ea"/><circle cx="${f(x - 0.25)}" cy="${f(y - 0.25)}" r="0.25" fill="#ffffff"/>`,
        );
      }
      out.push(pearls.join(""));
      out.push(
        `<circle cx="36" cy="27" r="1" fill="#f6f2ea"/><circle cx="64" cy="27" r="1" fill="#f6f2ea"/>`,
      );
      break;
    }
    case "feathers": {
      for (const [x, y, rot, colr] of [
        [68, 28, 32, col],
        [70.5, 30, 50, "#f4f4f4"],
      ] as const) {
        out.push(
          `<g transform="rotate(${rot} ${x} ${y})"><ellipse cx="${x}" cy="${y - 6}" rx="1.6" ry="6.5" fill="${colr}" opacity="0.95"/><path d="M${x} ${y + 1} L${x} ${y - 12.5}" stroke="${shade(colr, -0.4)}" stroke-width="0.35"/>${[-4, -7, -10].map((d) => `<path d="M${x} ${y + d} l-1.4 -1.2 M${x} ${y + d} l1.4 -1.2" stroke="${shade(colr, -0.3)}" stroke-width="0.25"/>`).join("")}</g>`,
        );
      }
      out.push(gem(66.4, 29.4, 0.9, col));
      break;
    }
    case "leaves": {
      out.push(
        `<path d="M34 30 C40 24 46 24.5 50 25 C54 24.5 60 24 66 30" fill="none" stroke="#2f7a3a" stroke-width="0.6"/>`,
      );
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = 34 + t * 32;
        const y = 30 - Math.sin(Math.PI * t) * 5.4;
        const r = i % 2 ? 35 : -35;
        out.push(
          `<ellipse cx="${f(x)}" cy="${f(y - 0.8)}" rx="1.5" ry="0.7" fill="${i % 3 ? "#5cc65c" : "#8ae36a"}" transform="rotate(${r} ${f(x)} ${f(y - 0.8)})"/>`,
        );
      }
      break;
    }
    case "chains": {
      out.push(
        `<path d="M36 31 Q38 36 41 38.6 M64 31 Q62 36 59 38.6 M38.5 29 Q50 35 61.5 29" fill="none" stroke="#c9d0dc" stroke-width="0.35" stroke-dasharray="0.6 0.4"/>`,
      );
      out.push(gem(41.2, 39.4, 0.7, col), gem(58.8, 39.4, 0.7, col), gem(50, 33.4, 1, col));
      break;
    }
    case "beads": {
      for (const x of [33.4, 66.6]) {
        const beads: string[] = [];
        for (let i = 0; i < 9; i++) {
          beads.push(
            `<circle cx="${f(x + Math.sin(i * 0.9) * 0.4)}" cy="${f(38 + i * 2.6)}" r="0.85" fill="${["#e8c872", col, "#f4ecdc"][i % 3]}"/>`,
          );
        }
        out.push(
          `<path d="M${x} 36 L${x} 61" stroke="#3a2414" stroke-width="0.35"/>` + beads.join(""),
        );
      }
      break;
    }
  }
  return out.join("");
}

/** Where each scene's detail is, top to bottom, so a wide banner shows it. */
const FOCUS: Record<string, number> = {
  palace: 36,
  inn: 34,
  shire: 72,
  void: 40,
  mine: 70,
  harbor: 56,
  temple: 30,
  spire: 32,
  forge: 70,
  arena: 62,
  sanctum: 30,
};

/** A place's scenery as a wide banner for its window, as a whole SVG document. */
export function sceneBanner(
  place: string,
  region: string,
  bg0: string,
  bg1: string,
  accent: string,
): string {
  const a = hex(bg0, "#2a1840");
  const b = hex(bg1, "#05020c");
  const focus = FOCUS[place] ?? (region === "realm" ? 66 : region === "isles" ? 52 : 50);
  const top = Math.max(0, Math.min(64, focus - 18));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} 100 36" preserveAspectRatio="xMidYMid slice" width="400" height="144">` +
    `<defs><linearGradient id="bannerBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="100" height="100" fill="url(#bannerBg)"/>` +
    scene(place, region, a, hex(accent, "#a855f7")) +
    `</svg>`
  );
}
