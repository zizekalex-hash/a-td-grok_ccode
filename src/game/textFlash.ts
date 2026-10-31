import { FrameLimiter, renderDpr } from "@/game/frameLimiter";
import { clampCenter, fitPhrase, overlapArea, type Measure } from "@/game/layout";
import { FONT, PAL } from "@/game/palette";
import { readPhrase, type Cursor } from "@/game/reader";
import { useGame } from "@/game/store";

interface Phrase {
  text: string;
  rows: string[];
  /** Centre of the phrase's block. */
  x: number;
  y: number;
  size: number;
  w: number;
  h: number;
  alpha: number;
  cool: number;
}

/** Shortest gap between two repaints: every frame, so the fastest flash settings show every change. */
const REPAINT_MS = 15;
/** Clear space kept around the panel's edge, in px. */
const PAD = 6;
/** Smallest text size before a phrase is allowed to run taller than the panel. */
const MIN_SIZE = 6;
/** Size text is measured at; other sizes scale from it. */
const REF_SIZE = 100;

/**
 * Phrases from the loaded text flashing through a small panel: glowing capitals
 * that each change on their own clock and jump to a free spot. A phrase is a whole
 * sentence, up to its full stop. Long ones get a smaller size or wrap onto more
 * lines, so a phrase is never cut.
 */
export class TextFlash {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private phrases: Phrase[] = [];
  private cursor: Cursor = { line: 0, word: 0 };
  private w = 1;
  private h = 1;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private paintedAt = 0;
  private dirty = true;
  private running = false;
  private ro: ResizeObserver | null = null;
  private reduce = false;
  /** Running average of the area a phrase takes, used to decide how many fit. */
  private avgArea = 0;
  private limiter = new FrameLimiter();
  /** Render-resolution setting the canvas was last sized for. */
  private renderScale = 0;
  private widths = new Map<string, number>();
  private fontsReady = "";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
  }

  /** Each string is measured once and scaled, so fitting a phrase costs lookups. */
  private readonly measure: Measure = (text, size) => {
    let width = this.widths.get(text);
    if (width === undefined) {
      if (this.widths.size > 20_000) this.widths.clear();
      this.ctx.font = `${REF_SIZE}px ${FONT}`;
      width = this.ctx.measureText(text).width;
      this.widths.set(text, width);
    }
    return (width * size) / REF_SIZE;
  };

  start() {
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }

  private resize() {
    // Layout size, not the on-screen box: the hologram tilt transforms the canvas.
    this.w = Math.max(1, this.canvas.clientWidth);
    this.h = Math.max(1, this.canvas.clientHeight);
    this.renderScale = useGame.getState().settings.renderScale;
    this.dpr = renderDpr(window.devicePixelRatio, this.renderScale);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.avgArea = (this.w * this.h) / 2;
    for (const p of this.phrases) p.cool = Math.random() * 0.2;
    this.dirty = true;
  }

  /** How many phrases fit without crowding, from how big they have been, capped by the density setting. */
  private capacity(density: number): number {
    // Room for about two and a half times what the phrases cover, so each can land in a free spot.
    return Math.max(1, Math.min(density, Math.floor((this.w * this.h) / (this.avgArea * 2.5))));
  }

  private frame = (t: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.limiter.ready(t, useGame.getState().settings.fpsCap)) return;
    if (useGame.getState().settings.renderScale !== this.renderScale) this.resize();
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    // Widths measured before the web font arrived are wrong, so drop them once it has.
    const fonts =
      typeof document !== "undefined" && document.fonts ? document.fonts.status : "loaded";
    if (fonts !== this.fontsReady) {
      this.fontsReady = fonts;
      this.widths.clear();
    }
    const { settings, lines } = useGame.getState();
    const count = this.capacity(settings.density);
    while (this.phrases.length < count) {
      this.phrases.push({
        text: "",
        rows: [],
        x: 0,
        y: 0,
        size: 0,
        w: 0,
        h: 0,
        alpha: 0,
        cool: Math.random() * 0.3,
      });
    }
    if (this.phrases.length > count) {
      this.phrases.length = count;
      this.dirty = true;
    }
    // Each phrase changes every flashMs, as the sphere does; slower when the device asks for reduced motion.
    const pace = (settings.flashMs / 1000) * (this.reduce ? 3 : 1);
    for (const p of this.phrases) {
      p.cool -= dt;
      if (p.cool > 0) continue;
      this.rewrite(p, lines, settings.textSize, settings.opacity);
      p.cool = pace * (0.55 + Math.random() * 0.9);
      this.dirty = true;
    }
    if (this.dirty && t - this.paintedAt >= REPAINT_MS) this.paint(t);
  };

  private rewrite(p: Phrase, lines: string[], baseSize: number, opacity: number) {
    const box = { w: Math.max(20, this.w - PAD * 2), h: Math.max(10, this.h - PAD * 2) };
    p.text = readPhrase(lines, this.cursor).toUpperCase();
    const fit = fitPhrase(
      p.text,
      box,
      { max: Math.max(MIN_SIZE, Math.min(baseSize, box.h)), min: MIN_SIZE },
      this.measure,
    );
    p.rows = fit.rows;
    p.size = fit.size;
    p.w = fit.width;
    p.h = fit.height;
    this.avgArea = this.avgArea * 0.9 + p.w * p.h * 0.1;
    const { w, h } = p;
    let best = { x: this.w / 2, y: this.h / 2, overlap: Infinity };
    for (let tries = 0; tries < 24 && best.overlap > 0; tries++) {
      const x = clampCenter(PAD + Math.random() * (this.w - PAD * 2), w, PAD, this.w - PAD);
      const y = clampCenter(PAD + Math.random() * (this.h - PAD * 2), h, PAD, this.h - PAD);
      let overlap = 0;
      for (const o of this.phrases) {
        if (o === p || !o.text) continue;
        overlap += overlapArea(x - w / 2, y - h / 2, w, h, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      }
      if (overlap < best.overlap) best = { x, y, overlap };
    }
    p.x = best.x;
    p.y = best.y;
    p.alpha = Math.max(0.12, Math.min(1, opacity + 0.25 + (Math.random() * 0.4 - 0.2)));
  }

  private paint(t: number) {
    this.paintedAt = t;
    this.dirty = false;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Hologram tints the phrases sea-green with a violet glow, as in the original tome.
    const holo = useGame.getState().settings.holo;
    ctx.shadowColor = holo ? PAL.violet : PAL.cyan;
    ctx.shadowBlur = holo ? 12 : 8;
    ctx.fillStyle = holo ? "#00ffcc" : PAL.cyan;
    for (const p of this.phrases) {
      if (!p.text) continue;
      ctx.globalAlpha = p.alpha;
      ctx.font = `${p.size}px ${FONT}`;
      const lh = p.h / Math.max(1, p.rows.length);
      const top = p.y - p.h / 2 + lh / 2;
      p.rows.forEach((row, i) => ctx.fillText(row, p.x, top + i * lh));
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
