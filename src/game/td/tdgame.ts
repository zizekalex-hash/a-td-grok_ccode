import { sfx } from "@/game/audio";
import { shotText } from "@/game/engine";
import { Backdrop } from "@/game/backdrop";
import { CONFIG } from "@/game/config";
import { drawCoreImage } from "@/game/coreImage";
import { FrameLimiter, frameStats, renderDpr } from "@/game/frameLimiter";
import { pickCouncilLine, QUEEN } from "@/game/council";
import { pickLine, type Mood } from "@/game/dialogue";
import { clampCenter, fitPhrase, type PhraseFit } from "@/game/layout";
import { cancelNarration, narrate } from "@/game/narrator";
import { DISPLAY, FONT, PAL } from "@/game/palette";
import { getGame, setActiveGame, type GameBase } from "@/game/registry";
import { readPhrase, type Cursor } from "@/game/reader";
import { setSpeech, useGame, type TdView } from "@/game/store";
import {
  addRep,
  armReps,
  build,
  buyPerk,
  buyVoidPerk,
  summonRift,
  castSpell,
  chooseAscension,
  choosePath,
  createGame,
  cycleTargeting,
  pending,
  sell,
  sendWave,
  setAuto,
  step,
  towerAt,
  upgrade,
  upgradeMax,
  auraBonus,
  damageReport,
  hasteBonus,
  inCircle,
  leadBoss,
  maxUpgrades,
  musesOf,
  refundFor,
  undoable,
  type TdEvent,
  type TdState,
} from "./sim.ts";
import { buildable, COLS, inGrid, mapFor, MAPS, pointAt, ROWS } from "./map.ts";
import {
  bossesFor,
  CREEPS,
  earlyBonus,
  MAX_TOWER_LEVEL,
  masteryOf,
  isDifficulty,
  ascendCost,
  ascensionsOf,
  pathCost,
  pathsOf,
  currencyOf,
  fluxPerRep,
  isVoid,
  repGold,
  summonCost,
  summonReward,
  TOWER_KEYS,
  TOWERS,
  upgradeCost,
  wavePreview,
  type CreepKind,
  type DifficultyKey,
  type PerkKey,
  type SpellKey,
  type TowerKey,
  type VoidPerkKey,
} from "./economy.ts";
import { restore, serialize, summarize } from "./save.ts";
import { cancelSleep, resting, sleepFrames } from "@/game/rest";
import { readReps, recordReps, writeReps } from "@/game/reps";
import { readRepUi } from "./repui.ts";

const BEST_KEY = "azshara-td-v1";
/** The run in progress, saved so it survives the app closing. */
const RUN_KEY = "azshara-td-run-v1";

interface TdSave {
  /** The map and difficulty last picked. */
  map: string;
  difficulty: DifficultyKey;
  /** Best wave cleared on each map, by map key (Normal) or map:difficulty. */
  bests: Record<string, number>;
}

/** Where a map's best is kept: Normal under the map's own key, as before difficulties. */
export function bestKey(map: string, difficulty: DifficultyKey): string {
  return difficulty === "normal" ? map : `${map}:${difficulty}`;
}

function readRun(): string | null {
  try {
    return localStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

function readSave(): TdSave {
  const save: TdSave = { map: CONFIG.td.defaultMap, difficulty: "normal", bests: {} };
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (typeof data !== "object" || data === null) return save;
    const d = data as { map?: unknown; difficulty?: unknown; bests?: unknown; bestWave?: unknown };
    if (typeof d.map === "string" && MAPS[d.map]) save.map = d.map;
    if (isDifficulty(d.difficulty)) save.difficulty = d.difficulty;
    if (typeof d.bests === "object" && d.bests !== null) {
      for (const [key, n] of Object.entries(d.bests as Record<string, unknown>)) {
        const [map, diff] = key.split(":");
        const known = map && MAPS[map] && (diff === undefined || isDifficulty(diff));
        if (known && typeof n === "number" && Number.isFinite(n) && n > 0) save.bests[key] = n;
      }
    }
    // Saves from before there was a choice of maps hold one best, from the first map.
    const old = Number(d.bestWave);
    if (!d.bests && Number.isFinite(old) && old > 0) save.bests[CONFIG.td.defaultMap] = old;
  } catch {
    /* private mode / broken save */
  }
  return save;
}

/** A spell's flash over the board. */
interface SpellFx {
  key: SpellKey;
  text: string;
  life: number;
  total: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

/** The tower-defense mode: a 9 by 9 grid, a lane of creeps, and text-firing towers. Waves never end. */
export class TdGame implements GameBase {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private limiter = new FrameLimiter();
  /** Render-resolution setting the canvas was last sized for. */
  private renderScale = 0;
  private save = readSave();
  private sim: TdState = createGame(mapFor(this.save.map), this.save.difficulty);
  private spellFx: SpellFx[] = [];
  private selected: { col: number; row: number } | null = null;
  private message = "Tap a free cell to raise a tower.";
  private cursor: Cursor = { line: 0, word: 0 };
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private flashT = 0;
  private reduce = false;
  private mq: MediaQueryList | null = null;
  private ro: ResizeObserver | null = null;
  private viewAt = 0;
  private saidAt = -10;
  private lowTold = false;
  /** Fast-forward multiplier on top of the game-speed setting. */
  private speed = 1;
  private floaters: Floater[] = [];
  private banner = "";
  private bannerLife = 0;
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private w = 1;
  private h = 1;
  /** The grid and the lane, drawn once per size. */
  private board: HTMLCanvasElement = document.createElement("canvas");
  private boardKey = "";
  /** The font last set on the canvas this frame. Setting a font is slow, so it is only set when it changes. */
  private fontNow = "";
  /** Phrases already laid out at the current cell size, so each is fitted once, not every frame. */
  private phraseFits = new Map<string, PhraseFit>();
  private phraseCell = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    sfx.unlock();
    const r = this.canvas.getBoundingClientRect();
    this.select(e.clientX - r.left, e.clientY - r.top);
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (useGame.getState().phase !== "battle") return;
    const key = e.key.toLowerCase();
    const n = Number(e.key);
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePause();
    } else if (/^[0-9]$/.test(e.key) && (n === 0 ? 10 : n) <= TOWER_KEYS.length) {
      // 1 to 9, then 0 for the tenth tower.
      this.tdBuild(TOWER_KEYS[(n === 0 ? 10 : n) - 1] as TowerKey);
    } else if (key === "n") this.tdSendWave();
    else if (key === "a") this.tdToggleAuto();
    else if (key === "f") this.tdCycleSpeed();
    else if (key === "u") this.tdUpgrade();
    else if (key === "m") this.tdUpgradeMax();
    else if (key === "s") this.tdSell();
    else if (key === "t") this.tdTarget();
    else if (key === "q") this.tdSpell("storm");
    else if (key === "e") this.tdSpell("still");
    else if (key === "r") this.tdRepBatch();
    else if (e.key === "Escape" && this.selected) {
      // Clearing the selection uses up the key; the next Esc opens the menu.
      e.preventDefault();
      this.selected = null;
      this.pushView(true);
    }
  };

  private onHide = () => {
    if (document.visibilityState === "hidden") this.saveRun();
  };

  private onPageHide = () => this.saveRun();

  start() {
    setActiveGame(this);
    useGame.setState({ tdMap: this.sim.map.key, tdDifficulty: this.save.difficulty, tdRun: summarize(readRun()) });
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("pagehide", this.onPageHide);
    this.mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduce = this.mq.matches;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKey);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.pushView(true);
  }

  stop() {
    cancelSleep(this.wake);
    this.tdFlushReps();
    this.saveRun();
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("pagehide", this.onPageHide);
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKey);
    cancelNarration();
    if (getGame() === this) setActiveGame(null);
  }

  engage() {
    sfx.unlock();
    const { tdMap, tdDifficulty } = useGame.getState();
    this.sim = createGame(mapFor(tdMap), tdDifficulty);
    this.selected = null;
    this.speed = 1;
    this.floaters = [];
    this.spellFx = [];
    this.bannerLife = 0;
    this.lowTold = false;
    this.message = "Build, then call the first wave. Call the next one early for bonus O/I.";
    useGame.setState({ phase: "battle", tomeOpen: false, paused: false, drawer: false });
    this.say("engage", true);
    this.pushView(true);
  }

  /** Picks up the saved run where it was left. */
  continueRun() {
    sfx.unlock();
    const run = restore(readRun());
    if (!run) {
      useGame.setState({ tdRun: null });
      return;
    }
    this.sim = run;
    this.selected = null;
    this.speed = 1;
    this.floaters = [];
    this.spellFx = [];
    this.bannerLife = 0;
    this.lowTold = false;
    this.save.map = run.map.key;
    this.save.difficulty = run.difficulty;
    this.persist();
    this.message = `Back on wave ${run.wave}. Call the next wave when ready.`;
    useGame.setState({
      tdMap: run.map.key,
      tdDifficulty: run.difficulty,
      phase: "battle",
      tomeOpen: false,
      paused: false,
      drawer: false,
    });
    this.say("engage", true);
    this.pushView(true);
  }

  /** Keeps the run in progress on the device. Runs that never called a wave are not worth keeping. */
  private saveRun() {
    if (useGame.getState().phase !== "battle" || this.sim.phase === "over" || this.sim.wave < 1) return;
    try {
      const raw = serialize(this.sim);
      localStorage.setItem(RUN_KEY, raw);
      useGame.setState({ tdRun: summarize(raw) });
    } catch {
      /* private mode / quota */
    }
  }

  private clearRun() {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {
      /* private mode */
    }
    useGame.setState({ tdRun: null });
  }

  toTitle() {
    this.tdFlushReps();
    this.saveRun();
    const { tdMap, tdDifficulty } = useGame.getState();
    this.sim = createGame(mapFor(tdMap), tdDifficulty);
    this.selected = null;
    useGame.setState({ phase: "title", paused: false, tomeOpen: false, drawer: false });
    this.pushView(true);
  }

  togglePause() {
    if (useGame.getState().phase !== "battle") return;
    useGame.setState({ paused: !useGame.getState().paused });
  }

  toggleTome() {
    useGame.setState({ tomeOpen: !useGame.getState().tomeOpen });
  }

  persist() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(this.save));
    } catch {
      /* private mode / quota */
    }
  }

  /** Best wave cleared on the map and difficulty in play. */
  private get bestWave(): number {
    return this.save.bests[bestKey(this.sim.map.key, this.sim.difficulty)] ?? 0;
  }

  private recordBest() {
    if (this.sim.cleared <= this.bestWave) return;
    this.save.bests = { ...this.save.bests, [bestKey(this.sim.map.key, this.sim.difficulty)]: this.sim.cleared };
    this.persist();
  }

  onCodex() {
    this.pushView(true);
  }

  say(mood: Mood, force = false) {
    if (!force && this.time - this.saidAt < 3.2) return;
    this.saidAt = this.time;
    const council = pickCouncilLine(mood, useGame.getState().hud.speaker);
    setSpeech(council ? council.speaker : QUEEN, council ? council.text : pickLine(mood));
    narrate(
      mood,
      {
        Mode: "tower defense",
        Wave: this.sim.wave,
        "Waves on the board": this.sim.spawners.length,
        Lives: this.sim.lives,
        Gold: Math.round(this.sim.gold),
      },
      (speaker, text) => {
        if (!this.running) return;
        this.saidAt = this.time;
        setSpeech(speaker, text);
      },
    );
  }

  /** Raise the chosen tower on the selected cell. */
  tdBuild(key: TowerKey) {
    if (!this.selected) return this.note("Tap a free cell first.");
    const r = build(this.sim, key, this.selected.col, this.selected.row);
    if (r.ok) sfx.ready();
    this.note(r.ok ? `${TOWERS[key].name} raised.` : r.reason);
  }

  tdUpgrade() {
    if (!this.selected) return;
    const r = upgrade(this.sim, this.selected.col, this.selected.row);
    if (r.ok) sfx.ready();
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    this.note(
      r.ok && t ? `${TOWERS[t.key].name} is level ${t.level}.` : r.ok ? "Upgraded." : r.reason,
    );
  }

  /** Every level the O/I allows, in one tap. */
  tdUpgradeMax() {
    if (!this.selected) return;
    const r = upgradeMax(this.sim, this.selected.col, this.selected.row);
    if (r.ok) sfx.ready();
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    this.note(r.ok && t ? `${TOWERS[t.key].name} up ${r.levels} level${r.levels === 1 ? "" : "s"}, to ${t.level}.` : r.ok ? "" : r.reason);
  }

  tdSell() {
    if (!this.selected) return;
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    const undo = t ? undoable(this.sim, t) : false;
    const r = sell(this.sim, this.selected.col, this.selected.row);
    this.note(r.ok ? (undo ? "Build undone: every O/I back." : "Tower sold.") : r.reason);
  }

  tdTarget() {
    if (!this.selected) return;
    const r = cycleTargeting(this.sim, this.selected.col, this.selected.row);
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    this.note(r.ok && t ? `Now aiming at the ${targetCopy(t.targeting)}.` : r.ok ? "" : r.reason);
  }

  /** Calls the next wave, even while others are still coming. */
  tdSendWave() {
    sfx.unlock();
    const r = sendWave(this.sim);
    if (!r.ok) this.note(r.reason);
    this.drainEvents();
    this.pushView(true);
  }

  tdToggleAuto() {
    setAuto(this.sim, !this.sim.auto);
    this.note(this.sim.auto ? "Auto: the next wave comes once the last has spawned." : "Auto off.");
  }

  tdCycleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.note(`Speed ${this.speed}×`);
  }

  /** Takes one of the selected tower's two paths. */
  tdPath(path: number) {
    if (!this.selected) return;
    const r = choosePath(this.sim, this.selected.col, this.selected.row, path);
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    if (r.ok) sfx.bless();
    this.note(r.ok && t ? `${TOWERS[t.key].name} takes the path of ${pathsOf(t.key)[path]?.name}.` : r.ok ? "" : r.reason);
  }

  /** Takes one of the selected tower's two Ascensions. */
  tdAscend(index: number) {
    if (!this.selected) return;
    const r = chooseAscension(this.sim, this.selected.col, this.selected.row, index);
    const t = towerAt(this.sim, this.selected.col, this.selected.row);
    if (r.ok) {
      sfx.bless();
      this.banner = `ASCENSION · ${(ascensionsOf(t!.key)[index]?.name ?? "").toUpperCase()}`;
      this.bannerLife = 2.2;
    }
    this.note(r.ok && t ? `${TOWERS[t.key].name} ascends: ${ascensionsOf(t.key)[index]?.name}.` : r.ok ? "" : r.reason);
  }

  tdSpell(key: SpellKey) {
    sfx.unlock();
    // A spell always carries a phrase, pauses or not.
    const r = castSpell(this.sim, key, () => shotText(this.cursor, readPhrase, { gaps: false }));
    if (!r.ok) this.note(`${CONFIG.td.spells[key].name}: ${r.reason}.`);
    this.drainEvents();
    this.pushView(true);
  }

  tdBuyPerk(key: PerkKey) {
    const r = buyPerk(this.sim, key);
    if (r.ok) sfx.ready();
    this.note(r.ok ? `${CONFIG.td.perks[key].name} to level ${this.sim.perks[key]}.` : r.reason);
  }

  /** Reps done in the rep window, not yet written into the Recitation drill: per phrase, count and time. */
  private repTally = new Map<string, { count: number; ms: number; last: number }>();

  /**
   * Reps for a phrase in Reps, count of them in one tap: they count only when
   * count x td.void.repSeconds have passed since the last tap (the simulation
   * checks, by the clock), pay flux, and go into the Recitation drill too (every
   * 100, and when the window closes or the run ends). True when they counted.
   */
  tdRep(phraseId: string, count = 1): boolean {
    const now = Date.now();
    const r = addRep(this.sim, now, count);
    if (!r.ok) {
      this.note(r.reason);
      return false;
    }
    const n = r.count ?? 1;
    const t = this.repTally.get(phraseId) ?? { count: 0, ms: 0, last: 0 };
    // Time since the last tap counts as the set's time; a long pause counts as the batch's own time.
    const least = n * Math.max(0, CONFIG.td.void.repSeconds) * 1000;
    const step = t.last ? now - t.last : least;
    t.ms += step > least * 2 ? least : Math.max(least, step);
    t.count += n;
    t.last = now;
    this.repTally.set(phraseId, t);
    if (t.count >= 100) this.tdFlushReps();
    this.message = `${n} rep${n > 1 ? "s" : ""} done: +${r.flux ?? 0} flux${r.gold ? ` +${r.gold} O/I` : ""}.`;
    this.saveRun();
    this.pushView(true);
    return true;
  }

  /**
   * A batch from the rep controls (the window's Rep, the tap button, the core or
   * beside the board): the phrase and batch picked in the window.
   */
  tdRepBatch(): boolean {
    const ui = readRepUi();
    const items = readReps().items;
    const item = items.find((i) => i.id === ui.phraseId) ?? items[0];
    if (!item) {
      this.note("Pick a phrase in the rep window first: tap the flux count at the top.");
      return false;
    }
    return this.tdRep(item.id, ui.batch);
  }

  /** The rep clock starts when the rep controls first show, so the first batch is earned too. */
  tdArmReps() {
    armReps(this.sim, Date.now());
    this.pushView(true);
  }

  /** Writes the reps done here into the Recitation drill: totals and History, one set per phrase. */
  tdFlushReps() {
    if (!this.repTally.size) return;
    let reps = readReps();
    const now = Date.now();
    for (const [id, t] of this.repTally) reps = recordReps(reps, id, t.count, t.ms, now);
    writeReps(reps);
    this.repTally.clear();
  }

  tdSummon() {
    const r = summonRift(this.sim);
    this.note(r.ok ? "A Rift Titan tears through. Slay it for flux." : r.reason);
    this.saveRun();
  }

  tdBuyVoidPerk(key: VoidPerkKey) {
    const r = buyVoidPerk(this.sim, key);
    this.note(r.ok ? `${CONFIG.td.void.perks[key].name}: level ${this.sim.voidPerks[key]}.` : r.reason);
    this.saveRun();
  }

  private note(message: string) {
    this.message = message;
    this.pushView(true);
  }

  private geometry() {
    const box = this.backdrop.fieldBox(useGame.getState().chrome);
    const cell = Math.max(10, Math.min(box.w / COLS, box.h / ROWS));
    this.cell = cell;
    this.ox = Math.round(box.x + (box.w - COLS * cell) / 2);
    this.oy = Math.round(box.y + (box.h - ROWS * cell) / 2);
  }

  private select(x: number, y: number) {
    this.geometry();
    const fx = (x - this.ox) / this.cell;
    const fy = (y - this.oy) / this.cell;
    const col = Math.floor(fx);
    const row = Math.floor(fy);
    // Tapping the core, or beside the board, can count a rep batch (set in the rep window).
    if (useGame.getState().phase === "battle" && this.sim.phase !== "over") {
      const ui = readRepUi();
      const [cc, cr] = this.sim.map.core;
      const onCore = Math.hypot(fx - cc - 0.5, fy - cr - 0.5) <= 0.9;
      if ((ui.coreTap && onCore) || (ui.offTap && !inGrid(col, row))) {
        this.selected = null;
        this.tdRepBatch();
        return;
      }
    }
    const same = this.selected && this.selected.col === col && this.selected.row === row;
    this.selected = !inGrid(col, row) || same ? null : { col, row };
    this.pushView(true);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderScale = useGame.getState().settings.renderScale;
    const dpr = renderDpr(window.devicePixelRatio, this.renderScale);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.backdrop.setFrame(w, h, dpr);
    this.boardKey = "";
  }

  /** A rep set's rest ended: draw again. */
  private wake = () => {
    if (this.running && !this.raf) this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (t: number) => {
    if (!this.running) return;
    // While a rep set runs, nothing is drawn: the loop sleeps until it ends.
    if (resting()) {
      this.raf = 0;
      return sleepFrames(this.wake);
    }
    this.raf = requestAnimationFrame(this.frame);
    const { fpsCap, renderScale } = useGame.getState().settings;
    if (!this.limiter.ready(t, fpsCap)) return;
    if (renderScale !== this.renderScale) this.resize();
    // Up to a tenth of a second per step (the simulation slices it finer), so a low cap keeps real-time speed.
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.tick(dt);
    this.draw();
    frameStats.draws += 1;
  };

  private tick(dt: number) {
    const { phase, paused, tomeOpen, settings, lines, tdMap } = useGame.getState();
    this.time += dt;
    this.flashT += dt;
    this.backdrop.ensureBinary(settings, lines);
    // A map picked on the title screen shows on the board at once.
    const picked = mapFor(tdMap);
    const level = useGame.getState().tdDifficulty;
    if (phase === "title" && (picked !== this.sim.map || level !== this.sim.difficulty)) {
      this.sim = createGame(picked, level);
      this.save.difficulty = level;
      this.selected = null;
      this.save.map = this.sim.map.key;
      this.persist();
      this.pushView(true);
    }
    if (phase === "battle" && !paused && !tomeOpen) {
      step(
        this.sim,
        dt,
        settings.gameSpeed * this.speed,
        () => shotText(this.cursor, readPhrase),
        settings.phraseEvery,
      );
      this.drainEvents();
    }
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= dt * 0.6;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const fx of this.spellFx) fx.life -= dt;
    this.spellFx = this.spellFx.filter((fx) => fx.life > 0);
    if (this.bannerLife > 0) this.bannerLife -= dt;
    this.pushView(false);
  }

  private float(x: number, y: number, text: string, color: string) {
    if (this.floaters.length > 24) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life: 1.4 });
  }

  /** Reacts to what the simulation reports: lines, sounds, banners and floating rewards. */
  private drainEvents() {
    const events: TdEvent[] = this.sim.events.splice(0);
    const core = { x: this.sim.map.core[0] + 0.5, y: this.sim.map.core[1] + 0.5 };
    for (const e of events) {
      if (e.type === "waveSent") {
        if (e.bonus > 0) this.float(0.5, 0.3, `+${e.bonus} early`, PAL.gold);
        if (!e.auto) this.say("wave", true);
        this.saveRun();
      } else if (e.type === "waveCleared") {
        const total = e.bonus + e.income + e.interest;
        this.float(core.x, core.y - 0.6, `Wave ${e.wave} · +${total}`, PAL.gold);
        sfx.ready();
        this.recordBest();
        this.saveRun();
        this.say("clear", true);
      } else if (e.type === "leak") {
        sfx.leak();
        if (!this.lowTold && e.lives <= this.sim.maxLives * 0.35) {
          this.lowTold = true;
          this.say("low", true);
        } else {
          this.say("leak");
        }
      } else if (e.type === "bossSpawned") {
        this.banner = `BOSS · ${CREEPS[e.kind].name.toUpperCase()}`;
        this.bannerLife = 2.4;
      } else if (e.type === "bossKilled") {
        sfx.kill(true);
        this.float(core.x, core.y + 0.6, `${CREEPS[e.kind].name} down · +${e.gold}`, PAL.gold);
        this.say("kill", true);
      } else if (e.type === "spell") {
        const spec = CONFIG.td.spells[e.key];
        // Stillness lingers as long as its slow; the storm is a flash.
        const life = e.key === "still" ? Math.min(4, spec.cooldown) : 1.4;
        this.spellFx.push({ key: e.key, text: e.text, life, total: life });
        this.banner = `${spec.name.toUpperCase()} · ${e.hit} HIT`;
        this.bannerLife = 1.8;
        if (e.key === "storm") sfx.kill(true);
        else sfx.bless();
      } else if (e.type === "rep") {
        const times = e.count > 1 ? `×${e.count} ` : "";
        this.float(core.x, core.y - 0.9, `${times}+${e.flux} flux${e.gold ? ` +${e.gold}` : ""}`, PAL.violet);
      } else if (e.type === "riftSummoned") {
        this.banner = "RIFT TITAN SUMMONED";
        this.bannerLife = 2.4;
        sfx.bless();
      } else if (e.type === "riftKilled") {
        sfx.kill(true);
        this.float(core.x, core.y + 0.9, `Rift slain · +${e.flux} flux`, PAL.violet);
        this.banner = `+${e.flux} FLUX · +${Math.round(e.boost * 100)}% A REP`;
        this.bannerLife = 2.4;
        this.saveRun();
      } else if (e.type === "over") {
        this.finish();
      }
    }
  }

  private finish() {
    this.tdFlushReps();
    this.recordBest();
    this.clearRun();
    sfx.over();
    useGame.setState({ phase: "over", paused: false, drawer: false });
    this.message = `The core fell during wave ${this.sim.wave}, after ${this.sim.cleared} cleared.`;
    this.say("over", true);
    this.pushView(true);
  }

  private pushView(force: boolean) {
    const now = performance.now();
    if (!force && now - this.viewAt < 100) return;
    this.viewAt = now;
    const sim = this.sim;
    const sel = this.selected;
    const tower = sel ? towerAt(sim, sel.col, sel.row) : undefined;
    const busy = sim.spawners.length > 0 || sim.creeps.length > 0;
    const plan = tower ? maxUpgrades(sim, tower) : { levels: 0, cost: 0 };
    const boss = leadBoss(sim);
    const view: TdView = {
      phase: sim.phase,
      gold: sim.gold,
      lives: sim.lives,
      maxLives: sim.maxLives,
      wave: sim.wave,
      cleared: sim.cleared,
      kills: sim.kills,
      bestWave: this.bestWave,
      bests: this.save.bests,
      active: sim.spawners.length,
      pending: pending(sim),
      onBoard: sim.creeps.length,
      auto: sim.auto,
      speed: this.speed,
      nextBonus: busy ? earlyBonus(sim.wave + 1) : 0,
      bossNext: bossesFor(sim.wave + 1).length > 0,
      selected: sel,
      canBuild: sel ? buildable(sim.map, sel.col, sel.row) && !tower : false,
      tower: tower
        ? {
            key: tower.key,
            level: tower.level,
            damage: tower.stats.damage * auraBonus(sim, tower),
            rate: tower.stats.rate,
            range: tower.stats.range,
            upgradeCost: upgradeCost(tower.key, tower.level, sim.perks),
            sellValue: refundFor(sim, tower),
            undo: undoable(sim, tower),
            maxLevels: plan.levels,
            maxCost: plan.cost,
            boosts: tower.stats.aura > 0 || tower.stats.haste > 0 ? sim.towers.filter((o) => o !== tower && inCircle(tower, o)).length : 0,
            muses: musesOf(sim, tower).length,
            targeting: tower.targeting,
            aura: auraBonus(sim, tower) - 1,
            haste: hasteBonus(sim, tower) - 1,
            path: tower.path,
            pathCost: pathCost(tower.key, sim.perks),
            ascend: tower.ascend,
            ascendCost: ascendCost(tower.key, sim.perks),
            dealt: tower.dealt,
            kills: tower.kills,
            currency: currencyOf(tower.key),
          }
        : null,
      perks: { ...sim.perks },
      difficulty: sim.difficulty,
      spells: { ...sim.spells },
      next: wavePreview(sim.wave + 1),
      boss: boss ? { kind: boss.kind, pct: Math.max(0, boss.hp / boss.maxHp) } : null,
      report: damageReport(sim),
      flux: sim.flux,
      reps: sim.reps,
      lastRepAt: sim.lastRepAt,
      fluxPerRep: fluxPerRep(sim.voidPerks, sim.fluxBoost),
      repGold: repGold(sim.voidPerks),
      fluxBoost: sim.fluxBoost,
      voidPerks: { ...sim.voidPerks },
      summonCost: summonCost(sim.wave),
      summonReward: summonReward(sim.wave),
      message: this.message,
    };
    useGame.setState({ tdView: view });
  }

  // ---- Drawing ----

  private px(x: number) {
    return this.ox + x * this.cell;
  }

  private py(y: number) {
    return this.oy + y * this.cell;
  }

  private font(ctx: CanvasRenderingContext2D, font: string) {
    if (font === this.fontNow) return;
    ctx.font = font;
    this.fontNow = font;
  }

  private draw() {
    const ctx = this.ctx;
    const { settings, lines, chrome } = useGame.getState();
    const dpr = this.backdrop.dpr;
    this.geometry();
    // Other code (the backdrop) sets fonts too, so start each frame unsure of the current one.
    this.fontNow = "";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.backdrop.drawBinary(
      ctx,
      settings,
      this.time * (this.reduce ? CONFIG.rain.reducedMotionSpeed : CONFIG.rain.speed),
    );
    this.drawBoard(ctx);
    this.drawRange(ctx);
    this.drawTowers(ctx);
    this.drawCore(ctx, lines);
    // The text goes over the board, so nothing on it hides a word. The word-opacity setting keeps it readable.
    this.backdrop.drawField(
      ctx,
      { ...settings, opacity: settings.opacity * 0.75 },
      lines,
      chrome,
      this.flashT,
      this.reduce,
    );
    this.fontNow = "";
    this.drawCreeps(ctx);
    this.drawBeams(ctx);
    this.drawShots(ctx);
    this.drawSpells(ctx);
    this.drawSelection(ctx);
    this.drawFloaters(ctx);
    this.drawBanner(ctx);
  }

  /** Draws the grid and the lane into a cache, once per size. */
  private drawBoard(ctx: CanvasRenderingContext2D) {
    const dpr = this.backdrop.dpr;
    const s = this.cell;
    const map = this.sim.map;
    const key = `${map.key}|${this.w}|${this.h}|${dpr}|${s}|${this.ox}|${this.oy}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      const b = this.board;
      b.width = Math.ceil(COLS * s * dpr) + 2;
      b.height = Math.ceil(ROWS * s * dpr) + 2;
      const g = b.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const lane = map.lane.has(`${c},${r}`);
            g.fillStyle = lane ? "rgba(168, 85, 247, 0.14)" : "rgba(0, 255, 255, 0.035)";
            g.fillRect(c * s, r * s, s, s);
            g.strokeStyle = lane ? "rgba(168, 85, 247, 0.22)" : "rgba(0, 255, 255, 0.13)";
            g.lineWidth = 1;
            g.strokeRect(c * s + 0.5, r * s + 0.5, s - 1, s - 1);
          }
        }
        // Each lane's centre line, with a soft glow, from its gate to the core.
        g.beginPath();
        for (const lane of map.lanes) {
          lane.waypoints.forEach(([c, r], i) => {
            const x = (c + 0.5) * s;
            const y = (r + 0.5) * s;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          });
        }
        g.lineJoin = "round";
        g.strokeStyle = "rgba(168, 85, 247, 0.28)";
        g.lineWidth = s * 0.34;
        g.stroke();
        g.strokeStyle = "rgba(240, 171, 252, 0.45)";
        g.lineWidth = 1.5;
        g.setLineDash([4, 6]);
        g.stroke();
        g.setLineDash([]);
        g.font = `${Math.max(8, s * 0.22)}px ${DISPLAY}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = PAL.violet;
        for (const lane of map.lanes)
          g.fillText("GATE", (lane.gate[0] + 0.5) * s, (lane.gate[1] + 0.5) * s);
      }
    }
    ctx.drawImage(this.board, this.ox, this.oy, this.board.width / dpr, this.board.height / dpr);
  }

  private drawRange(ctx: CanvasRenderingContext2D) {
    const sel = this.selected;
    if (!sel) return;
    const t = towerAt(this.sim, sel.col, sel.row);
    if (!t || t.stats.range <= 0) return;
    const cx = this.px(t.col + 0.5);
    const cy = this.py(t.row + 0.5);
    const color = TOWERS[t.key].color;
    const support = t.stats.rate <= 0;
    ctx.beginPath();
    ctx.arc(cx, cy, t.stats.range * this.cell, 0, Math.PI * 2);
    ctx.fillStyle = support ? "rgba(232, 200, 114, 0.07)" : "rgba(0, 255, 255, 0.05)";
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
    const s = this.cell;
    // A Muse: mark every tower it boosts. Any other tower: link it to the Muses boosting it.
    if (t.stats.aura > 0 || t.stats.haste > 0) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      for (const o of this.sim.towers) {
        if (o === t || o.stats.rate <= 0 || !inCircle(t, o)) continue;
        const x = this.px(o.col);
        const y = this.py(o.row);
        const k = s * 0.22;
        ctx.beginPath();
        for (const [ax, ay, dx, dy] of [
          [x + 2, y + 2, 1, 1],
          [x + s - 2, y + 2, -1, 1],
          [x + 2, y + s - 2, 1, -1],
          [x + s - 2, y + s - 2, -1, -1],
        ] as const) {
          ctx.moveTo(ax + dx * k, ay);
          ctx.lineTo(ax, ay);
          ctx.lineTo(ax, ay + dy * k);
        }
        ctx.stroke();
      }
    } else if (!support) {
      ctx.strokeStyle = "rgba(232, 200, 114, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      for (const m of musesOf(this.sim, t)) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(this.px(m.col + 0.5), this.py(m.row + 0.5));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  private drawTowers(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.sim.towers) {
      const x = this.px(t.col);
      const y = this.py(t.row);
      const pad = s * 0.12;
      const spec = TOWERS[t.key];
      const color = spec.color;
      if (spec.aura || spec.vuln) {
        ctx.beginPath();
        ctx.arc(
          x + s / 2,
          y + s / 2,
          s * 0.55 + Math.sin(this.time * 2) * s * 0.03,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = spec.vuln ? "rgba(255, 107, 214, 0.08)" : "rgba(134, 239, 172, 0.08)";
        ctx.fill();
      }
      if (isVoid(t.key)) {
        // The void set: a black round body, a glowing ring, and a small orbit.
        const cx = x + s / 2;
        const cy = y + s / 2;
        const rad = s / 2 - pad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.94)";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = t.level >= MAX_TOWER_LEVEL ? 2.4 : 1.6;
        ctx.stroke();
        const a = this.time * 1.6 + t.id;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, Math.max(1.5, s * 0.05), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(2, 0, 5, 0.86)";
        ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = t.level >= MAX_TOWER_LEVEL ? 2.2 : 1.5;
        ctx.strokeRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      }
      ctx.fillStyle = color;
      this.font(ctx, `${Math.max(8, s * 0.24)}px ${FONT}`);
      ctx.fillText(spec.label, x + s / 2, y + s * 0.44);
      const pips = Math.min(t.level, MAX_TOWER_LEVEL);
      const gap = s * 0.13;
      const start = x + s / 2 - ((pips - 1) * gap) / 2;
      for (let i = 0; i < pips; i++) {
        ctx.beginPath();
        ctx.arc(start + i * gap, y + s - pad - s * 0.1, Math.max(1.2, s * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      const mastery = masteryOf(t.level);
      if (mastery > 0) {
        this.font(ctx, `${Math.max(7, s * 0.18)}px ${FONT}`);
        ctx.fillStyle = PAL.gold;
        ctx.fillText(`★${mastery}`, x + s - pad - s * 0.13, y + pad + s * 0.12);
      }
    }
  }

  /** The wake core: see-through, with the loaded text as a raw image inside it. */
  private drawCore(ctx: CanvasRenderingContext2D, lines: string[]) {
    const s = this.cell;
    const cx = this.px(this.sim.map.core[0] + 0.5);
    const cy = this.py(this.sim.map.core[1] + 0.5);
    const pulse = 1 + Math.sin(this.time * 2.2) * 0.04;
    const r = s * 0.6 * pulse;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 1.9);
    g.addColorStop(0, "rgba(232, 200, 114, 0.3)");
    g.addColorStop(0.45, "rgba(0, 255, 255, 0.22)");
    g.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    drawCoreImage(ctx, lines, cx, cy, r, this.time * 0.25, 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.cyan;
    ctx.stroke();
    const frac = Math.max(0, Math.min(1, this.sim.lives / Math.max(1, this.sim.maxLives)));
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = frac < 0.35 ? PAL.danger : PAL.cyan;
    ctx.arc(cx, cy, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  /**
   * Creeps are plain dots in their kind's colour (pale blue while slowed, orange while
   * burning), drawn in one batch per colour, with a thin health bar once hurt. Only
   * bosses get a full shape, a name and a wide bar. Hundreds of creeps cost a handful
   * of draw calls this way.
   */
  private drawCreeps(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    const dots = new Map<string, number[]>();
    const bars: number[] = [];
    const marks: number[] = [];
    for (const c of this.sim.creeps) {
      const spec = CREEPS[c.kind];
      if (spec.boss) {
        this.drawBoss(ctx, c.kind, this.px(c.x), this.py(c.y), c.hp / c.maxHp);
        continue;
      }
      // Spread creeps across three thin lanes, so stacked waves do not sit on top of each other.
      const ahead = pointAt(this.sim.map, c.dist + 0.05);
      const dx = ahead.x - c.x;
      const dy = ahead.y - c.y;
      const len = Math.hypot(dx, dy);
      const lane = len > 0 ? ((c.id % 3) - 1) * 0.2 : 0;
      const px = this.px(c.x + (len > 0 ? (-dy / len) * lane : 0));
      const py = this.py(c.y + (len > 0 ? (dx / len) * lane : 0));
      const r = Math.max(2, s * spec.size * 0.6);
      const color = c.slowTime > 0 ? "#9fd3ff" : c.burnTime > 0 ? "#ff9f43" : spec.color;
      let list = dots.get(color);
      if (!list) dots.set(color, (list = []));
      list.push(px, py, r);
      if (c.hp < c.maxHp) bars.push(px - r, py - r - 4, 2 * r * Math.max(0, c.hp / c.maxHp));
      if (c.vuln > 0 || c.shred > 0) marks.push(px, py, r + 2);
    }
    ctx.globalAlpha = 0.9;
    for (const [color, list] of dots) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 3) {
        const x = list[i]!;
        const y = list[i + 1]!;
        const r = list[i + 2]!;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.fg;
    for (let i = 0; i < bars.length; i += 3) ctx.fillRect(bars[i]!, bars[i + 1]!, bars[i + 2]!, 2);
    // Creeps an Eraser has marked: one thin ring each, in one stroke.
    if (marks.length) {
      ctx.strokeStyle = TOWERS.eraser.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < marks.length; i += 3) {
        ctx.moveTo(marks[i]! + marks[i + 2]!, marks[i + 1]!);
        ctx.arc(marks[i]!, marks[i + 1]!, marks[i + 2]!, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  private drawBoss(
    ctx: CanvasRenderingContext2D,
    kind: CreepKind,
    px: number,
    py: number,
    pct: number,
  ) {
    const s = this.cell;
    const spec = CREEPS[kind];
    const r = s * spec.size;
    const turn = this.time * 0.4;
    ctx.beginPath();
    for (let i = 0; i < spec.sides; i++) {
      const a = turn + (i / spec.sides) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
      else ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(2, 0, 5, 0.62)";
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = spec.color;
    ctx.stroke();
    const bw = s * 1.1;
    ctx.fillStyle = "rgba(2, 0, 5, 0.7)";
    ctx.fillRect(px - bw / 2, py - r - 7, bw, 4);
    ctx.fillStyle = spec.color;
    ctx.fillRect(px - bw / 2, py - r - 7, bw * Math.max(0, pct), 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = PAL.fg;
    this.font(ctx, `${Math.max(7, s * 0.22)}px ${FONT}`);
    ctx.fillText(spec.label, px, py);
    this.font(ctx, `${Math.max(8, s * 0.2)}px ${DISPLAY}`);
    ctx.fillStyle = spec.color;
    const name = spec.name.toUpperCase();
    const nw = ctx.measureText(name).width;
    // Above the boss, or below it when that would leave the board.
    const above = py - r - 15;
    const ny = above < this.oy + 6 ? py + r + 12 : above;
    ctx.fillText(name, clampCenter(px, nw, this.ox, this.ox + COLS * s), ny);
  }

  private drawBeams(ctx: CanvasRenderingContext2D) {
    const size = Math.max(8, this.cell * 0.2);
    for (const b of this.sim.beams) {
      const a = Math.max(0, Math.min(1, b.life / b.total));
      const color = TOWERS[b.key].color;
      ctx.globalAlpha = TOWERS[b.key].beam ? 0.85 : a;
      ctx.strokeStyle = color;
      ctx.lineWidth = TOWERS[b.key].beam ? 2.5 : 1.8;
      ctx.beginPath();
      b.points.forEach((p, i) => {
        const x = this.px(p.x);
        const y = this.py(p.y);
        if (i === 0) {
          ctx.moveTo(x, y);
          return;
        }
        // Instant strikes crackle; beams stay straight.
        if (!TOWERS[b.key].beam) {
          const prev = b.points[i - 1]!;
          const mx = (this.px(prev.x) + x) / 2 + Math.sin(this.time * 40 + i) * 4;
          const my = (this.py(prev.y) + y) / 2 + Math.cos(this.time * 37 + i) * 4;
          ctx.lineTo(mx, my);
        }
        ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (b.text) {
        const end = b.points[Math.min(1, b.points.length - 1)]!;
        const start = b.points[0]!;
        const tx = this.px((start.x + end.x) / 2);
        const ty = this.py((start.y + end.y) / 2);
        this.drawWord(ctx, b.text, tx, ty - 6, size, color);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A whole phrase around a point: on one line when it fits the board's width,
   * otherwise smaller and wrapped onto more lines, never cut. Kept inside the board,
   * with a dark edge so it reads over anything.
   */
  private drawWord(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ) {
    if (this.cell !== this.phraseCell || this.phraseFits.size > 3000) {
      this.phraseFits.clear();
      this.phraseCell = this.cell;
    }
    const left = this.ox + 2;
    const right = this.ox + COLS * this.cell - 2;
    const id = `${size}|${text}`;
    let fit = this.phraseFits.get(id);
    if (!fit) {
      fit = fitPhrase(
        text,
        { w: right - left, h: size * 1.25 * 3 },
        { max: size, min: Math.min(size, 6) },
        this.backdrop.measure,
      );
      this.phraseFits.set(id, fit);
    }
    if (!fit.rows.length) return;
    const lh = fit.size * 1.25;
    const cx = clampCenter(x, fit.width, left, right);
    const top = this.oy + lh / 2;
    const bottom = this.oy + ROWS * this.cell - lh / 2 - (fit.rows.length - 1) * lh;
    const y0 = Math.max(top, Math.min(bottom, y - ((fit.rows.length - 1) * lh) / 2));
    this.font(ctx, `${fit.size}px ${FONT}`);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, fit.size * 0.3);
    ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
    ctx.fillStyle = color;
    fit.rows.forEach((row, i) => {
      ctx.strokeText(row, cx, y0 + i * lh);
      ctx.fillText(row, cx, y0 + i * lh);
    });
  }

  private drawShots(ctx: CanvasRenderingContext2D) {
    const size = Math.max(8, this.cell * 0.22);
    for (const sh of this.sim.shots) {
      const x = this.px(sh.x);
      const y = this.py(sh.y);
      const color = TOWERS[sh.key].color;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      this.drawWord(ctx, sh.text, x, y - size * 0.8, size, color);
    }
    ctx.globalAlpha = 1;
  }

  /** Ink Storm flashes the board with its phrase; Stillness tints it blue while it holds. */
  private drawSpells(ctx: CanvasRenderingContext2D) {
    const w = COLS * this.cell;
    const h = ROWS * this.cell;
    for (const fx of this.spellFx) {
      const a = Math.max(0, Math.min(1, fx.life / fx.total));
      if (fx.key === "storm") {
        ctx.globalAlpha = a * a * 0.35;
        ctx.fillStyle = PAL.cyan;
        ctx.fillRect(this.ox, this.oy, w, h);
      } else {
        ctx.globalAlpha = Math.min(1, a * 2) * 0.16;
        ctx.fillStyle = "#4f8cff";
        ctx.fillRect(this.ox, this.oy, w, h);
      }
      ctx.globalAlpha = Math.min(1, a * 1.6);
      if (fx.text) {
        this.drawWord(
          ctx,
          fx.text,
          this.ox + w / 2,
          this.oy + h * 0.62,
          Math.max(12, this.cell * 0.42),
          fx.key === "storm" ? PAL.cyan : "#9fd3ff",
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSelection(ctx: CanvasRenderingContext2D) {
    const sel = this.selected;
    if (!sel) return;
    const s = this.cell;
    const ok = buildable(this.sim.map, sel.col, sel.row) || towerAt(this.sim, sel.col, sel.row);
    ctx.strokeStyle = ok ? PAL.gold : PAL.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.px(sel.col) + 1, this.py(sel.row) + 1, s - 2, s - 2);
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    const size = Math.max(9, this.cell * 0.26);
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      this.drawWord(ctx, f.text, this.px(f.x), this.py(f.y), size, f.color);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    if (this.bannerLife <= 0) return;
    const size = Math.max(12, Math.min(22, this.cell * 0.5));
    ctx.globalAlpha = Math.max(0, Math.min(1, this.bannerLife));
    this.font(ctx, `700 ${size}px ${DISPLAY}`);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Mid-board, just above the core, clear of the gate where bosses enter.
    const x = this.ox + (COLS * this.cell) / 2;
    const y = this.oy + this.cell * 3.3;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(2, 0, 5, 0.85)";
    ctx.strokeText(this.banner, x, y);
    ctx.fillStyle = PAL.gold;
    ctx.fillText(this.banner, x, y);
    ctx.globalAlpha = 1;
  }
}

/** Words for each targeting rule. */
export function targetCopy(t: string): string {
  return t === "first"
    ? "creep furthest along"
    : t === "last"
      ? "newest creep"
      : t === "strong"
        ? "toughest creep"
        : "closest creep";
}
