import { useEffect, useState } from "react";
import { Check, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp } from "@/game/recite";
import {
  addItem,
  cancelSet,
  clampSet,
  clock,
  finishSet,
  grandTotal,
  readReps,
  removeItem,
  resetAll,
  setMs,
  setXp,
  startSet,
  timeLeft,
  writeReps,
  type RepItem,
  type RepsState,
} from "@/game/reps";
import { useGame } from "@/game/store";

const R = CONFIG.reps;
/** Red for what cannot be undone (the shared button style sets its own colours). */
const DANGER = { color: "var(--color-danger)", borderColor: "var(--color-danger)" };

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
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
 * and start a set. It takes at least a second a rep (by the clock, so the screen
 * can be off); then one tap of Done adds the whole set to the total. Reset sets
 * every total back to 0 and keeps the phrases.
 */
export function RepsTab() {
  const [state, setState] = useState<RepsState>(() => readReps());
  const [draft, setDraft] = useState("");
  const [setText, setSetText] = useState(String(state.set));
  const [asking, setAsking] = useState<
    null | { kind: "reset" } | { kind: "delete"; id: string } | { kind: "cancel" }
  >(null);
  /** The set just finished: what it added and the new total. */
  const [saved, setSaved] = useState<null | { id: string; added: number; total: number }>(null);
  const [now, setNow] = useState(() => Date.now());

  const save = (next: RepsState) => {
    setState(next);
    writeReps(next);
  };
  const item = (id: string) => state.items.find((i) => i.id === id);

  // While a set runs, the time left is checked twice a second (by the clock, so time
  // with the screen off counts too); a short buzz when Done opens.
  const active = state.active;
  useEffect(() => {
    if (!active) return;
    let wasReady = timeLeft(active, Date.now()) <= 0;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const ready = timeLeft(active, t) <= 0;
      if (ready && !wasReady) buzz(80);
      wasReady = ready;
    }, 500);
    return () => window.clearInterval(timer);
  }, [active]);

  const add = () => {
    const { state: next, id } = addItem(state, draft, Date.now());
    if (!id) return;
    save(next);
    setDraft("");
  };

  const start = (id: string) => {
    setAsking(null);
    setSaved(null);
    const t = Date.now();
    setNow(t);
    save(startSet(state, id, t));
  };

  /** Done: the whole set goes to the phrase, with Recitation XP. */
  const done = () => {
    const a = state.active;
    if (!a) return;
    const t = Date.now();
    const next = finishSet(state, t);
    if (next === state) return;
    save(next);
    const it = item(a.id);
    if (it) {
      const before = levelForXp(useGame.getState().skills.recitation);
      grantSkillXp("recitation", setXp(it.text, a.target));
      const after = levelForXp(useGame.getState().skills.recitation);
      if (after > before) flashToast(`Recitation level ${after}`);
    }
    buzz(30);
    setSaved({
      id: a.id,
      added: a.target,
      total: next.items.find((i) => i.id === a.id)?.total ?? 0,
    });
  };

  const pickSet = (n: number) => {
    const set = clampSet(n);
    save({ ...state, set });
    setSetText(String(set));
  };

  // ---- A set in progress ----
  if (active) {
    const text = item(active.id)?.text ?? "";
    const full = setMs(active.target);
    const left = timeLeft(active, now);
    const ready = left <= 0;
    const elapsed = Math.min(full, Math.max(0, now - active.since));
    return (
      <div>
        <p className="text-xs tracking-wider text-muted uppercase">
          Set of {active.target.toLocaleString()} reps ·{" "}
          {(item(active.id)?.total ?? 0).toLocaleString()} so far
        </p>
        <div className="glass mt-2 p-4 text-center">
          <p className="text-xl leading-snug break-words text-fg">{text}</p>
          <p
            className={`mt-3 font-display text-5xl leading-none ${ready ? "text-gold" : "text-cyan"}`}
            aria-live="off"
          >
            {ready ? "✓" : clock(left)}
          </p>
          {/* The bar fills by itself over the set's time, from wherever it is now. */}
          <div className="mt-3 h-1.5 overflow-hidden rounded bg-cyan/10" aria-hidden>
            <div
              key={`${active.since}|${ready}`}
              className={`h-1.5 rounded ${ready ? "bg-gold" : "court-fill bg-cyan"}`}
              style={
                ready
                  ? undefined
                  : { animationDuration: `${full}ms`, animationDelay: `-${elapsed}ms` }
              }
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {ready
              ? `Done when you have said it ${active.target.toLocaleString()} times.`
              : `Recite it ${active.target.toLocaleString()} times. Done opens after ${clock(full)} (${R.secondsPerRep} s a rep); the time runs with the screen off too.`}
          </p>
        </div>
        <button
          type="button"
          className={`btn mt-3 min-h-20 w-full flex-col gap-0 text-lg ${ready ? "btn-gold" : "opacity-70"}`}
          disabled={!ready}
          onClick={done}
        >
          <span className="flex items-center gap-2">
            <Check className="size-5" aria-hidden />
            {ready ? `Done: +${active.target.toLocaleString()}` : `Done in ${clock(left)}`}
          </span>
          <span className="text-[0.7rem] tracking-normal normal-case opacity-90">
            {(item(active.id)?.total ?? 0) + active.target} in all
          </span>
        </button>
        {asking?.kind === "cancel" ? (
          <Confirm
            text="Cancel this set? Nothing is added."
            yes="Yes, cancel it"
            no="No, go on"
            onYes={() => {
              save(cancelSet(state));
              setAsking(null);
            }}
            onNo={() => setAsking(null)}
          />
        ) : (
          <button
            type="button"
            className="btn mt-2 w-full"
            onClick={() => setAsking({ kind: "cancel" })}
          >
            <X className="size-4" aria-hidden />
            Cancel the set
          </button>
        )}
      </div>
    );
  }

  // ---- The list ----
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Write a word or phrase, then do sets of reps of it. A set of {R.setSizes.at(-1)} takes at
        least {clock(setMs(R.setSizes.at(-1) ?? 100))}; then Done adds it to the total, with
        Recitation XP.
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

      {saved && item(saved.id) && (
        <div className="mt-3 rounded-md border border-gold/60 p-3 text-center" role="status">
          <p className="font-display text-lg text-gold">
            +{saved.added.toLocaleString()} → {saved.total.toLocaleString()}
          </p>
          <p className="mt-1 text-sm break-words">{item(saved.id)?.text}</p>
          <button
            type="button"
            className="btn btn-gold mt-2 min-h-12 w-full"
            onClick={() => start(saved.id)}
          >
            <RotateCcw className="size-4" aria-hidden />
            Another {state.set.toLocaleString()}
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
                aria-label={`Start a set of ${state.set} reps of ${it.text}`}
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
                  if (saved?.id === it.id) setSaved(null);
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
                setSaved(null);
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
