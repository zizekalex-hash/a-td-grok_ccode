import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Minus, Pause, Pencil, Play, Plus, RotateCcw, Square, X } from "lucide-react";
import { Info, Toggle } from "@/components/game/RehearseTab";
import {
  addPosture,
  clearPostureLog,
  pausePosture,
  postureStats,
  postureToday,
  removePosture,
  renamePosture,
  resetPosture,
  resumePosture,
  runningMs,
  stopPosture,
  tapPosture,
} from "@/game/postures";
import { postureState, postureUpdate, subscribePostures } from "@/game/postureRun";
import {
  hidePostureWindow,
  postureWindowHere,
  postureWindowShown,
  showPostureWindow,
  subscribePostureWindow,
} from "@/game/postureWindow";
import { clock } from "@/game/reps";

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Now, a second at a time (while `on`). */
function useNow(on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

/** The posture going, with its time: shown at the top of the drill on every tab (a tap opens Postures). */
export function PostureChip({ open }: { open: () => void }) {
  const s = useSyncExternalStore(subscribePostures, postureState, postureState);
  const now = useNow(!!s.running);
  const going = s.running;
  if (!going) return null;
  const name = s.postures.find((p) => p.id === going.id)?.name ?? "";
  const time = clock(runningMs(s, now));
  return (
    <button
      type="button"
      className="btn mt-2 w-full justify-between tracking-normal normal-case"
      data-on={!going.pausedAt}
      onClick={open}
      aria-label={`${name}: ${time}${going.pausedAt ? ", paused" : ""}. Open Postures`}
    >
      <span className="truncate">
        {going.pausedAt ? "⏸" : "🧘"} {name}
      </span>
      <span className="font-display tabular-nums">{time}</span>
    </button>
  );
}

/**
 * Postures: a timer for meditating in a posture (headstand, quadstanding,
 * standing, your own). Tap one as you go into it; tap it again as you come out,
 * or another as you change. It counts from the moment of the tap, so it keeps
 * time anywhere: other tabs, other apps, the screen off, the app closed. Its
 * floating window does the same over other apps.
 */
export function PosturesTab() {
  const s = useSyncExternalStore(subscribePostures, postureState, postureState);
  const now = useNow();
  const stats = postureStats(s, now);
  const going = s.running;
  const goingName = going ? (s.postures.find((p) => p.id === going.id)?.name ?? "") : "";
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
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
  const shown = useSyncExternalStore(
    subscribePostureWindow,
    postureWindowShown,
    postureWindowShown,
  );
  const [here, setHere] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    void postureWindowHere().then(setHere);
  }, []);
  const add = () => {
    if (!name.trim()) return;
    postureUpdate((p) => addPosture(p, name, Date.now()));
    setName("");
  };
  const saveName = () => {
    if (!editing) return;
    postureUpdate((p) => renamePosture(p, editing.id, editing.name));
    setEditing(null);
  };
  return (
    <div className="space-y-2">
      <div className="glass space-y-1.5 p-2.5">
        <p className="flex items-center gap-1.5 font-display text-[0.6rem] tracking-[0.14em] text-violet">
          POSTURES · A TIMER FOR MEDITATING IN THEM
          <Info title="Postures">
            <p>
              Tap a posture as you go into it: its timer starts. Tap it again as you come out, or
              tap another as you change (the first stops, counted, and that one starts).
            </p>
            <p>
              Pause stops its time (not counted) till you go on. Reset throws the one going away
              (fell asleep: not counted). Stop counts it.
            </p>
            <p>
              It counts from the moment you tap, not by ticking, so it keeps time wherever you are:
              other tabs, the game, other apps, the screen off, even the app closed.
            </p>
            <p>
              Each sitting counted shows in History, by day, and in each posture's times here:
              today, all time, how many and the longest. ✎ renames a posture (its sittings too); +
              adds one of your own; − takes one off (tap twice; its sittings stay in History).
            </p>
          </Info>
        </p>
        {going ? (
          <div className="text-center" role="status">
            <p className="text-sm text-fg">
              {going.pausedAt ? "⏸ " : ""}
              {goingName}
            </p>
            <p
              className={`font-display text-4xl tabular-nums ${going.pausedAt ? "text-muted" : "text-cyan"}`}
            >
              {clock(runningMs(s, now))}
            </p>
            <p className="text-[0.65rem] text-muted">
              since {timeOf(going.since)}
              {going.pausedAt ? " · paused" : ""} · all today {clock(postureToday(s, now))}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className="btn tracking-normal normal-case"
                onClick={() =>
                  postureUpdate((p) =>
                    p.running?.pausedAt
                      ? resumePosture(p, Date.now())
                      : pausePosture(p, Date.now()),
                  )
                }
              >
                {going.pausedAt ? (
                  <>
                    <Play className="size-4" aria-hidden /> Go on
                  </>
                ) : (
                  <>
                    <Pause className="size-4" aria-hidden /> Pause
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-gold tracking-normal normal-case"
                onClick={() => postureUpdate((p) => stopPosture(p, Date.now()))}
              >
                <Square className="size-4" aria-hidden /> Stop
              </button>
              <button
                type="button"
                className="btn tracking-normal normal-case"
                onClick={() => postureUpdate(resetPosture)}
                aria-label="Reset: fell asleep, not counted"
              >
                <RotateCcw className="size-4" aria-hidden /> Reset
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            Tap a posture as you go into it; tap it again as you come out.
            {postureToday(s, now) > 0 ? ` Today in all: ${clock(postureToday(s, now))}.` : ""}
          </p>
        )}
      </div>

      {here && (
        <Toggle
          label="Floating window over other apps (small, see-through)"
          on={shown}
          flip={() => {
            setNote("");
            if (shown) void hidePostureWindow();
            else void showPostureWindow().then(setNote);
          }}
          info={
            <>
              <p>
                The timer over every other app, small and see-through like the phone's clock in its
                status bar: “🧘 Headstand 12:34”, ticking.
              </p>
              <p>
                Drag it anywhere; pinch it (or A− A+) to size it; ◐ puts it on a pane, more solid
                each time, then see-through again. A tap on it opens its controls: each posture (a
                tap starts it, or switches to it; on the one going, stops it), ⏸ pause / ▶ go on, ■
                stop (counted), ↺ reset (not counted) and ✕ to close it.
              </p>
              <p>
                What you tap there is kept with its time and put on the timer here, so it is all the
                same as tapping here. The first time, the phone asks to allow “Display over other
                apps”.
              </p>
            </>
          }
        />
      )}
      {note && (
        <p className="text-xs text-gold" role="status">
          {note}
        </p>
      )}

      <ul className="space-y-1.5" aria-label="Postures">
        {stats.map((t) => {
          const on = going?.id === t.id;
          if (editing?.id === t.id)
            return (
              <li key={t.id}>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName();
                  }}
                >
                  <input
                    className="text-input min-w-0 flex-1"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                    aria-label={`New name for ${t.name}`}
                    maxLength={60}
                    autoFocus
                  />
                  <button type="submit" className="btn stepper" aria-label="Keep the new name">
                    <Check className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn stepper"
                    onClick={() => setEditing(null)}
                    aria-label="Keep the name as it was"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </form>
              </li>
            );
          return (
            <li key={t.id} className="flex items-stretch gap-1.5">
              <button
                type="button"
                className="btn min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 text-left tracking-normal normal-case"
                data-on={on}
                aria-pressed={on}
                onClick={() => postureUpdate((p) => tapPosture(p, t.id, Date.now()))}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="truncate text-sm">{t.name}</span>
                  <span className="font-display text-sm tabular-nums">
                    {on ? `${going?.pausedAt ? "⏸ " : ""}${clock(runningMs(s, now))}` : "▶"}
                  </span>
                </span>
                <span className="text-[0.62rem] font-normal opacity-80">
                  today {clock(t.todayMs)} · all {clock(t.totalMs)} · {t.sittings}×
                  {t.longestMs ? ` · longest ${clock(t.longestMs)}` : ""}
                </span>
              </button>
              <button
                type="button"
                className="btn stepper self-center"
                onClick={() => setEditing({ id: t.id, name: t.name })}
                aria-label={`Rename: ${t.name}`}
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="btn stepper self-center"
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
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="text-input min-w-0 flex-1"
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
