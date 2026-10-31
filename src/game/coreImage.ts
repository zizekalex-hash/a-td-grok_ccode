import { textBytes } from "@/game/binary";
import { rawPixels, rawSide } from "@/game/rawimage";

/**
 * The raw text image as a canvas, and the two places it shows up: inside the wake
 * core, and as a JPG the player can save.
 */

let cache: { lines: string[]; canvas: HTMLCanvasElement } | null = null;

/** The loaded text as a raw image, rebuilt only when the text changes. */
export function rawTextImage(lines: string[]): HTMLCanvasElement {
  if (cache?.lines === lines) return cache.canvas;
  const bytes = textBytes(lines);
  const side = rawSide(bytes.length);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const g = canvas.getContext("2d");
  if (g) g.putImageData(new ImageData(rawPixels(bytes, side), side, side), 0, 0);
  cache = { lines, canvas };
  return canvas;
}

/**
 * Draws the image inside a circle, turning slowly and partly transparent, so the
 * core shows the text it guards and anything behind it still shows through.
 */
export function drawCoreImage(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  cy: number,
  r: number,
  angle: number,
  alpha: number,
) {
  const img = rawTextImage(lines);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  // The diagonal of the square covers the circle at any angle.
  const d = r * 2 * Math.SQRT2;
  ctx.drawImage(img, -d / 2, -d / 2, d, d);
  ctx.restore();
}

/** Saves the raw image as a JPG, scaled up with hard edges so each pixel stays visible. */
export function saveRawJpg(lines: string[], name = "neuro-tome.jpg") {
  const img = rawTextImage(lines);
  const scale = Math.max(1, Math.floor(1024 / img.width));
  const c = document.createElement("canvas");
  c.width = img.width * scale;
  c.height = img.height * scale;
  const g = c.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, c.width, c.height);
  c.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    "image/jpeg",
    0.92,
  );
}
