/**
 * Queens coming out to find you on the map: how likely each one is to come out,
 * what she says when she finds you or leaves, and how two queens react when they
 * meet on the way. Pure, with relative imports, so the tests can load it. Tuned
 * in court.presence in config.json.
 */

import { CONFIG } from "../config.ts";
import { meetsNeed, tierOf, type CourtSave, type QueenKey } from "./rules.ts";
import { arcOf, BOND_NAME, bondOf } from "./hearts.ts";
import { buzzOf, fillLine } from "./news.ts";
import { presenceLines } from "./talk.ts";

const P = CONFIG.court.presence;

/**
 * The chance she comes out to find you within a span of seconds. Only a queen who
 * knows you does (or one upset enough to have it out with you); a hurt one won't.
 * Warmer tiers, the talk of the town, and being lonely or upset make it likelier.
 */
export function comeOutChance(
  save: CourtSave,
  q: QueenKey,
  day: number,
  now: number,
  seconds: number,
): number {
  if (!P.enabled || !meetsNeed(q, save.skills)) return 0;
  const tier = tierOf(save.affection[q]).index;
  const arc = arcOf(save, q, now)?.id;
  if (arc === "distant") return 0;
  const upset = arc === "confront";
  if (tier < P.minTier && !upset) return 0;
  let chance = P.chancePerMinute * (seconds / 60) * (0.5 + 0.25 * tier);
  if (buzzOf(day) === q) chance *= P.buzzBoost;
  if (arc === "lonely" || upset) chance *= P.arcBoost;
  return Math.max(0, Math.min(1, chance));
}

/** One of her lines (court.presence.lines) or the Court's notices, filled in; "" when there are none. */
export function presenceLine(
  kind: string,
  values: Record<string, string | number>,
  rand: () => number,
  from: "lines" | "notices" = "lines",
  /** Names whose lines would sound wrong now (say, "0 passes for me"): those lines are left out, when others remain. */
  skip: string[] = [],
): string {
  const all = presenceLines(from, kind);
  const fit = all.filter((l) => !skip.some((k) => l.includes(`{${k}}`)));
  const list = fit.length ? fit : all;
  const line = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  return line ? fillLine(line, values) : "";
}

/** What she says when she finds you: upset, lonely, or glad to see you. */
export function foundKind(was: string | null, hours: number, rand: () => number): string {
  if (was === "confront") return "confront";
  if (was === "lonely" && hours >= 1) return "lonely";
  return rand() < 0.5 ? "seeking" : "present";
}

/** How two queens who meet on the map react: rivals bristle, sisters and friends are glad; null for neither. */
export function encounterOf(
  a: QueenKey,
  b: QueenKey,
): { kind: "rivals" | "close"; bond: string } | null {
  const bond = bondOf(a, b);
  if (!bond) return null;
  return { kind: bond === "rival" ? "rivals" : "close", bond: BOND_NAME[bond] };
}

/** A pair of queens, the same either way round. */
export function pairKey(a: QueenKey, b: QueenKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
