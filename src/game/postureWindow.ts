/**
 * The Postures window over other apps (the Android app; PostureWindowService):
 * small and see-through like the status bar's clock, with every posture,
 * pause, stop and reset a tap away. What is tapped on it is kept there with its
 * time and put on the timer here (in the order it was made) as soon as the app
 * can: at once while it runs, else when it comes back. Changes made here go to
 * the window, in the look's colours.
 */
import { applyPostureEvents, type PostureEvent, type PostureState } from "@/game/postures";
import { postureState, postureUpdate, subscribePostures } from "@/game/postureRun";
import { colorsOf } from "@/game/theme";
import { subscribeTheme, themeState } from "@/game/themeRun";

interface WindowSetup {
  postures: { id: string; name: string }[];
  running: PostureState["running"];
  colors: { accent: string; on: string; hi: string };
}

interface PostureWindowApi {
  canDraw(): Promise<{ allowed: boolean; shown: boolean }>;
  allow(): Promise<{ allowed: boolean }>;
  show(o: WindowSetup): Promise<void>;
  update(o: WindowSetup): Promise<void>;
  hide(): Promise<void>;
  take(): Promise<{ events: PostureEvent[]; shown: boolean }>;
  addListener(event: "posture", fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

let plugin: Promise<{ api: PostureWindowApi } | null> | null = null;

/** The window's plugin, in the Android app only (wrapped: a plugin is not a promise's result). */
function windowPlugin() {
  plugin ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? { api: registerPlugin<PostureWindowApi>("PostureWindow") }
        : null,
    )
    .catch(() => null);
  return plugin;
}

let shown = false;
const subs = new Set<() => void>();
const setShown = (v: boolean) => {
  if (v === shown) return;
  shown = v;
  for (const f of subs) f();
};

/** Whether the window is open now (as last heard). */
export function postureWindowShown(): boolean {
  return shown;
}

export function subscribePostureWindow(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** Whether there is a window here at all (the Android app). */
export async function postureWindowHere(): Promise<boolean> {
  return !!(await windowPlugin());
}

function setupOf(s: PostureState): WindowSetup {
  const c = colorsOf(themeState());
  return {
    postures: s.postures.map((p) => ({ id: p.id, name: p.name })),
    running: s.running,
    colors: { accent: c.accent, on: c.on, hi: c.hi },
  };
}

/** What was tapped on the window: put on the timer here, in turn. */
export async function takePostureEvents() {
  const w = await windowPlugin();
  if (!w) return;
  try {
    const r = await w.api.take();
    setShown(r.shown);
    if (r.events?.length) postureUpdate((s) => applyPostureEvents(s, r.events));
  } catch {
    /* none */
  }
}

/**
 * Opens the window: first, if the phone does not let the app draw over other
 * apps yet, its setting for that. Gives back what happened ("" when it opened).
 */
export async function showPostureWindow(): Promise<string> {
  const w = await windowPlugin();
  if (!w) return "The floating window is in the Android app.";
  try {
    if (!(await w.api.canDraw()).allowed) {
      const r = await w.api.allow();
      if (!r.allowed)
        return "Allow “Display over other apps” for this app, then open the window again.";
    }
    await takePostureEvents();
    await w.api.show(setupOf(postureState()));
    setShown(true);
    return "";
  } catch (e) {
    return String((e as Error)?.message ?? e);
  }
}

export async function hidePostureWindow() {
  const w = await windowPlugin();
  if (!w) return;
  await takePostureEvents();
  await w.api.hide().catch(() => {});
  setShown(false);
}

let timer = 0;
/** The window shows what the timer here shows (a moment after a change). */
function syncSoon() {
  if (!shown || typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void windowPlugin().then((w) => w?.api.update(setupOf(postureState())).catch(() => {}));
  }, 120);
}

let started = false;
/** Once, at the start: taps made on the window while the app was away put on, and kept in step after. */
export function startPostureBackground() {
  if (started || typeof document === "undefined") return;
  started = true;
  void windowPlugin().then(async (w) => {
    if (!w) return;
    try {
      setShown((await w.api.canDraw()).shown);
    } catch {
      /* not here */
    }
    await takePostureEvents();
    void w.api.addListener("posture", () => void takePostureEvents());
    subscribePostures(syncSoon);
    subscribeTheme(syncSoon);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void takePostureEvents();
    });
  });
}
