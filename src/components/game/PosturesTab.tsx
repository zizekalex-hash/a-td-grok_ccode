import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Minus, Plus, RotateCcw, Square } from "lucide-react";
import { Info } from "@/components/game/RehearseTab";
import {
  addPosture,
  clearPostureLog,
  postureStats,
  postureToday,
  removePosture,
  resetPosture,
  runningMs,
  stopPosture,
  tapPosture,
} from "@/game/postures";
import { postureState, postureUpdate, subscribePostures } from "@/game/postureRun";
import { clock } from "@/game/reps";

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Now, a second at a time, while the tab is open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** The posture going, with its time: shown at the top of the drill on every tab (a tap opens Postures). */
export function PostureChip({ open }: { open: () => void }) {
  const s = useSyncExternalStore(subscribePostures, postureState, postureState);
  const [now, setNow] = useState(() => Date.now());
  const going = s.running;
  useEffect(() => {
    if (!going) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [going]);
  if (!going) return null;
  const name = s.postures.find((p) => p.id === going.id)?.name ?? "";
  return (
    <button
      type="button"
      className="btn mt-3 w-full justify-between tracking-normal normal-case"
      data-on
      onClick={open}
      aria-label={`${name}: ${clock(Math.max(0, now - going.since))}. Open Postures`}
    >
      <span className="truncate">🧘 {name}</span>
      <span className="font-display tabular-nums">{clock(Math.max(0, now - going.since))}</span>
    </button>
  );
}

/**
 * Postures: a timer for meditating in a posture (headstand, on all fours,
 * standing, your own). Tap one as you go into it; tap it again as you come out,
 * or another as you change. It counts from the moment of the tap, so it keeps
 * time anywhere: other tabs, other apps, the screen off, the app closed.
 */
export function PosturesTab() {
  const s = useSyncExternalStore(subscribePostures, postureState, postureState);
  const now = useNow();
  const stats = postureStats(s, now);
  const going = s.running ? stats.find((t) => t.id === s.running!.id) : undefined;
  const [name, setName] = useState("");
  const [armed, setArmed] = useState("");
  const armTimer = useRef(0);
  const arm = (key: string, act: () => void) => {
    window.clearTimeout(armTimer.current);
    if (armed === key) {
      setArmed("");
      act();
      return;
    }
    setArmed(key);
    armTimer.current = window.setTimeout(() => setArmed(""), 3000);
  };
  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  const add = () => {
    if (!name.trim()) return;
    postureUpdate((p) => addPosture(p, name, Date.now()));
    setName("");
  };
  return (
    <div className="space-y-3">
      <div className="glass space-y-2 p-3">
        <p className="flex items-center gap-1.5 font-display text-[0.6rem] tracking-[0.14em] text-violet">
          POSTURES · A TIMER FOR MEDITATING IN THEM
          <Info title="Postures">
            <p>
              Tap a posture as you go into it: its timer starts. Tap it again as you come out, or
              tap another as you change (the first stops, counted, and that one starts).
            </p>
            <p>
              It counts from the moment you tap, not by ticking, so it keeps time wherever you are:
              other tabs, the game, other apps, the screen off, even the app closed.
            </p>
            <p>
              Fell asleep in one? Reset when you wake: that sitting is not counted. Each sitting
              counted shows in History, by day, and in each posture's times here: today, all time,
              how many and the longest. + adds a posture of your own; − takes one off (tap twice;
              its sittings stay in History).
            </p>
          </Info>
        </p>
        {going && s.running ? (
          <div className="text-center" role="status">
            <p className="text-sm text-fg">{going.name}</p>
            <p className="font-display text-5xl text-cyan tabular-nums">
              {clock(runningMs(s, now))}
            </p>
            <p className="text-[0.65rem] text-muted">
              since {timeOf(s.running.since)} · all postures today {clock(postureToday(s, now))}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-gold tracking-normal normal-case"
                onClick={() => postureUpdate((p) => stopPosture(p, Date.now()))}
              >
                <Square className="size-4" aria-hidden /> Stop (counted)
              </button>
              <button
                type="button"
                className="btn tracking-normal normal-case"
                onClick={() => postureUpdate(resetPosture)}
              >
                <RotateCcw className="size-4" aria-hidden /> Reset (fell asleep: not counted)
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Tap a posture as you go into it; tap it again as you come out.
            {postureToday(s, now) > 0 ? ` Today in all: ${clock(postureToday(s, now))}.` : ""}
          </p>
        )}
      </div>

      <ul className="space-y-2" aria-label="Postures">
        {stats.map((t) => {
          const on = s.running?.id === t.id;
          return (
            <li key={t.id} className="flex items-stretch gap-2">
              <button
                type="button"
                className="btn min-w-0 flex-1 flex-col items-start gap-0.5 px-3 text-left tracking-normal normal-case"
                data-on={on}
                aria-pressed={on}
                onClick={() => postureUpdate((p) => tapPosture(p, t.id, Date.now()))}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="truncate text-sm">{t.name}</span>
                  <span className="font-display text-sm tabular-nums">
                    {on ? clock(runningMs(s, now)) : "▶"}
                  </span>
                </span>
                <span className="text-[0.65rem] font-normal opacity-80">
                  today {clock(t.todayMs)} · all {clock(t.totalMs)} · {t.sittings} sitting
                  {t.sittings === 1 ? "" : "s"}
                  {t.longestMs ? ` · longest ${clock(t.longestMs)}` : ""}
                </span>
              </button>
              <button
                type="button"
                className="btn stepper"
                data-on={armed === `rm-${t.id}`}
                aria-label={
                  armed === `rm-${t.id}`
                    ? `Tap again to take off: ${t.name}`
                    : `Take off: ${t.name}`
                }
                onClick={() =>
                  arm(`rm-${t.id}`, () => postureUpdate((p) => removePosture(p, t.id, Date.now())))
                }
              >
                <Minus className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {armed.startsWith("rm-") && (
        <p className="text-xs text-gold" role="status">
          Tap − again to take it off (its sittings stay in History).
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-cyan/40 bg-transparent p-2 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="A posture of your own (e.g. Lotus)"
          aria-label="A posture of your own"
          maxLength={60}
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </form>

      <button
        type="button"
        className="btn w-full tracking-normal normal-case"
        data-on={armed === "clear"}
        disabled={!s.log.length}
        onClick={() => arm("clear", () => postureUpdate(clearPostureLog))}
      >
        {armed === "clear"
          ? "Tap again: forget every sitting (the postures stay)"
          : "Clear the postures' history"}
      </button>
    </div>
  );
}
