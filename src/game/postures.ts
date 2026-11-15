/**
 * Postures: a timer for meditating in a posture (a headstand, on all fours,
 * standing, or your own). Tap one to start it; tapping another stops the
 * first (counted) and starts that one; tapping the one going stops it. Each
 * sitting is kept (when it started, how long), so its stats (today, all time,
 * how many, the longest) and the History show it. It counts from a moment in
 * time, not by ticking: it goes on in the background, in other apps and with
 * the app closed. Reset throws away the one going (fell asleep: not counted).
 * Pure: no page.
 */

export interface Posture {
  id: string;
  name: string;
}

/** A sitting in a posture: when it started (ms since 1970) and how long (ms), its name as it was. */
export interface PostureSitting {
  id: string;
  name: string;
  at: number;
  ms: number;
}

export interface PostureState {
  postures: Posture[];
  /** The posture being timed now, and since when (ms since 1970). */
  running: { id: string; since: number } | null;
  /** Every sitting, newest first (up to POSTURE_LOG_KEEP). */
  log: PostureSitting[];
}

export const POSTURES_KEY = "azshara-postures-v1";
export const POSTURE_LOG_KEEP = 10_000;
/** A sitting shorter than this is not kept (a tap too many). */
export const MIN_SITTING_MS = 1000;
export const MAX_POSTURES = 40;
export const MAX_POSTURE_NAME = 60;

export const DEFAULT_POSTURES: readonly Posture[] = [
  { id: "headstand", name: "Headstand" },
  { id: "fours", name: "On all fours" },
  { id: "standing", name: "Standing" },
];

export function newPostures(): PostureState {
  return { postures: DEFAULT_POSTURES.map((p) => ({ ...p })), running: null, log: [] };
}

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_POSTURE_NAME);

/** A saved state, each value checked (nothing saved: the three to start). */
export function loadPostures(data: unknown): PostureState {
  const d = obj(data);
  if (!Array.isArray(d.postures)) return { ...newPostures(), log: loadLog(d.log) };
  const seen = new Set<string>();
  const postures: Posture[] = [];
  for (const raw of d.postures) {
    const r = obj(raw);
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const name = typeof r.name === "string" ? cleanName(r.name) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    postures.push({ id, name });
    if (postures.length >= MAX_POSTURES) break;
  }
  const run = obj(d.running);
  const running =
    typeof run.id === "string" && seen.has(run.id) && num(run.since, 0) > 0
      ? { id: run.id, since: num(run.since, 0) }
      : null;
  return { postures, running, log: loadLog(d.log) };
}

function loadLog(v: unknown): PostureSitting[] {
  const log: PostureSitting[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const r = obj(raw);
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const name = typeof r.name === "string" ? cleanName(r.name) : "";
    const at = num(r.at, 0);
    const ms = num(r.ms, -1);
    if (!id || !name || at <= 0 || ms < 0) continue;
    log.push({ id, name, at, ms: Math.round(ms) });
    if (log.length >= POSTURE_LOG_KEEP) break;
  }
  return log;
}

/** How long the one going has gone (ms; 0 when none). */
export function runningMs(s: PostureState, now: number): number {
  return s.running ? Math.max(0, now - s.running.since) : 0;
}

/** The one going stops, counted (unless it was only a tap too many). */
export function stopPosture(s: PostureState, now: number): PostureState {
  const r = s.running;
  if (!r) return s;
  const ms = Math.max(0, now - r.since);
  const name = s.postures.find((p) => p.id === r.id)?.name ?? r.id;
  const log =
    ms >= MIN_SITTING_MS
      ? [{ id: r.id, name, at: r.since, ms }, ...s.log].slice(0, POSTURE_LOG_KEEP)
      : s.log;
  return { ...s, running: null, log };
}

/** A tap on a posture: the one going stops (counted); it starts, unless it was the one going. */
export function tapPosture(s: PostureState, id: string, now: number): PostureState {
  if (!s.postures.some((p) => p.id === id)) return s;
  const was = s.running?.id;
  const stopped = stopPosture(s, now);
  return was === id ? stopped : { ...stopped, running: { id, since: now } };
}

/** Reset: the one going stops, not counted (fell asleep). */
export function resetPosture(s: PostureState): PostureState {
  return s.running ? { ...s, running: null } : s;
}

/** A new posture at the end (its name tidied; none twice, by name). */
export function addPosture(s: PostureState, name: string, now: number): PostureState {
  const clean = cleanName(name);
  if (!clean || s.postures.length >= MAX_POSTURES) return s;
  if (s.postures.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return s;
  let id = `p${now.toString(36)}`;
  while (s.postures.some((p) => p.id === id)) id += "x";
  return { ...s, postures: [...s.postures, { id, name: clean }] };
}

/** A posture taken off (the one going stops first, counted); its sittings stay in the history. */
export function removePosture(s: PostureState, id: string, now: number): PostureState {
  const t = s.running?.id === id ? stopPosture(s, now) : s;
  return { ...t, postures: t.postures.filter((p) => p.id !== id) };
}

/** Every sitting forgotten (the postures stay; the one going goes on). */
export function clearPostureLog(s: PostureState): PostureState {
  return { ...s, log: [] };
}

/** A day number in local time, so days change at midnight. */
const dayOf = (ms: number) =>
  Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);

export interface PostureStats {
  id: string;
  name: string;
  /** Today's time (the one going too), all time, sittings, the longest, the last (ms since 1970; 0 for none). */
  todayMs: number;
  totalMs: number;
  sittings: number;
  longestMs: number;
  lastAt: number;
}

/** Each posture's stats, in the list's order (the one going counted as far as it has gone). */
export function postureStats(s: PostureState, now: number): PostureStats[] {
  const today = dayOf(now);
  const by = new Map<string, PostureStats>(
    s.postures.map((p) => [
      p.id,
      { id: p.id, name: p.name, todayMs: 0, totalMs: 0, sittings: 0, longestMs: 0, lastAt: 0 },
    ]),
  );
  const add = (id: string, at: number, ms: number) => {
    const t = by.get(id);
    if (!t) return;
    t.totalMs += ms;
    t.sittings += 1;
    t.longestMs = Math.max(t.longestMs, ms);
    t.lastAt = Math.max(t.lastAt, at);
    if (dayOf(at) === today) t.todayMs += ms;
  };
  for (const e of s.log) add(e.id, e.at, e.ms);
  if (s.running) add(s.running.id, s.running.since, runningMs(s, now));
  return s.postures.map((p) => by.get(p.id)!);
}

/** Every posture's time today (the one going too). */
export function postureToday(s: PostureState, now: number): number {
  const today = dayOf(now);
  let ms = 0;
  for (const e of s.log) if (dayOf(e.at) === today) ms += e.ms;
  if (s.running && dayOf(s.running.since) === today) ms += runningMs(s, now);
  return ms;
}
