/**
 * The Read tab's see-through window over other apps (ReadOverlayPlugin.java, the
 * Android app only): the text reads on by itself in it, word by word, as see-
 * through as set, over whatever app is open. In a browser there is none.
 */

export interface OverlayLook {
  /** Background and words opacity (0 to 1), words size (sp), touches through it to the app below. */
  bg: number;
  words: number;
  size: number;
  through: boolean;
}

export interface OverlayText extends OverlayLook {
  key: string;
  title: string;
  units: string[];
  index: number;
  wordMs: number;
  passes: number;
  perHit: number;
  silenceMs: number;
  phraseSilenceMs: number;
  auto: boolean;
}

export interface OverlayRead {
  key: string;
  index: number;
  reps: number;
  phrases: number;
  texts: number;
  shown: boolean;
}

interface ReadOverlayApi {
  canDraw(): Promise<{ allowed: boolean; shown: boolean }>;
  allow(): Promise<{ allowed: boolean }>;
  prepare(o: OverlayText): Promise<void>;
  place(o: { index: number }): Promise<void>;
  look(o: OverlayLook): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  setAuto(o: { on: boolean }): Promise<void>;
  resetPlace(): Promise<void>;
  takePlace(): Promise<OverlayRead>;
}

let plugin: Promise<{ api: ReadOverlayApi } | null> | null = null;

function overlay() {
  plugin ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? { api: registerPlugin<ReadOverlayApi>("ReadOverlay") }
        : null,
    )
    .catch(() => null);
  return plugin;
}

/** Whether there is a see-through window (the phone app). */
export async function overlayHere(): Promise<boolean> {
  return !!(await overlay());
}

export async function overlayPrepare(t: OverlayText) {
  const o = await overlay();
  if (o) await o.api.prepare(t).catch(() => {});
}

export async function overlayPlace(index: number) {
  const o = await overlay();
  if (o) await o.api.place({ index }).catch(() => {});
}

export async function overlayLook(l: OverlayLook) {
  const o = await overlay();
  if (o) await o.api.look(l).catch(() => {});
}

/** Opens it (first asking to let the app draw over other apps): "" when it opened, else why not. */
export async function overlayShow(): Promise<string> {
  const o = await overlay();
  if (!o) return "The see-through window is in the Android app.";
  try {
    if (!(await o.api.canDraw()).allowed) {
      const r = await o.api.allow();
      if (!r.allowed) return "Allow “Display over other apps” for this app, then open it again.";
    }
    await o.api.show();
    return "";
  } catch (e) {
    return String((e as Error)?.message ?? e);
  }
}

export async function overlayHide() {
  const o = await overlay();
  if (o) await o.api.hide().catch(() => {});
}

export async function overlayAuto(on: boolean) {
  const o = await overlay();
  if (o) await o.api.setAuto({ on }).catch(() => {});
}

export async function overlayResetPlace() {
  const o = await overlay();
  if (o) await o.api.resetPlace().catch(() => {});
}

/** What was read in it since last asked (null in a browser). */
export async function overlayTake(): Promise<OverlayRead | null> {
  const o = await overlay();
  if (!o) return null;
  try {
    return await o.api.takePlace();
  } catch {
    return null;
  }
}
