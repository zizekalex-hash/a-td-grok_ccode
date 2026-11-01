/**
 * The Reps tab of the Recitation drill: your own words and phrases, each with a
 * running total of reps. A set of N reps takes at least N seconds
 * (reps.secondsPerRep each); then one tap of Done adds all N to the total.
 * The time runs by the clock, so it goes on while the screen is off, and a set
 * in progress is saved. Resetting sets every total back to 0 and keeps the
 * words and phrases. Saved in this browser (or phone). Pure, with relative
 * imports, so the tests can load it. Tuned in reps in config.json.
 */

import { CONFIG } from "./config.ts";

const R = CONFIG.reps;

export const REPS_KEY = "azshara-reps-v1";

export interface RepItem {
  id: string;
  text: string;
  /** Reps since the last reset, and sets finished. */
  total: number;
  sets: number;
  /** When it was added (ms since 1970). */
  at: number;
}

/** A set in progress: of which phrase, how many reps, and when it began (ms since 1970). */
export interface ActiveSet {
  id: string;
  target: number;
  since: number;
}

export interface RepsState {
  items: RepItem[];
  /** Reps in a set. */
  set: number;
  active: ActiveSet | null;
}

export function newReps(): RepsState {
  return { items: [], set: clampSet(R.set), active: null };
}

/** Words in a phrase (at least 1, so a single word counts). */
export function wordsOf(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

/** A set size from 1 to maxSet, whole. */
export function clampSet(n: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.min(R.maxSet, Math.round(n))) : R.set;
}

/** The least time a set of this many reps takes before Done (ms). */
export function setMs(target: number): number {
  return Math.max(0, target) * R.secondsPerRep * 1000;
}

/** Time left before Done can be tapped (ms; 0 when it can). */
export function timeLeft(a: ActiveSet, now: number): number {
  return Math.max(0, a.since + setMs(a.target) - now);
}

/** "1:40", "0:05", "1:02:03". */
export function clock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Adds a word or phrase (once: the same text again, in any case, is the one already there). Its id, or "" for empty text. */
export function addItem(
  s: RepsState,
  text: string,
  now: number,
  id = `r${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
): { state: RepsState; id: string } {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!clean) return { state: s, id: "" };
  const same = s.items.find((i) => i.text.toLowerCase() === clean.toLowerCase());
  if (same) return { state: s, id: same.id };
  return {
    state: { ...s, items: [{ id, text: clean, total: 0, sets: 0, at: now }, ...s.items] },
    id,
  };
}

export function removeItem(s: RepsState, id: string): RepsState {
  return {
    ...s,
    items: s.items.filter((i) => i.id !== id),
    active: s.active?.id === id ? null : s.active,
  };
}

/** Starts a set of the chosen size for a phrase, now. */
export function startSet(s: RepsState, id: string, now: number): RepsState {
  if (!s.items.some((i) => i.id === id)) return s;
  return { ...s, active: { id, target: s.set, since: now } };
}

export function cancelSet(s: RepsState): RepsState {
  return { ...s, active: null };
}

/** Adds reps to a phrase; 0 changes nothing. */
export function addReps(s: RepsState, id: string, count: number): RepsState {
  const n = Math.max(0, Math.floor(count));
  if (!n) return s;
  return {
    ...s,
    items: s.items.map((i) => (i.id === id ? { ...i, total: i.total + n, sets: i.sets + 1 } : i)),
  };
}

/** Finishes the set in progress once its time is up: all its reps go to the phrase. Unchanged before then. */
export function finishSet(s: RepsState, now: number): RepsState {
  const a = s.active;
  if (!a || timeLeft(a, now) > 0) return s;
  return { ...addReps(s, a.id, a.target), active: null };
}

/** Every count back to 0; the words and phrases stay. */
export function resetAll(s: RepsState): RepsState {
  return { ...s, items: s.items.map((i) => ({ ...i, total: 0, sets: 0 })) };
}

export function grandTotal(s: RepsState): number {
  return s.items.reduce((n, i) => n + i.total, 0);
}

/** Recitation XP for a finished set: each rep of each word (reps.xpPerWordRep). */
export function setXp(text: string, count: number): number {
  return Math.max(0, Math.floor(count)) * wordsOf(text) * R.xpPerWordRep;
}

/** Reads a saved state, keeping only sound values. */
export function loadReps(data: unknown): RepsState {
  const s = newReps();
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const whole = (v: unknown) => (Number.isFinite(num(v)) ? Math.max(0, Math.floor(num(v))) : 0);
  if (Number.isFinite(num(d.set))) s.set = clampSet(num(d.set));
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : []) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Record<string, unknown>;
    if (typeof i.id !== "string" || !i.id || seen.has(i.id)) continue;
    if (typeof i.text !== "string" || !i.text.trim()) continue;
    seen.add(i.id);
    s.items.push({
      id: i.id,
      text: i.text.trim().slice(0, 300),
      total: whole(i.total),
      sets: whole(i.sets),
      at: whole(i.at),
    });
  }
  const a = d.active as Record<string, unknown> | null | undefined;
  if (a && typeof a === "object" && typeof a.id === "string" && seen.has(a.id)) {
    const target = Number.isFinite(num(a.target)) ? clampSet(num(a.target)) : s.set;
    s.active = { id: a.id, target, since: whole(a.since) };
  }
  return s;
}

export function readReps(): RepsState {
  try {
    const raw = localStorage.getItem(REPS_KEY);
    return loadReps(raw ? JSON.parse(raw) : null);
  } catch {
    return newReps();
  }
}

export function writeReps(s: RepsState) {
  try {
    localStorage.setItem(REPS_KEY, JSON.stringify(s));
  } catch {
    /* private mode or full */
  }
}
