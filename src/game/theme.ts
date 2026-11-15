/**
 * The app's look: a theme (its colours: the page's, the words', the main
 * accent, what is on or picked, what stands out) and how roomy the buttons
 * are. Void crystal to start; six others, or your own colours. Kept on the
 * device and put on the page before it shows (see THEME_BOOT).
 */

export interface ThemeColors {
  /** The page behind everything. */
  bg: string;
  /** Words. */
  fg: string;
  /** Quieter words. */
  muted: string;
  /** The main accent: borders, buttons, numbers. */
  accent: string;
  /** What is on or picked. */
  on: string;
  /** What stands out (notes, counts). */
  hi: string;
  /** Warnings. */
  danger: string;
}

export type ThemeId =
  "void" | "amethyst" | "cyan" | "rose" | "emerald" | "ice" | "ember" | "custom";
export type Density = "compact" | "comfortable";

export interface ThemeState {
  id: ThemeId;
  /** Your own colours (theme "custom"). */
  custom: ThemeColors;
  density: Density;
}

export const THEME_KEY = "azshara-theme-v1";

export const THEMES: { id: Exclude<ThemeId, "custom">; name: string; colors: ThemeColors }[] = [
  {
    id: "void",
    name: "Void crystal",
    colors: {
      bg: "#06030d",
      fg: "#efe8ff",
      muted: "#a59bc6",
      accent: "#c4a5ff",
      on: "#8b5cf6",
      hi: "#ff9ee7",
      danger: "#ff5c8a",
    },
  },
  {
    id: "amethyst",
    name: "Amethyst & gold",
    colors: {
      bg: "#08040f",
      fg: "#f3ecff",
      muted: "#a99cc0",
      accent: "#b388ff",
      on: "#6d28d9",
      hi: "#f5c76a",
      danger: "#ff5a7a",
    },
  },
  {
    id: "cyan",
    name: "Signal cyan (the first)",
    colors: {
      bg: "#020005",
      fg: "#f4f7ff",
      muted: "#9aa3b8",
      accent: "#00ffff",
      on: "#a855f7",
      hi: "#e8c872",
      danger: "#ff4d6d",
    },
  },
  {
    id: "rose",
    name: "Rose quartz",
    colors: {
      bg: "#0c0409",
      fg: "#ffeef5",
      muted: "#c39aaf",
      accent: "#ff9cc8",
      on: "#db2777",
      hi: "#ffd28a",
      danger: "#ff6b6b",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    colors: {
      bg: "#020a07",
      fg: "#eafff5",
      muted: "#8fb8a6",
      accent: "#4ff0b4",
      on: "#059669",
      hi: "#f5d76e",
      danger: "#ff6b81",
    },
  },
  {
    id: "ice",
    name: "Ice",
    colors: {
      bg: "#030812",
      fg: "#eef6ff",
      muted: "#93a8c4",
      accent: "#8fd3ff",
      on: "#2563eb",
      hi: "#ffe08a",
      danger: "#ff6b8a",
    },
  },
  {
    id: "ember",
    name: "Ember",
    colors: {
      bg: "#0d0503",
      fg: "#fff1ea",
      muted: "#c4a294",
      accent: "#ffab70",
      on: "#dc4a1a",
      hi: "#ffe066",
      danger: "#ff4d6d",
    },
  },
];

const IDS: ThemeId[] = [...THEMES.map((t) => t.id), "custom"];
const HEX = /^#[0-9a-f]{6}$/i;

export function newTheme(): ThemeState {
  return { id: "void", custom: { ...THEMES[0]!.colors }, density: "compact" };
}

/** A saved look, each value checked (nothing saved: void crystal, compact). */
export function loadTheme(data: unknown): ThemeState {
  const t = newTheme();
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (IDS.includes(d.id as ThemeId)) t.id = d.id as ThemeId;
  if (d.density === "compact" || d.density === "comfortable") t.density = d.density;
  const c = d.custom && typeof d.custom === "object" ? (d.custom as Record<string, unknown>) : {};
  for (const k of Object.keys(t.custom) as (keyof ThemeColors)[]) {
    const v = c[k];
    if (typeof v === "string" && HEX.test(v)) t.custom[k] = v.toLowerCase();
  }
  return t;
}

/** The colours a look puts on the page. */
export function colorsOf(t: ThemeState): ThemeColors {
  return t.id === "custom" ? t.custom : (THEMES.find((x) => x.id === t.id) ?? THEMES[0]!).colors;
}

/** The page's own variables for a look (what styles.css reads). */
export function themeVars(t: ThemeState): Record<string, string> {
  const c = colorsOf(t);
  return {
    "--color-bg": c.bg,
    "--color-fg": c.fg,
    "--color-muted": c.muted,
    "--color-cyan": c.accent,
    "--color-violet": c.on,
    "--color-gold": c.hi,
    "--color-danger": c.danger,
    "--color-panel": `color-mix(in oklab, ${c.bg} 82%, ${c.on})`,
  };
}

/** Puts a look on the page: its colours, its density, and the phone's bar colour. */
export function applyTheme(t: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  root.dataset.density = t.density;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colorsOf(t).bg);
}

/**
 * Run in the page's head, before it shows: the saved look put on at once (no
 * flash of another). Kept short and self-contained (it runs before the app).
 */
export const THEME_BOOT = `(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})||"null");var T=${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.colors])))};var c=d&&d.id==="custom"&&d.custom?d.custom:(T[d&&d.id]||T.void);var r=document.documentElement,s=r.style,h=/^#[0-9a-f]{6}$/i;function p(k,v,f){s.setProperty(k,h.test(v)?v:f)}p("--color-bg",c.bg,T.void.bg);p("--color-fg",c.fg,T.void.fg);p("--color-muted",c.muted,T.void.muted);p("--color-cyan",c.accent,T.void.accent);p("--color-violet",c.on,T.void.on);p("--color-gold",c.hi,T.void.hi);p("--color-danger",c.danger,T.void.danger);r.setAttribute("data-density",d&&d.density==="comfortable"?"comfortable":"compact")}catch(e){}})();`;
