import { bitAt, textBytes } from "@/game/binary";
import { CONFIG } from "@/game/config";
import { fitSectors, flashUnits, LEADING, SECTOR_GAP, type Fit, type Measure } from "@/game/layout";
import { FONT, PAL } from "@/game/palette";
import type { Chrome, Settings } from "@/game/store";

/** Smallest and largest sizes the field text is allowed to take (px, before textScale). */
export const FIELD_MIN = CONFIG.field.minSize;
export const FIELD_MAX = CONFIG.field.maxSize;

/** Text is measured once at this size; widths at other sizes scale from it. */
const REF_SIZE = 100;
/** Measured widths kept before the cache starts over. */
const MAX_WIDTHS = 50_000;
/** Clear margin around cached text, so a glyph a hair wider than measured is never clipped. */
const PAD = 16;

/** Stable 0..1 value per column, so the rain looks the same on every rebuild. */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function fontsSettled(): boolean {
  return typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded";
}

/**
 * The background every mode shares: binary rain built from the loaded text, and the
 * whole text laid out on the field (or flashed sector by sector when it cannot fit).
 *
 * Everything here is drawn once into offscreen canvases and copied to the screen each
 * frame, so a frame costs a few image copies however long the text is. The caches are
 * rebuilt only when the size, the text or a setting that changes them does.
 */
export class Backdrop {
  w = 1;
  h = 1;
  dpr = 1;

  private measureCtx: CanvasRenderingContext2D;
  private widths = new Map<string, number>();
  private fontsReady = fontsSettled();

  /** One seamless sheet of rain in device pixels, scrolled down and drawn twice. */
  private rain: HTMLCanvasElement = document.createElement("canvas");
  private rainPeriod = 1;
  private bytes: Uint8Array = new Uint8Array(0);
  private binLines: string[] | null = null;
  private binKey = "";
  private binCursor = 0;

  private fieldKey = "";
  private fieldLines: string[] | null = null;
  private fieldMax: number = FIELD_MAX;
  private fieldFit: Fit | null = null;
  private fieldUnits: string[] = [];
  private unitFits = new Map<number, Fit | null>();
  /** The fitted text, or the sector being flashed, already drawn. */
  private fieldCache: HTMLCanvasElement = document.createElement("canvas");
  private cacheTag = "";

  private vignette: HTMLCanvasElement = document.createElement("canvas");
  private vignetteKey = "";

  constructor() {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    this.measureCtx = ctx;
  }

  /**
   * Text measurement with the same font the field is drawn in. Each string is measured
   * once and scaled to the size asked for, so refitting a long text after the HUD moves
   * costs lookups rather than thousands of canvas measurements.
   */
  readonly measure: Measure = (text, size) => {
    let width = this.widths.get(text);
    if (width === undefined) {
      if (this.widths.size >= MAX_WIDTHS) this.widths.clear();
      this.measureCtx.font = `${REF_SIZE}px ${FONT}`;
      width = this.measureCtx.measureText(text).width;
      this.widths.set(text, width);
    }
    return (width * size) / REF_SIZE;
  };

  setFrame(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
  }

  /** Area behind the HUD panels where the text may be drawn. */
  fieldBox(chrome: Chrome) {
    const y = Math.min(this.h * 0.4, chrome.top + 10);
    const yEnd = Math.max(y + 60, this.h - Math.min(this.h * 0.5, chrome.bottom + 10));
    return { x: 14, y, w: Math.max(60, this.w - 28 - chrome.right), h: Math.max(60, yEnd - y) };
  }

  /** Next bit of the loaded text, read in order and wrapping at the end. */
  nextBit(): number {
    const bit = bitAt(this.bytes, this.binCursor);
    this.binCursor += 1;
    return bit;
  }

  /** Widths measured before the web font arrived are wrong, so drop them once it has. */
  private checkFonts() {
    const ready = fontsSettled();
    if (ready === this.fontsReady) return;
    this.fontsReady = ready;
    this.widths.clear();
    this.fieldKey = "";
    this.binKey = "";
  }

  /** Rebuilds the rain only when the text, the size or the column spacing changes. */
  ensureBinary(settings: Settings, lines: string[]) {
    this.checkFonts();
    const key = `${this.w}|${this.h}|${this.dpr}|${settings.binaryPitch}|${this.fontsReady}`;
    if (key === this.binKey && lines === this.binLines) return;
    this.binKey = key;
    if (lines !== this.binLines) {
      this.binLines = lines;
      this.bytes = textBytes(lines);
    }
    this.rebuildBinary(settings.binaryPitch);
  }

  /**
   * Draws the rain sheet. Rows sit in whole cells and the sheet height is a whole number
   * of rows, so when it wraps no digit is split across the seam. Columns are centred
   * with a margin, so none is cut at the left or right edge. Each column is a set of
   * streaks that brighten toward a leading digit, which reads as falling as it scrolls.
   */
  private rebuildBinary(pitch: number) {
    const { fontSize, rowStep, streakMin, streakMax } = CONFIG.rain;
    const dpr = this.dpr;
    const wPx = Math.max(2, Math.round(this.w * dpr));
    const hPx = Math.max(2, Math.round(this.h * dpr));
    const step = Math.max(4, Math.round(rowStep * dpr));
    const rows = Math.max(1, Math.ceil(hPx / step));
    const pitchPx = Math.max(4, pitch * dpr);
    const cols = Math.max(1, Math.floor(wPx / pitchPx));
    const x0 = (wPx - cols * pitchPx) / 2 + pitchPx / 2;
    this.rainPeriod = rows * step;
    // Resizing a canvas also clears it.
    this.rain.width = wPx;
    this.rain.height = this.rainPeriod;
    const g = this.rain.getContext("2d");
    if (!g) return;
    g.font = `${Math.max(4, fontSize * dpr)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lo = Math.max(2, Math.min(streakMin, streakMax));
    const hi = Math.max(lo, streakMax);
    for (let c = 0; c < cols; c++) {
      const x = Math.round(x0 + c * pitchPx);
      const len = Math.round(lo + hash01(c) * (hi - lo));
      const phase = Math.floor(hash01(c + 991) * len);
      const columnAlpha = 0.55 + 0.45 * hash01(c + 313);
      for (let r = 0; r < rows; r++) {
        // 0 at the tail of a streak, 1 at its leading digit.
        const t = ((r + phase) % len) / Math.max(1, len - 1);
        const lead = t === 1;
        g.globalAlpha = columnAlpha * (lead ? 1 : 0.16 + 0.7 * t * t);
        g.fillStyle = lead ? PAL.fg : PAL.violet;
        g.fillText(String(bitAt(this.bytes, c * 131 + r)), x, r * step + step / 2);
      }
    }
    g.globalAlpha = 1;
  }

  drawBinary(ctx: CanvasRenderingContext2D, settings: Settings, scroll: number) {
    const alpha = settings.binaryOpacity * CONFIG.rain.alpha;
    if (alpha <= 0.001) return;
    const period = this.rainPeriod;
    const off = ((Math.round(scroll * this.dpr) % period) + period) % period;
    // Copy in device pixels at whole-pixel offsets: no resampling, so the digits stay sharp.
    const m = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, Math.round(m.e), Math.round(m.f));
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(this.rain, 0, off - period);
    ctx.drawImage(this.rain, 0, off);
    ctx.restore();
  }

  private ensureField(settings: Settings, lines: string[], chrome: Chrome) {
    this.checkFonts();
    const box = this.fieldBox(chrome);
    const key = [
      this.w,
      this.h,
      this.dpr,
      settings.textScale,
      settings.holo,
      Math.round(box.w),
      Math.round(box.h),
      this.fontsReady,
    ].join("|");
    if (key === this.fieldKey && lines === this.fieldLines) return;
    this.fieldKey = key;
    this.fieldLines = lines;
    this.fieldMax = (FIELD_MAX * settings.textScale) / 100;
    this.unitFits.clear();
    this.cacheTag = "";
    this.fieldFit = fitSectors(lines, box, { min: FIELD_MIN, max: this.fieldMax }, this.measure);
    this.fieldUnits = this.fieldFit ? [] : flashUnits(lines, box, FIELD_MIN, this.measure);
  }

  private unitFit(i: number, chrome: Chrome): Fit | null {
    if (!this.unitFits.has(i)) {
      const unit = this.fieldUnits[i] ?? "";
      this.unitFits.set(i, fitSectors([unit], this.fieldBox(chrome), { min: FIELD_MIN, max: this.fieldMax }, this.measure));
    }
    return this.unitFits.get(i) ?? null;
  }

  /**
   * The whole text, fitted to the field. When it cannot fit even at the smallest
   * size, one sector at a time flashes on screen and the list loops.
   */
  drawField(
    ctx: CanvasRenderingContext2D,
    settings: Settings,
    lines: string[],
    chrome: Chrome,
    flashT: number,
    reduce: boolean,
  ) {
    this.ensureField(settings, lines, chrome);
    const box = this.fieldBox(chrome);
    const cx = box.x + box.w / 2;
    if (this.fieldFit) {
      this.paintFit(ctx, "all", this.fieldFit, box, settings.holo, settings.opacity * CONFIG.field.alpha);
      return;
    }
    const n = this.fieldUnits.length;
    if (!n) return;
    const period = reduce ? settings.wordFlashMs * 2 : settings.wordFlashMs;
    const elapsed = flashT * 1000;
    const i = Math.floor(elapsed / period) % n;
    const p = (elapsed % period) / period;
    const fade = reduce ? 1 : p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
    const fit = this.unitFit(i, chrome);
    if (fit) {
      this.paintFit(ctx, `unit ${i}`, fit, box, settings.holo, Math.min(1, settings.opacity * 1.4) * fade);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = PAL.cyan;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`${i + 1} / ${n}`, cx, box.y - 10);
    ctx.globalAlpha = 1;
  }

  /** Copies a fitted block of text to the field, drawing it into the cache first if it changed. */
  private paintFit(
    ctx: CanvasRenderingContext2D,
    tag: string,
    fit: Fit,
    box: { x: number; y: number; w: number; h: number },
    holo: boolean,
    alpha: number,
  ) {
    if (alpha <= 0.002) return;
    if (tag !== this.cacheTag) {
      this.renderFit(fit, box.w, holo);
      this.cacheTag = tag;
    }
    const dpr = this.dpr;
    const top = Math.round((box.y + (box.h - fit.height) / 2 - PAD) * dpr) / dpr;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(this.fieldCache, box.x - PAD, top, this.fieldCache.width / dpr, this.fieldCache.height / dpr);
    ctx.globalAlpha = 1;
  }

  private renderFit(fit: Fit, width: number, holo: boolean) {
    const dpr = this.dpr;
    const c = this.fieldCache;
    c.width = Math.max(1, Math.ceil((width + PAD * 2) * dpr));
    c.height = Math.max(1, Math.ceil((fit.height + PAD * 2) * dpr));
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = `${fit.size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const step = fit.size * LEADING;
    const gap = fit.size * SECTOR_GAP;
    const cx = PAD + width / 2;
    let y = PAD;
    fit.sectors.forEach((rows, si) => {
      g.fillStyle = holo && si % 3 === 0 ? PAL.violet : PAL.cyan;
      for (const row of rows) {
        g.fillText(row, cx, y + step / 2);
        y += step;
      }
      y += gap;
    });
  }

  /**
   * Darkens the edges of the screen. The gradient is smooth, so it is drawn once at a
   * quarter of the size and stretched, instead of being recomputed for every pixel each frame.
   */
  drawVignette(ctx: CanvasRenderingContext2D) {
    const key = `${this.w}|${this.h}`;
    if (key !== this.vignetteKey) {
      this.vignetteKey = key;
      const k = 0.25;
      const vw = Math.max(2, Math.ceil(this.w * k));
      const vh = Math.max(2, Math.ceil(this.h * k));
      this.vignette.width = vw;
      this.vignette.height = vh;
      const g = this.vignette.getContext("2d");
      if (g) {
        const cx = vw / 2;
        const cy = vh / 2;
        const v = g.createRadialGradient(cx, cy, Math.min(vw, vh) * 0.25, cx, cy, Math.max(vw, vh) * 0.72);
        v.addColorStop(0, "rgba(2,0,5,0)");
        v.addColorStop(1, "rgba(2,0,5,0.55)");
        g.fillStyle = v;
        g.fillRect(0, 0, vw, vh);
      }
    }
    ctx.drawImage(this.vignette, 0, 0, this.w, this.h);
  }
}
