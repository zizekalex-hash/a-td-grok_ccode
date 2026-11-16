import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Activity, X } from "lucide-react";
import { meterOn, meterRead } from "@/game/phraseSound";
import { rehearseState, subscribeRehearse } from "@/game/rehearseRun";
import { FAST_VOICE, voiceSums } from "@/game/rehearse";
import { clearLog, logLines, subscribeLog } from "@/game/soundLog";
import { subscribeSwarm, swarmStats } from "@/game/swarm";

const KEY = "azshara-monitor-v1";

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

let on = typeof window === "undefined" ? false : saved();
const subs = new Set<() => void>();
const monitorOn = () => on;
const subscribeMonitor = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};
function setMonitor(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? "on" : "off");
  } catch {
    /* private mode */
  }
  for (const f of subs) f();
}

/** The monitor's button (the drill's top bar): on, a see-through meter over the drill. */
export function MonitorButton() {
  const shown = useSyncExternalStore(subscribeMonitor, monitorOn, () => false);
  return (
    <button
      type="button"
      className="btn stepper"
      data-on={shown}
      aria-pressed={shown}
      onClick={() => setMonitor(!shown)}
      aria-label={
        shown
          ? "Sound monitor on: its meter, voices and log (tap to turn it off)"
          : "Sound monitor off (tap for its meter, voices and log)"
      }
    >
      <Activity className="size-4" aria-hidden />
    </button>
  );
}

const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

/**
 * The sound monitor: small and see-through over the drill. The live sound's
 * peak (and how far over 1.0, where it clips), its wave, the background mix's
 * voices and how hard the phone works at it. A tap opens the rest: every
 * layer's numbers (voices, speeds, how loud all at once) and the log of what
 * the sound did. Off, nothing is measured (no battery spent on it).
 */
export function SoundMonitor() {
  const shown = useSyncExternalStore(subscribeMonitor, monitorOn, () => false);
  const stats = useSyncExternalStore(subscribeSwarm, swarmStats, swarmStats);
  const log = useSyncExternalStore(subscribeLog, logLines, logLines);
  const rs = useSyncExternalStore(subscribeRehearse, rehearseState, rehearseState);
  const [open, setOpen] = useState(false);
  const [peak, setPeak] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    meterOn(shown);
    if (!shown) return;
    const buf = new Float32Array(2048);
    let raf = 0;
    let last = 0;
    let hold = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // About 15 times a second: enough to see, light on the battery.
      if (t - last < 66) return;
      last = t;
      const p = meterRead(buf);
      hold = Math.max(p, hold * 0.92);
      setPeak(hold);
      const c = canvas.current;
      const g = c?.getContext("2d");
      if (!c || !g) return;
      const w = c.width;
      const h = c.height;
      g.clearRect(0, 0, w, h);
      // 1.0 marked: above it, it clips.
      const scale = Math.max(1.2, hold * 1.05);
      g.strokeStyle = "rgba(255,92,138,0.6)";
      g.beginPath();
      for (const y of [h / 2 - h / 2 / scale, h / 2 + h / 2 / scale]) {
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
      g.strokeStyle =
        getComputedStyle(document.documentElement).getPropertyValue("--color-cyan") || "#c4a5ff";
      g.beginPath();
      for (let x = 0; x < w; x++) {
        const v = buf[Math.floor((x / w) * buf.length)] ?? 0;
        const y = h / 2 - (v / scale) * (h / 2);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  if (!shown) return null;
  const sums = voiceSums(rs.settings);
  const over = peak > 1 ? peak - 1 : 0;
  return (
    <div
      className="pointer-events-auto absolute top-14 right-3 z-40 w-56 rounded-lg border border-cyan/30 bg-bg/55 p-2 text-[0.6rem] leading-snug text-fg backdrop-blur-sm"
      role="status"
      aria-label="Sound monitor"
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Sound monitor: show less" : "Sound monitor: show its voices and log"}
      >
        <div className="flex items-baseline justify-between gap-1 font-display tabular-nums">
          <span>
            peak {fmt(peak)}
            {over > 0 ? <span className="text-danger"> · +{fmt(over)} over 1.0</span> : null}
          </span>
          <span className="text-muted">{open ? "less" : "more"}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-fg/10">
          <div
            className={peak > 1 ? "h-full bg-danger" : "h-full bg-cyan"}
            style={{ width: `${Math.min(100, (peak / Math.max(1, peak)) * 100)}%` }}
          />
        </div>
        <canvas
          ref={canvas}
          width={200}
          height={34}
          className="mt-1 block"
          // Not the game's full-stage canvas: a small wave, in its place.
          style={{ position: "static", width: "100%", height: 34 }}
        />
        <p className="text-muted">
          {stats.running
            ? `${stats.voices.toLocaleString()} background voices · mixing ${Math.round(stats.load * 100)}% of real time · ${stats.rate / 1000} kHz${stats.waiting ? ` · ${stats.waiting} waiting for a phrase` : ""}${stats.late ? ` · ${stats.late} late` : ""}`
            : "No background mix playing."}
        </p>
      </button>
      {open && (
        <div className="mt-1.5 max-h-[50dvh] space-y-1.5 overflow-y-auto border-t border-cyan/20 pt-1.5">
          <p className="font-display text-[0.55rem] tracking-[0.12em] text-violet">THE VOICES</p>
          <table className="w-full tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="text-left font-normal">layer</th>
                <th className="text-right font-normal">voices</th>
                <th className="text-right font-normal">speeds</th>
                <th className="text-right font-normal">all at once</th>
              </tr>
            </thead>
            <tbody>
              {sums.layers.map((l) => (
                <tr key={l.index} className={l.heard ? "" : "text-muted line-through"}>
                  <td>
                    {l.index + 1}
                    {l.index === 0 ? " ★" : ""}
                  </td>
                  <td className="text-right">{l.voices.toLocaleString()}</td>
                  <td className="text-right">
                    {l.voices ? `×${fmt(l.slowest)}–${fmt(l.fastest)}` : "–"}
                  </td>
                  <td className="text-right">{fmt(l.loud)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Main voice {fmt(sums.main)} + background {fmt(sums.background)} ={" "}
            <span className={sums.total > 1 ? "text-danger" : ""}>
              {fmt(sums.total)}
              {sums.total > 1 ? ` (+${fmt(sums.total - 1)} over 1.0)` : ""}
            </span>{" "}
            if every voice sounded at once (they rarely all meet: the peak above is what plays).
            {sums.layers.some((l) => l.heard && l.extreme)
              ? ` ${sums.layers.reduce((n, l) => n + (l.heard ? l.extreme : 0), 0).toLocaleString()} voices past ${FAST_VOICE}× are clicks, not words.`
              : ""}
          </p>
          <div className="flex items-center justify-between">
            <p className="font-display text-[0.55rem] tracking-[0.12em] text-violet">THE LOG</p>
            <span className="flex gap-1">
              <button type="button" className="btn px-1.5 text-[0.55rem]" onClick={clearLog}>
                Clear
              </button>
              <button
                type="button"
                className="btn stepper"
                onClick={() => setMonitor(false)}
                aria-label="Turn the sound monitor off"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          </div>
          <ul className="space-y-0.5" aria-label="Sound log">
            {log.length === 0 && <li className="text-muted">Nothing yet.</li>}
            {[...log]
              .reverse()
              .slice(0, 60)
              .map((l, i) => (
                <li
                  key={`${l.at}-${i}`}
                  className={
                    l.level === "error" ? "text-danger" : l.level === "warn" ? "text-gold" : ""
                  }
                >
                  <span className="text-muted">
                    {new Date(l.at).toLocaleTimeString(undefined, { hour12: false })}
                  </span>{" "}
                  {l.text}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
