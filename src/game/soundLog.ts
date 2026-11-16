/**
 * What the sound did, as it happened: the background mix started (its voices
 * and rate), coming late, the phone too slow for it, phrases that could not be
 * said, the rate changed. Kept on this visit only, the last 300 lines; read by
 * the sound monitor.
 */
export interface LogLine {
  at: number;
  text: string;
  level: "info" | "warn" | "error";
}

const MAX = 300;
let lines: LogLine[] = [];
const subs = new Set<() => void>();
/** The same text not again within this long (a stream of the same warning is one line). */
const QUIET_MS = 4000;
const lastSaid = new Map<string, number>();

export function soundLog(text: string, level: LogLine["level"] = "info") {
  const now = Date.now();
  const was = lastSaid.get(text);
  if (was !== undefined && now - was < QUIET_MS) return;
  lastSaid.set(text, now);
  if (lastSaid.size > 200) lastSaid.delete(lastSaid.keys().next().value!);
  lines = [...lines.slice(-(MAX - 1)), { at: now, text, level }];
  for (const f of subs) f();
}

export function logLines(): LogLine[] {
  return lines;
}

export function subscribeLog(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function clearLog() {
  lines = [];
  lastSaid.clear();
  for (const f of subs) f();
}
