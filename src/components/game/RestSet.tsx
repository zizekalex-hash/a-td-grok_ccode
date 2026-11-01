import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { BinaryWall } from "@/components/game/BinaryWall";
import { Confirm } from "@/components/game/Confirm";
import { buzz } from "@/components/game/feel";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp } from "@/game/recite";
import {
  cancelSet,
  clock,
  finishSet,
  setMs,
  setTime,
  setXp,
  timeLeft,
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
  /** How long this set took (ms). */
  took: number;
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
}: {
  state: RepsState;
  /** The reps after a change (Done or Cancel), to save. */
  onChange: (next: RepsState) => void;
  /** After Done, with what it added. */
  onDone?: (done: SetDone) => void;
  title: string;
  /** What Done also pays, in words. */
  reward?: ReactNode;
  color?: string;
}) {
  const active = state.active;
  const item = active ? state.items.find((i) => i.id === active.id) : undefined;
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);

  // The rest lasts while the set runs.
  const on = !!active;
  useEffect(() => (on ? holdRest() : undefined), [on]);

  // Once a second, by the clock; a buzz when Done opens.
  useEffect(() => {
    if (!active) return;
    let wasReady = timeLeft(active, Date.now()) <= 0;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const ready = timeLeft(active, t) <= 0;
      if (ready && !wasReady) buzz(80);
      wasReady = ready;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active || !item || typeof document === "undefined") return null;
  const text = item.text;
  const left = timeLeft(active, now);
  const ready = left <= 0;
  const watch = setTime(active, now);

  const done = () => {
    const t = Date.now();
    const next = finishSet(state, t);
    if (next === state) return;
    onChange(next);
    const before = levelForXp(useGame.getState().skills.recitation);
    grantSkillXp("recitation", setXp(text, active.target));
    const after = levelForXp(useGame.getState().skills.recitation);
    if (after > before) flashToast(`Recitation level ${after}`);
    buzz(30);
    const now = next.items.find((i) => i.id === active.id);
    onDone?.({
      id: active.id,
      text,
      added: active.target,
      total: now?.total ?? 0,
      time: now?.ms ?? 0,
      took: setTime(active, t),
    });
  };

  return createPortal(
    <div
      className="rest-screen fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-fg"
      role="dialog"
      aria-label={`${title}: ${active.target} ${text}`}
    >
      <BinaryWall text={text} color={color} spec={R.wall} />
      <div className="relative w-full max-w-md rounded-xl bg-black/85 p-4 text-center">
        <p className="text-xs tracking-wider text-muted uppercase">
          {title} · set of {active.target.toLocaleString()} · {item.total.toLocaleString()} so far
        </p>
        <p className="mt-2 text-2xl leading-snug break-words" style={{ color }}>
          {text}
        </p>
        <p
          className={`mt-3 font-display text-5xl leading-none tabular-nums ${ready ? "text-gold" : "text-fg"}`}
          aria-live="off"
          aria-label={`Stopwatch ${clock(watch)}`}
        >
          {clock(watch)}
        </p>
        <p className="mt-1 text-xs tracking-wider text-muted uppercase">
          {ready ? "Ready: tap Done when you finish" : `Done opens in ${clock(left, true)}`}
        </p>
        {reward && <p className="mt-2 text-xs text-gold">{reward}</p>}
        <button
          type="button"
          className={`btn mt-4 min-h-20 w-full flex-col gap-0 text-lg ${ready ? "btn-gold" : "opacity-70"}`}
          disabled={!ready}
          onClick={done}
        >
          <span className="flex items-center gap-2">
            <Check className="size-5" aria-hidden />
            {ready
              ? `Done: +${active.target.toLocaleString()} in ${clock(watch)}`
              : `Done in ${clock(left, true)}`}
          </span>
          <span className="text-[0.7rem] tracking-normal normal-case opacity-90">
            {(item.total + active.target).toLocaleString()} in {clock(item.ms + watch)} all told
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
          Recite it {active.target.toLocaleString()} times; Done opens after{" "}
          {clock(setMs(active.target))}. The game rests meanwhile, and the stopwatch runs with the
          screen off too.
        </p>
      </div>
    </div>,
    document.body,
  );
}
