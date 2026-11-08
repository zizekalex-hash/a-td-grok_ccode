/**
 * Rehearse's floating window over other apps (RepBubblePlugin.java, the Android
 * app only): the phrase, its count and the batch; a tap on it counts the batch
 * (with the same wait), and those reps wait there till the app takes them.
 * In a browser there is none: every call says so (false, or nothing).
 */

export interface BubblePhrase {
  id: string;
  text: string;
  count: number;
}

export interface BubbleSetup {
  phrases: BubblePhrase[];
  current: string;
  batch: number;
  waitMs: number;
  lastTap: number;
}

export interface BubbleReps {
  reps: { id: string; n: number; at: number }[];
  current: string;
  shown: boolean;
}

interface RepBubbleApi {
  canDraw(): Promise<{ allowed: boolean; shown: boolean }>;
  allow(): Promise<{ allowed: boolean }>;
  show(o: BubbleSetup): Promise<void>;
  update(o: BubbleSetup): Promise<void>;
  hide(): Promise<void>;
  takeReps(): Promise<BubbleReps>;
  addListener(event: "reps", fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

let plugin: Promise<{ api: RepBubbleApi } | null> | null = null;

/** The window's plugin, in the Android app only (wrapped: a plugin is not a promise's result). */
function bubble() {
  plugin ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? { api: registerPlugin<RepBubbleApi>("RepBubble") }
        : null,
    )
    .catch(() => null);
  return plugin;
}

/** Whether there is a window (the phone app), and whether it is open now. */
export async function bubbleState(): Promise<{ here: boolean; shown: boolean }> {
  const b = await bubble();
  if (!b) return { here: false, shown: false };
  try {
    return { here: true, shown: (await b.api.canDraw()).shown };
  } catch {
    return { here: false, shown: false };
  }
}

/**
 * Opens the window: first, if the phone does not let the app draw over other
 * apps yet, its setting for that (the window opens once it is allowed). Gives
 * back what happened, in plain words ("" when it opened).
 */
export async function openBubble(setup: BubbleSetup): Promise<string> {
  const b = await bubble();
  if (!b) return "The floating window is in the Android app.";
  try {
    if (!(await b.api.canDraw()).allowed) {
      const r = await b.api.allow();
      if (!r.allowed)
        return "Allow “Display over other apps” for this app, then open the window again.";
    }
    await b.api.show(setup);
    return "";
  } catch (e) {
    return String((e as Error)?.message ?? e);
  }
}

export async function updateBubble(setup: BubbleSetup) {
  const b = await bubble();
  if (b) await b.api.update(setup).catch(() => {});
}

export async function closeBubble() {
  const b = await bubble();
  if (b) await b.api.hide().catch(() => {});
}

/** The reps counted on the window since last asked (none in a browser). */
export async function takeBubbleReps(): Promise<BubbleReps | null> {
  const b = await bubble();
  if (!b) return null;
  try {
    return await b.api.takeReps();
  } catch {
    return null;
  }
}

/** Calls back when the window counted something (or changed phrase, or closed). */
export async function onBubble(fn: () => void): Promise<() => void> {
  const b = await bubble();
  if (!b) return () => {};
  try {
    const h = await b.api.addListener("reps", fn);
    return () => void h.remove();
  } catch {
    return () => {};
  }
}
