/**
 * A sliding-window request limit keyed by client address. It keeps counts in
 * memory, so it holds per running instance: enough to stop a single client from
 * spending the key, not a hard global cap.
 */

export interface LimitOptions {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export const AGENT_LIMIT: LimitOptions = { max: 20, windowMs: 10 * 60_000 };

const SWEEP_AT = 1000;

export function createLimiter(options: LimitOptions) {
  const hits = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    return (hits.get(key) ?? []).filter((t) => now - t < options.windowMs);
  }

  return {
    /** True when the request may go ahead; records it if so. */
    allow(key: string, now: number = Date.now()): boolean {
      if (hits.size > SWEEP_AT) {
        for (const k of [...hits.keys()]) {
          if (recent(k, now).length === 0) hits.delete(k);
        }
      }
      const times = recent(key, now);
      if (times.length >= options.max) {
        hits.set(key, times);
        return false;
      }
      times.push(now);
      hits.set(key, times);
      return true;
    },
  };
}
