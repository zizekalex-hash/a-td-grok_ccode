import { useRef, useState } from "react";
import {
  ArrowUp,
  ChevronsUp,
  Coins,
  Crosshair,
  FastForward,
  Heart,
  Hourglass,
  Pause,
  Play,
  Repeat,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { MenuButton } from "@/components/game/BattleButtons";
import { TextFlashPanel } from "@/components/game/TextFlashPanel";
import { useChromeInsets } from "@/components/game/useChromeInsets";
import { getGame } from "@/game/registry";
import { CONFIG } from "@/game/config";
import { useGame } from "@/game/store";
import {
  buildCost,
  CREEPS,
  DIFFICULTY_KEYS,
  difficulty,
  MAX_TOWER_LEVEL,
  masteryOf,
  PERK_KEYS,
  PERKS,
  perkCost,
  TOWER_KEYS,
  ascensionsOf,
  pathsOf,
  TOWERS,
  towerStats,
  type SpellKey,
} from "@/game/td/economy";
import { MAP_KEYS, MAPS, mapFor, type TdMap } from "@/game/td/map";
import { bestKey, TdGame } from "@/game/td/tdgame";

function game(): TdGame | null {
  const g = getGame();
  return g instanceof TdGame ? g : null;
}

const TARGET_LABEL = { first: "First", last: "Last", strong: "Strong", close: "Close" } as const;

/** Short numbers for the top bar: 21,400 becomes 21.4k. */
function short(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** Every tower, one tap to raise on the selected cell. */
function BuildGrid() {
  const gold = useGame((s) => s.tdView.gold);
  const perks = useGame((s) => s.tdView.perks);
  return (
    <div className={`grid gap-1.5 ${TOWER_KEYS.length > 9 ? "grid-cols-5" : "grid-cols-3"}`}>
      {TOWER_KEYS.map((key, i) => {
        const spec = TOWERS[key];
        const cost = buildCost(key, perks);
        return (
          <button
            key={key}
            type="button"
            className="btn flex-col gap-0 px-1 py-1"
            disabled={gold < cost}
            title={`${spec.name}: ${spec.copy} (key ${(i + 1) % 10})`}
            aria-label={`Build ${spec.name}, ${spec.role}, ${cost} O/I`}
            onClick={() => game()?.tdBuild(key)}
          >
            <span
              className="font-display text-[0.7rem]"
              style={{ color: gold < cost ? undefined : spec.color }}
            >
              {spec.name}
            </span>
            <span className="text-[0.6rem] tracking-normal normal-case opacity-80">
              {spec.role} · {cost}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The selected tower: what it does, and what to do with it. */
function TowerPanel() {
  const tower = useGame((s) => s.tdView.tower);
  const gold = useGame((s) => s.tdView.gold);
  const perks = useGame((s) => s.tdView.perks);
  if (!tower) return null;
  const spec = TOWERS[tower.key];
  const stats = towerStats(tower.key, tower.level, perks, tower.path, tower.ascend);
  const paths = pathsOf(tower.key);
  const path = paths[tower.path];
  const ascensions = ascensionsOf(tower.key);
  const ascended = ascensions[tower.ascend];
  const mastery = masteryOf(tower.level);
  const fires = stats.rate > 0;
  const effect = fires
    ? `Damage ${tower.damage.toFixed(0)}${tower.aura > 0 ? ` (+${Math.round(tower.aura * 100)}% Muse)` : ""} · ${(tower.rate * (1 + tower.haste)).toFixed(2)}/s${tower.haste > 0 ? ` (+${Math.round(tower.haste * 100)}% Tempo)` : ""} · range ${tower.range.toFixed(1)}${
        stats.splash ? ` · blast ${stats.splash.toFixed(1)}` : ""
      }${stats.slow ? ` · slows ${Math.round(stats.slow * 100)}%` : ""}${stats.chain ? ` · jumps ${stats.chain}` : ""}${stats.burn ? ` · burns ${(stats.burn * (1 + tower.aura)).toFixed(0)}/s` : ""}`
    : stats.aura || stats.haste
      ? `Towers in its circle (${stats.range.toFixed(1)}) deal ${Math.round(stats.aura * 100)}% more damage${stats.haste ? ` and fire ${Math.round(stats.haste * 100)}% faster` : ""}. Boosting ${tower.boosts} now.`
      : stats.vuln || stats.shred
        ? `Creeps in its circle (${stats.range.toFixed(1)}) take ${Math.round(stats.vuln * 100)}% more damage${stats.shred ? ` and lose ${Math.round(stats.shred * 100)}% of their armor` : ""}.`
        : `Pays ${Math.round(stats.income)} O/I every time a wave clears${stats.bounty ? `; kills pay ${Math.round(stats.bounty * 100)}% more` : ""}.`;
  const canPath = tower.level >= MAX_TOWER_LEVEL && tower.path < 0 && paths.length > 0;
  const canAscend =
    tower.level >= CONFIG.td.ascendLevel && tower.path >= 0 && tower.ascend < 0 && ascensions.length > 0;
  // The two choices on offer now, if any: a path at level 5, an Ascension at level 10.
  const offer = canPath
    ? { label: "Choose a path", items: paths, cost: tower.pathCost, pick: (i: number) => game()?.tdPath(i), prefix: "" }
    : canAscend
      ? {
          label: "Choose an Ascension",
          items: ascensions,
          cost: tower.ascendCost,
          pick: (i: number) => game()?.tdAscend(i),
          prefix: "Ascend: ",
        }
      : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-sm" style={{ color: spec.color }}>
          {spec.name} · Lv {Math.min(tower.level, MAX_TOWER_LEVEL)}
          {mastery > 0 && <span className="text-gold"> ★{mastery}</span>}
          {path && <span className="text-violet"> · {path.name}</span>}
          {ascended && <span className="text-gold"> · {ascended.name}</span>}
        </p>
        <p className="text-xs text-muted">{spec.role}</p>
      </div>
      <p className="mt-1 text-xs leading-snug text-fg">{effect}</p>
      {/* With a path to choose, its two buttons take this line's place, so the panel still fits. */}
      {!offer && (
        <p className="mt-0.5 text-xs leading-snug text-muted">
          {fires || tower.dealt > 0 ? `Dealt ${short(tower.dealt)} · ${short(tower.kills)} kills. ` : ""}
          {ascended ? ascended.copy : path ? path.copy : spec.copy}
        </p>
      )}
      {offer && (
        <div className="mt-1 grid grid-cols-2 gap-1.5" role="group" aria-label={offer.label}>
          {offer.items.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className="btn h-auto flex-col items-start gap-0 text-left"
              disabled={gold < offer.cost}
              onClick={() => offer.pick(i)}
              aria-label={`${offer.prefix}${p.name} for ${offer.cost} O/I: ${p.copy}`}
            >
              <span className={`font-display text-[0.7rem] ${canAscend ? "text-gold" : "text-violet"}`}>
                {offer.prefix}
                {p.name} · {short(offer.cost)}
              </span>
              <span className="text-[0.6rem] leading-tight tracking-normal normal-case opacity-90">{p.copy}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={gold < tower.upgradeCost}
          onClick={() => game()?.tdUpgrade()}
          aria-label={`${tower.level >= MAX_TOWER_LEVEL ? "Mastery" : "Upgrade"} for ${tower.upgradeCost} O/I`}
        >
          <span className="flex items-center gap-1">
            <ArrowUp className="size-3.5" aria-hidden />
            {tower.level >= MAX_TOWER_LEVEL ? "Mastery" : "Upgrade"}
          </span>
          <span className="text-[0.6rem] tracking-normal">{tower.upgradeCost} O/I</span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={tower.maxLevels < 1}
          onClick={() => game()?.tdUpgradeMax()}
          aria-label={`Upgrade ${tower.maxLevels} levels for ${tower.maxCost} O/I`}
        >
          <span className="flex items-center gap-1">
            <ChevronsUp className="size-3.5" aria-hidden />
            Max{tower.maxLevels > 0 ? ` ×${tower.maxLevels}` : ""}
          </span>
          <span className="text-[0.6rem] tracking-normal">{tower.maxLevels > 0 ? `${short(tower.maxCost)} O/I` : "—"}</span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={!fires}
          onClick={() => game()?.tdTarget()}
          aria-label={`Targeting: ${TARGET_LABEL[tower.targeting]}. Tap to change.`}
        >
          <span className="flex items-center gap-1">
            <Crosshair className="size-3.5" aria-hidden />
            Target
          </span>
          <span className="text-[0.6rem] tracking-normal">
            {fires ? TARGET_LABEL[tower.targeting] : "none"}
          </span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          onClick={() => game()?.tdSell()}
          aria-label={`${tower.undo ? "Undo the build" : "Sell"} for ${tower.sellValue} O/I`}
        >
          <span className="flex items-center gap-1">
            <Trash2 className="size-3.5" aria-hidden />
            {tower.undo ? "Undo" : "Sell"}
          </span>
          <span className="text-[0.6rem] tracking-normal">+{tower.sellValue} O/I</span>
        </button>
      </div>
    </div>
  );
}

/** Global upgrades bought with O/I. Opening it does not pause the fight. */
function PerkSheet({ onClose }: { onClose: () => void }) {
  const gold = useGame((s) => s.tdView.gold);
  const perks = useGame((s) => s.tdView.perks);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <section
        className="glass pointer-events-auto flex max-h-[58dvh] w-full max-w-xl flex-col"
        role="dialog"
        aria-label="Library"
      >
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <div>
            <h2 className="font-display text-sm tracking-[0.16em] text-cyan">THE LIBRARY</h2>
            <p className="text-xs text-muted">Upgrades for every tower. The fight keeps going.</p>
          </div>
          <p className="font-display text-sm whitespace-nowrap text-gold">O/I {Math.floor(gold)}</p>
          <button type="button" className="btn" onClick={onClose} aria-label="Close library">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {PERK_KEYS.map((key) => {
            const spec = PERKS[key];
            const level = perks[key];
            const maxed = level >= spec.max;
            const cost = perkCost(key, level);
            return (
              <div key={key} className="rounded-md border border-cyan/30 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-xs text-fg">{spec.name}</p>
                  <p className="text-xs text-muted">
                    {level}/{spec.max}
                  </p>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{spec.copy}</p>
                <button
                  type="button"
                  className="btn mt-2 w-full"
                  disabled={maxed || gold < cost}
                  onClick={() => game()?.tdBuyPerk(key)}
                >
                  {maxed ? "Complete" : `Learn · ${cost}`}
                </button>
              </div>
            );
          })}
          <div className="rounded-md border border-cyan/30 p-2 sm:col-span-2">
            <p className="font-display text-xs text-fg">This run</p>
            <DamageReport />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Damage and kills by tower kind this run, as bars. */
function DamageReport({ limit = 10 }: { limit?: number }) {
  const report = useGame((s) => s.tdView.report);
  if (!report.length) return <p className="mt-1 text-xs text-muted">No damage dealt yet.</p>;
  const top = report[0]?.dealt || 1;
  const total = report.reduce((n, r) => n + r.dealt, 0) || 1;
  return (
    <ul className="mt-1 space-y-1" aria-label="Damage by tower">
      {report.slice(0, limit).map((r) => (
        <li key={r.key} className="text-xs">
          <div className="flex justify-between gap-2">
            <span style={{ color: TOWERS[r.key].color }}>{TOWERS[r.key].name}</span>
            <span className="text-muted">
              {short(r.dealt)} · {Math.round((r.dealt / total) * 100)}% · {short(r.kills)} kills
            </span>
          </div>
          <div className="mt-0.5 h-1 rounded bg-cyan/10">
            <div className="h-1 rounded" style={{ width: `${(r.dealt / top) * 100}%`, background: TOWERS[r.key].color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A spell button: what it does, and the seconds until it is ready again. */
function SpellButton({ spell, hotkey }: { spell: SpellKey; hotkey: string }) {
  const left = useGame((s) => s.tdView.spells[spell]);
  const spec = CONFIG.td.spells[spell];
  const ready = left <= 0;
  const Icon = spell === "storm" ? Zap : Hourglass;
  return (
    <button
      type="button"
      className={`btn flex-col gap-0 px-1 ${ready ? "text-gold" : ""}`}
      disabled={!ready}
      title={`${spec.name}: ${spec.copy} (key ${hotkey})`}
      aria-label={`${spec.name}${ready ? "" : `, ready in ${Math.ceil(left)} seconds`}`}
      onClick={() => game()?.tdSpell(spell)}
    >
      <Icon className="size-4" aria-hidden />
      <span className="text-[0.6rem] tracking-normal normal-case">{ready ? spec.name : `${Math.ceil(left)} s`}</span>
    </button>
  );
}

/** The creeps the next wave brings, by kind. */
function NextWave() {
  const next = useGame((s) => s.tdView.next);
  const wave = useGame((s) => s.tdView.wave);
  const boss = useGame((s) => s.tdView.boss);
  return (
    <p className="mt-1 truncate text-[0.7rem] text-muted" aria-label="Next wave">
      {/* A boss on the board comes first: how much life it has left. */}
      {boss && (
        <span className="mr-2 whitespace-nowrap" style={{ color: CREEPS[boss.kind].color }}>
          ◆ {CREEPS[boss.kind].name} {Math.ceil(boss.pct * 100)}% ·
        </span>
      )}
      <span className="text-fg">Wave {wave + 1}:</span>{" "}
      {next.map((r) => (
        <span key={r.kind} className="mr-1.5 whitespace-nowrap" title={CREEPS[r.kind].name}>
          <span style={{ color: CREEPS[r.kind].color }} aria-hidden>
            {r.boss ? "◆" : "●"}
          </span>{" "}
          {r.boss ? CREEPS[r.kind].name : `${r.count} ${CREEPS[r.kind].label}`}
        </span>
      ))}
    </p>
  );
}

export function TdHud() {
  const v = useGame((s) => s.tdView);
  const paused = useGame((s) => s.paused);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  useChromeInsets(headerRef, footerRef);
  const [perksOpen, setPerksOpen] = useState(false);
  const lifePct = Math.max(0, Math.min(100, (v.lives / Math.max(1, v.maxLives)) * 100));
  const status = paused
    ? "Held"
    : v.active > 0
      ? `${v.active} wave${v.active > 1 ? "s" : ""} running · ${v.pending} to come`
      : "Build phase";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header ref={headerRef} className="pointer-events-auto">
        <div className="glass flex items-center justify-between gap-2 px-3 py-2 font-display text-xs tracking-wider whitespace-nowrap">
          <span
            className="flex items-center gap-1 text-gold"
            aria-label={`${Math.floor(v.gold)} O/I`}
          >
            <Coins className="size-3.5" aria-hidden /> {short(v.gold)}
          </span>
          <span
            className="flex items-center gap-1 text-danger"
            aria-label={`${Math.round(v.lives)} lives`}
          >
            <Heart className="size-3.5" aria-hidden /> {short(v.lives)}
          </span>
          <span className="text-cyan">WAVE {String(v.wave).padStart(2, "0")}</span>
          <span className="text-fg">{short(v.kills)} down</span>
        </div>
        <div
          className="meter mt-2"
          data-low={lifePct <= 35}
          role="meter"
          aria-label="Core lives"
          aria-valuenow={Math.round(lifePct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${lifePct}%` }} />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>
            Cleared {v.cleared} · best {v.bestWave}
          </span>
          <span className="text-right">{status}</span>
        </div>
        <NextWave />
      </header>

      <footer
        ref={footerRef}
        className="pointer-events-auto mx-auto w-full max-w-xl lg:absolute lg:right-3 lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:w-[22rem]"
      >
        <div className="glass h-[11.25rem] overflow-y-auto p-2">
          {v.canBuild && <BuildGrid />}
          {v.tower && <TowerPanel />}
          {!v.canBuild && !v.tower && (
            <p className="p-1 text-sm leading-relaxed text-muted">
              {v.selected
                ? "The lane and the core take no towers. Pick a free cell."
                : "Tap a free cell to raise one of ten towers, or a tower to upgrade it. Waves never end: call the next one early for bonus O/I, even while one is running, and they stack."}
            </p>
          )}
        </div>

        <p className="mt-1.5 min-h-4 text-center text-xs text-gold" role="status">
          {v.message}
        </p>

        <TextFlashPanel className="mt-1.5 h-16" />

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <button
            type="button"
            className={`btn flex-col gap-0 px-1 ${v.active === 0 ? "btn-gold" : ""}`}
            onClick={() => game()?.tdSendWave()}
            aria-label={`Call wave ${v.wave + 1}${v.nextBonus ? `, ${v.nextBonus} O/I early bonus` : ""}${v.bossNext ? ", boss wave" : ""}`}
          >
            <span className="flex items-center gap-1">
              <Swords className="size-4" aria-hidden />
              Wave {v.wave + 1}
            </span>
            <span className="text-[0.6rem] tracking-normal normal-case">
              {v.bossNext ? "boss" : ""}
              {v.bossNext && v.nextBonus ? " · " : ""}
              {v.nextBonus ? `+${v.nextBonus} early` : v.bossNext ? "" : "call it"}
            </span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            data-on={v.auto}
            aria-pressed={v.auto}
            onClick={() => game()?.tdToggleAuto()}
          >
            <Repeat className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal normal-case">Auto</span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            onClick={() => game()?.tdCycleSpeed()}
            aria-label={`Speed ${v.speed} times`}
          >
            <FastForward className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal">{v.speed}×</span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            data-on={perksOpen}
            aria-pressed={perksOpen}
            onClick={() => setPerksOpen((o) => !o)}
          >
            <Sparkles className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal normal-case">Library</span>
          </button>
          <SpellButton spell="storm" hotkey="Q" />
          <SpellButton spell="still" hotkey="E" />
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            data-on={paused}
            onClick={() => game()?.togglePause()}
          >
            {paused ? (
              <Play className="size-4" aria-hidden />
            ) : (
              <Pause className="size-4" aria-hidden />
            )}
            <span className="text-[0.6rem] tracking-normal normal-case">{paused ? "Resume" : "Hold"}</span>
          </button>
          <MenuButton className="btn flex-col gap-0 px-1" compact />
        </div>
      </footer>

      {perksOpen && <PerkSheet onClose={() => setPerksOpen(false)} />}
    </div>
  );
}

/** A map's lane, drawn small: the gate is the open end, the core the gold dot. */
function LaneThumb({ map }: { map: TdMap }) {
  const points = map.waypoints.map(([c, r]) => `${c + 0.5},${r + 0.5}`).join(" ");
  return (
    <svg viewBox="0 0 9 9" className="size-10" aria-hidden>
      <rect
        x="0.1"
        y="0.1"
        width="8.8"
        height="8.8"
        rx="0.4"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="0.15"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={map.core[0] + 0.5} cy={map.core[1] + 0.5} r="0.85" fill="var(--color-gold)" />
    </svg>
  );
}

/** Map choice on the title screen. The board behind it changes as soon as one is picked. */
export function MapPicker() {
  const current = mapFor(useGame((s) => s.tdMap));
  const bests = useGame((s) => s.tdView.bests);
  const level = useGame((s) => s.tdDifficulty);
  const best = bests[bestKey(current.key, level)] ?? 0;
  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="radiogroup" aria-label="Map">
        {MAP_KEYS.map((key) => {
          const map = MAPS[key] as TdMap;
          const on = key === current.key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              data-on={on}
              className="flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-md border border-cyan/40 px-0.5 py-1.5 text-[0.65rem] leading-none tracking-normal text-cyan transition-colors focus-visible:outline-2 focus-visible:outline-cyan data-[on=true]:border-violet data-[on=true]:bg-violet/25 data-[on=true]:text-fg"
              onClick={() => useGame.setState({ tdMap: key })}
            >
              <LaneThumb map={map} />
              <span className="w-full truncate text-center">{map.name}</span>
              <Medal best={bests[bestKey(key, level)] ?? 0} />
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTY_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === level}
            data-on={key === level}
            className="btn min-h-9 py-1 text-[0.7rem]"
            title={difficulty(key).copy}
            onClick={() => useGame.setState({ tdDifficulty: key })}
          >
            {difficulty(key).name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        <span className="text-fg">{current.name}</span> · lane {current.length} cells
        {best > 0 ? ` · best wave ${best}` : ""}. {current.blurb} {difficulty(level).copy}
      </p>
    </div>
  );
}

const MEDAL_COLORS = ["#cd7f32", "#d8dee9", "var(--color-gold)"];
const MEDAL_NAMES = ["Bronze", "Silver", "Gold"];

/** Bronze, silver or gold for the best wave cleared on a map, at the difficulty picked. */
function Medal({ best }: { best: number }) {
  const won = CONFIG.td.medals.filter((n) => best >= n).length;
  return (
    <span className="h-3 text-[0.6rem] leading-none tracking-[0.15em]" aria-label={won ? `${MEDAL_NAMES[won - 1]} medal` : "No medal yet"}>
      {CONFIG.td.medals.map((n, i) => (
        <span key={n} style={{ color: i < won ? MEDAL_COLORS[i] : "rgba(244, 247, 255, 0.2)" }} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

/** Title buttons for tower defense: carry on a saved run, or start a new one. */
export function TdStart() {
  const run = useGame((s) => s.tdRun);
  const [confirm, setConfirm] = useState(false);
  const map = run ? mapFor(run.map) : null;
  return (
    <>
      {run && map && (
        <button type="button" className="btn btn-gold w-full" onClick={() => game()?.continueRun()}>
          <Play className="size-4" aria-hidden />
          Continue · wave {run.wave} · {map.name}
          {run.difficulty !== "normal" ? ` · ${difficulty(run.difficulty).name}` : ""}
        </button>
      )}
      <button
        type="button"
        className="btn w-full"
        data-on={confirm}
        onClick={() => {
          if (run && !confirm) {
            setConfirm(true);
            return;
          }
          setConfirm(false);
          game()?.engage();
        }}
      >
        <Swords className="size-4" aria-hidden />
        {!run ? "Start the defense" : confirm ? "Tap again: the saved run will be replaced" : "New defense"}
      </button>
    </>
  );
}

/** Shown when the core falls. */
export function TdOver() {
  const v = useGame((s) => s.tdView);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto w-full max-w-md p-4">
        <p className="font-display text-xs tracking-[0.22em] text-danger">CORE BREACHED</p>
        <h2 className="font-display mt-1 text-2xl text-fg">The rite broke</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Cleared</dt>
            <dd className="font-display text-cyan">{v.cleared}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Kills</dt>
            <dd className="font-display text-fg">{v.kills}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Best</dt>
            <dd className="font-display text-gold">{v.bestWave}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">{v.message}</p>
        <div className="mt-3">
          <p className="font-display text-xs tracking-[0.16em] text-violet">DAMAGE BY TOWER</p>
          <DamageReport limit={5} />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn w-full" onClick={() => game()?.engage()}>
            <Shield className="size-4" aria-hidden />
            Defend again
          </button>
          <button type="button" className="btn w-full" onClick={() => game()?.toTitle()}>
            Return to the glass
          </button>
        </div>
      </section>
    </div>
  );
}
