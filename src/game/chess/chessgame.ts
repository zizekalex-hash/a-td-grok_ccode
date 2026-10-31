import { sfx } from "@/game/audio";
import { loadPieceFont, PIECE_FONT, TEXT_VS } from "@/game/pieceFont";
import { shotText } from "@/game/engine";
import { Backdrop } from "@/game/backdrop";
import { CONFIG } from "@/game/config";
import { pickCouncilLine, QUEEN } from "@/game/council";
import { pickLine, type Mood } from "@/game/dialogue";
import { FrameLimiter, frameStats, renderDpr } from "@/game/frameLimiter";
import { clampCenter, fitPhrase, type PhraseFit } from "@/game/layout";
import { cancelNarration, narrate } from "@/game/narrator";
import { DISPLAY, FONT, PAL } from "@/game/palette";
import { getGame, setActiveGame, type GameBase } from "@/game/registry";
import { readPhrase, type Cursor } from "@/game/reader";
import { setSpeech, useGame, type ChessView } from "@/game/store";
import { GLYPH, HOME_ROWS, PIECES, pieceStats, sellValue, SIZE, xpNeed, type PieceKey } from "./rules.ts";
import {
  benchAt,
  benchPieces,
  boardLimit,
  boardPieces,
  bossFor,
  buy,
  buyXp,
  createGame,
  isHome,
  move,
  myTraits,
  nextRound,
  owned,
  pieceAt,
  refresh,
  sell,
  startFight,
  step,
  type Area,
  type ChessEvent,
  type ChessState,
  type Fighter,
} from "./sim.ts";

const CH = CONFIG.chess;
const BEST_KEY = "azshara-chess-v1";
/** Space between the board and the bench, in squares. */
const BENCH_GAP = 0.35;

const SIDE_COLOR = [PAL.cyan, PAL.danger] as const;
const SPLAT = {
  hit: { fill: "#b3121f", edge: "#ff8a8a" },
  miss: { fill: "#1d4fbf", edge: "#8fb4ff" },
  heal: { fill: "#23803a", edge: "#9ff0b0" },
  shield: { fill: "#9a7a14", edge: "#f5dc8c" },
} as const;
/** Where stacked splats on one piece sit, in squares from its centre (RuneScape's four places). */
const SPLAT_SLOTS: [number, number][] = [
  [0, 0.12],
  [0, -0.2],
  [-0.24, 0.26],
  [0.24, 0.26],
];

function readBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    const best = Number((data as { best?: unknown } | null)?.best);
    return Number.isFinite(best) && best > 0 ? best : 0;
  } catch {
    return 0;
  }
}

type Hit = { area: Area; col: number; row: number };

interface Splat {
  target: number;
  x: number;
  y: number;
  text: string;
  kind: keyof typeof SPLAT;
  life: number;
  slot: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  total: number;
  size: number;
}

interface Strike {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  color: string;
  life: number;
}

interface Ghost {
  x: number;
  y: number;
  kind: PieceKey;
  side: 0 | 1;
  star: number;
  life: number;
}

function pieceName(kind: PieceKey, star: number): string {
  return `${PIECES[kind].name}${star > 1 ? ` ${"★".repeat(star)}` : ""}`;
}

/** The auto-chess mode: buy pieces, set them on your half, and they fight the other side by themselves. */
export class ChessGame implements GameBase {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private limiter = new FrameLimiter();
  private renderScale = 0;
  private sim: ChessState = createGame();
  private best = readBest();
  private cursor: Cursor = { line: 0, word: 0 };
  private selected: number | null = null;
  private drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; pointer: number } | null =
    null;
  private message = "Buy pieces in the shop, then press Fight.";
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private flashT = 0;
  private reduce = false;
  private ro: ResizeObserver | null = null;
  private viewAt = 0;
  private saidAt = -10;
  private soundAt = 0;
  private speed = 1;
  private splats: Splat[] = [];
  private floaters: Floater[] = [];
  private strikes: Strike[] = [];
  private ghosts: Ghost[] = [];
  /** Where each fighter is drawn, gliding toward its square. */
  private shown = new Map<number, { x: number; y: number }>();
  private banner = "";
  private bannerSub = "";
  private bannerColor: string = PAL.gold;
  private bannerLife = 0;
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private w = 1;
  private h = 1;
  private board: HTMLCanvasElement = document.createElement("canvas");
  private boardKey = "";
  private fontNow = "";
  private phraseFits = new Map<string, PhraseFit>();
  private phraseCell = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
  }

  start() {
    setActiveGame(this);
    loadPieceFont();
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("keydown", this.onKey);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.pushView(true);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("keydown", this.onKey);
    cancelNarration();
    if (getGame() === this) setActiveGame(null);
  }

  private reset() {
    this.sim = createGame();
    this.selected = null;
    this.drag = null;
    this.splats = [];
    this.floaters = [];
    this.strikes = [];
    this.ghosts = [];
    this.shown.clear();
    this.bannerLife = 0;
  }

  engage() {
    sfx.unlock();
    this.reset();
    this.speed = 1;
    this.message = "Buy pieces: they go straight onto the board. Three alike merge into a stronger one.";
    useGame.setState({ phase: "battle", tomeOpen: false, paused: false, drawer: false });
    this.showBanner("ROUND 1", "Set your board, then Fight", PAL.cyan);
    this.say("engage", true);
    this.pushView(true);
  }

  toTitle() {
    this.reset();
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
      localStorage.setItem(BEST_KEY, JSON.stringify({ best: this.best }));
    } catch {
      /* private mode / quota */
    }
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
        Mode: "auto chess",
        Round: this.sim.round,
        Life: this.sim.hp,
        Gold: this.sim.gold,
        "Pieces on the board": boardPieces(this.sim).length,
      },
      (speaker, text) => {
        if (!this.running) return;
        this.saidAt = this.time;
        setSpeech(speaker, text);
      },
    );
  }

  // ---- Commands from the HUD and the keys ----

  chessBuy(slot: number) {
    sfx.unlock();
    const kind = this.sim.shop[slot];
    const r = buy(this.sim, slot);
    if (r.ok && kind) {
      sfx.ready();
      const p = this.sim.pieces.find((q) => q.id === r.id);
      this.note(
        p
          ? p.area === "board"
            ? `${PIECES[kind].name} set on the board.`
            : `${PIECES[kind].name} waits on the bench.`
          : `${PIECES[kind].name} merged.`,
      );
    } else if (!r.ok) this.note(r.reason);
    this.drainEvents();
  }

  chessSell() {
    if (this.selected === null) return this.note("Tap a piece to sell it.");
    const p = this.sim.pieces.find((q) => q.id === this.selected);
    const r = sell(this.sim, this.selected);
    if (r.ok && p) {
      this.selected = null;
      this.note(`Sold for ${sellValue(p.kind, p.star)} gold.`);
    } else if (!r.ok) this.note(r.reason);
  }

  chessRefresh() {
    const r = refresh(this.sim);
    this.note(r.ok ? "A new shop." : r.reason);
  }

  chessXp() {
    const r = buyXp(this.sim);
    if (!r.ok) this.note(r.reason);
    this.drainEvents();
    this.pushView(true);
  }

  /** Starts the fight; during the round's result it goes straight to the next round. */
  chessFight() {
    sfx.unlock();
    if (this.sim.phase === "result") {
      nextRound(this.sim);
      this.drainEvents();
      return this.pushView(true);
    }
    const r = startFight(this.sim);
    if (!r.ok) return this.note(r.reason);
    // Pieces on the board are fighting now; a piece picked on the bench stays picked.
    const picked = this.sim.pieces.find((p) => p.id === this.selected);
    if (picked?.area !== "bench") this.selected = null;
    this.shown.clear();
    for (const f of this.sim.fighters) this.shown.set(f.id, { x: f.col, y: f.row });
    this.message = "They fight on their own. Shop for the bench while you watch.";
    this.drainEvents();
    this.pushView(true);
  }

  chessSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.note(`Speed ${this.speed}×`);
  }

  private note(message: string) {
    this.message = message;
    this.pushView(true);
  }

  // ---- Input ----

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (useGame.getState().phase !== "battle") return;
    const key = e.key.toLowerCase();
    const n = Number(e.key);
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePause();
    } else if (n >= 1 && n <= this.sim.shop.length) this.chessBuy(n - 1);
    else if (key === "g" || key === "enter") this.chessFight();
    else if (key === "d") this.chessRefresh();
    else if (key === "x") this.chessXp();
    else if (key === "s") this.chessSell();
    else if (key === "f") this.chessSpeed();
    else if (e.key === "Escape" && this.selected !== null) {
      // Clearing the selection uses up the key; the next Esc opens the menu.
      e.preventDefault();
      this.selected = null;
      this.pushView(true);
    }
  };

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || useGame.getState().phase !== "battle") return;
    sfx.unlock();
    const { x, y } = this.local(e);
    const hit = this.hitAt(x, y);
    const piece = hit ? this.ownedAt(hit) : undefined;
    if (piece && this.movable(piece.area)) {
      this.drag = { id: piece.id, x, y, sx: x, sy: y, moved: false, pointer: e.pointerId };
    } else {
      this.tap(hit);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer) return;
    const { x, y } = this.local(e);
    d.x = x;
    d.y = y;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > Math.max(8, this.cell * 0.2)) {
      d.moved = true;
      this.selected = d.id;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer) return;
    this.drag = null;
    const { x, y } = this.local(e);
    const hit = this.hitAt(x, y);
    if (!d.moved) return this.tap(hit);
    if (hit) this.tryMove(d.id, hit);
    this.pushView(true);
  };

  private onPointerCancel = () => {
    this.drag = null;
  };

  private movable(area: Area) {
    const phase = this.sim.phase;
    return phase !== "over" && (phase !== "fight" || area === "bench");
  }

  private ownedAt(hit: Hit) {
    if (hit.area === "bench") return benchAt(this.sim, hit.col);
    return this.sim.phase === "fight" ? undefined : pieceAt(this.sim, hit.col, hit.row);
  }

  private tryMove(id: number, hit: Hit) {
    const r = move(this.sim, id, hit.area, hit.col, hit.row);
    // Either way the selection clears, so the reason for a refusal shows where the piece card was.
    this.selected = null;
    if (r.ok) {
      sfx.shield();
      this.message = "";
    } else this.message = r.reason;
  }

  /** A tap picks a piece, moves the picked one to an empty place, or tells about an enemy. */
  private tap(hit: Hit | null) {
    if (!hit) {
      this.selected = null;
      return this.pushView(true);
    }
    const piece = this.ownedAt(hit);
    if (piece) {
      this.selected = this.selected === piece.id ? null : piece.id;
      const st = pieceStats(piece.kind, piece.star);
      if (this.selected !== null) {
        this.message = `${pieceName(piece.kind, piece.star)}: ${st.hp} life, max hit ${st.maxHit}. Drag or tap a square to move it.`;
      }
      return this.pushView(true);
    }
    if (this.selected !== null && this.sim.pieces.some((p) => p.id === this.selected)) {
      this.tryMove(this.selected, hit);
      return this.pushView(true);
    }
    if (hit.area === "board") this.describe(hit.col, hit.row);
    this.pushView(true);
  }

  /** Tells about the piece on a square that is not yours: the other side's, or any piece in a fight. */
  private describe(col: number, row: number) {
    const s = this.sim;
    let info: { kind: PieceKey; star: number; hp: number; boss?: string } | null = null;
    if (s.phase === "plan") {
      const e = s.enemy.find((q) => q.col === col && q.row === row);
      if (e) info = { kind: e.kind, star: e.star, hp: Math.round(pieceStats(e.kind, e.star).hp * e.hpMult), boss: e.boss };
    } else {
      const f = s.fighters.find((q) => !q.dead && q.col === col && q.row === row);
      if (f) info = { kind: f.kind, star: f.star, hp: f.maxHp, boss: f.boss };
    }
    if (info) {
      this.message = `${info.boss ? `${info.boss}, a ` : ""}${pieceName(info.kind, info.star)}: ${info.hp} life. ${PIECES[info.kind].copy}`;
    }
  }

  // ---- Frame loop ----

  private geometry() {
    const box = this.backdrop.fieldBox(useGame.getState().chrome);
    const rows = SIZE + BENCH_GAP + 1;
    const cell = Math.max(10, Math.min(box.w / SIZE, box.h / rows));
    this.cell = cell;
    this.ox = Math.round(box.x + (box.w - SIZE * cell) / 2);
    this.oy = Math.round(box.y + (box.h - rows * cell) / 2);
  }

  private benchW() {
    return (SIZE * this.cell) / Math.max(1, CH.benchSize);
  }

  private benchY() {
    return this.oy + (SIZE + BENCH_GAP) * this.cell;
  }

  private hitAt(x: number, y: number): Hit | null {
    this.geometry();
    const col = Math.floor((x - this.ox) / this.cell);
    const row = Math.floor((y - this.oy) / this.cell);
    if (col >= 0 && col < SIZE && row >= 0 && row < SIZE) return { area: "board", col, row };
    const by = this.benchY();
    if (y >= by && y < by + this.cell) {
      const slot = Math.floor((x - this.ox) / this.benchW());
      if (slot >= 0 && slot < CH.benchSize) return { area: "bench", col: slot, row: 0 };
    }
    return null;
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

  private frame = (t: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const { fpsCap, renderScale } = useGame.getState().settings;
    if (!this.limiter.ready(t, fpsCap)) return;
    if (renderScale !== this.renderScale) this.resize();
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.tick(dt);
    this.draw();
    frameStats.draws += 1;
  };

  private tick(dt: number) {
    const { phase, paused, tomeOpen, settings, lines } = useGame.getState();
    this.time += dt;
    this.flashT += dt;
    this.backdrop.ensureBinary(settings, lines);
    const live = phase === "battle" && !paused && !tomeOpen;
    const rate = settings.gameSpeed * this.speed;
    if (live) {
      step(this.sim, dt, rate, () => shotText(this.cursor, readPhrase), settings.phraseEvery);
      this.drainEvents();
    }
    // Effects run at the game's pace, so 3× stays readable and a hold freezes them.
    const fx = live ? dt * Math.max(1, rate * 0.75) : 0;
    const glide = 1 - Math.exp(-dt * 14 * Math.max(1, rate));
    for (const f of this.sim.fighters) {
      const p = this.shown.get(f.id);
      if (!p) this.shown.set(f.id, { x: f.col, y: f.row });
      else if (!this.reduce) {
        p.x += (f.col - p.x) * glide;
        p.y += (f.row - p.y) * glide;
      } else {
        p.x = f.col;
        p.y = f.row;
      }
    }
    for (const s of this.splats) s.life -= fx;
    this.splats = this.splats.filter((s) => s.life > 0);
    for (const f of this.floaters) {
      f.life -= fx;
      f.y -= fx * 0.35;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const s of this.strikes) s.life -= fx;
    this.strikes = this.strikes.filter((s) => s.life > 0);
    for (const g of this.ghosts) g.life -= fx;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.bannerLife > 0) this.bannerLife -= dt;
    this.pushView(false);
  }

  private showBanner(text: string, sub: string, color: string) {
    this.banner = text;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerLife = 2.2;
  }

  private float(x: number, y: number, text: string, color: string, life = 1.3, size = 0.24) {
    if (this.floaters.length > 14) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life, total: life, size });
  }

  private splat(target: number, x: number, y: number, text: string, kind: keyof typeof SPLAT) {
    const used = new Set(this.splats.filter((s) => s.target === target).map((s) => s.slot));
    let slot = 0;
    while (used.has(slot) && slot < SPLAT_SLOTS.length - 1) slot += 1;
    if (this.splats.length > 40) this.splats.shift();
    this.splats.push({ target, x, y, text, kind, life: 0.95, slot });
  }

  private sound(play: () => void) {
    const now = performance.now();
    if (now - this.soundAt < 70) return;
    this.soundAt = now;
    play();
  }

  private posOf(id: number, x: number, y: number) {
    const p = this.shown.get(id);
    return p ? { x: p.x, y: p.y } : { x, y };
  }

  /** Reacts to what the simulation reports: splats, phrases, banners and sounds. */
  private drainEvents() {
    const events: ChessEvent[] = this.sim.events.splice(0);
    for (const e of events) {
      if (e.type === "attack") {
        const from = this.posOf(e.from, e.fx, e.fy);
        const to = this.posOf(e.to, e.tx, e.ty);
        if (this.strikes.length > 30) this.strikes.shift();
        this.strikes.push({
          fx: from.x,
          fy: from.y,
          tx: to.x,
          ty: to.y,
          color: e.ability ? PAL.gold : SIDE_COLOR[e.side],
          life: 0.3,
        });
        this.splat(e.to, to.x, to.y, String(e.dmg), e.hit ? "hit" : "miss");
        if (e.text) this.float((from.x + to.x) / 2, Math.min(from.y, to.y) - 0.15, e.text, SIDE_COLOR[e.side]);
        if (e.hit) this.sound(() => sfx.hit());
      } else if (e.type === "heal") {
        const at = this.posOf(e.to, e.x, e.y);
        this.splat(e.to, at.x, at.y, String(e.amount), "heal");
        if (e.text) this.float(at.x, at.y - 0.4, e.text, "#9ff0b0");
        sfx.bless();
      } else if (e.type === "shield") {
        const at = this.posOf(e.to, e.x, e.y);
        this.splat(e.to, at.x, at.y, String(e.amount), "shield");
        if (e.text) this.float(at.x, at.y - 0.4, e.text, PAL.gold);
        sfx.shield();
      } else if (e.type === "cast") {
        const at = this.posOf(e.id, e.x, e.y);
        this.float(at.x, at.y - 0.55, `${e.name.toUpperCase()}!`, PAL.gold, 1, 0.26);
      } else if (e.type === "die") {
        const at = this.posOf(e.id, e.x, e.y);
        const f = this.sim.fighters.find((g) => g.id === e.id);
        this.ghosts.push({ x: at.x, y: at.y, kind: e.kind, side: e.side, star: f?.star ?? 1, life: 0.6 });
        this.sound(() => sfx.kill(Boolean(e.boss)));
        if (e.boss) {
          this.showBanner(`${e.boss.toUpperCase()} FALLS`, "", PAL.gold);
          this.say("kill", true);
        }
      } else if (e.type === "promote") {
        const at = this.posOf(e.id, e.x, e.y);
        this.float(at.x, at.y - 0.5, "PROMOTED!", PAL.gold, 1.4, 0.28);
        if (e.text) this.float(at.x, at.y + 0.3, e.text, PAL.gold);
        sfx.bless();
      } else if (e.type === "fightStart") {
        if (e.boss) this.showBanner(`BOSS · ${e.boss.toUpperCase()}`, "", PAL.gold);
        this.say("wave");
      } else if (e.type === "result") {
        this.recordBest(this.sim.round);
        if (e.win) {
          this.showBanner("VICTORY", `Round ${e.round} won`, PAL.cyan);
          sfx.ready();
          this.say("clear", true);
          this.message = `Round ${e.round} won.`;
        } else {
          this.showBanner(e.timeout ? "STALEMATE" : "DEFEAT", `−${e.damage} life`, PAL.danger);
          sfx.leak();
          this.say(this.sim.hp <= CH.startHp * 0.35 ? "low" : "leak", true);
          this.message = `Round ${e.round} lost: ${e.survivors} enemy piece${e.survivors === 1 ? "" : "s"} left, −${e.damage} life.`;
        }
      } else if (e.type === "round") {
        const paid = e.income + e.interest + e.win;
        this.message = `Round ${e.round}: +${paid} gold (${e.income} income${e.interest ? `, ${e.interest} interest` : ""}${e.win ? `, ${e.win} for the win` : ""}).`;
        if (e.boss) this.showBanner(`ROUND ${e.round}`, `Boss: ${e.boss}`, PAL.gold);
        this.shown.clear();
        this.ghosts = [];
      } else if (e.type === "merge") {
        this.message = `Three alike merged: ${pieceName(e.kind, e.star)}.`;
        sfx.bless();
      } else if (e.type === "levelUp") {
        this.message = `Level ${e.level}: the board takes ${boardLimit(e.level)} pieces.`;
        sfx.ready();
      } else if (e.type === "over") {
        this.finish();
      }
    }
  }

  private recordBest(round: number) {
    if (round <= this.best) return;
    this.best = round;
    this.persist();
  }

  private finish() {
    this.recordBest(this.sim.round);
    sfx.over();
    useGame.setState({ phase: "over", paused: false, drawer: false });
    this.message = `Your life ran out in round ${this.sim.round}, after ${this.sim.wins} won.`;
    this.say("over", true);
    this.pushView(true);
  }

  private pushView(force: boolean) {
    const now = performance.now();
    if (!force && now - this.viewAt < 100) return;
    this.viewAt = now;
    const s = this.sim;
    let sel = this.selected !== null ? s.pieces.find((p) => p.id === this.selected) : undefined;
    if (!sel && this.selected !== null) this.selected = null;
    if (sel && s.phase === "fight" && sel.area === "board") sel = undefined;
    const view: ChessView = {
      phase: s.phase,
      round: s.round,
      hp: s.hp,
      maxHp: CH.startHp,
      gold: s.gold,
      level: s.level,
      xp: s.xp,
      xpNext: xpNeed(s.level),
      onBoard: boardPieces(s).length,
      limit: boardLimit(s.level),
      bench: benchPieces(s).length,
      shop: s.shop.map((k) => (k ? { kind: k, owned: owned(s, k, 1) } : null)),
      traits: myTraits(s).map((t) => ({
        key: t.key,
        name: t.name,
        copy: t.copy,
        count: t.count,
        step: t.step,
        next: t.next,
      })),
      selected: sel ? { id: sel.id, kind: sel.kind, star: sel.star, area: sel.area, sell: sellValue(sel.kind, sel.star) } : null,
      boss: bossFor(s.round)?.name ?? null,
      enemies: s.phase === "plan" ? s.enemy.length : s.fighters.filter((f) => f.side === 1 && !f.dead).length,
      lastWin: s.lastWin,
      lastDamage: s.lastDamage,
      speed: this.speed,
      best: this.best,
      wins: s.wins,
      kills: s.kills,
      message: this.message,
    };
    useGame.setState({ chessView: view });
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
    this.fontNow = "";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.backdrop.drawBinary(ctx, settings, this.time * (this.reduce ? CONFIG.rain.reducedMotionSpeed : CONFIG.rain.speed));
    this.drawBoard(ctx);
    this.drawZones(ctx);
    // Your text over the squares, under the pieces, kept faint so the pieces read.
    this.backdrop.drawField(ctx, { ...settings, opacity: settings.opacity * 0.45 }, lines, chrome, this.flashT, this.reduce);
    this.fontNow = "";
    this.drawPieces(ctx);
    this.drawStrikes(ctx);
    this.drawSplats(ctx);
    this.drawFloaters(ctx);
    this.drawBanner(ctx);
    this.drawDrag(ctx);
  }

  /** Squares, the bench and the rank and file letters, drawn into a cache once per size. */
  private drawBoard(ctx: CanvasRenderingContext2D) {
    const dpr = this.backdrop.dpr;
    const s = this.cell;
    const totalH = (SIZE + BENCH_GAP + 1) * s;
    const key = `${this.w}|${this.h}|${dpr}|${s}|${this.ox}|${this.oy}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      const b = this.board;
      b.width = Math.ceil(SIZE * s * dpr) + 2;
      b.height = Math.ceil(totalH * dpr) + 2;
      const g = b.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (let c = 0; c < SIZE; c++) {
          for (let r = 0; r < SIZE; r++) {
            const light = (c + r) % 2 === 0;
            g.fillStyle = light ? "rgba(0, 255, 255, 0.075)" : "rgba(168, 85, 247, 0.1)";
            g.fillRect(c * s, r * s, s, s);
          }
        }
        g.strokeStyle = "rgba(0, 255, 255, 0.35)";
        g.lineWidth = 1;
        g.strokeRect(0.5, 0.5, SIZE * s - 1, SIZE * s - 1);
        // The middle line between the two halves.
        g.strokeStyle = "rgba(232, 200, 114, 0.35)";
        g.setLineDash([4, 5]);
        g.beginPath();
        g.moveTo(0, (SIZE - HOME_ROWS) * s);
        g.lineTo(SIZE * s, (SIZE - HOME_ROWS) * s);
        g.stroke();
        g.setLineDash([]);
        g.font = `${Math.max(7, s * 0.16)}px ${FONT}`;
        g.fillStyle = "rgba(244, 247, 255, 0.35)";
        g.textBaseline = "top";
        g.textAlign = "left";
        for (let r = 0; r < SIZE; r++) g.fillText(String(SIZE - r), 2, r * s + 2);
        g.textAlign = "right";
        g.textBaseline = "bottom";
        for (let c = 0; c < SIZE; c++) g.fillText("abcdefgh"[c] ?? "", (c + 1) * s - 2, SIZE * s - 1);
        // Bench slots.
        const bw = (SIZE * s) / Math.max(1, CH.benchSize);
        const by = (SIZE + BENCH_GAP) * s;
        for (let i = 0; i < CH.benchSize; i++) {
          g.fillStyle = "rgba(2, 0, 5, 0.6)";
          g.fillRect(i * bw + 2, by, bw - 4, s);
          g.strokeStyle = "rgba(0, 255, 255, 0.25)";
          g.strokeRect(i * bw + 2.5, by + 0.5, bw - 5, s - 1);
        }
        g.font = `${Math.max(7, s * 0.15)}px ${DISPLAY}`;
        g.fillStyle = "rgba(0, 255, 255, 0.55)";
        g.textAlign = "left";
        g.textBaseline = "bottom";
        g.fillText("BENCH", 3, by - 1);
      }
    }
    ctx.drawImage(this.board, this.ox, this.oy, this.board.width / dpr, this.board.height / dpr);
  }

  /** While planning: your half glows, and with a piece picked, so do the places it can go. */
  private drawZones(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    if (this.sim.phase !== "plan" && this.sim.phase !== "result") return;
    const picked = this.drag?.moved ? this.drag.id : this.selected;
    ctx.fillStyle = picked !== null ? "rgba(232, 200, 114, 0.1)" : "rgba(0, 255, 255, 0.04)";
    ctx.fillRect(this.px(0), this.py(SIZE - HOME_ROWS), SIZE * s, HOME_ROWS * s);
    if (picked === null) return;
    const p = this.sim.pieces.find((q) => q.id === picked);
    if (!p) return;
    const x = p.area === "board" ? this.px(p.col) : this.ox + p.col * this.benchW();
    const y = p.area === "board" ? this.py(p.row) : this.benchY();
    const w = p.area === "board" ? s : this.benchW();
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, s - 3);
  }

  private drawPieces(ctx: CanvasRenderingContext2D) {
    const s = this.sim;
    const phase = s.phase;
    const dragging = this.drag?.moved ? this.drag.id : null;
    if (phase === "plan") {
      for (const e of s.enemy) {
        this.drawPiece(ctx, e.kind, e.star, this.px(e.col + 0.5), this.py(e.row + 0.5), 1, 0.6, e.boss);
      }
      for (const p of boardPieces(s)) {
        if (p.id === dragging) continue;
        this.drawPiece(ctx, p.kind, p.star, this.px(p.col + 0.5), this.py(p.row + 0.5), 0, 1);
      }
    } else {
      for (const g of this.ghosts) {
        this.drawPiece(ctx, g.kind, g.star, this.px(g.x + 0.5), this.py(g.y + 0.5), g.side, Math.max(0, g.life / 0.6) * 0.7);
      }
      for (const f of s.fighters) {
        if (f.dead) continue;
        const at = this.shown.get(f.id) ?? { x: f.col, y: f.row };
        const x = this.px(at.x + 0.5);
        const y = this.py(at.y + 0.5);
        this.drawPiece(ctx, f.kind, f.star, x, y, f.side, 1, f.boss, f.stun > 0);
        this.drawBars(ctx, f, x, y);
      }
    }
    const bw = this.benchW();
    for (const p of benchPieces(s)) {
      if (p.id === dragging) continue;
      this.drawPiece(ctx, p.kind, p.star, this.ox + (p.col + 0.5) * bw, this.benchY() + this.cell / 2, 0, 1, undefined, false, Math.min(this.cell, bw));
    }
  }

  private drawPiece(
    ctx: CanvasRenderingContext2D,
    kind: PieceKey,
    star: number,
    x: number,
    y: number,
    side: 0 | 1,
    alpha: number,
    boss?: string,
    stunned = false,
    size = this.cell,
  ) {
    const color = boss ? PAL.gold : SIDE_COLOR[side];
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size * (boss ? 0.47 : 0.41), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(2, 0, 5, 0.78)";
    ctx.fill();
    ctx.lineWidth = boss ? 2.4 : star >= 3 ? 2 : 1.4;
    ctx.strokeStyle = star >= 3 ? PAL.gold : color;
    ctx.stroke();
    this.font(ctx, `${Math.round(size * (boss ? 0.66 : 0.58))}px ${PIECE_FONT}`);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = stunned ? PAL.fg : color;
    ctx.fillText(GLYPH[kind] + TEXT_VS, x, y + size * 0.02);
    if (star > 1) {
      this.font(ctx, `${Math.max(7, Math.round(size * 0.17))}px ${FONT}`);
      ctx.fillStyle = PAL.gold;
      ctx.fillText("★".repeat(star), x, y + size * 0.33);
    }
    if (boss) {
      this.font(ctx, `${Math.max(7, Math.round(size * 0.15))}px ${DISPLAY}`);
      ctx.fillStyle = PAL.gold;
      const name = boss.toUpperCase();
      const w = ctx.measureText(name).width;
      const above = y - size * 0.62;
      ctx.fillText(name, clampCenter(x, w, this.ox, this.ox + SIZE * this.cell), above < this.oy + 6 ? y + size * 0.62 : above);
    }
    ctx.globalAlpha = 1;
  }

  /** Life (green on red, like RuneScape), shield (gold) and mana (blue) over a fighting piece. */
  private drawBars(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number) {
    const s = this.cell;
    const w = s * 0.72;
    const left = x - w / 2;
    const top = y - s * 0.47;
    const h = Math.max(2, s * 0.06);
    ctx.fillStyle = "#7a0d14";
    ctx.fillRect(left, top, w, h);
    ctx.fillStyle = "#33d14f";
    ctx.fillRect(left, top, w * Math.max(0, Math.min(1, f.hp / f.maxHp)), h);
    if (f.shield > 0) {
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(left, top - h * 0.8, w * Math.min(1, f.shield / f.maxHp), h * 0.6);
    }
    const max = PIECES[f.kind].ability.mana;
    if (max > 0) {
      ctx.fillStyle = "rgba(2, 0, 5, 0.8)";
      ctx.fillRect(left, top + h, w, h * 0.6);
      ctx.fillStyle = f.mana >= max ? PAL.gold : "#4f8cff";
      ctx.fillRect(left, top + h, w * Math.min(1, f.mana / max), h * 0.6);
    }
  }

  private drawStrikes(ctx: CanvasRenderingContext2D) {
    for (const st of this.strikes) {
      ctx.globalAlpha = Math.max(0, Math.min(1, st.life / 0.3));
      ctx.strokeStyle = st.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.px(st.fx + 0.5), this.py(st.fy + 0.5));
      ctx.lineTo(this.px(st.tx + 0.5), this.py(st.ty + 0.5));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** RuneScape hitsplats: red for damage, blue 0 for a miss, green for healing, gold for a shield. */
  private drawSplats(ctx: CanvasRenderingContext2D) {
    const s = this.cell;
    const r = Math.max(7, s * 0.16);
    this.font(ctx, `700 ${Math.max(8, Math.round(s * 0.2))}px ${FONT}`);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const sp of this.splats) {
      const [dx, dy] = SPLAT_SLOTS[sp.slot] ?? [0, 0];
      // Splats ride on the piece they hit while it moves.
      const on = this.shown.get(sp.target);
      const x = this.px((on?.x ?? sp.x) + 0.5 + dx);
      const y = this.py((on?.y ?? sp.y) + 0.5 + dy) - (0.95 - sp.life) * s * 0.15;
      const color = SPLAT[sp.kind];
      ctx.globalAlpha = Math.min(1, sp.life * 3);
      // A blob, not a circle: four bumps round a centre.
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.moveTo(x + Math.cos(a) * r * 0.45 + r * 0.62, y + Math.sin(a) * r * 0.45);
        ctx.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.62, 0, Math.PI * 2);
      }
      ctx.fillStyle = color.fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color.edge;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
      ctx.strokeText(sp.text, x, y + 0.5);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(sp.text, x, y + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, (f.life / f.total) * 2));
      this.drawWord(ctx, f.text, this.px(f.x + 0.5), this.py(f.y + 0.5), Math.max(8, this.cell * f.size), f.color);
    }
    ctx.globalAlpha = 1;
  }

  /** A whole phrase near a point: one line if it fits the board, else smaller and wrapped, never cut. */
  private drawWord(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
    if (this.cell !== this.phraseCell || this.phraseFits.size > 3000) {
      this.phraseFits.clear();
      this.phraseCell = this.cell;
    }
    const left = this.ox + 2;
    const right = this.ox + SIZE * this.cell - 2;
    const id = `${size}|${text}`;
    let fit = this.phraseFits.get(id);
    if (!fit) {
      fit = fitPhrase(text, { w: right - left, h: size * 1.25 * 3 }, { max: size, min: Math.min(size, 6) }, this.backdrop.measure);
      this.phraseFits.set(id, fit);
    }
    if (!fit.rows.length) return;
    const lh = fit.size * 1.25;
    const cx = clampCenter(x, fit.width, left, right);
    const top = this.oy + lh / 2;
    const bottom = this.oy + SIZE * this.cell - lh / 2 - (fit.rows.length - 1) * lh;
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

  private drawBanner(ctx: CanvasRenderingContext2D) {
    if (this.bannerLife <= 0) return;
    const size = Math.max(14, Math.min(26, this.cell * 0.55));
    const x = this.ox + (SIZE * this.cell) / 2;
    const y = this.oy + (SIZE / 2) * this.cell;
    ctx.globalAlpha = Math.max(0, Math.min(1, this.bannerLife));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.font(ctx, `700 ${size}px ${DISPLAY}`);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(2, 0, 5, 0.9)";
    ctx.strokeText(this.banner, x, y);
    ctx.fillStyle = this.bannerColor;
    ctx.fillText(this.banner, x, y);
    if (this.bannerSub) {
      this.font(ctx, `${Math.round(size * 0.55)}px ${DISPLAY}`);
      ctx.lineWidth = 4;
      ctx.strokeText(this.bannerSub, x, y + size * 0.95);
      ctx.fillStyle = PAL.fg;
      ctx.fillText(this.bannerSub, x, y + size * 0.95);
    }
    ctx.globalAlpha = 1;
  }

  /** The piece being dragged, under the finger, and the square it would land on. */
  private drawDrag(ctx: CanvasRenderingContext2D) {
    const d = this.drag;
    if (!d?.moved) return;
    const p = this.sim.pieces.find((q) => q.id === d.id);
    if (!p) return;
    const hit = this.hitAt(d.x, d.y);
    if (hit) {
      const ok = hit.area === "bench" || isHome(hit.row);
      const x = hit.area === "board" ? this.px(hit.col) : this.ox + hit.col * this.benchW();
      const y = hit.area === "board" ? this.py(hit.row) : this.benchY();
      const w = hit.area === "board" ? this.cell : this.benchW();
      ctx.strokeStyle = ok ? PAL.gold : PAL.danger;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, this.cell - 3);
    }
    this.drawPiece(ctx, p.kind, p.star, d.x, d.y - this.cell * 0.3, 0, 0.9);
  }
}
