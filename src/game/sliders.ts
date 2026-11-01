import { FIELD_SPEC } from "@/game/engine";
import type { OptionsTab } from "@/game/store";

/** The sliders shown in the tome and the options window. */
export type SliderKey = keyof typeof FIELD_SPEC;

export interface SliderSpec {
  key: SliderKey;
  label: string;
  format: (n: number) => string;
  copy: string;
}

/** 2 → "2nd", 3 → "3rd", 11 → "11th". */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export const SLIDER_GROUPS: { title: string; sliders: SliderSpec[] }[] = [
  {
    title: "Words",
    sliders: [
      {
        key: "textScale",
        label: "Field text size",
        format: (n) => `${Math.round(n)}%`,
        copy: "Scales the full text on the field. Smaller fits more, larger fills the screen. Text shrinks further only when it must, so every word stays whole.",
      },
      {
        key: "opacity",
        label: "Word opacity",
        format: (n) => `${Math.round(n * 100)}%`,
        copy: "How strongly the words show behind the fight. Turn it down if the text competes with the enemies.",
      },
      {
        key: "textSize",
        label: "Flash text size",
        format: (n) => `${Math.round(n)} px`,
        copy: "Size of the phrases in the flash panel, and of the floating phrases in sphere and chaos. Long phrases shrink to fit rather than being cut.",
      },
      {
        key: "density",
        label: "Flash count",
        format: (n) => String(Math.round(n)),
        copy: "How many phrases the flash panel, sphere and chaos keep alive. The panel shows fewer when they would crowd it.",
      },
      {
        key: "flashMs",
        label: "Flash speed",
        format: (n) => `${Math.round(n)} ms`,
        copy: "How often each phrase in the flash panel, sphere and chaos changes. Lower is faster. Each phrase changes on its own, never the whole screen at once.",
      },
    ],
  },
  {
    title: "Flash & pace",
    sliders: [
      {
        key: "wordFlashMs",
        label: "Seconds per sector",
        format: (n) => `${(n / 1000).toFixed(1)} s`,
        copy: "When the whole text cannot fit even at its smallest size, each sector flashes alone for this long, then the list loops. The fastest setting comes from settingLimits in config.json.",
      },
      {
        key: "gameSpeed",
        label: "Game speed",
        format: (n) => `${n.toFixed(2)}×`,
        copy: "How fast sleep-signals arrive and move. Slow it down to learn the waves, speed it up when the field feels too easy.",
      },
      {
        key: "phraseEvery",
        label: "Phrases on hits",
        format: (n) => (n <= 1 ? "Every hit" : `Every ${ordinal(Math.round(n))}`),
        copy: "Which tower shots (tower defense) and piece attacks (auto chess) carry a phrase: the first, then every Nth; the rest fly plain. Fewer phrases is calmer to watch at 3× and lighter on the battery. Abilities always carry one, and the text still reads in order.",
      },
      {
        key: "phrasePauseMs",
        label: "Pause between phrases",
        format: (n) => (n <= 0 ? "None" : `${Math.round(n)} ms`),
        copy: "The least time between two phrases, in milliseconds. Shots in between fly plain, so a busy board does not pile phrases on top of each other.",
      },
      {
        key: "textPauseMs",
        label: "Pause between texts",
        format: (n) => (n <= 0 ? "None" : `${(n / 1000).toFixed(n % 1000 ? 2 : 0)} s`),
        copy: "When a text has been read through, a break before the next one (or the same one again) starts. Shots in the break fly plain.",
      },
    ],
  },
  {
    title: "Binary rain",
    sliders: [
      {
        key: "binaryOpacity",
        label: "Binary opacity",
        format: (n) => `${Math.round(n * 100)}%`,
        copy: "The background binary is built from the bits of your loaded text, not random noise. This sets how visible it is.",
      },
      {
        key: "binaryPitch",
        label: "Binary spacing",
        format: (n) => `${Math.round(n)} px`,
        copy: "Distance between the binary columns. Tighter columns fill more of the screen.",
      },
    ],
  },
  {
    title: "Performance",
    sliders: [
      {
        key: "fpsCap",
        label: "Frame rate cap",
        format: (n) => (n >= 120 ? "Unlimited" : `${Math.round(n)} fps`),
        copy: "Most frames drawn per second. Lower it to save battery and keep a busy board smooth on a slow phone. Movement stays the same speed; it is just drawn less often.",
      },
      {
        key: "renderScale",
        label: "Render resolution",
        format: (n) => `${Math.round(n)}%`,
        copy: "How sharp the game is drawn. Lower is softer but much lighter: 50% draws a quarter of the pixels.",
      },
    ],
  },
  {
    title: "Interface",
    sliders: [
      {
        key: "uiScale",
        label: "Interface size",
        format: (n) => `${Math.round(n)}%`,
        copy: "Scales the panels and buttons. Raise it for easier tapping, lower it to see more of the field.",
      },
    ],
  },
];

const VOLUME: SliderSpec = {
  key: "volume",
  label: "Volume",
  format: (n) => (n <= 0 ? "Silent" : `${Math.round(n)}%`),
  copy: "How loud the game's sounds are.",
};

/** Every slider, by the setting it changes. */
export const SLIDERS = Object.fromEntries(
  [...SLIDER_GROUPS.flatMap((g) => g.sliders), VOLUME].map((s) => [s.key, s]),
) as Record<SliderKey, SliderSpec>;

export type ToggleKey = "holo" | "shake" | "muted" | "showFps";

export interface ToggleSpec {
  key: ToggleKey;
  label: string;
  copy: string;
  /** On means the setting is false (Sound on = not muted). */
  invert?: boolean;
}

export interface OptionsTabSpec {
  id: OptionsTab;
  title: string;
  sliders: SliderKey[];
  toggles: ToggleSpec[];
}

/** The tabs of the options window and what each holds. */
export const OPTION_TABS: OptionsTabSpec[] = [
  {
    id: "game",
    title: "Game",
    sliders: ["gameSpeed", "phraseEvery", "phrasePauseMs", "textPauseMs"],
    toggles: [
      { key: "shake", label: "Screen shake", copy: "The recoil when the core is hit. Turn it off if motion bothers you." },
    ],
  },
  {
    id: "display",
    title: "Display",
    sliders: ["fpsCap", "renderScale", "uiScale", "binaryOpacity", "binaryPitch"],
    toggles: [
      { key: "showFps", label: "Frame-rate counter", copy: "Frames drawn each second, in the top-left corner." },
      { key: "holo", label: "Hologram", copy: "Tilt and a violet echo on the text." },
    ],
  },
  {
    id: "text",
    title: "Text",
    sliders: ["textScale", "opacity", "textSize", "density", "flashMs", "wordFlashMs"],
    toggles: [],
  },
  {
    id: "sound",
    title: "Sound",
    sliders: ["volume"],
    toggles: [{ key: "muted", label: "Sound", copy: "Every game sound, on or off.", invert: true }],
  },
  { id: "controls", title: "Controls", sliders: [], toggles: [] },
  { id: "backup", title: "Backup", sliders: [], toggles: [] },
  { id: "advanced", title: "Advanced", sliders: [], toggles: [] },
];
