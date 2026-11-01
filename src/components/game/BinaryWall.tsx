import { useLayoutEffect, useRef } from "react";
import { binWall } from "@/game/binwall";
import type { BinaryWallConfig } from "@/game/config";

/**
 * A phrase in raw binary, standing still behind a screen: drawn once (again only
 * when the phrase or the screen's size changes), so it costs nothing while it
 * shows. Whole copies spread evenly over the box, nothing cut off at an edge.
 */
export function BinaryWall({
  text,
  color,
  spec,
}: {
  text: string;
  color: string;
  spec: BinaryWallConfig;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { enabled, opacity, minFont, maxFont, fallbackFont, fill } = spec;

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !enabled) return;
    let size = "";
    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (!w || !h || size === `${w}x${h}@${dpr}`) return;
      size = `${w}x${h}@${dpr}`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const wall = binWall(text, w, h, { minFont, maxFont, fallbackFont, fill });
      if (!wall) return;
      ctx.fillStyle = color;
      ctx.font = `${wall.font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let r = 0; r < wall.lines.length; r++) {
        const line = wall.lines[r]!;
        const y = wall.top + r * wall.pitch;
        for (let i = 0; i < line.length; i++) ctx.fillText(line[i]!, wall.left + i * wall.cellW, y);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [text, color, enabled, minFont, maxFont, fallbackFont, fill]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
    />
  );
}
