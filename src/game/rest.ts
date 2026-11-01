/**
 * Rest: while a rep set runs you recite from memory, eyes closed, and nothing
 * needs to move on the screen. The set's screen holds a rest; meanwhile every
 * game loop stops drawing (it sleeps until the rest ends), the page under the
 * set's screen is hidden and its animations stand still, and keys go to the
 * set's screen only (a game below does not take Enter or Esc). All of it comes
 * back when the set ends.
 */

let holds = 0;
const sleepers = new Set<() => void>();
/** Time spent resting before the rest now (ms), and when the rest now began. */
let restedMs = 0;
let restSince = 0;

/** All the time spent resting so far (ms), the rest now included. */
export function restedTotal(): number {
  return restedMs + (holds > 0 ? Date.now() - restSince : 0);
}

/** A rep set's screen is up. */
export function resting(): boolean {
  return holds > 0;
}

/** Keys reach the set's screen's own buttons, and nothing listening on the page. */
function swallow(e: KeyboardEvent) {
  e.stopPropagation();
}

function mark(on: boolean) {
  try {
    document.documentElement.classList.toggle("resting", on);
    if (on) window.addEventListener("keydown", swallow, true);
    else window.removeEventListener("keydown", swallow, true);
  } catch {
    /* no page (tests, server) */
  }
}

/** Starts a rest; the function it gives back ends it (once). Rests can overlap. */
export function holdRest(): () => void {
  holds += 1;
  if (holds === 1) {
    restSince = Date.now();
    mark(true);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds = Math.max(0, holds - 1);
    if (holds) return;
    restedMs += Date.now() - restSince;
    mark(false);
    const wake = [...sleepers];
    sleepers.clear();
    for (const w of wake) w();
  };
}

/** A game loop that found a rest: `wake` runs when it ends. */
export function sleepFrames(wake: () => void) {
  sleepers.add(wake);
}

/** A stopped game no longer wants waking. */
export function cancelSleep(wake: () => void) {
  sleepers.delete(wake);
}
