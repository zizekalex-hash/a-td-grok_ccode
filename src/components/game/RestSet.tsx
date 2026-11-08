import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, EyeOff, RotateCcw, X } from "lucide-react";
import { BinaryWall } from "@/components/game/BinaryWall";
import { Confirm } from "@/components/game/Confirm";
import { buzz } from "@/components/game/feel";
import { ringAlarmNow, scheduleAlarm, stopAlarm } from "@/game/alarm";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp } from "@/game/recite";
import {
  cancelSet,
  clock,
  doneAfter,
  estimateReps,
  finishSet,
  isTimed,
  lastPart,
  nextPart,
  partOf,
  repsOf,
  setXp,
  startSet,
  timeLeft,
  totalTime,
  type RepsState,
} from "@/game/reps";
import { holdRest } from "@/game/rest";
import { useGame } from "@/game/store";

const R = CONFIG.reps;

/** What a finished set added. */
export interface SetDone {
  id: string;
  text: string;
  added: number;
  /** The phrase's new total and all its time (ms). */
  total: number;
  time: number;
  /** How long this set took (ms): for a timed set, its own length. */
  took: number;
  /** A timed set (timer or both). */
  timed: boolean;
}

/**
 * The screen of a running rep set, over everything: black, the word or phrase
 * standing behind in raw binary, the stopwatch, and Done once the set's least
 * time has passed. You recite from memory, eyes closed if you like, so nothing
 * moves: the games below stop drawing until it closes (see game/rest.ts). The
 * stopwatch goes by the clock, so time with the screen off counts.
 */
export function RestSet({
  state,
  onChange,
  onDone,
  title,
  reward,
  color = "#7fe7ff",
  repeat = false,
}: {
  state: RepsState;
  /** The reps after a change (Done or Cancel), to save. */
  onChange: (next: RepsState) => void;
  /** After Done, with what it added. */
  onDone?: (done: SetDone) => void;
  title: string;
  /** Offer "Done, and again": the same set of the same phrase, straight on. */
  repeat?: boolean;
  /** What Done also pays, in words. */
  reward?: ReactNode;
  color?: string;
}) {
  const active = state.active;
  const item = active ? state.items.find((i) => i.id === active.id) : undefined;
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);
  /** Blank: the screen is all black, nothing drawn or updated, until tapped (from the start, if chosen in Reps). */
  const [blank, setBlank] = useState(() => state.blank);

  // The rest lasts while the set runs.
  const on = !!active;
  useEffect(() => (on ? holdRest() : undefined), [on]);

  // The alarm: when a timer part is up, the phrase itself sounds (game/alarm.ts),
  // set now for that moment: on the phone by its alarm clock and the app's own
  // timer (it rings with the screen off), elsewhere on the page's audio clock;
  // and rung by the page too when it sees the time is up (once in all). Then it
  // keeps calling, louder each time, till the set is answered here: Done, Done
  // and again, the next part or Cancel end this set, and with it the alarm.
  const timerEnd =
    active && partOf(active) === "timer"
      ? (active.partSince ?? active.since) + Math.max(0, active.duration ?? 0)
      : 0;
  const alarmText = item?.text ?? "";
  const alarmVolume = state.alarmVolume;
  const [call1, call2, call3] = state.alarmCalls;
  const [alarmStatus, setAlarmStatus] = useState("");
  useEffect(() => {
    if (!state.alarm || !timerEnd) return;
    // Over already (the app opened at time's up): it rings (if it has not) and calls till answered.
    const calls = [call1 ?? 0.3, call2 ?? 0.6, call3 ?? 0.9];
    if (timerEnd <= Date.now()) {
      ringAlarmNow(alarmText, timerEnd, alarmVolume, calls);
      return () => stopAlarm(timerEnd);
    }
    return scheduleAlarm(alarmText, timerEnd, alarmVolume, setAlarmStatus, calls);
  }, [state.alarm, timerEnd, alarmText, alarmVolume, call1, call2, call3]);
  const alarm = useRef({
    on: state.alarm,
    text: alarmText,
    end: timerEnd,
    volume: alarmVolume,
    calls: state.alarmCalls,
  });
  alarm.current = {
    on: state.alarm,
    text: alarmText,
    end: timerEnd,
    volume: alarmVolume,
    calls: state.alarmCalls,
  };

  // Once a second, by the clock; a buzz when Done opens. While blank, nothing
  // updates at all: only the buzz is kept, for the moment Done opens.
  useEffect(() => {
    if (!active) return;
    /** Time's up, seen here: the buzz, and the alarm rung now unless it has rung. */
    const timeUp = (timer: boolean) => {
      buzz(timer ? 400 : 80);
      const a = alarm.current;
      if (timer && a.on && a.end) ringAlarmNow(a.text, a.end, a.volume, a.calls);
    };
    const left = timeLeft(active, Date.now());
    if (blank) {
      if (left <= 0) return;
      const id = window.setTimeout(() => timeUp(partOf(active) === "timer"), left);
      return () => window.clearTimeout(id);
    }
    let wasReady = left <= 0;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const ready = timeLeft(active, t) <= 0;
      if (ready && !wasReady) timeUp(partOf(active) === "timer");
      wasReady = ready;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, blank]);

  if (!active || !item || typeof document === "undefined") return null;
  const text = item.text;
  const left = timeLeft(active, now);
  const ready = left <= 0;
  const part = partOf(active);
  const last = lastPart(active);
  const both = active.mode === "both";
  const length = doneAfter(active);
  const timerLength = active.duration ?? 0;
  const reps = repsOf(active);
  /** The clock of the part going now: a countdown for a timer, a stopwatch for reps. */
  const partWatch = Math.max(0, now - (active.partSince ?? active.since));
  const all = totalTime(active, now);
  // A set with a timer earns XP for the reps its timer is reckoned at, too.
  const xpReps = reps + (isTimed(active) ? estimateReps(timerLength) : 0);

  /** Both mode: the first part is done, the second begins. */
  const onward = () => {
    const next = nextPart(state, Date.now());
    if (next === state) return;
    buzz(30);
    onChange(next);
  };

  /** Done: the set counts. With `again`, another of the same starts at once, here. */
  const done = (again = false) => {
    const t = Date.now();
    const next = finishSet(state, t);
    if (next === state) return;
    onChange(
      again
        ? startSet(next, active.id, t, {
            mode: active.mode ?? "count",
            target: active.target || undefined,
            minutes: active.duration ? active.duration / 60_000 : undefined,
          })
        : next,
    );
    const before = levelForXp(useGame.getState().skills.recitation);
    grantSkillXp("recitation", setXp(text, xpReps));
    const after = levelForXp(useGame.getState().skills.recitation);
    if (after > before) flashToast(`Recitation level ${after}`);
    buzz(30);
    if (again) {
      flashToast(`+${reps.toLocaleString()} ${text} · again`);
      setNow(t);
      return;
    }
    const now = next.items.find((i) => i.id === active.id);
    onDone?.({
      id: active.id,
      text,
      added: reps,
      total: now?.total ?? 0,
      time: now?.ms ?? 0,
      took: totalTime(active, t),
      timed: isTimed(active),
    });
  };

  // Blank: pure black (pixels off on most phone screens) until a tap anywhere.
  if (blank)
    return createPortal(
      <button
        type="button"
        className="rest-screen fixed inset-0 z-[80] block h-full w-full cursor-default bg-black"
        aria-label={`Screen blank while you recite ${text}. Tap to show the set.`}
        onClick={() => {
          setNow(Date.now());
          setBlank(false);
        }}
      />,
      document.body,
    );

  return createPortal(
    <div
      className="rest-screen fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-fg"
      role="dialog"
      aria-label={`${title}: ${text}`}
    >
      <BinaryWall text={text} color={color} spec={R.wall} />
      <div className="relative w-full max-w-md rounded-xl bg-black/85 p-4 text-center">
        <p className="text-xs tracking-wider text-muted uppercase">
          {title} ·{" "}
          {both
            ? `${active.target.toLocaleString()} reps + ${clock(timerLength)} timer · part ${(active.part ?? 0) + 1} of 2`
            : part === "timer"
              ? `${clock(timerLength)} timer`
              : `set of ${active.target.toLocaleString()}`}{" "}
          · {item.total.toLocaleString()} so far
        </p>
        <p className="mt-2 text-2xl leading-snug break-words" style={{ color }}>
          {text}
        </p>
        <p
          className={`mt-3 font-display text-5xl leading-none tabular-nums ${ready ? "text-gold" : "text-fg"}`}
          aria-live="off"
          aria-label={
            part === "timer" ? `Time left ${clock(left, true)}` : `Stopwatch ${clock(partWatch)}`
          }
        >
          {part === "timer" ? clock(left, true) : clock(partWatch)}
        </p>
        <p className="mt-1 text-xs tracking-wider text-muted uppercase">
          {part === "timer"
            ? ready
              ? last
                ? "Time's up: tap Done"
                : "Time's up: on to the reps"
              : "Repeat it nonstop until the time is up"
            : ready
              ? last
                ? "Ready: tap Done when you finish"
                : "Ready: tap when the reps are done, then the timer"
              : `${active.target.toLocaleString()} reps · Done opens in ${clock(left, true)}`}
        </p>
        {reward && <p className="mt-2 text-xs text-gold">{reward}</p>}
        <div className={`mt-4 grid gap-2 ${repeat ? "grid-cols-2" : "grid-cols-1"}`}>
          <button type="button" className="btn min-h-14" onClick={() => setBlank(true)}>
            <EyeOff className="size-5" aria-hidden />
            {repeat ? "Blank screen" : "Blank the screen (tap again to show)"}
          </button>
          {repeat && (
            <button
              type="button"
              className={`btn min-h-14 ${ready && last ? "btn-gold" : ""}`}
              disabled={!ready || !last}
              onClick={() => done(true)}
              aria-label={`Done, and again: another ${both ? "set" : part === "timer" ? clock(timerLength) : active.target} of ${text}`}
            >
              <RotateCcw className="size-5" aria-hidden />
              Done, and again
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn mt-2 min-h-20 w-full flex-col gap-0 text-lg ${ready ? "btn-gold" : "opacity-70"}`}
          disabled={!ready}
          onClick={last ? () => done() : onward}
        >
          <span className="flex items-center gap-2">
            <Check className="size-5" aria-hidden />
            {!ready
              ? `Done in ${clock(left, true)}`
              : !last
                ? part === "reps"
                  ? `Reps done: on to the ${clock(timerLength)} timer ▶`
                  : `On to the ${active.target.toLocaleString()} reps ▶`
                : part === "timer" && !both
                  ? `Done: ${clock(timerLength)} ⏱`
                  : `Done: +${reps.toLocaleString()} in ${clock(all)}${both ? " ⏱" : ""}`}
          </span>
          <span className="text-[0.7rem] tracking-normal normal-case opacity-90">
            {(item.total + reps).toLocaleString()} in {clock(item.ms + all)} all told
          </span>
        </button>
        {asking ? (
          <Confirm
            text="Cancel this set? Nothing is added."
            yes="Yes, cancel it"
            no="No, go on"
            onYes={() => {
              setAsking(false);
              onChange(cancelSet(state));
            }}
            onNo={() => setAsking(false)}
          />
        ) : (
          <button type="button" className="btn mt-2 w-full" onClick={() => setAsking(true)}>
            <X className="size-4" aria-hidden />
            Cancel the set
          </button>
        )}
        <p className="mt-3 text-[0.7rem] text-muted">
          {both
            ? `Two parts, one after the other: ${active.first === "timer" ? `nonstop for ${clock(timerLength)}, then ${active.target.toLocaleString()} reps` : `${active.target.toLocaleString()} reps, then nonstop for ${clock(timerLength)}`}.`
            : part === "timer"
              ? `Recite it over and over for ${clock(timerLength)}; a long buzz when the time is up.`
              : `Recite it ${active.target.toLocaleString()} times; Done opens after ${clock(length)}.`}{" "}
          The game rests meanwhile, and the clock runs with the screen off too.
        </p>
        {state.alarm && timerEnd > 0 && alarmStatus && (
          <p className="mt-1 text-[0.7rem] text-gold" role="status">
            🔔 {alarmStatus}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
