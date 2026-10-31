import { useRef, useState } from "react";
import { BookOpen, ChevronRight, Minus, Play, Plus, Shield, Upload, X } from "lucide-react";
import { AzsharaMark } from "@/components/game/AzsharaMark";
import { BattleButtons } from "@/components/game/BattleButtons";
import { useChromeInsets } from "@/components/game/useChromeInsets";
import { TextFlashPanel } from "@/components/game/TextFlashPanel";
import { ChessIntro } from "@/components/game/ChessHud";
import { CourtIntro } from "@/components/game/CourtHud";
import { MapPicker, TdStart } from "@/components/game/TdHud";
import {
  FIELD_SPEC,
  flashToast,
  getEngine,
  loadCodexText,
  loadCodexTexts,
  removeText,
  selectText,
  nudgeSetting,
  updateSetting,
} from "@/game/engine";
import { CONFIG } from "@/game/config";
import { accentFor } from "@/game/council";
import { coreDamageMultiplier, coreLevel } from "@/game/recite";
import { getGame } from "@/game/registry";
import { SLIDER_GROUPS, type SliderSpec } from "@/game/sliders";
import { POTIONS, UPGRADES } from "@/game/upgrades";
import { useGame, type Settings } from "@/game/store";
import { openOptions } from "@/game/menu";
import { APP_VERSION } from "@/game/version";

export function FileLoad() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn flex-1" onClick={() => ref.current?.click()}>
        <Upload className="size-4" aria-hidden />
        Load .txt
      </button>
      <input
        ref={ref}
        className="hidden"
        type="file"
        accept=".txt,text/plain"
        multiple
        onChange={(e) => {
          // Pick one file, or several: they are read in turn, 1, 2, 3, then 1 again.
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          void Promise.all(files.map(async (f) => ({ name: f.name, raw: await f.text() }))).then(
            (loaded) => loadCodexTexts(loaded),
            () => flashToast(files.length > 1 ? "Could not read those files" : "Could not read that file"),
          );
        }}
      />
    </>
  );
}

/**
 * The loaded texts, in the order they are read. The one in use is marked; tap
 * another to switch to it now. Only shown when there is more than one.
 */
export function TextList() {
  const texts = useGame((s) => s.texts);
  const current = useGame((s) => s.textIndex);
  if (texts.length < 2) return null;
  return (
    <section className="mt-3" aria-label="Loaded texts">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs tracking-wider text-muted uppercase">
          Texts · {current + 1} of {texts.length}, read in turn
        </p>
        <button type="button" className="btn px-2" onClick={() => selectText(current + 1)}>
          Next
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <ol className="mt-1 space-y-1">
        {texts.map((t, i) => (
          <li key={`${i}-${t.name}`} className="flex items-center gap-1.5">
            <button
              type="button"
              data-on={i === current}
              aria-current={i === current}
              className="min-h-9 min-w-0 flex-1 truncate rounded-md border border-cyan/30 px-2 py-1 text-left text-xs text-cyan data-[on=true]:border-violet data-[on=true]:bg-violet/25 data-[on=true]:text-fg"
              onClick={() => selectText(i)}
            >
              {i + 1}. {t.name}{" "}
              <span className="text-muted">
                · {t.lines.length} sector{t.lines.length === 1 ? "" : "s"}
              </span>
            </button>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-cyan/30 text-muted"
              aria-label={`Remove ${t.name}`}
              onClick={() => removeText(i)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SpeakerLine({ speaker, text, className }: { speaker: string; text: string; className: string }) {
  return (
    <p className={className} aria-live="polite">
      <span className={`block font-display text-[11px] uppercase tracking-[0.18em] ${accentFor(speaker)}`}>
        {speaker}
      </span>
      {text}
    </p>
  );
}

export function TitleScreen() {
  const speaker = useGame((s) => s.hud.speaker);
  const line = useGame((s) => s.hud.line);
  const bestWave = useGame((s) => s.hud.bestWave);
  const bestOi = useGame((s) => s.hud.bestOi);
  const sectors = useGame((s) => s.lines.length);
  const textCount = useGame((s) => s.texts.length);
  const textIndex = useGame((s) => s.textIndex);
  const gameMode = useGame((s) => s.gameMode);
  const level = useGame((s) => coreLevel(s.skills));
  const bonus = Math.round((coreDamageMultiplier(level, CONFIG.core.damagePerLevel, CONFIG.core.maxDamageBonus) - 1) * 100);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-3">
          <AzsharaMark />
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-cyan">LEVEL 3 · NEURO-TOME</p>
            <h1 className="font-display text-3xl leading-none text-fg">
              AZSHARA
              <span className="mt-1 block text-lg tracking-[0.18em] text-violet">SIGNAL DEFENSE</span>
            </h1>
          </div>
        </div>
        {CONFIG.ui.showSpeech ? (
          <SpeakerLine speaker={speaker} text={line} className="min-h-12 text-sm leading-relaxed text-fg" />
        ) : (
          <TextFlashPanel variant="inset" className="h-14" />
        )}
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Sleep-signals rush a wake core. Your text is the ammunition. Tap a shape, or tap anywhere to hit the
          nearest threat. Between waves, spend O/I in the armory on sharper ink, quicker tongue, longer verse, or
          potions. Fiction — not a sleep protocol.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Game mode">
          {(
            [
              ["arcade", "Arcade"],
              ["td", "Tower defense"],
              ["chess", "Auto chess"],
              ["court", "Court"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="btn"
              data-on={gameMode === mode}
              aria-pressed={gameMode === mode}
              onClick={() => useGame.setState({ gameMode: mode })}
            >
              {label}
            </button>
          ))}
        </div>
        {gameMode === "td" && <MapPicker />}
        {gameMode === "chess" && <ChessIntro />}
        {gameMode === "court" && <CourtIntro />}
        <div className="mt-2 flex flex-col gap-2">
          {gameMode === "td" ? (
            <TdStart />
          ) : (
            <button type="button" className="btn w-full" onClick={() => getGame()?.engage()}>
              <Play className="size-4" aria-hidden />
              {gameMode === "chess" ? "Set the board" : gameMode === "court" ? "Enter the Court" : "Engage the wake"}
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => getGame()?.toggleTome()}>
              <BookOpen className="size-4" aria-hidden />
              Open tome
            </button>
            <FileLoad />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => useGame.setState({ panel: "drill" })}>
              Recitation drill
            </button>
            <button type="button" className="btn flex-1" onClick={() => useGame.setState({ panel: "agents" })}>
              Agents
            </button>
            <button type="button" className="btn flex-1" onClick={() => openOptions()}>
              Options
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs tracking-wide text-muted">
          {textCount > 1 ? `text ${textIndex + 1} of ${textCount} · ` : ""}
          {sectors} sector{sectors === 1 ? "" : "s"} loaded
          {bestWave > 0 ? ` · best wave ${bestWave} · O/I ${Math.round(bestOi)}` : " · no rite recorded yet"}
          {` · core level ${level}${bonus > 0 ? `, shots +${bonus}%` : ""}`}
          {APP_VERSION && ` · v${APP_VERSION}`}
        </p>
      </section>
    </div>
  );
}

export function BattleHud() {
  const hud = useGame((s) => s.hud);
  const paused = useGame((s) => s.paused);
  const pct = Math.max(0, Math.min(100, hud.integrity));
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  useChromeInsets(headerRef, footerRef);
  const carrying = hud.potions.salve + hud.potions.draught > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header ref={headerRef} className="pointer-events-auto">
        <div className="glass flex items-center justify-between gap-2 px-3 py-2 font-display text-xs tracking-wider">
          <span className="text-cyan">WAVE {String(hud.wave).padStart(2, "0")}</span>
          <span className="text-fg">{hud.hz.toFixed(1)} Hz</span>
          <span className="text-gold">O/I {Math.round(hud.oi)}</span>
          <span className="text-violet">×{hud.combo}</span>
        </div>
        <div
          className="meter mt-2"
          data-low={pct <= 35}
          data-shield={hud.shield}
          role="meter"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Wake core integrity"
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>Integrity {Math.round(pct)}</span>
          <span>
            {hud.shield
              ? "Queen's shield"
              : hud.slowed
                ? "Clarity draught"
                : hud.gaba
                  ? "GABA drag"
                  : paused
                    ? "Held"
                    : "Core live"}
          </span>
        </div>
      </header>

      <footer ref={footerRef} className="pointer-events-auto">
        {hud.blessingReady && (
          <button type="button" className="btn btn-gold mb-2 w-full" onClick={() => getEngine()?.bless()}>
            <Shield className="size-4" aria-hidden />
            Queen's Blessing
          </button>
        )}
        {hud.blessing > 0 && (
          <div className="meter mb-2" data-shield="true" aria-hidden>
            <span style={{ width: `${Math.round(hud.blessing * 100)}%` }} />
          </div>
        )}
        <TextFlashPanel className="h-20" />
        {carrying && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POTIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="btn"
                disabled={hud.potions[p.key] <= 0}
                onClick={() => getEngine()?.usePotion(p.key)}
              >
                {p.name} ×{hud.potions[p.key]}
              </button>
            ))}
          </div>
        )}
        <BattleButtons />
      </footer>
    </div>
  );
}

/** Between waves: spend O/I on the text weapon and on potions, then start the next wave. */
export function Armory() {
  const hud = useGame((s) => s.hud);
  const oi = Math.round(hud.oi);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto flex max-h-[88%] w-full max-w-md flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-4 py-3">
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-cyan">
              WAVE {String(hud.wave).padStart(2, "0")} SECURED
            </p>
            <h2 className="font-display text-xl text-fg">The armory</h2>
          </div>
          <p className="font-display text-lg text-gold">O/I {oi}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <h3 className="font-display text-xs tracking-[0.16em] text-violet">WEAPON</h3>
          <div className="mt-2 grid gap-2">
            {UPGRADES.map((u) => {
              const level = hud.upgrades[u.key];
              const maxed = level >= u.max;
              const cost = u.cost(level);
              return (
                <div key={u.key} className="rounded-md border border-cyan/30 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-sm text-fg">{u.name}</p>
                    <p className="text-xs text-muted">
                      Lv {level}/{u.max}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{u.copy}</p>
                  <button
                    type="button"
                    className="btn mt-2 w-full"
                    disabled={maxed || oi < cost}
                    onClick={() => getEngine()?.buyUpgrade(u.key)}
                  >
                    {maxed ? "Maxed" : `Upgrade · ${cost} O/I`}
                  </button>
                </div>
              );
            })}
          </div>

          <h3 className="font-display mt-5 text-xs tracking-[0.16em] text-violet">POTIONS</h3>
          <div className="mt-2 grid gap-2">
            {POTIONS.map((p) => {
              const count = hud.potions[p.key];
              const full = count >= p.max;
              return (
                <div key={p.key} className="rounded-md border border-cyan/30 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-sm text-fg">{p.name}</p>
                    <p className="text-xs text-muted">
                      Carrying {count}/{p.max}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{p.copy}</p>
                  <button
                    type="button"
                    className="btn mt-2 w-full"
                    disabled={full || oi < p.cost}
                    onClick={() => getEngine()?.buyPotion(p.key)}
                  >
                    {full ? "Full" : `Buy · ${p.cost} O/I`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <footer className="border-t border-cyan/30 p-3">
          <button type="button" className="btn btn-gold w-full" onClick={() => getEngine()?.nextWave()}>
            Next wave
          </button>
        </footer>
      </section>
    </div>
  );
}

export function GameOver() {
  const hud = useGame((s) => s.hud);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto w-full max-w-md p-4">
        <p className="font-display text-xs tracking-[0.22em] text-danger">CORE DARK</p>
        <h2 className="font-display mt-1 text-2xl text-fg">The rite broke</h2>
        {CONFIG.ui.showSpeech ? (
          <SpeakerLine speaker={hud.speaker} text={hud.line} className="mt-2 min-h-12 text-sm leading-relaxed text-fg" />
        ) : (
          <TextFlashPanel variant="inset" className="mt-2 h-14" />
        )}
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Wave</dt>
            <dd className="font-display text-cyan">{hud.wave}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Wake</dt>
            <dd className="font-display text-fg">{hud.hz.toFixed(1)}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">O/I</dt>
            <dd className="font-display text-gold">{Math.round(hud.oi)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          Best wave {hud.bestWave} · best O/I {Math.round(hud.bestOi)}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn w-full" onClick={() => getGame()?.engage()}>
            Rewrite the rite
          </button>
          <button type="button" className="btn w-full" onClick={() => getGame()?.toTitle()}>
            Return to the glass
          </button>
        </div>
      </section>
    </div>
  );
}

export function TomePanel() {
  const settings = useGame((s) => s.settings);
  const lines = useGame((s) => s.lines);
  const [draft, setDraft] = useState("");

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-bg/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="glass flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <div>
            <h2 className="font-display text-sm tracking-[0.16em] text-cyan">NEURO-TOME</h2>
            <p className="text-xs text-muted">Combat holds. The shell keeps turning. Text stays on this device.</p>
          </div>
          <button type="button" className="btn" onClick={() => getGame()?.toggleTome()}>
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex gap-2">
            <FileLoad />
          </div>
          <p className="mt-1 text-xs text-muted">Pick several .txt files at once to read them in turn: 1, 2, 3, then 1 again.</p>
          <TextList />
          <label className="mt-3 block text-xs tracking-wider text-muted" htmlFor="paste-codex">
            Or paste sectors
          </label>
          <textarea
            id="paste-codex"
            className="mt-1"
            value={draft}
            placeholder="One phrase per line."
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="btn mt-2"
            onClick={() => {
              loadCodexText(draft);
              setDraft("");
            }}
          >
            Commit paste
          </button>

          <div className="mt-5 grid grid-cols-3 gap-2">
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn"
              data-on={settings.holo}
              aria-pressed={settings.holo}
              onClick={() => updateSetting("holo", !settings.holo)}
            >
              Hologram {settings.holo ? "on" : "off"}
            </button>
            <button
              type="button"
              className="btn"
              data-on={settings.shake}
              aria-pressed={settings.shake}
              onClick={() => updateSetting("shake", !settings.shake)}
            >
              Shake {settings.shake ? "on" : "off"}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Field fits your whole text to the screen as whole words. If it cannot fit even at its smallest size,
            the sectors flash one at a time and the list loops. Chaos and sphere float phrases around the core.
            Hologram adds tilt and a violet echo. Shake is the hit recoil — turn it off if motion bothers you.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            ADN is slow pressure. GABA drags your fire when it gets close. VLPO darts. PRS is the heavy signal
            every fifth wave. Six kills without a leak ready the Queen's Blessing: rapid lines and a shield.
          </p>

          {SLIDER_GROUPS.map((group) => (
            <section key={group.title} className="mt-6">
              <h3 className="font-display text-xs tracking-[0.16em] text-violet uppercase">{group.title}</h3>
              {group.sliders.map((slider) => (
                <SliderRow key={slider.key} slider={slider} value={settings[slider.key]} />
              ))}
            </section>
          ))}

          <h3 id="codex-read" className="font-display mt-6 text-sm tracking-[0.16em] text-violet">
            FULL TEXT · {lines.length} SECTORS
          </h3>
          <ol className="mt-3 space-y-3 pb-6">
            {lines.map((line, i) => (
              <li key={`${i}-${line.slice(0, 12)}`} className="text-sm leading-relaxed text-fg">
                <span className="mr-2 text-cyan">{String(i + 1).padStart(2, "0")}</span>
                {line}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export function SliderRow({
  slider,
  value,
  compact = false,
}: {
  slider: SliderSpec;
  value: number;
  /** Smaller help text, for the options window. */
  compact?: boolean;
}) {
  const spec = FIELD_SPEC[slider.key];
  const id = `slider-${slider.key}`;
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs tracking-wider text-muted uppercase">
          {slider.label}
        </label>
        <span className="font-display text-xs text-cyan">{slider.format(value)}</span>
      </div>
      <p id={`${id}-help`} className={compact ? "text-xs leading-snug text-muted/80" : "mt-1 text-sm leading-relaxed text-muted"}>
        {slider.copy}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" className="btn stepper" aria-label={`Decrease ${slider.label}`} onClick={() => nudgeSetting(slider.key, -1)}>
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          id={id}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          aria-describedby={`${id}-help`}
          onChange={(e) => updateSetting(slider.key, Number(e.target.value) as Settings[typeof slider.key])}
        />
        <button type="button" className="btn stepper" aria-label={`Increase ${slider.label}`} onClick={() => nudgeSetting(slider.key, 1)}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  );
}
