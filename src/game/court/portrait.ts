/**
 * Queen portraits, drawn as SVG from a few traits in config.json (court.queens.*.look):
 * skin, hair (colour, sheen, style), eyes, eyeshadow, lips, ears, horns, headpiece,
 * markings and colours. A glamorous, regal cartoon style: almond eyes with winged
 * liner, full lips, flowing hair, jewels and gowns. Each queen has nine moods
 * (her face, and what floats around her) and more jewels as she falls for you.
 * Pictures are still, so they are cheap to show; a separate light overlay holds
 * what moves (hearts, rain, petals, embers, a tear), and a blink frame lets a
 * page blink her by fading one picture over another. Made in code, so they work
 * offline and look the same everywhere.
 * Pure, so the tests can load it.
 */

import { CONFIG, type CourtQueenKey } from "../config.ts";
import type { Mood } from "./hearts.ts";
import { c, f, gem, heart, hex, rng, seedOf, shade, star, timing } from "./svgkit.ts";
import {
  adornment,
  closedOutfit,
  outfitBack,
  outfitFront,
  outfitOf,
  scene,
  sceneBanner,
} from "./attire.ts";

export { shade };

export interface Look {
  skin: string;
  hair: string;
  /** Hair highlight colour; empty for a lighter shade of the hair. */
  sheen?: string;
  /** long, flowing, bun or ponytail. */
  hairStyle: string;
  eyes: string;
  /** open, glow (lit, no pupils) or closed (dreaming). */
  eyeStyle: string;
  /** Eyeshadow and lipstick. */
  shadow?: string;
  lips?: string;
  /** round or elf. */
  ears: string;
  /** Colour of horns, or "" for none. */
  horns: string;
  /** crown, voidcrown, tiara, circlet, hood or none. */
  headpiece: string;
  /** Gown and jewel colour. */
  accent: string;
  /** Inner and outer background colours. */
  bg: string[];
  /** moon, tattoo, runes, beauty (a beauty mark) or "". */
  marking: string;
  /** gown, corset, scales, regal, void, robe, coat, armor or leather; a gown when left out. */
  outfit?: string;
  /** flowers, pearls, feathers, leaves, chains, beads, or none. */
  adorn?: string;
}

const HAIR_BACK: Record<string, string> = {
  long: "M25 50 C19 20 38 9 51 10 C66 10 82 20 76 50 C79 66 80 80 82 96 L18 96 C20 80 21 66 25 50 Z",
  flowing:
    "M23 50 C15 18 37 6 51 7 C68 7 86 18 78 50 C86 64 79 76 88 90 C80 98 66 99 50 99 C34 99 20 98 12 90 C21 76 14 64 23 50 Z",
  bun: "M29 48 C26 24 40 14 51 14 C64 14 76 24 72 48 C73 56 71 62 68 66 L33 66 C29 62 28 56 29 48 Z",
  ponytail:
    "M28 48 C25 22 40 12 51 12 C63 12 76 22 73 46 C74 54 72 60 69 64 L32 64 C29 60 27 54 28 48 Z",
};

/** Locks that frame the face, in front of it. */
const HAIR_FRONT: Record<string, string> = {
  long:
    "M34 39 C33 22 55 15 67 31 C61 25 51 25 45 30 C41 33 38 38 37 46 Z " +
    "M35.5 34 C29.5 45 30 58 33.5 70 C34.6 57 35.6 46 39.5 38 Z M64.5 33 C70.5 44 70 58 66.5 70 C65.4 57 64.4 46 60.5 38 Z",
  flowing:
    "M33 40 C31 20 56 13 68 31 C61 24 50 24 44 30 C40 34 37 40 36 48 Z " +
    "M35 33 C27 46 29 62 33 76 C34.5 60 35.5 47 39.5 38 Z M65 32 C73 45 71 61 67 76 C65.5 60 64.5 47 60.5 38 Z",
  bun: "M34.5 39 C35 26 46 22 51 24 C58 22 66 28 66 39 C61 31 55 29 50.5 31 C46 29 39 31 34.5 39 Z M36 38 C33 46 34 54 36 60 C36.4 52 37.2 45 39 40 Z",
  ponytail:
    "M34 39 C34 25 48 19 53 21 C61 21 67 28 66.5 38 C60 30 52 28 45 31 C40 33.5 37 36 34 39 Z M36 37 C33 46 34 55 36.5 62 C37 53 37.6 45 40 39 Z",
};

type MouthKind = "neutral" | "smirk" | "smile" | "soft" | "open" | "pout" | "sad";

/** How a mood shows on her face and around her. */
interface Expr {
  /** How far the upper lids come down: 0 wide open, 0.35 heavy-lidded. */
  lidDrop: number;
  /** Eyes closed in happy crescents. */
  happy: boolean;
  /** Eyes shut for a blink. */
  shut?: boolean;
  /** Where she looks: -1 to her right, 1 to her left (aside, shy). */
  look: number;
  /** Brows: above 0 knit and angry, below 0 raised and sad. */
  browTilt: number;
  /** One brow raised, haughty. */
  oneBrow: boolean;
  mouth: MouthKind;
  /** Blush, 0 to 1, and shy lines on the cheeks. */
  blush: number;
  blushLines: boolean;
  tear: boolean;
  /** Hearts for catchlights. */
  heartEyes: boolean;
  /** A burning ring round the irises. */
  intense: boolean;
  /** Hearts floating round her, and the air: storm, rain, flare or petals. */
  hearts: number;
  aura: "" | "storm" | "rain" | "flare" | "petals";
  sparkle: boolean;
}

const CALM: Expr = {
  lidDrop: 0,
  happy: false,
  look: 0,
  browTilt: 0,
  oneBrow: false,
  mouth: "smile",
  blush: 0.3,
  blushLines: false,
  tear: false,
  heartEyes: false,
  intense: false,
  hearts: 0,
  aura: "",
  sparkle: false,
};

const EXPR: Record<Mood, Expr> = {
  aloof: { ...CALM, lidDrop: 0.22, oneBrow: true, mouth: "smirk", blush: 0.1 },
  smile: { ...CALM, lidDrop: 0.05, mouth: "smile", blush: 0.35 },
  delighted: { ...CALM, happy: true, mouth: "open", blush: 0.6, sparkle: true, hearts: 2 },
  blush: { ...CALM, look: 0.9, browTilt: -0.35, mouth: "soft", blush: 1, blushLines: true },
  smitten: {
    ...CALM,
    lidDrop: 0.2,
    heartEyes: true,
    mouth: "soft",
    blush: 0.85,
    hearts: 5,
    aura: "petals",
  },
  adoring: {
    ...CALM,
    happy: true,
    mouth: "smile",
    blush: 0.75,
    hearts: 9,
    aura: "petals",
    sparkle: true,
  },
  jealous: {
    ...CALM,
    browTilt: 0.9,
    look: -0.8,
    lidDrop: 0.2,
    mouth: "pout",
    blush: 0.55,
    aura: "storm",
  },
  longing: {
    ...CALM,
    browTilt: -1,
    lidDrop: 0.12,
    mouth: "sad",
    blush: 0.2,
    tear: true,
    aura: "rain",
  },
  fierce: {
    ...CALM,
    browTilt: 0.5,
    lidDrop: 0.15,
    mouth: "smirk",
    blush: 0.2,
    intense: true,
    aura: "flare",
  },
};

/** The light around her mood: darker for jealousy, blue for longing, a fiery glow when fierce. */
function moodTint(x: Expr): string {
  if (x.aura === "storm")
    return `<rect x="0" y="0" width="100" height="100" fill="#14061f" opacity="0.4"/>`;
  if (x.aura === "rain")
    return `<rect x="0" y="0" width="100" height="100" fill="#0a2240" opacity="0.38"/>`;
  if (x.aura === "flare") {
    return `<radialGradient id="flare" cx="50%" cy="95%" r="70%"><stop offset="0" stop-color="#ff7a2e" stop-opacity="0.55"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient><rect x="0" y="0" width="100" height="100" fill="url(#flare)"/>`;
  }
  return "";
}

/**
 * What moves in that air: lightning, rain, embers or petals. fx adds soft glows,
 * for a still picture; the moving overlay goes without, so it is cheap to redraw.
 */
function moodMotes(x: Expr, rand: () => number, accent: string, fx: boolean): string {
  const out: string[] = [];
  const glow = fx ? ` filter="url(#glowSmall)"` : "";
  if (x.aura === "storm") {
    out.push(
      `<g class="flash" ${timing(4.5 + rand() * 2, rand() * 4)}><path d="M18 6 L24 22 L19 23 L27 40" fill="none" stroke="#e9d5ff" stroke-width="0.9" opacity="0.9"${glow}/><path d="M82 4 L76 18 L81 19 L73 33" fill="none" stroke="${accent}" stroke-width="0.8" opacity="0.9"${glow}/></g>`,
    );
  } else if (x.aura === "rain") {
    for (let i = 0; i < 22; i++) {
      const rx = rand() * 100;
      const ry = rand() * 100;
      out.push(
        `<path class="fall" ${timing(1 + rand() * 0.8, rand() * 2)} d="M${f(rx)} ${f(ry)} l-0.8 3.6" stroke="#bfe3ff" stroke-width="0.35" opacity="${f(0.35 + rand() * 0.4)}"/>`,
      );
    }
  } else if (x.aura === "flare") {
    for (let i = 0; i < 16; i++) {
      out.push(
        `<circle class="rise" ${timing(2.4 + rand() * 2, rand() * 4)} cx="${f(8 + rand() * 84)}" cy="${f(55 + rand() * 45)}" r="${f(0.4 + rand() * 0.7)}" fill="${rand() > 0.5 ? "#ffd27a" : "#ff6a3d"}"${glow}/>`,
      );
    }
  } else if (x.aura === "petals") {
    for (let i = 0; i < 12; i++) {
      const px = rand() * 100;
      const py = rand() * 70;
      out.push(
        `<ellipse class="drift" ${timing(6 + rand() * 5, rand() * 10)} cx="${f(px)}" cy="${f(py)}" rx="${f(1 + rand() * 0.6)}" ry="${f(0.55 + rand() * 0.3)}" fill="${rand() > 0.4 ? "#ff8fb8" : "#ffd1e3"}" opacity="0.9" transform="rotate(${Math.round(rand() * 180)} ${f(px)} ${f(py)})"/>`,
      );
    }
  }
  return out.join("");
}

/** Hearts and sparkles in front of her, in the frame. */
function moodFront(x: Expr, rand: () => number, accent: string): string {
  const out: string[] = [];
  for (let i = 0; i < x.hearts; i++) {
    const side = i % 2 ? 1 : -1;
    const hx = 50 + side * (24 + rand() * 18);
    const hy = 28 + rand() * 52;
    const color = [`#ff4f8b`, `#ff8fb8`, shade(accent, 0.35)][i % 3]!;
    out.push(
      heart(
        hx,
        hy,
        1.3 + rand() * 1.6,
        color,
        `class="float" ${timing(5 + rand() * 3, rand() * 8)} opacity="0.95"`,
      ),
    );
  }
  if (x.sparkle) {
    for (let i = 0; i < 7; i++) {
      out.push(
        star(
          10 + rand() * 80,
          8 + rand() * 60,
          0.9 + rand() * 1.2,
          "#fffbe6",
          `class="tw" ${timing(1.6 + rand() * 1.6, rand() * 3)}`,
        ),
      );
    }
  }
  return out.join("");
}

/** The lips for a mood: corners up or down, closed, pouting or open in a laugh. */
const MOUTHS: Record<
  MouthKind,
  { hw: number; corner: number; sag: number; depth: number; open: number }
> = {
  neutral: { hw: 5.3, corner: 0, sag: 0.9, depth: 0, open: 0 },
  smirk: { hw: 5.3, corner: -0.15, sag: 1.0, depth: 0, open: 0 },
  smile: { hw: 5.7, corner: -1.0, sag: 2.1, depth: 0.2, open: 0 },
  soft: { hw: 5.4, corner: -0.55, sag: 1.5, depth: 0.1, open: 0 },
  open: { hw: 5.8, corner: -1.1, sag: 2.3, depth: 1.8, open: 2.6 },
  pout: { hw: 4.0, corner: 0.35, sag: 0.5, depth: 0.8, open: 0 },
  sad: { hw: 5.0, corner: 0.9, sag: 0.2, depth: -0.2, open: 0 },
};

function mouth(kind: MouthKind, lips: string, skinDark: string): string {
  const m = MOUTHS[kind];
  const L = 50 - m.hw;
  const R = 50 + m.hw;
  const cy = 58.1 + m.corner;
  const seam = 58.1 + m.sag;
  const mid = (cy + seam) / 2;
  const low = seam + m.open * 1.6;
  const bottom = 62.9 + m.depth + m.open * 0.6;
  const out: string[] = [];
  // A full upper lip with a defined cupid's bow.
  const bow = `Q${f(50 - m.hw * 0.55)} 55.6 49 56.8 Q50 56.1 51 56.8 Q${f(50 + m.hw * 0.55)} 55.6 ${f(R)} ${f(cy)}`;
  // Light on the skin just above the cupid's bow, and a soft shadow under the lower lip.
  out.push(
    `<ellipse cx="50" cy="55" rx="1.3" ry="0.45" fill="#ffffff" opacity="0.18" filter="url(#glowSmall)"/>`,
  );
  out.push(
    `<ellipse cx="50" cy="${f(bottom + 1)}" rx="${f(m.hw * 0.6)}" ry="0.8" fill="${skinDark}" opacity="0.28" filter="url(#soft)"/>`,
  );
  if (m.open > 0) {
    // Open in a laugh: the mouth, a row of teeth and a hint of tongue.
    out.push(
      `<path d="M${f(L)} ${f(cy)} Q50 ${f(seam)} ${f(R)} ${f(cy)} Q50 ${f(low)} ${f(L)} ${f(cy)} Z" fill="#2a0710"/>`,
    );
    out.push(
      `<ellipse cx="50" cy="${f(mid + m.open * 0.9)}" rx="${f(m.hw * 0.45)}" ry="${f(m.open * 0.35)}" fill="#d9476b"/>`,
    );
    out.push(
      `<path d="M${f(L + 0.9)} ${f(cy + 0.15)} Q50 ${f(seam)} ${f(R - 0.9)} ${f(cy + 0.15)} Q50 ${f(seam + 1.5)} ${f(L + 0.9)} ${f(cy + 0.15)} Z" fill="#fff8f0"/>`,
    );
  }
  out.push(
    `<path d="M${f(L)} ${f(cy)} ${bow} Q50 ${f(seam)} ${f(L)} ${f(cy)} Z" fill="url(#lip)"/>`,
  );
  out.push(
    `<path d="M${f(L)} ${f(cy)} Q50 ${f(low)} ${f(R)} ${f(cy)} Q${f(50 + m.hw * 0.7)} ${f(bottom - 0.2)} 50 ${f(bottom)} Q${f(50 - m.hw * 0.7)} ${f(bottom - 0.2)} ${f(L)} ${f(cy)} Z" fill="url(#lip)"/>`,
  );
  if (!m.open) {
    out.push(
      `<path d="M${f(L)} ${f(cy)} Q50 ${f(seam + 0.2)} ${f(R)} ${f(cy)}" fill="none" stroke="${shade(lips, -0.5)}" stroke-width="0.45"/>`,
    );
  }
  // Gloss on the lower lip, a glint on the upper.
  const gy = (mid + m.open * 1.2 + bottom) / 2 + 0.2;
  out.push(
    `<ellipse cx="50" cy="${f(gy)}" rx="${f(m.hw * 0.4)}" ry="0.75" fill="#ffffff" opacity="0.3" filter="url(#glowSmall)"/>`,
  );
  out.push(
    `<ellipse cx="49.2" cy="${f(gy - 0.2)}" rx="0.9" ry="0.32" fill="#ffffff" opacity="0.6"/>`,
  );
  out.push(
    `<path d="M47.6 57.6 Q49 57 49.8 57.6" fill="none" stroke="#ffffff" stroke-width="0.35" opacity="0.4" stroke-linecap="round"/>`,
  );
  // The corners: dimples for a smile, one for a smirk, down for sadness.
  const corner = (sd: number) => {
    const x = 50 + sd * m.hw;
    if (kind === "sad") return `M${f(x)} ${f(cy)} q${f(sd * 0.6)} 0.4 ${f(sd * 0.9)} 1`;
    if (kind === "smirk")
      return sd > 0 ? `M${f(x)} ${f(cy)} q${f(sd * 0.9)} -0.4 ${f(sd * 1.4)} -1.2` : "";
    if (kind === "smile" || kind === "soft" || kind === "open")
      return `M${f(x)} ${f(cy)} q${f(sd * 0.6)} -0.5 ${f(sd * 0.9)} -1.2`;
    return "";
  };
  const corners = `${corner(-1)} ${corner(1)}`.trim();
  if (corners)
    out.push(
      `<path d="${corners}" fill="none" stroke="${skinDark}" stroke-width="0.5" stroke-linecap="round"/>`,
    );
  return out.join("");
}

/** Brows from outer end to inner: knit together when angry, raised in the middle when sad, one up when haughty. */
function brows(hairDark: string, x: Expr): string {
  const out: string[] = [];
  for (const sd of [-1, 1]) {
    const raise = x.oneBrow && sd > 0 ? 1.7 : 0;
    const t = x.browTilt;
    const O: [number, number] = [50 + sd * 12.6, 40.4 - raise - t * 0.4];
    const K: [number, number] = [50 + sd * 8.4, 35.8 - raise + t * 0.3];
    const I: [number, number] = [50 + sd * 2.8, 38.4 - raise + t * 1.8];
    out.push(
      `<path d="M${f(O[0])} ${f(O[1])} Q${f(K[0])} ${f(K[1])} ${f(I[0])} ${f(I[1])}" fill="none" stroke="${hairDark}" stroke-width="1.05" stroke-linecap="round"/>`,
    );
    for (const u of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
      const px = (1 - u) ** 2 * O[0] + 2 * u * (1 - u) * K[0] + u ** 2 * I[0];
      const py = (1 - u) ** 2 * O[1] + 2 * u * (1 - u) * K[1] + u ** 2 * I[1];
      out.push(
        `<path d="M${f(px)} ${f(py + 0.5)} l${f(sd * -0.9)} -0.9" stroke="${hairDark}" stroke-width="0.32" stroke-linecap="round" opacity="0.8"/>`,
      );
    }
  }
  return out.join("");
}

/** A tear on her cheek, sliding. */
function tear(x: number, y: number): string {
  return `<g class="tear" ${timing(3.8, 1.2)}><path d="M${f(x)} ${f(y)} q-0.9 1.7 0 2.5 q0.9 -0.8 0 -2.5 Z" fill="#d8f1ff" opacity="0.9"/><circle cx="${f(x - 0.25)}" cy="${f(y + 1.6)}" r="0.28" fill="#ffffff"/></g>`;
}

/** Jewels she wears more of as she falls for you. */
function tierJewels(tier: number, accent: string): string {
  const out: string[] = [];
  if (tier >= 2) out.push(gem(41.6, 75.2, 0.7, accent), gem(58.4, 75.2, 0.7, accent));
  if (tier >= 3) {
    out.push(
      `<path d="M40.2 74.4 Q50 83.4 59.8 74.4" fill="none" stroke="url(#gold)" stroke-width="0.6"/>`,
    );
    out.push(
      `<path d="M50 82.2 q-1.4 2.4 0 3.8 q1.4 -1.4 0 -3.8 Z" fill="${accent}" stroke="#fff3c4" stroke-width="0.35"/>`,
    );
  }
  return out.join("");
}

/** Glints in her hair once she is smitten, and a golden halo when devoted. */
function tierGlow(tier: number): string {
  const out: string[] = [];
  if (tier >= 4) {
    for (const [x, y, d] of [
      [38, 30, 0],
      [62, 27, 0.8],
      [56, 20, 1.6],
      [43, 22, 2.2],
    ] as const) {
      out.push(star(x, y, 1.1, "#fffbe6", `class="tw" ${timing(1.8, d)}`));
    }
  }
  return out.join("");
}

/** The figure drawn a little larger than the frame, so the face reads even as a small avatar. */
const FIGURE = "translate(50 56) scale(1.12) translate(-50 -56)";

/** How the overlay moves: transforms and fades only, and nothing for anyone who asks for less motion. */
const MOTION = [
  "<style>",
  ".tw{animation:tw 2.6s ease-in-out infinite alternate}",
  "@keyframes tw{from{opacity:.15}to{opacity:1}}",
  ".float{animation:float 6s linear infinite}",
  "@keyframes float{0%{transform:translateY(6px);opacity:0}15%{opacity:.95}100%{transform:translateY(-18px);opacity:0}}",
  ".fall{animation:fall 1.4s linear infinite}",
  "@keyframes fall{from{transform:translate(2px,-24px)}to{transform:translate(-2px,24px)}}",
  ".rise{animation:rise 3.2s linear infinite}",
  "@keyframes rise{0%{transform:translateY(8px);opacity:0}20%{opacity:1}100%{transform:translateY(-26px);opacity:0}}",
  ".drift{animation:drift 7s linear infinite}",
  "@keyframes drift{0%{transform:translate(-6px,-20px);opacity:0}15%{opacity:.9}100%{transform:translate(8px,40px);opacity:0}}",
  ".flash{opacity:0;animation:flash 4.5s steps(1) infinite}",
  "@keyframes flash{0%,100%{opacity:0}46%{opacity:.9}48%{opacity:0}50%{opacity:.7}52%{opacity:0}}",
  ".tear{animation:tear 3.8s ease-in infinite}",
  "@keyframes tear{0%{transform:translateY(-1px);opacity:0}20%{opacity:1}85%{transform:translateY(6px);opacity:1}100%{transform:translateY(7px);opacity:0}}",
  "@media (prefers-reduced-motion:reduce){*{animation:none!important}.flash{opacity:.6}}",
  "</style>",
].join("");

/**
 * Fine strands over a hair shape, clipped to it: alternating sheen and shadow
 * lines that follow the fall of the hair.
 */
function strands(
  clip: string,
  rand: () => number,
  n: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  light: string,
  dark: string,
): string {
  const out: string[] = [`<g clip-path="url(#${clip})" fill="none" stroke-linecap="round">`];
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i / (n - 1)) + (rand() - 0.5) * 2;
    const sway = (x - 50) * 0.18 + (rand() - 0.5) * 6;
    const wave = (rand() - 0.5) * 2.2;
    const top = y0 + rand() * 6;
    const bottom = y1 - rand() * 10;
    const h = bottom - top;
    // A gentle wave down each strand; every fourth a soft shadow between locks, every fourth catching the light.
    const d = `M${f(x)} ${f(top)} C${f(x + sway * 0.2 + wave)} ${f(top + h * 0.18)} ${f(x + sway * 0.45 + wave)} ${f(top + h * 0.32)} ${f(x + sway * 0.5)} ${f(top + h * 0.5)} S${f(x + sway - wave)} ${f(top + h * 0.82)} ${f(x + sway * 0.85)} ${f(bottom)}`;
    const kind = i % 4;
    if (kind === 3) {
      out.push(
        `<path d="${d}" stroke="${dark}" stroke-width="${f(1.2 + rand() * 0.6)}" opacity="${f(0.1 + rand() * 0.08)}"/>`,
      );
    } else {
      const lit = kind === 0;
      out.push(
        `<path d="${d}" stroke="${lit ? light : dark}" stroke-width="${f(0.25 + rand() * 0.4)}" opacity="${f(lit ? 0.38 + rand() * 0.3 : 0.25 + rand() * 0.22)}"/>`,
      );
    }
  }
  out.push("</g>");
  return out.join("");
}

/** Points of one eye: s is -1 for the left, 1 for the right. */
function eyeGeom(s: number) {
  const x = (v: number) => 50 + s * v;
  return {
    inner: [x(2.6), 45.6],
    outer: [x(11.4), 44.2],
    up: [x(7.2), 40.6],
    down: [x(7), 47.9],
    cx: x(7),
    wing: [x(14.2), 41.9],
  };
}

function eyes(
  look: Look,
  iris: string,
  lash: string,
  shadowCol: string,
  skinDark: string,
  x: Expr,
  /** Whether to draw her tear (left out when an overlay moves it). */
  tears: boolean,
): string {
  const out: string[] = [];
  const hot = hex(iris, "#3a86ff");
  for (const s of [-1, 1]) {
    const g = eyeGeom(s);
    const [ix, iy] = g.inner;
    const [ox, oy] = g.outer;
    const [ux, uy] = g.up;
    const [dx, dy] = g.down;
    // How far the upper lid comes down over the eye.
    const drop = x.lidDrop * 7;
    const open = `M${ox} ${oy} Q${ux} ${uy} ${ix} ${iy}`;
    const lid = `M${ox} ${oy} Q${ux} ${f(uy + drop)} ${ix} ${iy}`;
    const almond = `${open} Q${dx} ${dy} ${ox} ${oy} Z`;
    // Eyeshadow, swept up towards the brow; the crease; a soft shadow beneath.
    out.push(
      `<path d="M${ox + s * 1.2} ${oy + 0.4} Q${ux} ${uy - 4.4} ${ix - s * 0.6} ${iy - 1.2} Q${ux} ${uy - 0.6} ${ox} ${oy} Z" fill="${shadowCol}" opacity="0.62" filter="url(#soft)"/>`,
    );
    out.push(
      `<path d="M${ox} ${oy - 1.2} Q${ux} ${uy - 2.1} ${ix} ${iy - 1.3}" fill="none" stroke="${skinDark}" stroke-width="0.55" opacity="0.7"/>`,
    );
    // Deeper colour close to the lashes, fading up the lid.
    out.push(
      `<path d="M${ox} ${oy - 0.3} Q${ux} ${uy - 1.6} ${ix} ${iy - 0.5}" fill="none" stroke="${shade(shadowCol, -0.25)}" stroke-width="1.3" opacity="0.32" filter="url(#glowSmall)"/>`,
    );
    out.push(
      `<ellipse cx="${g.cx}" cy="49.2" rx="3.6" ry="0.9" fill="${skinDark}" opacity="0.16" filter="url(#soft)"/>`,
    );
    if (look.eyeStyle === "closed" || x.happy || x.shut) {
      // Closed: dreaming lids curve down; happy ones curve up in crescents.
      const happy = x.happy;
      const peak = happy ? iy - 3 : iy + 2.6;
      const y0 = oy + (happy ? 1 : 0.6);
      const y1 = iy + (happy ? 0.6 : 0);
      out.push(
        `<path d="M${ox} ${f(y0)} Q${g.cx} ${f(peak)} ${ix} ${f(y1)}" fill="none" stroke="${lash}" stroke-width="1.5" stroke-linecap="round"/>`,
      );
      for (const t of [0.12, 0.3, 0.5]) {
        const px = ox + (ix - ox) * t;
        const py = (1 - t) ** 2 * y0 + 2 * t * (1 - t) * peak + t ** 2 * y1;
        out.push(
          happy
            ? `<path d="M${f(px)} ${f(py)} l${f(s * 1.1)} -1.3" stroke="${lash}" stroke-width="0.55" stroke-linecap="round"/>`
            : `<path d="M${f(px)} ${f(py)} l${f(-s * 0.9)} 1.6" stroke="${lash}" stroke-width="0.6" stroke-linecap="round"/>`,
        );
      }
      if (tears && x.tear && s < 0) out.push(tear(ox + 1.6, oy + 3));
      continue;
    }
    const clip = `eye${s < 0 ? "L" : "R"}`;
    const cx = g.cx + x.look * 1.3 * (look.eyeStyle === "glow" ? 0.6 : 1);
    out.push(`<clipPath id="${clip}"><path d="${almond}"/></clipPath>`);
    out.push(`<g>`);
    if (look.eyeStyle === "glow") {
      // Lit from within: a dark eye, a blazing iris and a thin bright slit (a heart, when smitten).
      out.push(`<path d="${almond}" fill="${iris}" opacity="0.55" filter="url(#glow)"/>`);
      out.push(`<path d="${almond}" fill="${shade(hot, -0.55)}"/>`);
      out.push(`<g clip-path="url(#${clip})">`);
      out.push(`<circle cx="${f(cx)}" cy="45" r="3.1" fill="${hot}" filter="url(#glowSmall)"/>`);
      out.push(`<circle cx="${f(cx)}" cy="45" r="2.1" fill="${shade(hot, 0.45)}"/>`);
      out.push(
        x.heartEyes
          ? heart(cx, 45.1, 1.25, "#ffffff", 'opacity="0.95"')
          : `<ellipse cx="${f(cx)}" cy="45" rx="0.45" ry="1.8" fill="#ffffff" opacity="0.9"/>`,
      );
      out.push(`<circle cx="${f(cx + 0.9)}" cy="43.9" r="0.6" fill="#ffffff" opacity="0.9"/>`);
    } else {
      out.push(`<path d="${almond}" fill="#fbf4f0"/>`);
      out.push(`<g clip-path="url(#${clip})">`);
      out.push(`<circle cx="${f(cx)}" cy="45" r="2.85" fill="${iris}"/>`);
      out.push(`<circle cx="${f(cx)}" cy="45" r="2.85" fill="url(#iris)"/>`);
      // Fibres of the iris, its darker rim, the pupil and two catchlights.
      for (let a = 0; a < 18; a++) {
        const t = (a / 18) * Math.PI * 2;
        out.push(
          `<path d="M${f(cx + Math.cos(t) * 1.35)} ${f(45 + Math.sin(t) * 1.35)} L${f(cx + Math.cos(t) * 2.65)} ${f(45 + Math.sin(t) * 2.65)}" stroke="${a % 2 ? shade(hot, 0.35) : shade(hot, -0.4)}" stroke-width="0.2" opacity="0.65"/>`,
        );
      }
      out.push(
        `<circle cx="${f(cx)}" cy="45" r="2.75" fill="none" stroke="${shade(hot, -0.65)}" stroke-width="0.4"/>`,
      );
      out.push(`<circle cx="${f(cx)}" cy="45" r="1.25" fill="#140a14"/>`);
      out.push(
        x.heartEyes
          ? heart(cx + 0.8, 44, 0.85, "#ffffff")
          : `<circle cx="${f(cx + 0.9)}" cy="43.9" r="0.75" fill="#ffffff"/>`,
      );
      out.push(`<circle cx="${f(cx - 0.9)}" cy="46.2" r="0.32" fill="#ffffff" opacity="0.85"/>`);
      out.push(
        `<path d="M${ox} ${oy} Q${ux} ${uy + 1.2} ${ix} ${iy} L${ix} ${iy - 3} L${ox} ${oy - 3} Z" fill="${skinDark}" opacity="0.18"/>`,
      );
    }
    if (x.intense) {
      out.push(
        `<circle cx="${f(cx)}" cy="45" r="3" fill="none" stroke="${shade(hot, 0.3)}" stroke-width="0.5" opacity="0.9" filter="url(#glowSmall)"/>`,
      );
    }
    out.push(`</g>`);
    // Heavy lids: skin comes down over the top of the eye.
    if (drop > 0) {
      out.push(`<path d="${open} Q${ux} ${f(uy + drop)} ${ox} ${oy} Z" fill="url(#skin)"/>`);
    }
    // Winged liner and lashes, along the lid.
    out.push(
      `<path d="${lid}" fill="none" stroke="${lash}" stroke-width="1.45" stroke-linecap="round"/>`,
    );
    out.push(
      `<path d="M${ox + s * 0.4} ${oy + 0.2} L${g.wing[0]} ${g.wing[1]} L${ox - s * 0.6} ${oy - 0.9} Z" fill="${lash}"/>`,
    );
    for (const t of [0.04, 0.12, 0.2, 0.28, 0.36, 0.46, 0.58]) {
      const px = ox + (ix - ox) * t;
      const py = oy + (iy - oy) * t - Math.sin(Math.PI * t) * (3.1 - drop / 2);
      const len = 1.9 - t * 1.6;
      out.push(
        `<path d="M${f(px)} ${f(py)} q${f(s * 0.55 * len)} ${f(-0.8 * len)} ${f(s * len)} ${f(-1.05 * len)}" fill="none" stroke="${lash}" stroke-width="0.5" stroke-linecap="round"/>`,
      );
    }
    out.push(`</g>`);
    // A wet glint on the lower lid, and shimmer in the eyeshadow.
    out.push(
      `<path d="M${f(ox - s * 1.2)} ${f(oy + 1.3)} Q${dx} ${f(dy - 0.2)} ${f(ix + s * 0.6)} ${f(iy + 0.4)}" fill="none" stroke="#ffffff" stroke-width="0.3" opacity="${x.tear ? 0.85 : 0.5}"/>`,
    );
    for (const [ax, ay] of [
      [0.3, -2.4],
      [0.55, -3.1],
      [0.75, -2.2],
    ] as const) {
      out.push(
        `<circle cx="${f(ox + (ix - ox) * ax)}" cy="${f(iy + ay - 0.3)}" r="0.22" fill="#ffffff" opacity="0.7"/>`,
      );
    }
    out.push(
      `<path d="M${ox - s * 0.3} ${oy + 0.6} Q${dx} ${dy + 0.3} ${ix} ${iy + 0.2}" fill="none" stroke="${lash}" stroke-width="0.35" opacity="0.4"/>`,
    );
    // A bright inner corner, and a few fine lashes under the outer half.
    out.push(
      `<circle cx="${f(ix - s * 0.5)}" cy="${f(iy + 0.15)}" r="0.42" fill="#ffffff" opacity="0.55"/>`,
    );
    for (const t of [0.08, 0.2, 0.32]) {
      const px = ox + (dx - ox) * t * 2;
      const py = oy + (dy - oy) * t * 2 + 0.5;
      out.push(
        `<path d="M${f(px)} ${f(py)} l${f(s * 0.25)} 0.5" stroke="${lash}" stroke-width="0.22" stroke-linecap="round" opacity="0.4"/>`,
      );
    }
    if (tears && x.tear && s < 0) out.push(tear(ox + 1.6, oy + 3));
  }
  return out.join("");
}

function headpiece(kind: string, accent: string, rim: string): string {
  if (kind === "crown") {
    return (
      `<path d="M32.5 29 L35 11 L40.8 19.5 L45.2 6.5 L50 16 L54.8 6.5 L59.2 19.5 L65 11 L67.5 29 Q50 24.5 32.5 29 Z" fill="url(#gold)" stroke="#7a560e" stroke-width="0.7"/>` +
      `<path d="M33.5 26.5 Q50 22.2 66.5 26.5" fill="none" stroke="#fff3c4" stroke-width="0.7" opacity="0.8"/>` +
      // Filigree scrolls between the points.
      `<path d="M37 24 q1.5 -3 3.2 -1 q-1.6 1.2 -0.4 2.4 M63 24 q-1.5 -3 -3.2 -1 q1.6 1.2 0.4 2.4 M44.5 21.5 q1.2 -2.6 2.8 -0.8 M55.5 21.5 q-1.2 -2.6 -2.8 -0.8" fill="none" stroke="#8a6414" stroke-width="0.45"/>` +
      `<path d="M34 27.6 Q50 23.6 66 27.6" fill="none" stroke="#8a6414" stroke-width="0.35" stroke-dasharray="0.6 0.9"/>` +
      gem(50, 20.8, 3, accent) +
      gem(40.6, 23.6, 1.6, accent) +
      gem(59.4, 23.6, 1.6, accent) +
      `<circle cx="45.2" cy="7.2" r="1" fill="#fff3c4"/><circle cx="54.8" cy="7.2" r="1" fill="#fff3c4"/>` +
      `<circle cx="35" cy="11.6" r="0.8" fill="#fff3c4"/><circle cx="65" cy="11.6" r="0.8" fill="#fff3c4"/>`
    );
  }
  if (kind === "voidcrown") {
    return (
      `<path d="M32.5 30 L35.5 14 L39.6 22.5 L43.5 8.5 L46.8 21 L50 3.5 L53.2 21 L56.5 8.5 L60.4 22.5 L64.5 14 L67.5 30 Q50 25.5 32.5 30 Z" fill="${rim}" opacity="0.55" filter="url(#glow)"/>` +
      `<path d="M32.5 30 L35.5 14 L39.6 22.5 L43.5 8.5 L46.8 21 L50 3.5 L53.2 21 L56.5 8.5 L60.4 22.5 L64.5 14 L67.5 30 Q50 25.5 32.5 30 Z" fill="#14081f" stroke="${rim}" stroke-width="0.8"/>` +
      `<path d="M38 26.5 L40 20 L42 26 M58 26.5 L60 20 L62 26 M46 24.5 L50 13 L54 24.5" fill="none" stroke="${rim}" stroke-width="0.4" opacity="0.8"/>` +
      gem(50, 22.4, 2.8, rim) +
      `<circle cx="43.5" cy="9.4" r="0.7" fill="${rim}" filter="url(#glowSmall)"/><circle cx="56.5" cy="9.4" r="0.7" fill="${rim}" filter="url(#glowSmall)"/><circle cx="50" cy="4.6" r="0.9" fill="${rim}" filter="url(#glowSmall)"/>`
    );
  }
  if (kind === "tiara") {
    return (
      `<path d="M34 33.5 Q50 24.5 66 33.5" fill="none" stroke="#eef2ff" stroke-width="1.6"/>` +
      `<path d="M34 33.5 Q50 26.5 66 33.5" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.8"/>` +
      `<path d="M50 19.5 a5.4 5.4 0 1 0 4.4 8.6 a4.4 4.4 0 1 1 -4.4 -8.6 Z" fill="#f4f8ff" stroke="${accent}" stroke-width="0.6"/>` +
      gem(42, 29.6, 1.2, "#e8f4ff") +
      gem(58, 29.6, 1.2, "#e8f4ff") +
      `<path d="M37.5 31.5 l0.5 -1.4 M40 30.3 l0.4 -1.6 M60 30.3 l-0.4 -1.6 M62.5 31.5 l-0.5 -1.4" stroke="#eef2ff" stroke-width="0.4"/>`
    );
  }
  if (kind === "circlet") {
    return (
      `<path d="M34.5 35.5 Q50 29.5 65.5 35.5" fill="none" stroke="url(#gold)" stroke-width="1.5"/>` +
      `<path d="M38 34 Q44 37.5 50 36 Q56 37.5 62 34" fill="none" stroke="#e8c872" stroke-width="0.35" stroke-dasharray="0.5 0.7"/>` +
      `<path d="M50 32.2 q-1.6 2.6 0 4.6 q1.6 -2 0 -4.6 Z" fill="${accent}" stroke="#fff3c4" stroke-width="0.45"/>` +
      `<path d="M49.4 33.4 l0.5 0.9" stroke="#ffffff" stroke-width="0.35" stroke-linecap="round"/>`
    );
  }
  return "";
}

/** A hooded cloak behind the head: the face, ears and front hair sit in its opening. */
function hood(accent: string): string {
  const dark = shade(hex(accent, "#556070"), -0.6);
  const opening = "M27 100 C25 -2 75 -2 73 100 Z";
  return (
    `<path d="M11 100 C0 -16 100 -16 89 100 Z ${opening}" fill="${dark}" fill-rule="evenodd"/>` +
    `<path d="M11 100 C0 -16 100 -16 89 100" fill="none" stroke="${shade(dark, 0.35)}" stroke-width="0.8"/>` +
    `<path d="M18 96 C12 40 24 14 40 9 M82 96 C88 40 76 14 60 9" fill="none" stroke="${shade(dark, 0.25)}" stroke-width="0.6" opacity="0.8"/>` +
    `<path d="M27 100 C25 -2 75 -2 73 100" fill="none" stroke="#000000" stroke-width="2.4" opacity="0.35" filter="url(#soft)"/>` +
    `<path d="M27 100 C25 -2 75 -2 73 100" fill="none" stroke="#c9b26a" stroke-width="0.5" stroke-dasharray="1.2 0.8" opacity="0.85"/>`
  );
}

function markings(kind: string, accent: string, rim: string): string {
  if (kind === "moon")
    return `<path d="M50 31.5 a3 3 0 1 0 2.4 4.8 a2.4 2.4 0 1 1 -2.4 -4.8 Z" fill="${accent}" opacity="0.9"/>`;
  if (kind === "tattoo") {
    return (
      `<path d="M38.6 49 C37.6 52 37 55 37.6 58.5 M41.3 49.6 L40.2 54.5" stroke="${accent}" stroke-width="0.9" stroke-linecap="round" opacity="0.85" fill="none"/>` +
      `<path d="M61.4 49 C62.4 52 63 55 62.4 58.5 M58.7 49.6 L59.8 54.5" stroke="${accent}" stroke-width="0.9" stroke-linecap="round" opacity="0.85" fill="none"/>`
    );
  }
  if (kind === "runes") {
    const r = (x: number) =>
      `<path d="M${x} 49.5 l0.9 1.4 l-0.9 1.4 l-0.9 -1.4 Z M${x} 53 l0 2.2" stroke="${rim}" stroke-width="0.5" fill="${rim}" opacity="0.9"/>`;
    return `<g filter="url(#glowSmall)">${r(39.5)}${r(60.5)}<circle cx="50" cy="33.5" r="0.9" fill="${rim}"/></g>`;
  }
  if (kind === "beauty") return `<circle cx="56.6" cy="55.6" r="0.55" fill="#3a1a1a"/>`;
  return "";
}

/** Light rays, bokeh and either embers (Fire) or starlight (Water) behind a queen. */
function backdrop(rand: () => number, bg0: string, accent: string, element: string): string {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    const w = 0.05 + rand() * 0.06;
    const x1 = 50 + Math.sin(a - w) * 120;
    const x2 = 50 + Math.sin(a + w) * 120;
    out.push(
      `<path d="M50 -12 L${f(x1)} 110 L${f(x2)} 110 Z" fill="#ffffff" opacity="${f(0.03 + rand() * 0.04)}"/>`,
    );
  }
  for (let i = 0; i < 16; i++) {
    out.push(
      `<circle cx="${f(rand() * 100)}" cy="${f(rand() * 100)}" r="${f(0.8 + rand() * 4.2)}" fill="${shade(bg0, 0.55 + rand() * 0.3)}" opacity="${f(0.08 + rand() * 0.22)}"/>`,
    );
  }
  for (let i = 0; i < 14; i++) {
    const x = rand() * 100;
    const y = 20 + rand() * 78;
    if (element === "fire") {
      const col = rand() > 0.5 ? "#ffb347" : "#ff6a3d";
      out.push(
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.35 + rand() * 0.6)}" fill="${col}" opacity="${f(0.55 + rand() * 0.4)}" filter="url(#glowSmall)"/>`,
      );
    } else {
      const r = 0.6 + rand() * 1;
      out.push(
        `<path d="M${f(x)} ${f(y - r)} L${f(x + r * 0.25)} ${f(y - r * 0.25)} L${f(x + r)} ${f(y)} L${f(x + r * 0.25)} ${f(y + r * 0.25)} L${f(x)} ${f(y + r)} L${f(x - r * 0.25)} ${f(y + r * 0.25)} L${f(x - r)} ${f(y)} L${f(x - r * 0.25)} ${f(y - r * 0.25)} Z" fill="${rand() > 0.5 ? "#ffffff" : shade(hex(accent, "#a855f7"), 0.5)}" opacity="${f(0.5 + rand() * 0.45)}"/>`,
      );
    }
  }
  return out.join("");
}

export interface PortraitOptions {
  /** How she feels: her face and the air around her. Smiling when not given. */
  mood?: Mood;
  /** Her affection tier: more jewels, glints and a halo as she falls for you. */
  tier?: number;
  /**
   * Draw what floats around her (hearts, rain, petals, embers, a tear) into the
   * picture; true unless a moving overlay (portraitAirSvg) shows them instead.
   */
  air?: boolean;
  /** Her eyes shut, for the frame a page fades in to make her blink. */
  blink?: boolean;
  /** The place she stands (its scenery is drawn behind her), and its region. */
  scene?: string;
  region?: string;
}

/** Whether she can blink in a mood: not when her eyes are already closed. */
export function canBlink(look: Look, mood: Mood): boolean {
  return look.eyeStyle !== "closed" && !EXPR[mood]?.happy;
}

/**
 * One queen's portrait, as a whole SVG document. element (fire or water) picks
 * embers or starlight behind her.
 */
export function portraitSvg(
  look: Look,
  ring: string,
  element = "",
  o: PortraitOptions = {},
): string {
  const base = EXPR[o.mood ?? "smile"] ?? EXPR.smile;
  const x: Expr = o.blink ? { ...base, shut: true } : base;
  const tier = Math.max(0, Math.min(5, Math.floor(o.tier ?? 0)));
  const air = o.air !== false;
  const outfit = outfitOf(look.outfit);
  const skin = hex(look.skin, "#f2c9a5");
  const hair = hex(look.hair, "#5a3a2a");
  const iris = c(look.eyes, "#3a86ff");
  const accent = hex(look.accent, "#a855f7");
  const rim = c(ring, accent);
  const bg0 = hex(look.bg[0], "#2a1840");
  const bg1 = hex(look.bg[1], "#0b0614");
  const lips = hex(look.lips, "#c2185b");
  const shadowCol = hex(look.shadow, shade(accent, -0.2));
  const sheen = hex(look.sheen, shade(hair, 0.35));
  const skinDark = shade(skin, -0.22);
  const skinLight = shade(skin, 0.22);
  const hairDark = shade(hair, -0.45);
  const lash = shade(hair, -0.75) === "#000000" ? "#120a12" : shade(hair, -0.75);
  const style = HAIR_BACK[look.hairStyle] ? look.hairStyle : "long";
  const horn = look.horns ? hex(look.horns, "#e9dcc0") : "";
  const rand = rng(seedOf(`${look.hair}|${look.hairStyle}|${look.skin}|${look.eyes}`));
  // The mood's air from its own numbers, so her strands stay the same in every mood.
  const moodRand = rng(seedOf(`${look.hair}|${o.mood ?? "smile"}`));
  const face =
    "M35 38 C35 24.5 65 24.5 65 38 C65 47 63.2 53.6 58.6 59.4 C55.4 63.3 52.6 65.6 50 66 C47.4 65.6 44.6 63.3 41.4 59.4 C36.8 53.6 35 47 35 38 Z";
  const sparkles = [
    [16, 20, 1.3],
    [84, 24, 1.6],
    [12, 58, 1],
    [88, 62, 1.3],
    [24, 10, 0.9],
    [76, 8, 1.1],
    [90, 42, 0.8],
    [10, 38, 0.9],
  ]
    .map(
      ([sx, sy, r]) =>
        `<circle class="tw" ${timing(2 + (sx! % 7) / 3, (sy! % 9) / 3)} cx="${sx}" cy="${sy}" r="${r}" fill="${shade(bg0, 0.65)}" opacity="0.75"/>`,
    )
    .join("");
  const ear = (s: number) => {
    const x = (v: number) => (50 + s * v).toFixed(2);
    return look.ears === "elf"
      ? `<path d="M${x(14.4)} 42 C${x(20)} 37.5 ${x(27)} 30 ${x(33)} 24.5 C${x(29)} 33 ${x(24)} 44 ${x(15.2)} 52 Z" fill="url(#skin)" stroke="${skinDark}" stroke-width="0.5"/>` +
          `<path d="M${x(16.5)} 44 C${x(21)} 40 ${x(25)} 35 ${x(29)} 29.5" fill="none" stroke="${skinDark}" stroke-width="0.5" opacity="0.7"/>`
      : `<path d="M${x(14.6)} 44.5 C${x(18)} 43.5 ${x(18)} 51 ${x(14.6)} 52 Z" fill="url(#skin)" stroke="${skinDark}" stroke-width="0.4"/>`;
  };
  /** A drop earring hanging from the lobe: lower on a round ear than on a long elf ear. */
  const earring = (s: number) => {
    const x = 50 + s * 15.3;
    const y = look.ears === "elf" ? 49.4 : 52.4;
    return (
      `<circle cx="${x}" cy="${y}" r="0.85" fill="url(#gold)"/>` +
      `<path d="M${x} ${y + 0.8} L${x} ${y + 2}" stroke="#d4a017" stroke-width="0.4"/>` +
      `<path d="M${x} ${y + 2} q-1.5 2.5 0 3.9 q1.5 -1.4 0 -3.9 Z" fill="${accent}" stroke="#fff3c4" stroke-width="0.35"/>`
    );
  };
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="240" height="240">`,
    `<defs>`,
    `<radialGradient id="warm" cx="50%" cy="50%" r="55%"><stop offset="0.62" stop-color="#ff5a3c" stop-opacity="0"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0.16"/></radialGradient>`,
    `<radialGradient id="bg" cx="50%" cy="36%" r="68%"><stop offset="0" stop-color="${bg0}"/><stop offset="1" stop-color="${bg1}"/></radialGradient>`,
    `<radialGradient id="halo" cx="50%" cy="42%" r="45%"><stop offset="0" stop-color="${accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="skin" cx="44%" cy="36%" r="72%"><stop offset="0" stop-color="${skinLight}"/><stop offset="0.55" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.13)}"/></radialGradient>`,
    `<linearGradient id="hair" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${sheen}"/><stop offset="0.45" stop-color="${hair}"/><stop offset="1" stop-color="${hairDark}"/></linearGradient>`,
    `<linearGradient id="gown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(accent, 0.15)}"/><stop offset="1" stop-color="${shade(accent, -0.45)}"/></linearGradient>`,
    `<radialGradient id="iris" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#000000" stop-opacity="0.25"/></radialGradient>`,
    `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#c99212"/></linearGradient>`,
    `<radialGradient id="blush" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff5c8a"/><stop offset="0.55" stop-color="#ff6f96" stop-opacity="0.55"/><stop offset="1" stop-color="#ff7aa0" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(skin, -0.34)}"/><stop offset="0.5" stop-color="${skinDark}"/><stop offset="1" stop-color="${shade(skin, -0.1)}"/></linearGradient>`,
    `<linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(lips, -0.18)}"/><stop offset="1" stop-color="${shade(lips, 0.12)}"/></linearGradient>`,
    `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.7"/></filter>`,
    `<filter id="glowSmall" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.35"/></filter>`,
    `<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.9"/></filter>`,
    `<clipPath id="disc"><circle cx="50" cy="50" r="48"/></clipPath>`,
    `<clipPath id="hairBack"><path d="${HAIR_BACK[style]}"/></clipPath>`,
    `<clipPath id="hairFront"><path d="${HAIR_FRONT[style]}"/></clipPath>`,
    `<clipPath id="faceClip"><path d="${face}"/></clipPath>`,
    `<radialGradient id="vignette" cx="50%" cy="45%" r="60%"><stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/></radialGradient>`,
    `<linearGradient id="horn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${horn ? shade(horn, 0.35) : "#ffffff"}"/><stop offset="1" stop-color="${horn ? shade(horn, -0.35) : "#999999"}"/></linearGradient>`,
    `</defs>`,
    `<circle cx="50" cy="50" r="48" fill="url(#bg)"/>`,
    `<g clip-path="url(#disc)">`,
    o.scene ? scene(o.scene, o.region ?? "", bg0, accent) : "",
    backdrop(rand, bg0, accent, element),
    moodTint(x),
    air ? moodMotes(x, moodRand, accent, true) : "",
    sparkles,
    `<circle cx="50" cy="44" r="40" fill="url(#halo)"/>`,
    tier >= 5
      ? `<circle cx="50" cy="40" r="27" fill="none" stroke="#ffe08a" stroke-width="1.2" opacity="0.55" filter="url(#glowSmall)"/>`
      : "",
    // The figure a little larger than the frame, so the face reads even as a small avatar.
    `<g transform="${FIGURE}">`,
    `<path d="${HAIR_BACK[style]}" fill="url(#hair)"/>`,
    `<path d="${HAIR_BACK[style]}" fill="none" stroke="${sheen}" stroke-width="0.6" opacity="0.5"/>`,
    strands("hairBack", rand, 46, 16, 84, 8, 100, sheen, hairDark),
    style === "bun"
      ? `<ellipse cx="50" cy="15" rx="10" ry="8" fill="url(#hair)"/><path d="M42 14 Q50 9 58 14 M44 17 Q50 13.5 56 17" fill="none" stroke="${sheen}" stroke-width="0.6" opacity="0.8"/>`
      : "",
    style === "ponytail"
      ? `<path d="M64 24 C88 26 88 60 79 92 C76 70 75 48 62 34 Z" fill="url(#hair)"/><path d="M68 28 C82 34 82 58 78 80" fill="none" stroke="${sheen}" stroke-width="0.6" opacity="0.6"/>`
      : "",
    // Depth in the hair: the head's shadow on the hair behind it, and a ring of shine on the crown.
    `<g clip-path="url(#hairBack)">`,
    `<path d="${face}" transform="translate(50 46) scale(1.16 1.1) translate(-50 -46)" fill="#000000" opacity="0.3" filter="url(#soft)"/>`,
    `<path d="M30.5 25 C33.5 21.2 37 19.2 41 18.3 M44.8 17.4 C48.3 16.9 51.7 16.9 55.2 17.4 M59 18.3 C63 19.2 66.5 21.2 69.5 25" fill="none" stroke="${sheen}" stroke-width="2.2" stroke-linecap="round" opacity="0.28" filter="url(#glowSmall)"/>`,
    `<path d="M33 22.4 C36 19.9 38.6 18.8 41.2 18.2 M46 17.3 C48.7 17 51.3 17 54 17.3 M58.8 18.2 C61.4 18.8 64 19.9 67 22.4" fill="none" stroke="#ffffff" stroke-width="0.45" stroke-linecap="round" opacity="0.3"/>`,
    `</g>`,
    look.headpiece === "hood" ? hood(accent) : "",
    // A collar that stands behind the neck; the neck, shoulders and her outfit, with a pendant.
    outfitBack(outfit, accent),
    `<path d="M44.2 58 C44.4 64 43.8 68.5 42.4 72 L57.6 72 C56.2 68.5 55.6 64 55.8 58 Z" fill="url(#neck)"/>`,
    `<path d="M45.6 63 Q45.2 68 44.2 71.4" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.08" filter="url(#soft)"/>`,
    `<path d="M43 61 Q50 69 57 61 L57 65.5 Q50 71 43 65.5 Z" fill="#000000" opacity="0.14"/>`,
    `<path d="M12 100 C15 83 29 74.5 43 71.5 L57 71.5 C71 74.5 85 83 88 100 Z" fill="url(#skin)"/>`,
    `<path d="M39 80.6 Q44 82 47.6 80.8 M52.4 80.8 Q56 82 61 80.6" fill="none" stroke="${skinDark}" stroke-width="0.6" opacity="0.7"/>`,
    outfitFront(outfit, accent, skinDark),
    `<ellipse cx="34" cy="79" rx="5" ry="2.2" fill="#ffffff" opacity="0.12" filter="url(#soft)"/><ellipse cx="66" cy="79" rx="5" ry="2.2" fill="#ffffff" opacity="0.12" filter="url(#soft)"/>`,
    closedOutfit(outfit)
      ? ""
      : `<path d="M41.8 73.2 Q50 78.6 58.2 73.2" fill="none" stroke="url(#gold)" stroke-width="0.9"/>` +
        `<path d="M41.8 73.2 Q50 78.6 58.2 73.2" fill="none" stroke="#7a560e" stroke-width="0.35" stroke-dasharray="0.45 0.55"/>` +
        gem(50, 79.2, 2, accent) +
        gem(45.2, 76.6, 0.9, accent) +
        gem(54.8, 76.6, 0.9, accent) +
        tierJewels(tier, accent),
    // Ears, then the face over them.
    ear(-1),
    ear(1),
    `<path d="${face}" fill="url(#skin)"/>`,
    `<path d="${face}" fill="url(#warm)"/>`,
    `<path d="${face}" fill="none" stroke="${rim}" stroke-width="0.5" opacity="0.13"/>`,
    // A soft glow over the skin, as if lit by candlelight.
    `<ellipse cx="47" cy="44" rx="12" ry="14" fill="#ffffff" opacity="0.07" filter="url(#soft)"/>`,
    `<g clip-path="url(#faceClip)">`,
    `<ellipse cx="50" cy="31.5" rx="9" ry="4.2" fill="#ffffff" opacity="0.13" filter="url(#soft)"/>`,
    `<path d="${HAIR_FRONT[style]}" transform="translate(0.5 1.7)" fill="${shade(skin, -0.55)}" opacity="0.22" filter="url(#soft)"/>`,
    `<ellipse cx="43" cy="41.6" rx="5" ry="1.6" fill="${skinDark}" opacity="0.2" filter="url(#soft)"/><ellipse cx="57" cy="41.6" rx="5" ry="1.6" fill="${skinDark}" opacity="0.2" filter="url(#soft)"/>`,
    `<path d="M48.6 46 Q48 50.5 48.4 53" fill="none" stroke="${skinDark}" stroke-width="1.2" opacity="0.18" filter="url(#soft)"/>`,
    `<ellipse cx="39.5" cy="49.5" rx="3.2" ry="1.4" fill="#ffffff" opacity="0.14" filter="url(#soft)"/><ellipse cx="60.5" cy="49.5" rx="3.2" ry="1.4" fill="#ffffff" opacity="0.14" filter="url(#soft)"/>`,
    `<ellipse cx="50" cy="63.4" rx="3.2" ry="0.9" fill="${skinDark}" opacity="0.3" filter="url(#soft)"/><ellipse cx="50" cy="64.6" rx="1.8" ry="0.7" fill="#ffffff" opacity="0.18"/>`,
    `<path d="M${f(66)} 30 C70 44 64 58 52 67" fill="none" stroke="${rim}" stroke-width="1.4" opacity="0.18" filter="url(#soft)"/>`,
    `</g>`,
    `<path d="M36.6 49.5 Q39.5 56.5 45 59.6 M63.4 49.5 Q60.5 56.5 55 59.6" fill="none" stroke="${skinDark}" stroke-width="1.6" opacity="0.12" filter="url(#soft)"/>`,
    // Blush, deeper as she warms to you; shy lines when she is flustered.
    `<ellipse cx="40.6" cy="52.4" rx="${f(4.6 + x.blush * 1.1)}" ry="${f(2.5 + x.blush * 0.6)}" transform="rotate(-12 40.6 52.4)" fill="url(#blush)" opacity="${f(0.2 + x.blush * 0.5)}"/>`,
    `<ellipse cx="59.4" cy="52.4" rx="${f(4.6 + x.blush * 1.1)}" ry="${f(2.5 + x.blush * 0.6)}" transform="rotate(12 59.4 52.4)" fill="url(#blush)" opacity="${f(0.2 + x.blush * 0.5)}"/>`,
    x.blushLines
      ? `<path d="M38.6 52.4 l-0.9 1.6 M40.4 52.4 l-0.9 1.6 M42.2 52.4 l-0.9 1.6 M57.8 52.4 l0.9 1.6 M59.6 52.4 l0.9 1.6 M61.4 52.4 l0.9 1.6" stroke="#e83e74" stroke-width="0.35" stroke-linecap="round" opacity="0.7"/>`
      : "",
    brows(hairDark, x),
    eyes(look, iris, lash, shadowCol, skinDark, x, air),
    // The nose: a shadow down one side of the bridge, a lit ridge, the tip and nostrils.
    `<path d="M49.2 42.6 Q48.6 47 48.3 50.6" fill="none" stroke="${skinDark}" stroke-width="1.4" opacity="0.16" filter="url(#soft)"/>`,
    `<path d="M50.7 47.6 Q51.5 51.8 49.7 53.4" fill="none" stroke="${skinDark}" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`,
    `<path d="M48.7 53.6 Q50 54.4 51.3 53.6" fill="none" stroke="${skinDark}" stroke-width="0.5" opacity="0.8"/>`,
    `<ellipse cx="48.7" cy="53.5" rx="0.6" ry="0.3" fill="${shade(skin, -0.5)}" opacity="0.45"/><ellipse cx="51.3" cy="53.5" rx="0.6" ry="0.3" fill="${shade(skin, -0.5)}" opacity="0.45"/>`,
    `<ellipse cx="51.4" cy="48.6" rx="0.45" ry="2.2" fill="#ffffff" opacity="0.26"/>`,
    `<circle cx="50.5" cy="52.4" r="0.6" fill="#ffffff" opacity="0.3"/>`,
    `<path d="M49.3 54.8 L49.6 56.4 M50.7 54.8 L50.4 56.4" stroke="${skinDark}" stroke-width="0.35" opacity="0.3"/>`,
    mouth(x.mouth, lips, skinDark),
    markings(look.marking, accent, rim),
    `<path d="${HAIR_FRONT[style]}" fill="url(#hair)"/>`,
    strands("hairFront", rand, 30, 30, 70, 18, 78, sheen, hairDark),
    `<path d="${HAIR_FRONT[style]}" fill="none" stroke="${sheen}" stroke-width="0.35" opacity="0.4"/>`,
    `<path d="M36 34 C42 24 56 21 64 29" fill="none" stroke="${sheen}" stroke-width="0.7" opacity="0.75"/>`,
    // A soft band of shine across the crown of the hair.
    `<path d="M38 29.4 C42.5 24 57.5 24 62 29.4" fill="none" stroke="${sheen}" stroke-width="1.8" opacity="0.22" filter="url(#soft)"/>`,
    // A few loose strands that catch the light.
    style === "long" || style === "flowing"
      ? `<path d="M37 16 C33 12 28 13 25 17 M63 15 C67 11 72 12 75 16 M30 30 C25 32 22 37 21 42 M70 30 C75 32 78 37 79 42" fill="none" stroke="${sheen}" stroke-width="0.3" opacity="0.6"/>`
      : "",
    adornment(look.adorn, accent),
    earring(-1),
    earring(1),
    horn
      ? `<path d="M40 30.5 C34.5 18.5 25.5 9.5 15.5 10.5 C24.5 14.5 30.5 21.5 35.2 32.2 Z" fill="url(#horn)" stroke="${shade(horn, -0.45)}" stroke-width="0.7"/>` +
        `<path d="M60 30.5 C65.5 18.5 74.5 9.5 84.5 10.5 C75.5 14.5 69.5 21.5 64.8 32.2 Z" fill="url(#horn)" stroke="${shade(horn, -0.45)}" stroke-width="0.7"/>` +
        `<path d="M35.2 27 q2.2 -0.6 3.2 0.8 M31.5 21.4 q2 -0.8 3 0.4 M27 16.6 q1.8 -0.8 2.6 0.2 M64.8 27 q-2.2 -0.6 -3.2 0.8 M68.5 21.4 q-2 -0.8 -3 0.4 M73 16.6 q-1.8 -0.8 -2.6 0.2" fill="none" stroke="${shade(horn, -0.5)}" stroke-width="0.4" opacity="0.8"/>` +
        `<path d="M37 26 C33 19 27 14 21 12.5 M63 26 C67 19 73 14 79 12.5" fill="none" stroke="${shade(horn, 0.4)}" stroke-width="0.6" opacity="0.8"/>`
      : "",
    headpiece(look.headpiece, accent, rim),
    air ? tierGlow(tier) : "",
    `</g>`,
    `<circle cx="50" cy="50" r="48" fill="url(#vignette)"/>`,
    air ? moodFront(x, moodRand, accent) : "",
    `</g>`,
    `<circle cx="50" cy="50" r="48" fill="none" stroke="${rim}" stroke-width="3"/>`,
    `<circle cx="50" cy="50" r="49.3" fill="none" stroke="#e8c872" stroke-width="0.5" opacity="0.8"/>`,
    `<circle cx="50" cy="50" r="46.3" fill="none" stroke="#e8c872" stroke-width="0.35" stroke-dasharray="0.8 1.2" opacity="0.7"/>`,
    `<circle cx="50" cy="50" r="45.6" fill="none" stroke="#ffffff" stroke-width="0.4" opacity="0.25"/>`,
    gem(50, 2.6, 2.2, rim),
    gem(2.6, 50, 1.4, rim),
    gem(97.4, 50, 1.4, rim),
    `</svg>`,
  ];
  return parts.join("");
}

/**
 * What moves around her in a mood, as its own small picture to lay over a
 * portrait drawn with air: false. Shapes and fades only, no blurs, so a page
 * can keep it moving cheaply. "" when nothing moves.
 */
export function portraitAirSvg(look: Look, mood: Mood = "smile", tier = 0): string {
  const x = EXPR[mood] ?? EXPR.smile;
  const accent = hex(look.accent, "#a855f7");
  const t = Math.max(0, Math.min(5, Math.floor(tier)));
  // The same numbers as the full picture, so things float where they would be drawn.
  const moodRand = rng(seedOf(`${look.hair}|${mood}`));
  const motes = moodMotes(x, moodRand, accent, false);
  const inFigure =
    (t >= 4 ? tierGlow(t) : "") +
    (x.tear && !x.happy && look.eyeStyle !== "closed" ? tear(40.2, 47.2) : "");
  const front = moodFront(x, moodRand, accent);
  if (!motes && !inFigure && !front) return "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="240" height="240">`,
    MOTION,
    `<defs><clipPath id="disc"><circle cx="50" cy="50" r="48"/></clipPath></defs>`,
    `<g clip-path="url(#disc)">`,
    motes,
    inFigure ? `<g transform="${FIGURE}">${inFigure}</g>` : "",
    front,
    `</g>`,
    `</svg>`,
  ].join("");
}

/** The portrait as a data URL, for an <img> or a canvas Image. */
export function portraitUrl(
  look: Look,
  ring: string,
  element = "",
  o: PortraitOptions = {},
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(look, ring, element, o))}`;
}

const cache = new Map<string, string>();

/** A queen's portrait from config.json in a mood, made once. */
export function queenPortrait(queen: CourtQueenKey, o: PortraitOptions = {}): string {
  const tier = Math.max(0, Math.min(5, Math.floor(o.tier ?? 0)));
  const key = `${queen}|${o.mood ?? "smile"}|${tier}|${o.air !== false}|${o.blink === true}`;
  let url = cache.get(key);
  if (!url) {
    const q = CONFIG.court.queens[queen];
    const region = (CONFIG.court.places as Record<string, { region: string }>)[q.place]?.region;
    url = portraitUrl(q.look, q.color, q.element, { ...o, tier, scene: q.place, region });
    cache.set(key, url);
  }
  return url;
}

/** What moves around a queen in a mood, as a data URL; "" when nothing does. Made once. */
export function queenAir(queen: CourtQueenKey, mood: Mood = "smile", tier = 0): string {
  const t = Math.max(0, Math.min(5, Math.floor(tier)));
  const key = `air|${queen}|${mood}|${t}`;
  let url = cache.get(key);
  if (url === undefined) {
    const svg = portraitAirSvg(CONFIG.court.queens[queen].look, mood, t);
    url = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
    cache.set(key, url);
  }
  return url;
}

/** A place's scenery as a banner for its window: the queen's colours there, or her region's. Made once. */
export function placeBanner(place: string): string {
  const key = `banner|${place}`;
  let url = cache.get(key);
  if (!url) {
    const places = CONFIG.court.places as Record<string, { region: string }>;
    const region = places[place]?.region ?? "realm";
    const queen = Object.values(CONFIG.court.queens).find((q) => q.place === place);
    const tint =
      (CONFIG.court.regions as Record<string, { tint: string }>)[region]?.tint ?? "#a855f7";
    const svg = queen
      ? sceneBanner(
          place,
          region,
          queen.look.bg[0] ?? "",
          queen.look.bg[1] ?? "",
          queen.look.accent,
        )
      : sceneBanner(place, region, shade(tint, -0.55), "#05020c", tint);
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, url);
  }
  return url;
}
