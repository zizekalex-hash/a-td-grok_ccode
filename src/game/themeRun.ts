/**
 * The look on the device: one copy, put on the page at once when it changes
 * (and on the phone's status bar). Needs a page.
 */
import { applyTheme, colorsOf, loadTheme, THEME_KEY, type ThemeState } from "@/game/theme";

let state: ThemeState | null = null;
const subs = new Set<() => void>();

export function themeState(): ThemeState {
  if (!state) {
    try {
      state = loadTheme(JSON.parse(localStorage.getItem(THEME_KEY) || "null"));
    } catch {
      state = loadTheme(null);
    }
  }
  return state;
}

/** The phone's status bar in the page's colour (the Android app). */
function statusBar(t: ThemeState) {
  void import("@capacitor/core")
    .then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setBackgroundColor({ color: colorsOf(t).bg });
      await StatusBar.setStyle({ style: Style.Dark });
    })
    .catch(() => undefined);
}

/** Puts the saved look on the page (at the start). */
export function startTheme() {
  const t = themeState();
  applyTheme(t);
  statusBar(t);
}

export function themeUpdate(patch: Partial<ThemeState>) {
  state = { ...themeState(), ...patch };
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(state));
  } catch {
    /* private mode or full */
  }
  applyTheme(state);
  statusBar(state);
  for (const f of subs) f();
}

export function subscribeTheme(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
