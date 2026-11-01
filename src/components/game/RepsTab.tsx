import { useEffect, useRef, useState } from "react";
import { Check, Minus, Pause, Play, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp } from "@/game/recite";
import {
  addItem,
  addReps,
  clampPace,
  clampSet,
  grandTotal,
  msPerRep,
  readReps,
  removeItem,
  repsAt,
  resetAll,
  setXp,
  writeReps,
  type RepItem,
  type RepsState,
} from "@/game/reps";
import { useGame } from "@/game/store";

const R = CONFIG.reps;
/** Red for what cannot be undone (the shared button style sets its own colours). */
const DANGER = { color: "var(--color-danger)", borderColor: "var(--color-danger)" };

/** A set being counted: how far it is, and whether it counts by itself or by taps. */
interface Run {
  id: string;
  target: number;
  count: number;
  auto: boolean;
  repMs: number;
  /** Time counted before the last pause (auto), and when counting last resumed (null while held). */
  elapsed: number;
  since: number | null;
  phase: "count" | "done" | "stopping" | "saved";
  /** What the finished set added, and the new total. */
  added: number;
  total: number;
}

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
}

/** Keeps the screen on while a set counts, where the browser allows it. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((l) => {
        if (gone) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      gone = true;
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

/** Two buttons to say yes or no, the safe answer first. */
function Confirm({
  text,
  yes,
  no,
  onYes,
  onNo,
}: {
  text: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div
      className="mt-2 rounded-md border border-danger/60 p-3"
      role="alertdialog"
      aria-label={text}
    >
      <p className="text-sm text-fg">{text}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn min-h-12" onClick={onNo} autoFocus>
          {no}
        </button>
        <button type="button" className="btn min-h-12" style={DANGER} onClick={onYes}>
          {yes}
        </button>
      </div>
    </div>
  );
}

/**
 * Reps of your own words and phrases: write one, pick how many reps a set has,
 * and count them (by themselves at a pace, or one tap each). Finishing a set adds
 * it to the total; Reset sets every total back to 0 and keeps the phrases.
 */
export function RepsTab() {
  const [state, setState] = useState<RepsState>(() => readReps());
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [asking, setAsking] = useState<null | { kind: "reset" } | { kind: "delete"; id: string }>(
    null,
  );
  const [setText, setSetText] = useState(String(state.set));
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const save = (next: RepsState) => {
    setState(next);
    writeReps(next);
  };
  const item = (id: string) => state.items.find((i) => i.id === id);

  // Counting by itself: the count follows the clock; at the set's end it waits for the tap that saves it.
  const counting = run?.phase === "count" && run.auto && run.since !== null;
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => {
      const r = runRef.current;
      if (!r || r.phase !== "count" || r.since === null) return;
      const count = repsAt(r.elapsed + performance.now() - r.since, r.repMs, r.target);
      if (count >= r.target) {
        buzz(60);
        setRun({
          ...r,
          count,
          phase: "done",
          elapsed: r.elapsed + performance.now() - r.since,
          since: null,
        });
      } else if (count !== r.count) {
        setRun({ ...r, count });
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [counting]);
  useWakeLock(!!run && run.phase !== "saved");

  const add = () => {
    const { state: next, id } = addItem(state, draft, Date.now());
    if (!id) return;
    save(next);
    setDraft("");
  };

  const start = (id: string) => {
    const it = item(id);
    if (!it) return;
    setAsking(null);
    setRun({
      id,
      target: state.set,
      count: 0,
      auto: state.auto,
      repMs: msPerRep(it.text, state.wordMs),
      elapsed: 0,
      since: state.auto ? performance.now() : null,
      phase: "count",
      added: 0,
      total: it.total,
    });
  };

  /** Adds the reps counted to the phrase, with Recitation XP, and shows what it came to. */
  const finish = (count: number) => {
    const r = run;
    if (!r) return;
    const it = item(r.id);
    const next = addReps(state, r.id, count);
    save(next);
    if (it && count > 0) {
      const before = levelForXp(useGame.getState().skills.recitation);
      grantSkillXp("recitation", setXp(it.text, count));
      const after = levelForXp(useGame.getState().skills.recitation);
      if (after > before) flashToast(`Recitation level ${after}`);
    }
    buzz(30);
    const total = next.items.find((i) => i.id === r.id)?.total ?? 0;
    setRun({ ...r, phase: "saved", added: count, total, since: null });
  };

  const hold = () => {
    if (!run || run.phase !== "count" || !run.auto) return;
    if (run.since === null) setRun({ ...run, since: performance.now() });
    else setRun({ ...run, elapsed: run.elapsed + performance.now() - run.since, since: null });
  };

  const tapRep = () => {
    if (!run || run.phase !== "count" || run.auto) return;
    const count = run.count + 1;
    buzz(count >= run.target ? 60 : 8);
    setRun({ ...run, count, phase: count >= run.target ? "done" : "count" });
  };

  const stop = () => {
    if (!run) return;
    const held =
      run.auto && run.since !== null
        ? { elapsed: run.elapsed + performance.now() - run.since, since: null }
        : {};
    setRun({ ...run, ...held, phase: "stopping" });
  };

  const pickSet = (n: number) => {
    const set = clampSet(n);
    save({ ...state, set });
    setSetText(String(set));
  };

  // ---- A set being counted ----
  if (run) {
    const it = item(run.id);
    const text = it?.text ?? "";
    const left = run.target - run.count;
    const recent = [run.count - 2, run.count - 1].filter((n) => n > 0);
    return (
      <div>
        <p className="text-xs tracking-wider text-muted uppercase">
          Set of {run.target.toLocaleString()} · {run.total.toLocaleString()} before this set
        </p>
        <div
          className={`glass mt-2 p-4 text-center select-none ${!run.auto && run.phase === "count" ? "cursor-pointer" : ""}`}
          onPointerDown={(e) => {
            if (!run.auto && run.phase === "count") {
              e.preventDefault();
              tapRep();
            }
          }}
          aria-live="polite"
        >
          {/* The last reps fading above the current one: 1 xyz, 2 xyz, 3 xyz... */}
          <div className="min-h-12 text-sm text-muted">
            {recent.map((n, i) => (
              <p key={n} className="truncate" style={{ opacity: 0.35 + i * 0.3 }}>
                {n} {text}
              </p>
            ))}
          </div>
          <p className="font-display text-6xl leading-none text-gold">
            {run.count.toLocaleString()}
          </p>
          <p className="mt-2 text-lg leading-snug break-words text-fg">{text}</p>
          <div className="meter mt-3" aria-hidden>
            <span style={{ width: `${(run.count / run.target) * 100}%` }} />
          </div>
          {run.auto && run.phase === "count" && run.since !== null && (
            <div className="mt-2 h-1 overflow-hidden rounded bg-cyan/10" aria-hidden>
              <div
                key={run.count}
                className="court-fill h-1 rounded bg-cyan"
                style={{ animationDuration: `${run.repMs}ms` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            {run.phase === "count"
              ? run.auto
                ? run.since === null
                  ? "Held. Resume when you are ready."
                  : `${left.toLocaleString()} to go · ${(run.repMs / 1000).toFixed(1)} s a rep`
                : `${left.toLocaleString()} to go · tap here for each rep`
              : run.phase === "done"
                ? "All done. Tap to save them."
                : ""}
          </p>
        </div>

        {run.phase === "count" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {run.auto ? (
              <button type="button" className="btn min-h-14" onClick={hold}>
                {run.since === null ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )}
                {run.since === null ? "Resume" : "Hold"}
              </button>
            ) : (
              <button type="button" className="btn btn-gold min-h-14" onClick={tapRep}>
                <Plus className="size-4" aria-hidden />
                Rep {run.count + 1}
              </button>
            )}
            <button type="button" className="btn min-h-14" onClick={stop}>
              <Square className="size-4" aria-hidden />
              Stop
            </button>
          </div>
        )}

        {run.phase === "done" && (
          <button
            type="button"
            className="btn btn-gold mt-3 min-h-20 w-full flex-col gap-0 text-lg"
            onClick={() => finish(run.count)}
          >
            <span className="flex items-center gap-2">
              <Check className="size-5" aria-hidden />
              Done
            </span>
            <span className="text-[0.7rem] tracking-normal normal-case opacity-90">
              Save {run.count.toLocaleString()} reps: {(run.total + run.count).toLocaleString()} in
              all
            </span>
          </button>
        )}

        {run.phase === "stopping" && (
          <div className="mt-3 rounded-md border border-cyan/40 p-3">
            <p className="text-sm">
              Stop here?{" "}
              {run.count > 0
                ? `You counted ${run.count.toLocaleString()} reps.`
                : "No reps counted yet."}
            </p>
            <div className="mt-2 grid gap-2">
              {run.count > 0 && (
                <button
                  type="button"
                  className="btn btn-gold min-h-12"
                  onClick={() => finish(run.count)}
                >
                  Keep {run.count.toLocaleString()} reps
                </button>
              )}
              <button
                type="button"
                className="btn min-h-12"
                onClick={() =>
                  setRun({
                    ...run,
                    phase: "count",
                    since: run.auto ? performance.now() : null,
                  })
                }
              >
                Keep counting
              </button>
              <button
                type="button"
                className="btn min-h-12"
                style={DANGER}
                onClick={() => setRun(null)}
              >
                Throw this set away
              </button>
            </div>
          </div>
        )}

        {run.phase === "saved" && (
          <div className="mt-3 rounded-md border border-gold/60 p-3 text-center" role="status">
            <p className="font-display text-lg text-gold">
              +{run.added.toLocaleString()} → {run.total.toLocaleString()}
            </p>
            <p className="mt-1 text-sm break-words">{text}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-gold min-h-14" onClick={() => start(run.id)}>
                <RotateCcw className="size-4" aria-hidden />
                Another {state.set.toLocaleString()}
              </button>
              <button type="button" className="btn min-h-14" onClick={() => setRun(null)}>
                Back to the list
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- The list ----
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Write a word or phrase, then count sets of reps of it. Each finished set adds to its total,
        and gives Recitation XP.
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="text-input min-w-0 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A word or phrase"
          aria-label="A word or phrase to add"
          maxLength={300}
        />
        <button type="submit" className="btn shrink-0" disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </form>

      <p className="mt-3 text-xs tracking-wider text-muted uppercase">Reps in a set</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {R.setSizes.map((n) => (
          <button
            key={n}
            type="button"
            className="btn min-w-12"
            data-on={state.set === n}
            aria-pressed={state.set === n}
            onClick={() => pickSet(n)}
          >
            {n}
          </button>
        ))}
        <input
          className="text-input w-24"
          type="number"
          inputMode="numeric"
          min={1}
          max={R.maxSet}
          value={setText}
          onChange={(e) => setSetText(e.target.value)}
          onBlur={() => pickSet(Number(setText))}
          onKeyDown={(e) => {
            if (e.key === "Enter") pickSet(Number(setText));
          }}
          aria-label="Reps in a set"
        />
      </div>

      <p className="mt-3 text-xs tracking-wider text-muted uppercase">Counting</p>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn"
          data-on={state.auto}
          aria-pressed={state.auto}
          onClick={() => save({ ...state, auto: true })}
        >
          By itself
        </button>
        <button
          type="button"
          className="btn"
          data-on={!state.auto}
          aria-pressed={!state.auto}
          onClick={() => save({ ...state, auto: false })}
        >
          I tap each rep
        </button>
      </div>
      {state.auto && (
        <div className="mt-1.5 flex items-center justify-center gap-1 text-xs">
          <button
            type="button"
            className="btn stepper"
            aria-label="Slower"
            onClick={() => save({ ...state, wordMs: clampPace(state.wordMs + 100) })}
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="min-w-28 text-center text-muted">
            {(state.wordMs / 1000).toFixed(1)} s a word
          </span>
          <button
            type="button"
            className="btn stepper"
            aria-label="Faster"
            onClick={() => save({ ...state, wordMs: clampPace(state.wordMs - 100) })}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <ul className="mt-4 space-y-2" aria-label="Your words and phrases">
        {state.items.length === 0 && (
          <li className="text-sm text-muted">Nothing yet. Add a word or phrase above.</li>
        )}
        {state.items.map((it: RepItem) => (
          <li key={it.id} className="rounded-md border border-cyan/25 p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words">
                  <span className="font-display text-xl text-gold">
                    {it.total.toLocaleString()}
                  </span>{" "}
                  <span className="text-fg">{it.text}</span>
                </p>
                <p className="text-xs text-muted">
                  {it.sets} set{it.sets === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-gold shrink-0"
                onClick={() => start(it.id)}
                aria-label={`Count ${state.set} reps of ${it.text}`}
              >
                <Play className="size-4" aria-hidden />
                {state.set.toLocaleString()}
              </button>
              <button
                type="button"
                className="btn shrink-0 px-2"
                onClick={() => setAsking({ kind: "delete", id: it.id })}
                aria-label={`Delete ${it.text}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            {asking?.kind === "delete" && asking.id === it.id && (
              <Confirm
                text={`Delete "${it.text}" and its ${it.total.toLocaleString()} reps?`}
                yes="Yes, delete"
                no="No"
                onYes={() => {
                  save(removeItem(state, it.id));
                  setAsking(null);
                }}
                onNo={() => setAsking(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {state.items.length > 0 && (
        <div className="mt-4 border-t border-cyan/20 pt-3">
          <p className="text-sm">
            All reps:{" "}
            <span className="font-display text-gold">{grandTotal(state).toLocaleString()}</span>
          </p>
          {asking?.kind === "reset" ? (
            <Confirm
              text="Set every count back to 0? Your words and phrases stay."
              yes="Yes, reset to 0"
              no="No, keep them"
              onYes={() => {
                save(resetAll(state));
                setAsking(null);
                flashToast("All reps back to 0");
              }}
              onNo={() => setAsking(null)}
            />
          ) : (
            <button
              type="button"
              className="btn mt-2 w-full"
              style={DANGER}
              onClick={() => setAsking({ kind: "reset" })}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset all to 0
            </button>
          )}
        </div>
      )}
    </div>
  );
}
