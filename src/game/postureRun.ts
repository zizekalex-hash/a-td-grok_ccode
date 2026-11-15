/**
 * The posture timer on the device: one copy, shared by its tab, the drill's
 * header and the History. Needs a page.
 */
import { loadPostures, POSTURES_KEY, type PostureState } from "@/game/postures";

let state: PostureState | null = null;
const subs = new Set<() => void>();

export function postureState(): PostureState {
  if (!state) {
    try {
      const raw = localStorage.getItem(POSTURES_KEY);
      state = loadPostures(raw ? JSON.parse(raw) : null);
    } catch {
      state = loadPostures(null);
    }
  }
  return state;
}

export function postureUpdate(fn: (s: PostureState) => PostureState) {
  const next = fn(postureState());
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(POSTURES_KEY, JSON.stringify(state));
  } catch {
    /* private mode or full */
  }
  for (const f of subs) f();
}

export function subscribePostures(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** Read again from the device (a backup put back). */
export function reloadPostures() {
  state = null;
  for (const f of subs) f();
}
