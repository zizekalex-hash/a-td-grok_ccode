/**
 * The Reps tab of the Recitation drill: your own words and phrases, each with a
 * running total of reps and of the time they took. A set of N reps takes at
 * least N seconds (reps.secondsPerRep each); a stopwatch runs from its start,
 * and one tap of Done adds all N to the total, with the time.
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
  /** Reps since the last reset, sets finished, the time they took in all and the last set's time (ms). */
  total: number;
  sets: number;
  ms: number;
  last: number;
  /** When it was added (ms since 1970). */
  at: number;
}

/**
 * How a set is done: a number of reps (Done opens after a second a rep), a
 * time (repeat nonstop until it is up), or both, one after the other: the reps,
 * then the timer (or the timer first, if chosen).
 */
export type SetMode = "count" | "timer" | "both";

/** The two parts of a set in Both mode, in the order chosen. */
export type Part = "reps" | "timer";

/**
 * A set in progress: of which phrase, how many reps, and when it began (ms
 * since 1970); a timed set's length (ms). In Both mode: which part is going
 * (0 or 1), when it began, the order, and the time of the part already done.
 */
export interface ActiveSet {
  id: string;
  target: number;
  since: number;
  mode?: SetMode;
  duration?: number;
  part?: 0 | 1;
  partSince?: number;
  first?: Part;
  doneMs?: number;
}

/** A line in the history: a finished set (its phrase as it was, reps and time), or a reset (what it cleared). */
export interface LogEntry {
  /** A finished set, a reset, or a reading in the Read tab (text: its name, reps: phrases read). */
  kind: "set" | "reset" | "read";
  /** When (ms since 1970). */
  at: number;
  text: string;
  reps: number;
  ms: number;
  /** A timed set (a time rather than a number of reps). */
  timed?: boolean;
  /** A reading that reached the end of its text. */
  done?: boolean;
}

export interface RepsState {
  items: RepItem[];
  /** Reps in a set. */
  set: number;
  /** Count, timer or both; a timed set's minutes; which part comes first in Both; and whether sets start on a blank screen. */
  mode: SetMode;
  minutes: number;
  first: Part;
  blank: boolean;
  /** The alarm sounds when a timed set's timer is up (reps.alarm), at this share of the phone's alarm volume. */
  alarm: boolean;
  alarmVolume: number;
  /** Which knob alarmVolume is on: 2, even dB steps (game/alarm.ts); older saves are turned into it. */
  alarmCurve?: number;
  /** Unanswered, it calls again at these levels (3, 6 and 9 s after each ring), round and round. */
  alarmCalls: number[];
  active: ActiveSet | null;
  /** Every finished set and reset, newest first, up to reps.historyKeep. Resets do not clear it. */
  log: LogEntry[];
}

/** The three calls' levels as config.json sets them (0.3, 0.6, 0.9). */
export function defaultCalls(): number[] {
  const c = Array.isArray(R.alarm.calls) ? R.alarm.calls : [];
  return [0, 1, 2].map((i) =>
    clampAlarmVolume(typeof c[i] === "number" ? c[i]! : [0.3, 0.6, 0.9][i]!),
  );
}

/** The alarm's share of the phone's alarm volume: 0.01 to 1, in hundredths. */
export function clampAlarmVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0.01, Math.round(v * 100) / 100)) : 0.36;
}

export function newReps(): RepsState {
  return {
    items: [],
    set: clampSet(R.set),
    mode: "count",
    minutes: clampMinutes(R.timer.minutes),
    first: "reps",
    blank: false,
    alarm: R.alarm.on !== false,
    alarmVolume: clampAlarmVolume(R.alarm.volume),
    alarmCurve: 2,
    alarmCalls: defaultCalls(),
    active: null,
    log: [],
  };
}

/** Minutes for a timed set, from 1 to reps.timer.maxMinutes, whole. */
export function clampMinutes(n: number): number {
  return Number.isFinite(n)
    ? Math.max(1, Math.min(R.timer.maxMinutes, Math.round(n)))
    : R.timer.minutes;
}

export function isSetMode(v: unknown): v is SetMode {
  return v === "count" || v === "timer" || v === "both";
}

/** A set with a timer in it (timer, or both). */
export function isTimed(a: ActiveSet): boolean {
  return a.mode === "timer" || a.mode === "both";
}

/** The part going now: the reps or the timer. */
export function partOf(a: ActiveSet): Part {
  if (a.mode === "timer") return "timer";
  if (a.mode !== "both") return "reps";
  const first = a.first ?? "reps";
  return (a.part ?? 0) === 0 ? first : first === "reps" ? "timer" : "reps";
}

/** The last (or only) part is going: its Done finishes the set. */
export function lastPart(a: ActiveSet): boolean {
  return a.mode !== "both" || a.part === 1;
}

/** When the part going now began. */
function partStart(a: ActiveSet): number {
  return a.partSince ?? a.since;
}

/** Reps a timed set is reckoned at, at reps.timer.estimateSeconds a rep. */
export function estimateReps(ms: number): number {
  return Math.floor(Math.max(0, ms) / (Math.max(0.1, R.timer.estimateSeconds) * 1000));
}

/** Adds a line to the history, newest first, keeping up to reps.historyKeep. */
function logged(s: RepsState, e: LogEntry): RepsState {
  return { ...s, log: [e, ...s.log].slice(0, Math.max(0, R.historyKeep)) };
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

/** How long the part going now lasts before its Done opens (ms): a second a rep, or the timer's whole time. */
export function doneAfter(a: ActiveSet): number {
  return partOf(a) === "timer" ? Math.max(0, a.duration ?? 0) : setMs(a.target);
}

/** Time left before Done can be tapped (ms; 0 when it can). */
export function timeLeft(a: ActiveSet, now: number): number {
  return Math.max(0, partStart(a) + doneAfter(a) - now);
}

/** How long the part going now has taken (ms): a timer part counts its own length once it is up. */
function partTime(a: ActiveSet, now: number): number {
  return partOf(a) === "timer" ? Math.max(0, a.duration ?? 0) : Math.max(0, now - partStart(a));
}

/** "1:40", "0:04", "1:02:03": whole seconds, rounded down (a stopwatch), or up for a countdown. */
export function clock(ms: number, up = false): string {
  const t = Math.max(0, ms) / 1000;
  const total = up ? Math.ceil(t) : Math.floor(t);
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
    state: {
      ...s,
      items: [{ id, text: clean, total: 0, sets: 0, ms: 0, last: 0, at: now }, ...s.items],
    },
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

/**
 * Starts a set for a phrase, now: of the chosen size, or for the chosen minutes
 * in timer or both mode (or as given: the Court asks for a prayer of so long).
 */
export function startSet(
  s: RepsState,
  id: string,
  now: number,
  how: { mode?: SetMode; minutes?: number; target?: number } = {},
): RepsState {
  if (!s.items.some((i) => i.id === id)) return s;
  const mode = how.mode ?? s.mode;
  if (mode === "count")
    return { ...s, active: { id, target: clampSet(how.target ?? s.set), since: now, mode } };
  const duration = clampMinutes(how.minutes ?? s.minutes) * 60_000;
  if (mode === "timer") return { ...s, active: { id, target: 0, since: now, mode, duration } };
  // Both: the reps and the timer, one after the other.
  const target = clampSet(how.target ?? s.set);
  return {
    ...s,
    active: {
      id,
      target,
      since: now,
      mode,
      duration,
      part: 0,
      partSince: now,
      first: s.first,
      doneMs: 0,
    },
  };
}

export function cancelSet(s: RepsState): RepsState {
  return { ...s, active: null };
}

/** Adds a set's reps to a phrase, and the time it took (ms); 0 reps changes nothing. */
export function addReps(s: RepsState, id: string, count: number, ms = 0): RepsState {
  const n = Math.max(0, Math.floor(count));
  if (!n) return s;
  const t = Math.max(0, Math.round(ms));
  return {
    ...s,
    items: s.items.map((i) =>
      i.id === id
        ? { ...i, total: i.total + n, sets: i.sets + 1, ms: i.ms + t, last: t || i.last }
        : i,
    ),
  };
}

/**
 * Reps done somewhere else (the Tower Defense rep window) counted in: added to
 * the phrase's total and time as one set, and written in the History.
 */
export function recordReps(
  s: RepsState,
  id: string,
  count: number,
  ms: number,
  now: number,
): RepsState {
  const n = Math.max(0, Math.floor(count));
  const item = s.items.find((i) => i.id === id);
  if (!n || !item) return s;
  const t = Math.max(0, Math.round(ms));
  return logged(addReps(s, id, n, t), { kind: "set", at: now, text: item.text, reps: n, ms: t });
}

/** How long the set in progress has taken so far (ms): a stopwatch by the clock. */
export function setTime(a: ActiveSet, now: number): number {
  return Math.max(0, now - a.since);
}

/** Adds a finished set to a phrase: its reps (none for a timer set) and its time. */
function addSet(s: RepsState, id: string, reps: number, ms: number): RepsState {
  const n = Math.max(0, Math.floor(reps));
  const t = Math.max(0, Math.round(ms));
  if (!n && !t) return s;
  return {
    ...s,
    items: s.items.map((i) =>
      i.id === id
        ? { ...i, total: i.total + n, sets: i.sets + 1, ms: i.ms + t, last: t || i.last }
        : i,
    ),
  };
}

/** The reps a finished set adds: its target, or none for a timer set. */
export function repsOf(a: ActiveSet): number {
  return a.mode === "timer" ? 0 : a.target;
}

/** All the time of the set so far (ms): parts done, and the one going (a timer part counts its own length once up). */
export function totalTime(a: ActiveSet, now: number): number {
  return (a.doneMs ?? 0) + partTime(a, now);
}

/** Both mode: the first part done, the second begins now. Unchanged before the first part's time is up. */
export function nextPart(s: RepsState, now: number): RepsState {
  const a = s.active;
  if (!a || lastPart(a) || timeLeft(a, now) > 0) return s;
  return {
    ...s,
    active: { ...a, part: 1, partSince: now, doneMs: (a.doneMs ?? 0) + partTime(a, now) },
  };
}

/**
 * Finishes the set in progress once its (last part's) time is up: all its reps
 * go to the phrase, with the time (a timer counts its own length, however long
 * after Done was tapped). Unchanged before then, and in Both mode before the
 * second part.
 */
export function finishSet(s: RepsState, now: number): RepsState {
  const a = s.active;
  if (!a || !lastPart(a) || timeLeft(a, now) > 0) return s;
  const text = s.items.find((i) => i.id === a.id)?.text ?? "";
  const timed = isTimed(a);
  const ms = totalTime(a, now);
  const reps = repsOf(a);
  return logged(
    { ...addSet(s, a.id, reps, ms), active: null },
    { kind: "set", at: now, text, reps, ms, ...(timed ? { timed: true } : {}) },
  );
}

/** Every count and time back to 0; the words and phrases stay. */
export function resetAll(s: RepsState, now = Date.now()): RepsState {
  const cleared = {
    ...s,
    items: s.items.map((i) => ({ ...i, total: 0, sets: 0, ms: 0, last: 0 })),
  };
  // The history keeps everything, and marks the reset with what it cleared.
  return logged(cleared, {
    kind: "reset",
    at: now,
    text: "",
    reps: grandTotal(s),
    ms: grandTime(s),
  });
}

/** A reading in the Read tab goes into the history: the text's name, phrases read, the time, and whether it reached the end. */
export function logRead(
  s: RepsState,
  e: { at: number; text: string; phrases: number; ms: number; done: boolean },
): RepsState {
  return logged(s, {
    kind: "read",
    at: e.at,
    text: e.text,
    reps: Math.max(0, Math.floor(e.phrases)),
    ms: Math.max(0, Math.round(e.ms)),
    ...(e.done ? { done: true } : {}),
  });
}

/**
 * Empties the history and puts every count and time in Reps back to 0 with it,
 * so the two always agree; the words and phrases stay (and a set going on goes on).
 */
export function clearHistory(s: RepsState): RepsState {
  return {
    ...s,
    items: s.items.map((i) => ({ ...i, total: 0, sets: 0, ms: 0, last: 0 })),
    log: [],
  };
}

/** A day number in local time, so days change at midnight. */
export function localDay(ms: number): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);
}

export interface Tally {
  reps: number;
  ms: number;
  sets: number;
}

/**
 * What the history adds up to: all time, today, each phrase (most reps first), and
 * each day (newest first) with its lines.
 */
export function historyOf(
  log: LogEntry[],
  now: number,
): {
  all: Tally;
  today: Tally;
  phrases: (Tally & { text: string })[];
  days: (Tally & { day: number; at: number; entries: LogEntry[] })[];
} {
  const tally = (): Tally => ({ reps: 0, ms: 0, sets: 0 });
  const add = (t: Tally, e: LogEntry) => {
    t.reps += e.reps;
    t.ms += e.ms;
    t.sets += 1;
  };
  const all = tally();
  const today = tally();
  const phrases = new Map<string, Tally & { text: string }>();
  const days = new Map<number, Tally & { day: number; at: number; entries: LogEntry[] }>();
  const todayN = localDay(now);
  for (const e of log) {
    const d = localDay(e.at);
    let day = days.get(d);
    if (!day) {
      day = { ...tally(), day: d, at: e.at, entries: [] };
      days.set(d, day);
    }
    day.entries.push(e);
    if (e.kind !== "set") continue;
    add(all, e);
    add(day, e);
    if (d === todayN) add(today, e);
    const key = e.text.toLowerCase();
    let p = phrases.get(key);
    if (!p) {
      p = { ...tally(), text: e.text };
      phrases.set(key, p);
    }
    add(p, e);
  }
  return {
    all,
    today,
    phrases: [...phrases.values()].sort((a, b) => b.reps - a.reps || b.ms - a.ms),
    days: [...days.values()].sort((a, b) => b.day - a.day),
  };
}

// ---- Phrases from a text ----

/**
 * A word or phrase for a bonus set (the Court's +1 after a round): one at random
 * of those of at most maxWords words, or of all when none is that short; not
 * `avoid` (the last one) when there is another. Null with an empty list.
 */
export function pickBonus(
  s: RepsState,
  rand: () => number,
  maxWords: number,
  avoid = "",
): RepItem | null {
  const short = s.items.filter((i) => wordsOf(i.text) <= maxWords);
  const pool = short.length ? short : s.items;
  const other = pool.length > 1 ? pool.filter((i) => i.id !== avoid) : pool;
  if (!other.length) return null;
  return other[Math.min(other.length - 1, Math.floor(rand() * other.length))] ?? null;
}

/** A phrase's key for matching: lower case, single spaces. */
export function phraseKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The phrases in a text, to pick from: each line split into sentences (or kept
 * whole, for a pasted list), list marks ("- ", "• ", "1. ") taken off, nothing
 * without a letter or a digit, each phrase once (the first time it comes), up to max.
 */
export function phrasesFromText(text: string, max = 5000, bySentence = true): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    // A list mark comes off the line first, so "2. Keep it sharp" is not cut after "2.".
    const line = raw.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, "");
    // A pasted list keeps each line whole; a text's lines are split into sentences.
    for (const part of bySentence ? line.split(/(?<=[.!?…])\s+/) : [line]) {
      const p = part.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!/[\p{L}\p{N}]/u.test(p)) continue;
      const key = phraseKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type PhraseStatus =
  { kind: "on"; item: RepItem } | { kind: "done"; reps: number; ms: number } | { kind: "new" };

/** Where each phrase stands: on the list (with its totals), done before (in the history), or new. */
export function phraseIndex(s: RepsState): (text: string) => PhraseStatus {
  const on = new Map(s.items.map((i) => [phraseKey(i.text), i]));
  const done = new Map<string, { reps: number; ms: number }>();
  for (const e of s.log) {
    if (e.kind !== "set") continue;
    const k = phraseKey(e.text);
    const d = done.get(k) ?? { reps: 0, ms: 0 };
    d.reps += e.reps;
    d.ms += e.ms;
    done.set(k, d);
  }
  return (text) => {
    const k = phraseKey(text);
    const item = on.get(k);
    if (item) return { kind: "on", item };
    const d = done.get(k);
    return d ? { kind: "done", ...d } : { kind: "new" };
  };
}

/** Adds several phrases to the list (those not on it already), first one at the top; how many were added. */
export function addMany(
  s: RepsState,
  texts: string[],
  now: number,
): { state: RepsState; added: number } {
  let state = s;
  let added = 0;
  // Backwards, so the first picked ends up at the top of the list.
  for (let i = texts.length - 1; i >= 0; i--) {
    const before = state.items.length;
    state = addItem(state, texts[i] ?? "", now, `r${now.toString(36)}${i.toString(36)}`).state;
    if (state.items.length > before) added += 1;
  }
  return { state, added };
}

export function grandTotal(s: RepsState): number {
  return s.items.reduce((n, i) => n + i.total, 0);
}

/** All the time the finished sets took (ms). */
export function grandTime(s: RepsState): number {
  return s.items.reduce((n, i) => n + i.ms, 0);
}

/** Seconds a rep took on average, to one decimal; 0 before any. */
export function perRep(i: RepItem): number {
  return i.total > 0 ? Math.round(i.ms / i.total / 100) / 10 : 0;
}

/** Whole seconds, for "in 333 s" (rounded down, as the stopwatch). */
export function seconds(ms: number): number {
  return Math.floor(Math.max(0, ms) / 1000);
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
  if (isSetMode(d.mode)) s.mode = d.mode;
  if (Number.isFinite(num(d.minutes))) s.minutes = clampMinutes(num(d.minutes));
  if (d.first === "timer") s.first = "timer";
  s.blank = d.blank === true;
  if (typeof d.alarm === "boolean") s.alarm = d.alarm;
  if (Number.isFinite(num(d.alarmVolume))) {
    // Saved on the older knob (40 x log10 of it, in dB): the same loudness on this one (70 dB of even steps).
    const v = num(d.alarmVolume);
    s.alarmVolume = clampAlarmVolume(
      d.alarmCurve === 2 ? v : 1 + (40 * Math.log10(Math.max(0.001, v))) / 70,
    );
  }
  if (Array.isArray(d.alarmCalls)) {
    s.alarmCalls = s.alarmCalls.map((c, i) => {
      const v = num((d.alarmCalls as unknown[])[i]);
      return Number.isFinite(v) ? clampAlarmVolume(v) : c;
    });
  }
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
      ms: whole(i.ms),
      last: whole(i.last),
      at: whole(i.at),
    });
  }
  for (const raw of Array.isArray(d.log) ? d.log : []) {
    if (s.log.length >= R.historyKeep) break;
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const kind =
      e.kind === "reset" ? "reset" : e.kind === "set" ? "set" : e.kind === "read" ? "read" : null;
    if (!kind) continue;
    s.log.push({
      kind,
      at: whole(e.at),
      text: typeof e.text === "string" ? e.text.slice(0, 300) : "",
      reps: whole(e.reps),
      ms: whole(e.ms),
      ...(e.timed === true ? { timed: true } : {}),
      ...(e.done === true ? { done: true } : {}),
    });
  }
  const a = d.active as Record<string, unknown> | null | undefined;
  if (a && typeof a === "object" && typeof a.id === "string" && seen.has(a.id)) {
    const mode = isSetMode(a.mode) ? a.mode : "count";
    if (mode === "count") {
      const target = Number.isFinite(num(a.target)) ? clampSet(num(a.target)) : s.set;
      s.active = { id: a.id, target, since: whole(a.since), mode };
    } else if (mode === "timer") {
      const duration = clampMinutes(whole(a.duration) / 60_000) * 60_000;
      s.active = { id: a.id, target: 0, since: whole(a.since), mode, duration };
    } else {
      const duration = clampMinutes(whole(a.duration) / 60_000) * 60_000;
      const target = Number.isFinite(num(a.target)) ? clampSet(num(a.target)) : s.set;
      s.active = {
        id: a.id,
        target,
        since: whole(a.since),
        mode,
        duration,
        part: a.part === 1 ? 1 : 0,
        partSince: whole(a.partSince ?? a.since),
        first: a.first === "timer" ? "timer" : "reps",
        doneMs: whole(a.doneMs),
      };
    }
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
