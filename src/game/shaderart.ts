/**
 * Shader art: moving colour drawn by the graphics chip, with maths and no image
 * files. A fragment shader warps noise with noise (domain warping: the picture
 * is fbm(p + fbm(p + fbm(p + time)))), which flows like marbled paper, ink in
 * water or an aurora; a palette of four colours says what it is made of. This
 * file is the pure part: the shader sources, the palettes and the quality for a
 * setting. The component that runs it is components/game/ShaderBackdrop.tsx.
 * No path aliases (tests).
 */

/** What the picture is: liquid marble, curtains of aurora, or a nebula with stars. */
export type ShaderKind = "marble" | "aurora" | "nebula";
export const SHADER_KINDS: ShaderKind[] = ["marble", "aurora", "nebula"];

/** Four colours, darkest to lightest, each three numbers from 0 to 1. */
export type Palette = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

/** How a picture moves and what it is made of. */
export interface ShaderLook {
  kind: ShaderKind;
  palette: Palette;
  /** How fast it flows (1 is the usual). */
  speed: number;
  /** How big its shapes are (bigger: more, smaller shapes). */
  scale: number;
  /** How hard the noise is warped by noise (the swirl). */
  warp: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A colour as three numbers from 0 to 1 ("#rgb" or "#rrggbb"); the fallback for anything else. */
export function hexToRgb(
  color: string | undefined,
  fallback: [number, number, number] = [0.5, 0.4, 0.8],
): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? "").trim());
  if (!m) return fallback;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** A colour mixed towards black (amount below 0) or white (above 0). */
function shadeRgb(c: [number, number, number], amount: number): [number, number, number] {
  const to = amount < 0 ? 0 : 1;
  const k = Math.min(1, Math.abs(amount));
  return [clamp01(c[0] + (to - c[0]) * k), clamp01(c[1] + (to - c[1]) * k), clamp01(c[2] + (to - c[2]) * k)];
}

/**
 * A palette made of one colour: its deep shade, its own, a light one and a
 * bright accent, with `accent` (another colour) in the last place when given.
 */
export function paletteOf(color: string, accent?: string): Palette {
  const c = hexToRgb(color);
  const a = accent ? hexToRgb(accent) : shadeRgb(c, 0.5);
  return [shadeRgb(c, -0.82), shadeRgb(c, -0.38), c, a];
}

/** The picture behind the recite screen: embers for Fire, deep water for Water. */
export function elementLook(element: "fire" | "water"): ShaderLook {
  return element === "water"
    ? { kind: "marble", palette: paletteOf("#2f8cff", "#a8f0ff"), speed: 0.8, scale: 2.6, warp: 4 }
    : { kind: "marble", palette: paletteOf("#ff7a2e", "#ffd98a"), speed: 1, scale: 2.6, warp: 4 };
}

/** The picture behind a queen: curtains of her colour. */
export function queenLook(color: string): ShaderLook {
  return { kind: "aurora", palette: paletteOf(color), speed: 0.8, scale: 1.4, warp: 3 };
}

/** The picture behind the editor: a nebula in the colour of whoever is shown. */
export function nebulaLook(color: string): ShaderLook {
  return { kind: "nebula", palette: paletteOf(color, "#ffffff"), speed: 0.6, scale: 2.2, warp: 3.4 };
}

/** What a setting asks: how strong, how big the picture is drawn, how often. */
export interface ShaderQuality {
  /** 0 to 1: how much of the picture shows (0: none, nothing is drawn). */
  strength: number;
  /** The share of the screen's size it is drawn at (it is soft, so a part of it is enough). */
  scale: number;
  /** Most frames drawn a second. */
  fps: number;
}

/**
 * Quality from the Shader art setting (0 to 100), the render resolution (a
 * percent) and the frame cap: half the screen's size at full resolution, 30 frames
 * a second at most, and never more than the cap.
 */
export function qualityOf(shaderArt: number, renderScale: number, fpsCap: number): ShaderQuality {
  const art = Number.isFinite(shaderArt) ? Math.min(100, Math.max(0, shaderArt)) : 0;
  const res = Number.isFinite(renderScale) ? Math.min(100, Math.max(20, renderScale)) : 100;
  const cap = Number.isFinite(fpsCap) && fpsCap > 0 ? fpsCap : 60;
  return {
    strength: art / 100,
    scale: Math.round(0.5 * (res / 100) * 100) / 100,
    fps: Math.max(5, Math.min(30, cap)),
  };
}

/** The sizes (in pixels) a picture is drawn at, for a screen of `w` by `h`: never over 720 on its longest side, never under 32. */
export function drawSize(w: number, h: number, scale: number): { w: number; h: number } {
  const k = Math.min(1, 720 / Math.max(1, w * scale, h * scale));
  return {
    w: Math.max(32, Math.round(Math.max(1, w) * scale * k)),
    h: Math.max(32, Math.round(Math.max(1, h) * scale * k)),
  };
}

/** Every uniform the shaders read. */
export const UNIFORMS = ["uRes", "uTime", "uC0", "uC1", "uC2", "uC3", "uScale", "uWarp"] as const;

export const VERTEX_SOURCE = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** What every shader starts with: noise, and noise built on noise. */
const COMMON = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uScale;
uniform float uWarp;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}
`;

/** Marble: the warp of a warp of a warp, coloured by how far each layer moved. */
const MARBLE = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * uScale;
  float t = uTime;
  vec2 q = vec2(fbm(p + 0.05 * t), fbm(p + vec2(5.2, 1.3) - 0.04 * t));
  vec2 r = vec2(
    fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(p + uWarp * q + vec2(8.3, 2.8) + 0.126 * t));
  float f = fbm(p + uWarp * r);
  vec3 col = mix(uC0, uC1, clamp(f * f * 4.0, 0.0, 1.0));
  col = mix(col, uC2, clamp(length(q), 0.0, 1.0));
  col = mix(col, uC3, clamp(r.x * r.x, 0.0, 1.0));
  col *= 0.3 + 1.1 * f * f * f + 0.6 * f * f + 0.5 * f;
  float v = smoothstep(1.2, 0.2, length(uv - 0.5) * 1.3);
  gl_FragColor = vec4(min(col * mix(0.5, 1.0, v), vec3(1.0)), 1.0);
}
`;

/** Aurora: three curtains of light that sway, over a sky that darkens upward. */
const AURORA = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * uScale;
  float t = uTime * 0.18;
  vec3 col = mix(uC1 * 0.55, uC0, smoothstep(0.0, 1.0, uv.y));
  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sway = fbm(vec2(p.x * (0.9 + 0.35 * fi) + t * (1.0 + 0.4 * fi), fi * 7.3 + t * 0.4));
    float warp = fbm(vec2(p.x * 3.0 + fi * 11.0 - t, uWarp * sway + t));
    float y = uv.y - (0.34 + 0.13 * fi) - 0.3 * (sway - 0.5);
    float band = exp(-abs(y) * (7.0 + 2.5 * fi)) * (0.55 + 0.9 * warp);
    glow += band * (0.8 - 0.15 * fi);
  }
  vec3 curtain = mix(uC2, uC3, clamp(fbm(p * 1.3 + t) * 1.6, 0.0, 1.0));
  col += curtain * glow;
  float v = smoothstep(1.3, 0.2, length(uv - 0.5) * 1.35);
  gl_FragColor = vec4(min(col * mix(0.55, 1.0, v), vec3(1.0)), 1.0);
}
`;

/** Nebula: a gentler warp, clouds of colour, and stars that twinkle. */
const NEBULA = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * uScale;
  float t = uTime * 0.6;
  vec2 q = vec2(fbm(p + 0.04 * t), fbm(p + vec2(3.1, 7.7) - 0.03 * t));
  float f = fbm(p + uWarp * q + 0.08 * t);
  float cloud = smoothstep(0.25, 0.85, f);
  vec3 col = mix(uC0, uC1, cloud);
  col = mix(col, uC2, smoothstep(0.55, 1.0, f * (0.6 + length(q))));
  col += uC3 * pow(max(f - 0.45, 0.0) * 2.2, 2.0) * 0.5;
  vec2 cell = floor(gl_FragCoord.xy / 3.0);
  float s = hash(cell);
  float star = step(0.992, s) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 80.0));
  col += vec3(star) * (0.3 + 0.7 * (1.0 - cloud));
  float v = smoothstep(1.25, 0.2, length(uv - 0.5) * 1.3);
  gl_FragColor = vec4(min(col * mix(0.5, 1.0, v), vec3(1.0)), 1.0);
}
`;

/** The fragment shader's source for a kind of picture. */
export function fragmentSource(kind: ShaderKind): string {
  return kind === "aurora" ? AURORA : kind === "nebula" ? NEBULA : MARBLE;
}
