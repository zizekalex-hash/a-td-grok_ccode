/**
 * Small helpers for drawing SVG in code: safe colours, shades, seeded random
 * numbers and a few shapes (gems, stars, hearts). Pure, so the tests can load it.
 */

/** Keeps a config colour to safe characters, so nothing else reaches the SVG. */
export function c(color: string | undefined, fallback: string): string {
  const v = (color ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$|^rgba?\([\d\s.,%]+\)$/.test(v) ? v : fallback;
}

/** A #rrggbb colour, or the fallback. */
export function hex(color: string | undefined, fallback: string): string {
  const v = (color ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** A lighter or darker shade of a #rrggbb colour (amount -1 to 1). */
export function shade(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Small seeded random numbers, so a queen's strands and sparkles are the same every time. */
export function rng(seed: number): () => number {
  let x = (seed % 2147483646) + 1;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export const f = (n: number) => n.toFixed(2);

/** A heart, its point at the bottom. */
export function heart(x: number, y: number, r: number, color: string, extra = ""): string {
  return `<path d="M${f(x)} ${f(y + r * 0.9)} C${f(x - r * 1.7)} ${f(y - r * 0.1)} ${f(x - r * 0.9)} ${f(y - r * 1.4)} ${f(x)} ${f(y - r * 0.45)} C${f(x + r * 0.9)} ${f(y - r * 1.4)} ${f(x + r * 1.7)} ${f(y - r * 0.1)} ${f(x)} ${f(y + r * 0.9)} Z" fill="${color}" ${extra}/>`;
}

/** A four-pointed star. */
export function star(x: number, y: number, r: number, color: string, extra = ""): string {
  return `<path d="M${f(x)} ${f(y - r)} L${f(x + r * 0.25)} ${f(y - r * 0.25)} L${f(x + r)} ${f(y)} L${f(x + r * 0.25)} ${f(y + r * 0.25)} L${f(x)} ${f(y + r)} L${f(x - r * 0.25)} ${f(y + r * 0.25)} L${f(x - r)} ${f(y)} L${f(x - r * 0.25)} ${f(y - r * 0.25)} Z" fill="${color}" ${extra}/>`;
}

/** An animation's timing, so things that float do not move in step. */
export function timing(duration: number, delay: number): string {
  return `style="animation-duration:${f(duration)}s;animation-delay:-${f(delay)}s"`;
}

/** A faceted gem: body, facets and a glint. */
export function gem(x: number, y: number, r: number, color: string): string {
  const col = hex(color, "#a855f7");
  return (
    `<path d="M${f(x)} ${f(y - r)} L${f(x + r * 0.9)} ${f(y - r * 0.15)} L${f(x)} ${f(y + r)} L${f(x - r * 0.9)} ${f(y - r * 0.15)} Z" fill="${col}" stroke="#fff3c4" stroke-width="${f(r * 0.18)}"/>` +
    `<path d="M${f(x - r * 0.9)} ${f(y - r * 0.15)} L${f(x)} ${f(y + r * 0.1)} L${f(x + r * 0.9)} ${f(y - r * 0.15)} M${f(x)} ${f(y - r)} L${f(x)} ${f(y + r)}" fill="none" stroke="${shade(col, 0.45)}" stroke-width="${f(r * 0.12)}" opacity="0.8"/>` +
    `<path d="M${f(x - r * 0.35)} ${f(y - r * 0.55)} L${f(x - r * 0.05)} ${f(y - r * 0.2)}" stroke="#ffffff" stroke-width="${f(r * 0.22)}" stroke-linecap="round" opacity="0.9"/>`
  );
}
