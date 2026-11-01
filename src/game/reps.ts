/**
 * The Reps tab of the Recitation drill: your own words and phrases, each with a
 * running total of reps. A set counts reps of one (by itself at a pace, or one
 * tap each); finishing it adds them to the total. Resetting sets every total
 * back to 0 and keeps the words and phrases. Saved in this browser (or phone).
 * Pure, with relative imports, so the tests can load it. Tuned in reps in
 * config.json.
 */

import { CONFIG } from "./config.ts";

const R = CONFIG.reps;

export const REPS_KEY = "azshara-reps-v1";

export interface RepItem {
  id: string;
  text: string;
  /** Reps since the last reset, and sets completed. */
  total: number;
  sets: number;
  /** When it was added (ms since 1970). */
  at: number;
}

export interface RepsState {
  items: RepItem[];
  /** Reps in a set, how long each word of a rep takes when counting by itself, and whether it does. */
  set: number;
  wordMs: number;
  auto: boolean;
}

export function newReps(): RepsState {
  return { items: [], set: clampSet(R.set), wordMs: clampPace(R.wordMs), auto: true };
}

/** Words in a phrase (at least 1, so a single word counts). */
export function wordsOf(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

/** How long one rep takes when counting by itself: every word at the pace, never shorter than minRepMs. */
export function msPerRep(text: string, wordMs: number): number {
  return Math.max(R.minRepMs, wordsOf(text) * wordMs);
}

/** Reps counted after some time, up to the set's size. */
export function repsAt(elapsedMs: number, repMs: number, target: number): number {
  if (repMs <= 0) return target;
  return Math.max(0, Math.min(target, Math.floor(elapsedMs / repMs)));
}

/** A set size from 1 to maxSet, whole. */
export function clampSet(n: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.min(R.maxSet, Math.round(n))) : R.set;
}

/** A pace per word, in 100 ms steps, within limits. */
export function clampPace(ms: number): number {
  if (!Number.isFinite(ms)) return R.wordMs;
  return Math.max(R.wordMsMin, Math.min(R.wordMsMax, Math.round(ms / 100) * 100));
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
  return { ...s, items: s.items.filter((i) => i.id !== id) };
}

/** Adds the reps of a set to a word or phrase; a set of 0 changes nothing. */
export function addReps(s: RepsState, id: string, count: number): RepsState {
  const n = Math.max(0, Math.floor(count));
  if (!n) return s;
  return {
    ...s,
    items: s.items.map((i) => (i.id === id ? { ...i, total: i.total + n, sets: i.sets + 1 } : i)),
  };
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
  if (Number.isFinite(num(d.set))) s.set = clampSet(num(d.set));
  if (Number.isFinite(num(d.wordMs))) s.wordMs = clampPace(num(d.wordMs));
  if (typeof d.auto === "boolean") s.auto = d.auto;
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : []) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Record<string, unknown>;
    if (typeof i.id !== "string" || !i.id || seen.has(i.id)) continue;
    if (typeof i.text !== "string" || !i.text.trim()) continue;
    seen.add(i.id);
    const whole = (v: unknown) => (Number.isFinite(num(v)) ? Math.max(0, Math.floor(num(v))) : 0);
    s.items.push({
      id: i.id,
      text: i.text.trim().slice(0, 300),
      total: whole(i.total),
      sets: whole(i.sets),
      at: whole(i.at),
    });
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
