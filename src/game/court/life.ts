/**
 * A life of her own. With no model behind her, each queen still does things: a
 * small brain scores what she could do next (stay home, stroll nearby, visit a
 * place, call on a sister or friend, rest) by the hour, her mood and how far
 * she has come, and picks one, mostly the best but not always. The game then
 * walks her there, lets her stay a while, and asks again. The more she has
 * done, the more she does: visits open after a few outings, calls after more,
 * and she roams further. Numbers and words are court.life in config.json.
 * Pure, so the tests can load it.
 */

import { CONFIG, type CourtQueenKey } from "../config.ts";

const L = CONFIG.court.life;

export type Plan = "home" | "stroll" | "visit" | "call" | "rest";
export const PLANS: Plan[] = ["home", "stroll", "visit", "call", "rest"];

/** What the brain looks at. */
export interface LifeContext {
  /** The hour of the day, 0 to 23. */
  hour: number;
  /** Her mood now (hearts.ts Mood), and how fond she is of you (affection tier, 0 to 5). */
  mood: string;
  tier: number;
  /** What she has done so far (CourtSave.life). */
  outings: number;
  /** Whether there is a place she could visit, and a sister or friend here she could call on. */
  places: boolean;
  friends: boolean;
  /** Where she is now: at home, or out. */
  away: boolean;
}

/** Whether it is night by her clock. */
export function isNight(hour: number): boolean {
  return hour >= L.nightFrom || hour < L.nightTo;
}

/** What each thing is worth to her now; 0 for what she cannot or would not do. */
export function scores(ctx: LifeContext): Record<Plan, number> {
  const w = L.weights as Record<Plan, number>;
  const night = isNight(ctx.hour);
  const m = (L.moods as Record<string, Partial<Record<Plan, number>>>)[ctx.mood] ?? {};
  const out: Record<Plan, number> = { home: 0, stroll: 0, visit: 0, call: 0, rest: 0 };
  for (const p of PLANS) {
    let s = w[p] * (m[p] ?? 1);
    if (night) s *= (L.night as Record<Plan, number>)[p] ?? 1;
    out[p] = s;
  }
  // What she has not grown into yet, and what there is no one or nowhere for.
  if (ctx.outings < L.visitAfter || !ctx.places) out.visit = 0;
  if (ctx.outings < L.callAfter || !ctx.friends) out.call = 0;
  // Already home: going home is staying; out: she is drawn back a little.
  if (ctx.away) out.home *= L.homesick;
  // Fonder of you, she is out and about more.
  out.stroll *= 1 + ctx.tier * L.tierBoost;
  return out;
}

/** What she does next: picked by its score, so the likeliest mostly, the others sometimes. */
export function choose(ctx: LifeContext, rand: () => number = Math.random): Plan {
  const s = scores(ctx);
  const total = PLANS.reduce((n, p) => n + Math.max(0, s[p]), 0);
  if (total <= 0) return "home";
  let at = rand() * total;
  for (const p of PLANS) {
    at -= Math.max(0, s[p]);
    if (at < 0) return p;
  }
  return "home";
}

/** How far from home she strolls, in map squares: further the more she has done. */
export function roamRadius(outings: number): number {
  return Math.min(L.radiusMax, L.radius + Math.floor(outings / L.radiusEvery));
}

/** How long she stays where she went, in seconds. */
export function stayFor(plan: Plan, rand: () => number = Math.random): number {
  const [a, b] = (L.stay as Record<Plan, number[]>)[plan] ?? [4, 8];
  return (a ?? 4) + rand() * Math.max(0, (b ?? 8) - (a ?? 4));
}

/** What she is doing, in a few words for her sheet: "{place}" and "{queen}" filled in. */
export function doing(
  plan: Plan,
  walking: boolean,
  fill: { place?: string; queen?: string },
  seed = 0,
): string {
  const lines = (L.doing as Record<string, string[]>)[walking && plan !== "home" && plan !== "rest" ? "walking" : plan] ?? [];
  const line = lines.length ? lines[Math.abs(Math.floor(seed)) % lines.length]! : "";
  return line.replace("{place}", fill.place ?? "the road").replace("{queen}", fill.queen ?? "a friend");
}

/** The small mark over her head for what she is doing ("" for nothing). */
export function mark(plan: Plan): string {
  return (L.marks as Record<Plan, string>)[plan] ?? "";
}

/** What a save keeps of her life: how many outings she has made. */
export function loadLife(data: unknown, queens: readonly CourtQueenKey[]): Record<CourtQueenKey, number> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return Object.fromEntries(
    queens.map((q) => {
      const n = d[q];
      return [q, typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0];
    }),
  ) as Record<CourtQueenKey, number>;
}
