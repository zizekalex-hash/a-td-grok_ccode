import { useEffect, useState } from "react";
import { frameStats } from "@/game/frameLimiter";
import { useGame } from "@/game/store";

/** Frames the game drew in the last second, in the corner, when Display → Frame-rate counter is on. */
export function FpsCounter() {
  const on = useGame((s) => s.settings.showFps);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!on) return;
    let last = performance.now();
    let draws = frameStats.draws;
    const id = window.setInterval(() => {
      const now = performance.now();
      setFps(Math.round(((frameStats.draws - draws) * 1000) / Math.max(1, now - last)));
      last = now;
      draws = frameStats.draws;
    }, 500);
    return () => window.clearInterval(id);
  }, [on]);
  if (!on) return null;
  return (
    <div
      className="pointer-events-none absolute top-[max(0.25rem,env(safe-area-inset-top))] left-1 z-50 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.65rem] text-cyan"
      aria-live="off"
    >
      {fps} fps
    </div>
  );
}
