import { BookOpen, ImageDown, RotateCcw, X } from "lucide-react";
import { BackupPanel } from "@/components/game/BackupPanel";
import { CfgEditor } from "@/components/game/CfgEditor";
import { FileLoad, SliderRow, TextList } from "@/components/game/Chrome";
import { saveRawJpg } from "@/game/coreImage";
import { flashToast, updateSetting } from "@/game/engine";
import { closeOptions } from "@/game/menu";
import { getGame } from "@/game/registry";
import { OPTION_TABS, SLIDERS, type ToggleSpec } from "@/game/sliders";
import { defaultSettings, useGame, type Settings } from "@/game/store";

/** Keys and taps, per mode. */
const CONTROLS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Everywhere",
    rows: [
      ["Esc", "Open the menu; close the window on top"],
      ["Menu button", "The same as Esc, on a phone"],
      ["Space", "Hold or resume the fight"],
    ],
  },
  {
    title: "Arcade",
    rows: [
      ["Tap a shape", "Fire your text at it"],
      ["Tap anywhere", "Hit the nearest threat"],
      ["B", "The Queen's Blessing, when it is ready"],
    ],
  },
  {
    title: "Tower defense",
    rows: [
      ["Tap a cell", "Select it; tap again to clear"],
      ["1 to 9, 0", "Build a tower on the selected cell"],
      ["N", "Call the next wave"],
      ["A", "Auto waves on or off"],
      ["F", "Speed 1×, 2× or 3×"],
      ["U · M · S · T", "Upgrade · max upgrade · sell · change targeting"],
      ["Q · E", "Ink Storm · Stillness"],
      ["Level 5 tower", "Tap a path in its panel"],
      ["Esc", "Clear the selection"],
    ],
  },
  {
    title: "Court",
    rows: [
      ["Tap the ground", "Walk there"],
      ["Tap a place", "Walk to its door and open it"],
      ["Tap a queen", "Walk to her and talk"],
      ["Recited ✓", "Once each time you finish the phrase"],
      ["Space or Enter", "The same as Recited ✓"],
      ["X", "Switch Fire and Water style"],
      ["Esc", "Leave a session or close a sheet"],
    ],
  },
  {
    title: "Auto chess",
    rows: [
      ["Tap a shop card", "Buy it: onto the board if there is room, else the bench"],
      ["Tap a piece", "Pick it, to see it or sell it"],
      ["Tap a square", "Move the picked piece there"],
      ["Drag a piece", "Move or swap it"],
      ["1 to 5", "Buy from the shop"],
      ["G or Enter", "Fight"],
      ["D · X · S", "New shop · buy XP · sell"],
      ["F", "Speed 1×, 2× or 3×"],
    ],
  },
];

function Toggle({ spec, settings }: { spec: ToggleSpec; settings: Settings }) {
  const raw = settings[spec.key];
  const on = spec.invert ? !raw : raw;
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs tracking-wider text-muted uppercase">{spec.label}</p>
        <p className="text-xs leading-snug text-muted/80">{spec.copy}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={spec.label}
        data-on={on}
        className="btn w-20 shrink-0"
        onClick={() => updateSetting(spec.key, !raw)}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}

/**
 * The options window: tabs of settings that change at once, while the game runs,
 * plus the controls and the advanced cfg.
 */
export function OptionsWindow() {
  const tabId = useGame((s) => s.optionsTab);
  const settings = useGame((s) => s.settings);
  const tab = OPTION_TABS.find((t) => t.id === tabId) ?? OPTION_TABS[0];
  if (!tab) return null;
  const resetTab = () => {
    for (const key of tab.sliders) updateSetting(key, defaultSettings[key]);
    for (const t of tab.toggles) updateSetting(t.key, defaultSettings[t.key]);
    if (tab.id === "game") updateSetting("mode", defaultSettings.mode);
    flashToast(`${tab.title} back to defaults`);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto flex max-h-[80dvh] w-full max-w-2xl flex-col" role="dialog" aria-label="Options">
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <div>
            <h2 className="font-display text-sm tracking-[0.16em] text-cyan">OPTIONS</h2>
            <p className="text-xs text-muted">Changes show at once. Esc closes.</p>
          </div>
          <button type="button" className="btn" onClick={closeOptions} aria-label="Close options">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-cyan/20 p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0"
            role="tablist"
            aria-label="Options sections"
          >
            {OPTION_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tab.id}
                data-on={t.id === tab.id}
                className="shrink-0 rounded-md border border-transparent px-2.5 py-1.5 text-left font-display text-[0.7rem] tracking-wider text-cyan uppercase data-[on=true]:border-violet data-[on=true]:bg-violet/25 data-[on=true]:text-fg"
                onClick={() => useGame.setState({ optionsTab: t.id })}
              >
                {t.title}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4" role="tabpanel" aria-label={tab.title}>
            {tab.id === "game" && (
              <div className="mt-3">
                <p className="text-xs tracking-wider text-muted uppercase">Arcade text</p>
                <div className="mt-1 grid grid-cols-3 gap-2" role="group" aria-label="Arcade text mode">
                  {(
                    [
                      ["field", "Field"],
                      ["chaos", "Chaos"],
                      ["sphere", "Sphere"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className="btn"
                      data-on={settings.mode === mode}
                      aria-pressed={settings.mode === mode}
                      onClick={() => updateSetting("mode", mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab.toggles.map((t) => (
              <Toggle key={t.key} spec={t} settings={settings} />
            ))}
            {tab.sliders.map((key) => (
              <SliderRow key={key} slider={SLIDERS[key]} value={settings[key]} compact />
            ))}
            {tab.id === "text" && <TextList />}
            {tab.id === "text" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <FileLoad />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    saveRawJpg(useGame.getState().lines);
                    flashToast("Text image saved");
                  }}
                >
                  <ImageDown className="size-4" aria-hidden />
                  Save image
                </button>
                <button
                  type="button"
                  className="btn col-span-2"
                  onClick={() => {
                    closeOptions();
                    getGame()?.toggleTome();
                  }}
                >
                  <BookOpen className="size-4" aria-hidden />
                  Open the tome
                </button>
              </div>
            )}
            {tab.id === "controls" &&
              CONTROLS.map((group) => (
                <section key={group.title} className="mt-3">
                  <h3 className="font-display text-xs tracking-[0.16em] text-violet uppercase">{group.title}</h3>
                  <dl className="mt-1 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                    {group.rows.map(([key, what]) => (
                      <div key={key} className="contents">
                        <dt className="font-display text-cyan">{key}</dt>
                        <dd className="text-muted">{what}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            {tab.id === "backup" && <BackupPanel />}
            {tab.id === "advanced" && (
              <div className="mt-3">
                <CfgEditor />
              </div>
            )}
            {(tab.sliders.length > 0 || tab.toggles.length > 0) && (
              <button type="button" className="btn mt-5 w-full" onClick={resetTab}>
                <RotateCcw className="size-4" aria-hidden />
                Reset {tab.title.toLowerCase()} to defaults
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
