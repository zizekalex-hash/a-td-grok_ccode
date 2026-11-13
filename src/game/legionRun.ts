/**
 * The Legion engine's settings on the device, one copy shared by its tab and
 * the .tts.wav export (which reads them as it starts). Needs a page.
 */
import { LEGION_KEY, loadLegion, type LegionSettings } from "@/game/legion";

let state: LegionSettings | null = null;
const subs = new Set<() => void>();

export function legionState(): LegionSettings {
  if (!state) {
    try {
      const raw = localStorage.getItem(LEGION_KEY);
      state = loadLegion(raw ? JSON.parse(raw) : null);
    } catch {
      state = loadLegion(null);
    }
  }
  return state;
}

export function legionUpdate(patch: Partial<LegionSettings>) {
  state = { ...legionState(), ...patch } as LegionSettings;
  try {
    localStorage.setItem(LEGION_KEY, JSON.stringify(state));
  } catch {
    /* private mode or full */
  }
  for (const f of subs) f();
}

/** Every setting back to the engines' own. */
export function legionReset() {
  legionUpdate(loadLegion(null));
}

export function subscribeLegion(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
