import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Atom,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  Coins,
  Crosshair,
  FastForward,
  Flame,
  Heart,
  Hourglass,
  Info,
  Link2,
  Maximize2,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  Repeat,
  Settings2,
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
import { addItem, readReps, writeReps, type RepItem } from "@/game/reps";
import {
  batches,
  batchMs,
  clampOpacity,
  clampScale,
  clampSpot,
  clampLabelSize,
  clampTapSize,
  readRepUi,
  writeRepUi,
  type RepUi,
} from "@/game/td/repui";
import {
  buildCost,
  CREEPS,
  CURRENCY_NAME,
  DIFFICULTY_KEYS,
  difficulty,
  MAX_TOWER_LEVEL,
  masteryOf,
  PERK_KEYS,
  PERKS,
  perkCost,
  TOWER_KEYS,
  VOID_PERK_KEYS,
  VOID_PERKS,
  VOID_TOWER_KEYS,
  voidPerkCost,
  WAKE_TOWER_KEYS,
  ascensionsOf,
  pathsOf,
  TOWERS,
  towerStats,
  type SpellKey,
  type TowerKey,
  batchFlux,
  repsToGrowth,
} from "@/game/td/economy";
import {
  boardCount,
  MAP_KEYS,
  MAPS,
  mapFor,
  maxStitch,
  stitchKey,
  stitchKeys,
  stitchScale,
  type TdMap,
} from "@/game/td/map";
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

type BuildTab = "towers" | "void" | "wake";
/** The build menu's tab and its info switch, kept while the game is open, so the next cell opens on the same set. */
const buildMenu: { tab: BuildTab; info: boolean } = { tab: "towers", info: false };

/**
 * Every tower, one tap to raise on the selected cell: the towers (O/I), the void
 * set (flux), or the wake set (ATP). With the info switch on, a tap shows what
 * the tower does first, with a button to build it.
 */
function BuildGrid() {
  const gold = useGame((s) => s.tdView.gold);
  const flux = useGame((s) => s.tdView.flux);
  const atp = useGame((s) => s.tdView.atp);
  const perks = useGame((s) => s.tdView.perks);
  const [tab, setTabState] = useState<BuildTab>(buildMenu.tab);
  const [info, setInfoState] = useState(buildMenu.info);
  const [shown, setShown] = useState<TowerKey | null>(null);
  const setTab = (next: BuildTab) => {
    buildMenu.tab = next;
    setTabState(next);
    setShown(null);
  };
  const keys = tab === "void" ? VOID_TOWER_KEYS : tab === "wake" ? WAKE_TOWER_KEYS : TOWER_KEYS;
  const money = tab === "void" ? flux : tab === "wake" ? atp : gold;
  const unit = tab === "void" ? "flux" : tab === "wake" ? "ATP" : "O/I";
  const mark = tab === "void" ? " ◆" : tab === "wake" ? " ✦" : "";
  // Names fit a button only when the whole set's are short; otherwise the set shows its short forms, as on the board.
  const byName = keys.every((key) => TOWERS[key].name.length <= 7);
  const spec = shown ? TOWERS[shown] : null;
  return (
    <div>
    {/* A tower's card takes the whole panel: the tabs come back with the list. */}
    <div className={`mb-1.5 grid-cols-[1fr_1fr_1fr_auto] gap-1.5 ${spec ? "hidden" : "grid"}`}>
      <div className="col-span-3 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Tower sets">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "towers"}
          data-on={tab === "towers"}
          className="btn btn-tab"
          onClick={() => setTab("towers")}
          aria-label="Towers, paid in O/I"
        >
          Towers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "void"}
          data-on={tab === "void"}
          className="btn btn-tab"
          onClick={() => setTab("void")}
          aria-label={`The void set, paid in flux: ${Math.floor(flux)} flux`}
        >
          <Atom className="size-3.5 shrink-0" aria-hidden /> Void {short(flux)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "wake"}
          data-on={tab === "wake"}
          className="btn btn-tab"
          onClick={() => setTab("wake")}
          aria-label={`The wake set, paid in ATP: ${Math.floor(atp)} ATP`}
        >
          <Flame className="size-3.5 shrink-0" aria-hidden /> Wake {short(atp)}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-tab"
        data-on={info}
        aria-pressed={info}
        onClick={() => {
          buildMenu.info = !info;
          setInfoState(!info);
          setShown(null);
        }}
        aria-label="Show what a tower does before building it"
        title="Show what a tower does before building it"
      >
        <Info className="size-4" aria-hidden />
      </button>
    </div>
    {spec && shown ? (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-sm" style={{ color: spec.color }}>
            {spec.name}
          </p>
          <p className="text-xs text-muted">
            {spec.role} · {buildCost(shown, perks)} {unit}
          </p>
        </div>
        <p className="mt-1 text-xs leading-snug text-fg">{spec.copy}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted">
          Level {MAX_TOWER_LEVEL}: {pathsOf(shown).map((p) => p.name).join(" or ")}. Level {CONFIG.td.ascendLevel}:{" "}
          {ascensionsOf(shown).map((p) => p.name).join(" or ")}.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="btn btn-tab"
            disabled={money < buildCost(shown, perks)}
            onClick={() => {
              game()?.tdBuild(shown);
              setShown(null);
            }}
          >
            Build · {buildCost(shown, perks)}
            {mark || " O/I"}
          </button>
          <button type="button" className="btn btn-tab" onClick={() => setShown(null)}>
            Back
          </button>
        </div>
      </div>
    ) : (
    <div className={`grid gap-1.5 ${keys.length > 9 ? "grid-cols-5" : "grid-cols-3"}`}>
      {keys.map((key, i) => {
        const spec = TOWERS[key];
        const cost = buildCost(key, perks);
        return (
          <button
            key={key}
            type="button"
            className="btn btn-tower flex-col gap-0"
            // With info on, a tower can be read about even when it cannot be paid for yet.
            disabled={!info && money < cost}
            title={`${spec.name}: ${spec.copy}${tab === "towers" ? ` (key ${(i + 1) % 10})` : ""}`}
            aria-label={`${info ? "About" : "Build"} ${spec.name}, ${spec.role}, ${cost} ${unit}`}
            onClick={() => (info ? setShown(key) : game()?.tdBuild(key))}
          >
            <span
              className="font-display text-[0.66rem] whitespace-nowrap"
              style={{ color: money < cost ? undefined : spec.color }}
            >
              {byName ? spec.name : spec.label}
            </span>
            <span className="text-[0.6rem] tracking-normal whitespace-nowrap normal-case opacity-80">{spec.role}</span>
            <span className="text-[0.6rem] tracking-normal whitespace-nowrap normal-case opacity-80">
              {cost}
              {mark}
            </span>
          </button>
        );
      })}
    </div>
    )}
    </div>
  );
}

/** The selected tower: what it does, and what to do with it. */
function TowerPanel() {
  const tower = useGame((s) => s.tdView.tower);
  const gold = useGame((s) => s.tdView.gold);
  const flux = useGame((s) => s.tdView.flux);
  const perks = useGame((s) => s.tdView.perks);
  const voidPerks = useGame((s) => s.tdView.voidPerks);
  const atp = useGame((s) => s.tdView.atp);
  if (!tower) return null;
  // A void tower is paid in flux and a wake tower in ATP: every price below is in the tower's currency.
  const money = tower.currency === "flux" ? flux : tower.currency === "atp" ? atp : gold;
  const unit = CURRENCY_NAME[tower.currency];
  const spec = TOWERS[tower.key];
  const stats = towerStats(tower.key, tower.level, perks, tower.path, tower.ascend, voidPerks);
  const paths = pathsOf(tower.key);
  const path = paths[tower.path];
  const ascensions = ascensionsOf(tower.key);
  const ascended = ascensions[tower.ascend];
  const mastery = masteryOf(tower.level);
  const fires = stats.rate > 0;
  // What the wake set adds to a hit, each only when the tower has it.
  const wake = `${stats.multi ? ` · ${stats.multi + 1} creeps at once` : ""}${stats.spikeEvery ? ` · every ${stats.spikeEvery}${stats.spikeEvery === 3 ? "rd" : "th"} ×${stats.spikeMult}` : ""}${stats.stun ? ` · stops ${stats.stun.toFixed(1)} s` : ""}${stats.block ? ` · no mending ${stats.block.toFixed(1)} s` : ""}${stats.corrode ? ` · wears ${Math.round(stats.corrode * 100)} armor a hit` : ""}${stats.rend ? ` · −${(stats.rend * 100).toFixed(1)}% of life left a pulse` : ""}`;
  const pays = [
    stats.atpIncome ? `${Math.round(stats.atpIncome)} ATP` : "",
    stats.fluxIncome ? `${Math.round(stats.fluxIncome)} flux` : "",
    stats.income ? `${Math.round(stats.income)} O/I` : "",
  ].filter(Boolean);
  const effect = fires
    ? `${tower.jammed ? "Jammed for a moment. " : ""}Damage ${tower.damage.toFixed(0)}${tower.aura > 0 ? ` (+${Math.round(tower.aura * 100)}% Muse)` : ""} · ${(tower.rate * (1 + tower.haste)).toFixed(2)}/s${tower.haste > 0 ? ` (+${Math.round(tower.haste * 100)}% Tempo)` : ""} · range ${tower.range.toFixed(1)}${tower.reach > 0 ? ` (+${tower.reach.toFixed(1)} Serotonin)` : ""}${
        stats.splash ? ` · blast ${stats.splash.toFixed(1)}` : ""
      }${stats.slow ? ` · slows ${Math.round(stats.slow * 100)}%` : ""}${stats.chain ? ` · jumps ${stats.chain}` : ""}${stats.burn ? ` · burns ${(stats.burn * (1 + tower.aura)).toFixed(0)}/s` : ""}${stats.execute ? ` · collapses at ${Math.round(stats.execute * 100)}%` : ""}${wake}`
    : stats.aura || stats.haste || stats.reach
      ? `Towers in its circle (${stats.range.toFixed(1)}) deal ${Math.round(stats.aura * 100)}% more damage${stats.haste ? ` and fire ${Math.round(stats.haste * 100)}% faster` : ""}${stats.reach ? ` and reach ${stats.reach.toFixed(1)} cells further` : ""}. Boosting ${tower.boosts} now.`
      : stats.vuln || stats.shred || stats.mire
        ? `Creeps in its circle (${stats.range.toFixed(1)}) take ${Math.round(stats.vuln * 100)}% more damage${stats.shred ? ` and lose ${Math.round(stats.shred * 100)}% of their armor` : ""}${stats.mire ? ` and move ${Math.round(stats.mire * 100)}% slower` : ""}${stats.execute ? `; any but bosses at ${Math.round(stats.execute * 100)}% life collapse` : ""}.`
        : `Pays ${pays.length ? pays.join(" and ") : "0 O/I"} every time a wave clears${stats.bounty ? `; kills pay ${Math.round(stats.bounty * 100)}% more` : ""}.`;
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
              disabled={money < offer.cost}
              onClick={() => offer.pick(i)}
              aria-label={`${offer.prefix}${p.name} for ${offer.cost} ${unit}: ${p.copy}`}
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
          disabled={money < tower.upgradeCost}
          onClick={() => game()?.tdUpgrade()}
          aria-label={`${tower.level >= MAX_TOWER_LEVEL ? "Mastery" : "Upgrade"} for ${tower.upgradeCost} ${unit}`}
        >
          <span className="flex items-center gap-1">
            <ArrowUp className="size-3.5" aria-hidden />
            {tower.level >= MAX_TOWER_LEVEL ? "Mastery" : "Upgrade"}
          </span>
          <span className="text-[0.6rem] tracking-normal">
            {tower.upgradeCost} {unit}
          </span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={tower.maxLevels < 1}
          onClick={() => game()?.tdUpgradeMax()}
          aria-label={`Upgrade ${tower.maxLevels} levels for ${tower.maxCost} ${unit}`}
        >
          <span className="flex items-center gap-1">
            <ChevronsUp className="size-3.5" aria-hidden />
            Max{tower.maxLevels > 0 ? ` ×${tower.maxLevels}` : ""}
          </span>
          <span className="text-[0.6rem] tracking-normal">{tower.maxLevels > 0 ? `${short(tower.maxCost)} ${unit}` : "—"}</span>
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
          aria-label={`${tower.undo ? "Undo the build" : "Sell"} for ${tower.sellValue} ${unit}`}
        >
          <span className="flex items-center gap-1">
            <Trash2 className="size-3.5" aria-hidden />
            {tower.undo ? "Undo" : "Sell"}
          </span>
          <span className="text-[0.6rem] tracking-normal">
            +{tower.sellValue} {unit}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The wake core: what it does at its level, the stage to come, and the button
 * that raises it, for ATP. Shown when the core is tapped, and in the Library.
 */
function CorePanel() {
  const core = useGame((s) => s.tdView.core);
  const atp = useGame((s) => s.tdView.atp);
  const over = useGame((s) => s.tdView.phase === "over");
  const livesEach = CONFIG.td.core.livesPerLevel;
  const pulse = core.pulses
    ? `Pulse: ${Math.round(core.damage)} every ${+core.every.toFixed(1)} s within ${core.range.toFixed(1)} cells${core.pierce >= 1 ? ", through armor" : ""}${core.slow ? `, slows ${Math.round(core.slow * 100)}%` : ""}.`
    : `No pulse yet (from level ${CONFIG.td.core.pulse.fromLevel}).`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-sm text-gold">
          Wake core · Lv {core.level}
          {core.stage && <span className="text-atp"> · {core.stage}</span>}
        </p>
        <p className="text-xs text-muted">{core.dealt > 0 ? `${short(core.dealt)} dealt · ${short(core.kills)} kills` : "core"}</p>
      </div>
      <p className="mt-1 text-xs leading-snug text-fg">
        {pulse} +{core.atp} ATP a wave.
        {core.aura ? ` Towers in its circle +${Math.round(core.aura * 100)}% damage (${core.boosts} now).` : ""}
        {core.mend ? ` Mends ${core.mend} ${core.mend === 1 ? "life" : "lives"} a wave.` : ""}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-muted">
        A level: stronger pulse, +{CONFIG.td.core.atpPerLevel} ATP a wave
        {livesEach > 0 ? `, +${livesEach} ${livesEach === 1 ? "life" : "lives"}` : ""}.
        {core.next ? ` Lv ${core.next.level}, ${core.next.name}: ${core.next.copy}` : ""}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={over || atp < core.cost}
          onClick={() => game()?.tdRaiseCore()}
          aria-label={`Raise the core to level ${core.level + 1} for ${core.cost} ATP`}
        >
          <span className="flex items-center gap-1">
            <ArrowUp className="size-3.5" aria-hidden />
            Raise the core
          </span>
          <span className="text-[0.6rem] tracking-normal">{core.cost} ATP</span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0 px-1"
          disabled={over || core.maxLevels < 1}
          onClick={() => game()?.tdRaiseCoreMax()}
          aria-label={`Raise the core ${core.maxLevels} levels for ${core.maxCost} ATP`}
        >
          <span className="flex items-center gap-1">
            <ChevronsUp className="size-3.5" aria-hidden />
            Max{core.maxLevels > 0 ? ` ×${core.maxLevels}` : ""}
          </span>
          <span className="text-[0.6rem] tracking-normal">
            {core.maxLevels > 0 ? `${short(core.maxCost)} ATP` : `you have ${short(atp)}`}
          </span>
        </button>
      </div>
    </div>
  );
}

/** Global upgrades bought with O/I. Opening it does not pause the fight. */
function PerkSheet({ onClose }: { onClose: () => void }) {
  const gold = useGame((s) => s.tdView.gold);
  const atp = useGame((s) => s.tdView.atp);
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
          <div className="rounded-md border border-atp/50 p-2 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-xs tracking-[0.14em] text-atp">THE WAKE CORE · ATP ONLY</p>
              <p className="font-display text-xs text-atp">✦ {Math.floor(atp)}</p>
            </div>
            <p className="mt-1 mb-2 text-xs leading-snug text-muted">
              ATP comes from every Adenosine slain, the dream creeps (from wave {CONFIG.td.waves.unlocks.delta ?? 12}), every boss,
              and the core each time a wave clears. It raises the core and builds the wake set (the build menu's Wake tab).
            </p>
            <CorePanel />
          </div>
          <VoidPerks />
          <div className="rounded-md border border-cyan/30 p-2 sm:col-span-2">
            <p className="font-display text-xs text-fg">This run</p>
            <DamageReport />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The void in the Library: upgrades bought only with flux (the rep currency),
 * and the Rift Titan, summoned for O/I, that pays flux and more flux a rep.
 */
function VoidPerks() {
  const v = useGame((s) => s.tdView);
  return (
    <div className="rounded-md border border-violet/50 p-2 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-xs tracking-[0.14em] text-violet">THE VOID · FLUX ONLY</p>
        <p className="font-display text-xs text-violet">◆ {Math.floor(v.flux)}</p>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted">
        Flux comes only from reps (the ◆ at the top opens the rep window): +{v.fluxPerRep} a rep now
        {v.repGold ? `, and +${v.repGold} O/I` : ""}
        {CONFIG.td.void.repGrowth > 0
          ? `, +${CONFIG.td.void.repGrowth} a rep for every ${CONFIG.td.void.repGrowthEvery} reps done`
          : ""}
        . {v.reps.toLocaleString()} reps this run
        {v.fluxBoost ? `; Rift Titans slain: +${Math.round(v.fluxBoost * 100)}% a rep` : ""}.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {VOID_PERK_KEYS.map((key) => {
          const spec = VOID_PERKS[key];
          const level = v.voidPerks[key];
          const maxed = level >= spec.max;
          const cost = voidPerkCost(key, level);
          return (
            <div key={key} className="rounded-md border border-violet/30 p-2">
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
                disabled={maxed || v.flux < cost}
                onClick={() => game()?.tdBuyVoidPerk(key)}
              >
                {maxed ? "Complete" : `Learn · ${cost} flux`}
              </button>
            </div>
          );
        })}
        <div className="rounded-md border border-danger/40 p-2 sm:col-span-2">
          <p className="font-display text-xs text-fg">Summon a Rift Titan</p>
          <p className="mt-1 text-xs leading-snug text-muted">
            A void boss walks the lane, for O/I. Slay it for {v.summonReward} flux and +
            {Math.round(CONFIG.td.void.summonBoost * 100)}% flux a rep for the rest of the run. If it
            reaches the core, it costs {CREEPS.rift.leak} lives.
          </p>
          <button
            type="button"
            className="btn mt-2 w-full"
            disabled={v.gold < v.summonCost || v.phase === "over"}
            onClick={() => game()?.tdSummon()}
          >
            Summon · {v.summonCost} O/I
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The rep controls. Pick a phrase from Reps and a batch (1, 10, 20 or 30 reps a
 * tap), say them, tap Rep: a batch counts only once its time has passed (batch x
 * td.void.repSeconds since the last tap, by the clock), so it is done, not tapped
 * through. Each pays flux, and they go into the Recitation drill's totals and
 * History too. The window drags by its top bar, folds to that bar, and has its
 * own size and opacity; the round tap button stays in game with the window
 * closed, wherever it is put.
 */
const OLD_REP_KEY = "azshara-td-rep-v1";
/** How far a placed box keeps from the screen's edge, in px. */
const EDGE = 8;

/** The rep setup, from the device (and the phrase picked before there was one). */
function startRepUi(): RepUi {
  const u = readRepUi();
  if (!u.phraseId) {
    try {
      const old = localStorage.getItem(OLD_REP_KEY);
      if (old) {
        u.phraseId = old;
        writeRepUi(u);
      }
    } catch {
      /* private mode */
    }
  }
  return u;
}

/** Where a box sits in the HUD: x and y are fractions of the room beside it (0 left or top, 1 right or bottom). */
function usePlacement<T extends HTMLElement>(x: number, y: number, size: number) {
  const ref = useRef<T>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !(parent instanceof HTMLElement)) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const w = Math.max(0, parent.clientWidth - box.width - 2 * EDGE);
      const h = Math.max(0, parent.clientHeight - box.height - 2 * EDGE);
      setRoom((r) => (r.w === w && r.h === h ? r : { w, h }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    watch.observe(parent);
    return () => watch.disconnect();
  }, [size]);
  return { ref, room, left: EDGE + x * room.w, top: EDGE + y * room.h };
}

/** Dragging a placed box: the pointer moves its x and y, as fractions of its room; done when let go. */
function useDragPlace(
  room: { w: number; h: number },
  spot: { x: number; y: number },
  onPlace: (x: number, y: number, done: boolean) => void,
  opts: { on?: boolean; buttons?: boolean } = {},
) {
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number; nx: number; ny: number } | null>(null);
  const on = opts.on ?? true;
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onPlace(d.nx, d.ny, true);
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!on || e.button !== 0) return;
      if (!opts.buttons && (e.target as HTMLElement).closest("button")) return;
      drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: spot.x, y: spot.y, nx: spot.x, ny: spot.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      d.nx = room.w ? clampSpot(d.x + (e.clientX - d.px) / room.w) : d.x;
      d.ny = room.h ? clampSpot(d.y + (e.clientY - d.py) / room.h) : d.y;
      onPlace(d.nx, d.ny, false);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

/** The rep clock for a batch: ready once its time has passed since the last tap that counted. */
function useRepClock(batch: number) {
  const last = useGame((s) => s.tdView.lastRepAt);
  const ms = batchMs(batch);
  const readyAt = last > 0 ? last + ms : 0;
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    const t0 = Date.now();
    setNow(t0);
    if (t0 >= readyAt) return;
    const t = window.setTimeout(() => setNow(Date.now()), readyAt - t0 + 4);
    return () => window.clearTimeout(t);
  }, [readyAt]);
  return { ready: now >= readyAt, readyAt, ms };
}

/** How far into its wait a batch is, as a negative animation delay (set once, when the wait shows). */
function useWaitDelay(readyAt: number, ms: number) {
  const [delay] = useState(() => Math.min(0, readyAt - ms - Date.now()));
  return delay;
}

function RepBar({ readyAt, ms }: { readyAt: number; ms: number }) {
  const delay = useWaitDelay(readyAt, ms);
  return (
    <span
      className="block h-full bg-violet"
      style={{ animation: `rep-fill ${ms}ms linear ${delay}ms forwards` }}
    />
  );
}

function RepRing({ readyAt, ms }: { readyAt: number; ms: number }) {
  const delay = useWaitDelay(readyAt, ms);
  return (
    <circle
      cx="50"
      cy="50"
      r="45"
      pathLength={100}
      fill="none"
      stroke="var(--color-violet)"
      strokeWidth="7"
      strokeLinecap="round"
      strokeDasharray="100"
      transform="rotate(-90 50 50)"
      style={{ animation: `rep-ring ${ms}ms linear ${delay}ms forwards` }}
    />
  );
}

/** A setting with − and + buttons. */
function Tune({ label, value, down, up }: { label: string; value: string; down: () => void; up: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" className="btn stepper" onClick={down} aria-label={`${label}: less`}>
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-11 text-center text-fg" aria-live="polite">
          {value}
        </span>
        <button type="button" className="btn stepper" onClick={up} aria-label={`${label}: more`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}

/** An on/off setting, as one wide button. */
function Toggle({ label, on, flip }: { label: string; on: boolean; flip: () => void }) {
  return (
    <button
      type="button"
      className="btn w-full justify-between px-2 tracking-normal normal-case"
      data-on={on}
      aria-pressed={on}
      onClick={flip}
    >
      <span>{label}</span>
      <span className="font-display text-[0.6rem] tracking-wider uppercase">{on ? "On" : "Off"}</span>
    </button>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function RepWindow({
  ui,
  change,
  arranging,
  setArranging,
  onClose,
}: {
  ui: RepUi;
  change: (next: RepUi, keep?: boolean) => void;
  arranging: boolean;
  setArranging: (on: boolean) => void;
  onClose: () => void;
}) {
  const v = useGame((s) => s.tdView);
  const lines = useGame((s) => s.lines);
  const [items, setItems] = useState<RepItem[]>(() => readReps().items);
  const [tune, setTune] = useState(false);
  const item = items.find((i) => i.id === ui.phraseId) ?? items[0];
  const clock = useRepClock(ui.batch);
  const win = ui.win;
  const place = usePlacement<HTMLElement>(win.x, win.y, win.scale);
  const drag = useDragPlace(place.room, win, (x, y, done) => change({ ...ui, win: { ...win, x, y } }, done));
  const setWin = (next: Partial<RepUi["win"]>) => change({ ...ui, win: { ...win, ...next } });
  const setTap = (next: Partial<RepUi["tap"]>) => change({ ...ui, tap: { ...ui.tap, ...next } });
  const pays = batchFlux(v.voidPerks, v.fluxBoost, v.reps, ui.batch);
  const growth = CONFIG.td.void.repGrowth;
  const secs = +(clock.ms / 1000).toFixed(2);

  const choose = (next: RepItem | undefined) => {
    if (!next) return;
    game()?.tdFlushReps();
    change({ ...ui, phraseId: next.id });
  };
  const turn = (dir: 1 | -1) => {
    if (!items.length) return;
    const i = Math.max(0, items.indexOf(item ?? items[0]!));
    choose(items[(i + dir + items.length) % items.length]);
  };
  const rep = () => {
    if (clock.ready && item) game()?.tdRepBatch();
  };
  const addFirst = () => {
    const text = (lines[0] ?? "").trim();
    if (!text) return;
    const made = addItem(readReps(), text, Date.now());
    writeReps(made.state);
    setItems(made.state.items);
    choose(made.state.items.find((i) => i.id === made.id));
  };
  const close = () => {
    game()?.tdFlushReps();
    setArranging(false);
    onClose();
  };

  return (
    <section
      ref={place.ref}
      className="glass pointer-events-auto absolute z-30 p-2"
      style={{
        left: place.left,
        top: place.top,
        width: win.min ? "auto" : `min(19rem, calc((100vw - 1rem) / ${win.scale}))`,
        transform: `scale(${win.scale})`,
        transformOrigin: "top left",
        opacity: win.opacity,
        backdropFilter: `blur(${Math.round(14 * win.opacity ** 3)}px)`,
      }}
      role="dialog"
      aria-label="Rep window"
    >
      <header
        className="flex cursor-move items-center gap-1 select-none"
        style={{ touchAction: "none" }}
        title="Drag to move"
        {...drag}
      >
        <p className="min-w-0 flex-1 truncate font-display text-xs tracking-[0.14em] text-violet">
          ◆ {short(v.flux)}{win.min ? "" : " FLUX"}
        </p>
        {win.min && item && (
          <button
            type="button"
            className={`btn px-2 ${clock.ready ? "btn-gold" : ""}`}
            disabled={!clock.ready}
            onClick={rep}
            aria-label={`Rep ×${ui.batch}: ${item.text}. Pays ${pays} flux`}
          >
            ×{ui.batch} {clock.ready ? "✓" : "…"}
          </button>
        )}
        <button
          type="button"
          className="btn stepper"
          data-on={tune}
          aria-pressed={tune}
          onClick={() => {
            setTune((t) => !t);
            if (win.min) setWin({ min: false });
          }}
          aria-label="Rep settings"
        >
          <Settings2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="btn stepper"
          onClick={() => setWin({ min: !win.min })}
          aria-label={win.min ? "Unfold the rep window" : "Fold the rep window to its top bar"}
        >
          {win.min ? <Maximize2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
        </button>
        <button type="button" className="btn stepper" onClick={close} aria-label="Close the rep window">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {!win.min && (item ? (
        <>
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              className="btn stepper"
              onClick={() => turn(-1)}
              disabled={items.length < 2}
              aria-label="Previous phrase"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="line-clamp-2 min-w-0 flex-1 text-center text-sm leading-snug text-fg" aria-live="polite">
              {item.text}
            </p>
            <button
              type="button"
              className="btn stepper"
              onClick={() => turn(1)}
              disabled={items.length < 2}
              aria-label="Next phrase"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1" role="radiogroup" aria-label="Reps per tap">
            {batches().map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={ui.batch === b}
                data-on={ui.batch === b}
                className="btn px-1"
                onClick={() => change({ ...ui, batch: b })}
              >
                ×{b}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`btn mt-1.5 min-h-14 w-full flex-col gap-0 ${clock.ready ? "btn-gold" : ""}`}
            disabled={!clock.ready}
            onClick={rep}
            aria-label={`Rep ×${ui.batch}: ${item.text}. Pays ${pays} flux`}
          >
            <span className="font-display text-sm">
              {clock.ready ? `${ui.batch} rep${ui.batch > 1 ? "s" : ""} ✓` : "Saying them…"}
            </span>
            <span className="text-[0.6rem] tracking-normal normal-case">
              +{pays.toLocaleString()} flux{v.repGold ? ` +${v.repGold * ui.batch} O/I` : ""} · {ui.batch} ×{" "}
              {CONFIG.td.void.repSeconds} s = {secs} s
            </span>
          </button>
          <div className="mt-1 h-1 overflow-hidden rounded bg-violet/15" aria-hidden>
            {!clock.ready && <RepBar key={clock.readyAt} readyAt={clock.readyAt} ms={clock.ms} />}
          </div>
          <p className="mt-1 text-center text-[0.65rem] text-muted">
            This run: {v.reps.toLocaleString()} reps · {v.fluxPerRep} flux a rep now
            {growth > 0 ? `, +${growth} in ${repsToGrowth(v.reps)} more` : ""} · they count in Reps and History too
          </p>
        </>
      ) : (
        <div className="mt-2 text-xs leading-snug text-muted">
          <p>No phrases in Reps yet. Use the loaded text's first line, or add your own in Recitation drill → Reps.</p>
          <button type="button" className="btn mt-2 w-full" onClick={addFirst} disabled={!lines[0]}>
            Use “{(lines[0] ?? "").slice(0, 40)}”
          </button>
        </div>
      ))}
      {!win.min && tune && (
        <div className="mt-2 max-h-[38dvh] space-y-1.5 overflow-y-auto border-t border-violet/30 pt-2">
          <p className="font-display text-[0.6rem] tracking-[0.14em] text-violet">THIS WINDOW · DRAG ITS TOP BAR</p>
          <Tune
            label="Size"
            value={pct(win.scale)}
            down={() => setWin({ scale: clampScale(win.scale - 0.1) })}
            up={() => setWin({ scale: clampScale(win.scale + 0.1) })}
          />
          <Tune
            label="Opacity"
            value={pct(win.opacity)}
            down={() => setWin({ opacity: clampOpacity(win.opacity - 0.05) })}
            up={() => setWin({ opacity: clampOpacity(win.opacity + 0.05) })}
          />
          <p className="pt-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">THE TAP BUTTON · STAYS WITH THIS CLOSED</p>
          <Toggle label="Round tap button in game" on={ui.tap.on} flip={() => setTap({ on: !ui.tap.on })} />
          {ui.tap.on && (
            <>
              <Toggle
                label="A twin on the other side"
                on={ui.tap.twin}
                flip={() => setTap({ twin: !ui.tap.twin })}
              />
              <button
                type="button"
                className="btn w-full tracking-normal normal-case"
                data-on={arranging}
                aria-pressed={arranging}
                onClick={() => setArranging(!arranging)}
              >
                <Move className="size-4" aria-hidden />
                {arranging ? "Done moving" : ui.tap.twin ? "Move them: drag either" : "Move it: drag the button"}
              </button>
              <div className="grid grid-cols-2 gap-1">
                <button type="button" className="btn tracking-normal normal-case" onClick={() => setTap({ x: 0 })}>
                  Left side
                </button>
                <button type="button" className="btn tracking-normal normal-case" onClick={() => setTap({ x: 1 })}>
                  Right side
                </button>
              </div>
              <Tune
                label="Button size"
                value={`${ui.tap.size}px`}
                down={() => setTap({ size: clampTapSize(ui.tap.size - 8) })}
                up={() => setTap({ size: clampTapSize(ui.tap.size + 8) })}
              />
              <Tune
                label="Button opacity"
                value={pct(ui.tap.opacity)}
                down={() => setTap({ opacity: clampOpacity(ui.tap.opacity - 0.05) })}
                up={() => setTap({ opacity: clampOpacity(ui.tap.opacity + 0.05) })}
              />
              <Toggle label="The phrase under the button" on={ui.tap.label} flip={() => setTap({ label: !ui.tap.label })} />
              {ui.tap.label && (
                <Tune
                  label="Phrase size"
                  value={`${ui.tap.labelSize}px`}
                  down={() => setTap({ labelSize: clampLabelSize(ui.tap.labelSize - 1) })}
                  up={() => setTap({ labelSize: clampLabelSize(ui.tap.labelSize + 1) })}
                />
              )}
            </>
          )}
          <p className="pt-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">ON THE BOARD</p>
          <Toggle label="Tapping the core counts" on={ui.coreTap} flip={() => change({ ...ui, coreTap: !ui.coreTap })} />
          <Toggle
            label="Tapping beside the board counts"
            on={ui.offTap}
            flip={() => change({ ...ui, offTap: !ui.offTap })}
          />
          <p className="text-[0.65rem] leading-snug text-muted">
            Every way taps the same batch for the phrase above, and only once its time has passed. Key: R.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The round tap button: the batch for the picked phrase, in game with the window
 * closed, and the phrase under it (its own font size). The phrase keeps to the
 * button's side, so the button stays where it was put.
 */
function RepTapButton({
  ui,
  change,
  arranging,
  mirror = false,
}: {
  ui: RepUi;
  change: (next: RepUi, keep?: boolean) => void;
  arranging: boolean;
  /** The twin on the other side: at 1 - x, and moving it moves both. */
  mirror?: boolean;
}) {
  const voidPerks = useGame((s) => s.tdView.voidPerks);
  const fluxBoost = useGame((s) => s.tdView.fluxBoost);
  const reps = useGame((s) => s.tdView.reps);
  const clock = useRepClock(ui.batch);
  const tap = ui.tap;
  const phrase = useMemo(() => {
    const items = readReps().items;
    return (items.find((i) => i.id === ui.phraseId) ?? items[0])?.text ?? "";
  }, [ui.phraseId]);
  const label = tap.label && phrase ? phrase : "";
  const x = mirror ? 1 - tap.x : tap.x;
  const place = usePlacement<HTMLDivElement>(x, tap.y, tap.size);
  const drag = useDragPlace(
    place.room,
    { x, y: tap.y },
    (nx, y, done) => change({ ...ui, tap: { ...tap, x: clampSpot(mirror ? 1 - nx : nx), y } }, done),
    { on: arranging, buttons: true },
  );
  const pays = batchFlux(voidPerks, fluxBoost, reps, ui.batch);
  const side = x < 0.34 ? "items-start text-left" : x > 0.66 ? "items-end text-right" : "items-center text-center";
  return (
    <div
      ref={place.ref}
      className={`pointer-events-none absolute z-20 flex flex-col ${side}`}
      style={{ left: place.left, top: place.top, opacity: tap.opacity }}
    >
      <button
        type="button"
        className={`pointer-events-auto relative grid shrink-0 place-items-center rounded-full font-display ${clock.ready ? "text-gold" : "text-violet"} ${arranging ? "cursor-move outline-2 outline-offset-4 outline-cyan outline-dashed" : ""}`}
        style={{ width: tap.size, height: tap.size, touchAction: arranging ? "none" : "manipulation" }}
        onClick={() => {
          if (!arranging) game()?.tdRepBatch();
        }}
        {...drag}
        aria-label={
          arranging
            ? "Drag to move the tap button"
            : `Rep ×${ui.batch}, ${clock.ready ? "ready" : "not yet"}: pays ${pays} flux${phrase ? `. ${phrase}` : ""}`
        }
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="50" cy="50" r="45" fill="rgba(8, 6, 16, 0.78)" stroke="rgba(168, 85, 247, 0.28)" strokeWidth="7" />
          {clock.ready ? (
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-gold)" strokeWidth="7" />
          ) : (
            <RepRing key={clock.readyAt} readyAt={clock.readyAt} ms={clock.ms} />
          )}
        </svg>
        <span className="relative text-center leading-none">
          {arranging ? (
            <Move style={{ width: tap.size * 0.36, height: tap.size * 0.36 }} aria-hidden />
          ) : (
            <>
              <span className="block" style={{ fontSize: tap.size * 0.26 }}>
                ×{ui.batch}
              </span>
              <span className="mt-0.5 block" style={{ fontSize: Math.max(9, tap.size * 0.14) }}>
                {clock.ready ? `+${short(pays)}` : "…"}
              </span>
            </>
          )}
        </span>
      </button>
      {label && (
        <p
          className="mt-1 line-clamp-4 rounded bg-bg/55 px-1 leading-snug text-fg"
          style={{
            fontSize: tap.labelSize,
            maxWidth: "min(16em, calc(100vw - 1rem))",
            textShadow: "0 0 3px rgba(0, 0, 0, 0.9)",
          }}
          aria-hidden
        >
          {label}
        </p>
      )}
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
  const [repsOpen, setRepsOpen] = useState(false);
  const [repUi, setRepUi] = useState<RepUi>(startRepUi);
  const [arranging, setArranging] = useState(false);
  const changeRepUi = (next: RepUi, keep = true) => {
    setRepUi(next);
    if (keep) writeRepUi(next);
  };
  // The rep clock starts with the board, so the first batch is earned too.
  useEffect(() => {
    game()?.tdArmReps();
  }, []);
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
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-violet/50 px-1.5 py-0.5 text-violet"
            data-on={repsOpen}
            aria-pressed={repsOpen}
            onClick={() => setRepsOpen((o) => !o)}
            aria-label={`${Math.floor(v.flux)} flux. ${repsOpen ? "Close" : "Open"} the rep window`}
          >
            <Atom className="size-3.5" aria-hidden /> {short(v.flux)}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-atp/50 px-1.5 py-0.5 text-atp data-[on=true]:bg-atp/20"
            data-on={v.coreSelected}
            aria-pressed={v.coreSelected}
            onClick={() => game()?.tdSelectCore()}
            aria-label={`${Math.floor(v.atp)} ATP. The core is level ${v.core.level}: open it`}
          >
            <Flame className="size-3.5" aria-hidden /> {short(v.atp)}
          </button>
          <span
            className="flex items-center gap-1 text-danger"
            aria-label={`${Math.round(v.lives)} lives`}
          >
            <Heart className="size-3.5" aria-hidden /> {short(v.lives)}
          </span>
          <span className="text-cyan">WAVE {String(v.wave).padStart(2, "0")}</span>
          <span className="hidden text-fg sm:inline">{short(v.kills)} down</span>
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
        {v.boards.length > 1 && (
          <div className="mt-1 flex gap-1" role="group" aria-label="Boards of the stitched map">
            <button
              type="button"
              className="btn min-h-7 px-2 py-0 text-[0.65rem]"
              data-on={v.board < 0}
              aria-pressed={v.board < 0}
              onClick={() => game()?.tdSetView(-1)}
            >
              All
            </button>
            {v.boards.map((name, i) => (
              <button
                key={i}
                type="button"
                className="btn min-h-7 min-w-0 flex-1 px-1 py-0 text-[0.65rem] tracking-normal"
                data-on={v.board === i}
                aria-pressed={v.board === i}
                onClick={() => game()?.tdSetView(i)}
                aria-label={`Look at board ${i + 1}, ${name}`}
              >
                <span className="truncate">
                  {i + 1} · {name}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      <footer
        ref={footerRef}
        className="pointer-events-auto mx-auto w-full max-w-xl lg:absolute lg:right-3 lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:w-[22rem]"
      >
        <div className="glass h-[11.25rem] overflow-y-auto p-2">
          {v.canBuild && <BuildGrid />}
          {v.tower && <TowerPanel />}
          {!v.canBuild && !v.tower && v.coreSelected && <CorePanel />}
          {!v.canBuild && !v.tower && !v.coreSelected && (
            <p className="p-1 text-sm leading-relaxed text-muted">
              {v.selected
                ? "The lane takes no towers. Pick a free cell."
                : "Tap a free cell to raise a tower from one of three sets (O/I, flux, ATP), a tower to upgrade it, or the core to raise it. Waves never end: call the next one early for bonus O/I, even while one is running, and they stack."}
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
      {repUi.tap.on && <RepTapButton ui={repUi} change={changeRepUi} arranging={arranging} />}
      {repUi.tap.on && repUi.tap.twin && (
        <RepTapButton ui={repUi} change={changeRepUi} arranging={arranging} mirror />
      )}
      {repsOpen && (
        <RepWindow
          ui={repUi}
          change={changeRepUi}
          arranging={arranging}
          setArranging={setArranging}
          onClose={() => setRepsOpen(false)}
        />
      )}
    </div>
  );
}

/** A map's lane, drawn small: the gate is the open end, the core the gold dot. On a stitched map, a violet dot marks each join. */
function LaneThumb({ map, className = "size-10" }: { map: TdMap; className?: string }) {
  const lines = map.lanes.map((l) => l.waypoints.map(([c, r]) => `${c + 0.5},${r + 0.5}`).join(" "));
  return (
    <svg viewBox={`0 0 ${map.cols} ${map.rows}`} className={className} aria-hidden>
      {map.sections.map((sec) => (
        <rect
          key={`${sec.col},${sec.row}`}
          x={sec.col + 0.1}
          y={sec.row + 0.1}
          width="8.8"
          height="8.8"
          rx="0.4"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="0.15"
        />
      ))}
      {lines.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {map.joins.map(([c, r]) => (
        <circle key={`${c},${r}`} cx={c + 0.5} cy={r + 0.5} r="0.85" fill="var(--color-violet)" />
      ))}
      <circle cx={map.core[0] + 0.5} cy={map.core[1] + 0.5} r="0.85" fill="var(--color-gold)" />
    </svg>
  );
}

/**
 * Map choice on the title screen. The board behind it changes as soon as one is
 * picked. With Stitch on, the maps tapped (two to four, in the order tapped)
 * are joined into one map: the lane runs on from each into the next.
 */
export function MapPicker() {
  const current = mapFor(useGame((s) => s.tdMap));
  const bests = useGame((s) => s.tdView.bests);
  const level = useGame((s) => s.tdDifficulty);
  const best = bests[bestKey(current.key, level)] ?? 0;
  const chain = stitchKeys(current.key);
  const [stitching, setStitching] = useState(chain.length > 1);
  const most = maxStitch();
  const boards = boardCount(current);
  const scale = stitchScale(current);
  const pick = (key: string) => {
    if (!stitching) {
      useGame.setState({ tdMap: key });
      return;
    }
    // Tapping a map in the chain takes it out (the last one stays); tapping another adds it at the end.
    const next = chain.includes(key)
      ? chain.length > 1
        ? chain.filter((k) => k !== key)
        : chain
      : chain.length < most
        ? [...chain, key]
        : chain;
    useGame.setState({ tdMap: stitchKey(next) });
  };
  const toggle = () => {
    // Stitch off: back to the first map of the chain.
    if (stitching) useGame.setState({ tdMap: chain[0] ?? current.key });
    setStitching(!stitching);
  };
  return (
    <div className="mt-3">
      <div
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-7"
        role={stitching ? "group" : "radiogroup"}
        aria-label={stitching ? "Maps to stitch, in order" : "Map"}
      >
        {MAP_KEYS.map((key) => {
          const map = MAPS[key] as TdMap;
          const at = chain.indexOf(key);
          const on = at >= 0;
          return (
            <button
              key={key}
              type="button"
              role={stitching ? "checkbox" : "radio"}
              aria-checked={on}
              data-on={on}
              className="relative flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-md border border-cyan/40 px-0.5 py-1.5 text-[0.65rem] leading-none tracking-normal text-cyan transition-colors focus-visible:outline-2 focus-visible:outline-cyan data-[on=true]:border-violet data-[on=true]:bg-violet/25 data-[on=true]:text-fg"
              onClick={() => pick(key)}
              aria-label={stitching && on ? `${map.name}, board ${at + 1} of the stitched map` : map.name}
            >
              {stitching && on && (
                <span className="absolute top-0.5 right-1 font-display text-[0.7rem] text-gold" aria-hidden>
                  {at + 1}
                </span>
              )}
              <LaneThumb map={map} />
              <span className="w-full truncate text-center">{map.name}</span>
              <Medal best={bests[bestKey(key, level)] ?? 0} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn mt-2 min-h-9 w-full py-1 text-[0.7rem]"
        data-on={stitching}
        aria-pressed={stitching}
        onClick={toggle}
      >
        <Link2 className="size-4" aria-hidden />
        {stitching ? `Stitching ${chain.length} of ${most}: tap maps in order` : "Stitch maps together"}
      </button>
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
      {boards > 1 && (
        <div className="mt-2 flex items-center gap-2 text-violet">
          <LaneThumb map={current} className={current.rows > 9 ? "h-16 w-16 shrink-0" : "h-10 w-20 shrink-0"} />
          <p className="text-xs leading-snug text-muted">
            <span className="text-fg">{current.name}</span> · {boards} boards, one lane of {current.lanes.map((l) => l.length).join(" and ")} cells
            {best > 0 ? ` · best wave ${best}` : ""}. <Medal best={best} />
          </p>
        </div>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {boards > 1 ? (
          <>
            {current.blurb} Creeps have {Math.round((scale.hp - 1) * 100)}% more life and kills pay{" "}
            {Math.round((scale.gold - 1) * 100)}% more O/I. {difficulty(level).copy}
          </>
        ) : (
          <>
            <span className="text-fg">{current.name}</span> ·{" "}
            {current.lanes.length > 1
              ? `${current.lanes.length} lanes of ${current.lanes.map((l) => l.length).join(" and ")} cells`
              : `lane ${current.length} cells`}
            {best > 0 ? ` · best wave ${best}` : ""}. {current.blurb} {difficulty(level).copy}
            {stitching ? " Tap another map to join it to this one." : ""}
          </>
        )}
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
        {v.reps > 0 && (
          <p className="mt-1 text-xs text-violet">
            {v.reps.toLocaleString()} reps this run (in your Reps and History) · ◆ {Math.floor(v.flux)} flux left
          </p>
        )}
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
