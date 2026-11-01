import { useEffect, useState } from "react";
import { Check, FileText, Library, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { RepsPicker } from "@/components/game/RepsPicker";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp } from "@/game/recite";
import {
  addItem,
  addMany,
  phrasesFromText,
  cancelSet,
  clampSet,
  clock,
  finishSet,
  grandTime,
  grandTotal,
  perRep,
  readReps,
  removeItem,
  resetAll,
  seconds,
  setMs,
  setTime,
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
export function Confirm({
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
  const [saved, setSaved] = useState<null | {
    id: string;
    added: number;
    total: number;
    /** How long the set took, and all the time for this phrase (ms). */
    took: number;
    time: number;
  }>(null);
  const [now, setNow] = useState(() => Date.now());
  /** A text's phrases being picked from (only the picked ones are kept), and the loaded texts' list being open. */
  const [source, setSource] = useState<null | { name: string; phrases: string[] }>(null);
  const [chooseLoaded, setChooseLoaded] = useState(false);
  const texts = useGame((s) => s.texts);

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
    const after = next.items.find((i) => i.id === a.id);
    setSaved({
      id: a.id,
      added: a.target,
      total: after?.total ?? 0,
      took: setTime(a, t),
      time: after?.ms ?? 0,
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
    // The stopwatch: from the set's start until Done.
    const watch = setTime(active, now);
    return (
      <div>
        <p className="text-xs tracking-wider text-muted uppercase">
          Set of {active.target.toLocaleString()} reps ·{" "}
          {(item(active.id)?.total ?? 0).toLocaleString()} so far
        </p>
        <div className="glass mt-2 p-4 text-center">
          <p className="text-xl leading-snug break-words text-fg">{text}</p>
          <p
            className={`mt-3 font-display text-5xl leading-none tabular-nums ${ready ? "text-gold" : "text-cyan"}`}
            aria-live="off"
            aria-label={`Stopwatch ${clock(watch)}`}
          >
            {clock(watch)}
          </p>
          <p className="mt-1 text-xs tracking-wider text-muted uppercase">
            {ready ? "Ready: tap Done when you finish" : `Done opens in ${clock(left, true)}`}
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
              ? `The stopwatch runs until you tap Done, after ${active.target.toLocaleString()} reps.`
              : `Recite it ${active.target.toLocaleString()} times. Done opens after ${clock(full)} (${R.secondsPerRep} s a rep); the stopwatch runs with the screen off too.`}
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
            {ready
              ? `Done: +${active.target.toLocaleString()} in ${clock(watch)}`
              : `Done in ${clock(left, true)}`}
          </span>
          <span className="text-[0.7rem] tracking-normal normal-case opacity-90">
            {((item(active.id)?.total ?? 0) + active.target).toLocaleString()} in{" "}
            {clock((item(active.id)?.ms ?? 0) + watch)} all told
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

  /** Reads .txt files into phrases to pick from. */
  const loadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    const all = await Promise.all(list.map((f) => f.text()));
    const phrases = phrasesFromText(all.join("\n"));
    if (!phrases.length) {
      flashToast("No phrases found in that text");
      return;
    }
    setChooseLoaded(false);
    setSource({ name: list.map((f) => f.name).join(", "), phrases });
  };

  // ---- Picking phrases from a text ----
  if (source) {
    return (
      <RepsPicker
        name={source.name}
        phrases={source.phrases}
        state={state}
        onClose={() => setSource(null)}
        onAdd={(picked) => {
          const { state: next, added } = addMany(state, picked, Date.now());
          save(next);
          setSource(null);
          flashToast(
            added
              ? `Added ${added} phrase${added === 1 ? "" : "s"} to the list`
              : "Already on the list",
          );
        }}
      />
    );
  }

  // ---- The list ----
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Your words and phrases stay here. Tap one to start a set; Done adds it with its time (a set
        of {R.setSizes.at(-1)} takes at least {clock(setMs(R.setSizes.at(-1) ?? 100))}).
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
      {/* Phrases from a text: pick the ones you want onto the list. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="btn cursor-pointer">
          <FileText className="size-4" aria-hidden />
          Load .txt
          <input
            type="file"
            accept=".txt,text/plain"
            multiple
            className="sr-only"
            onChange={(e) => {
              void loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!texts.length}
          data-on={chooseLoaded}
          aria-expanded={chooseLoaded}
          onClick={() => setChooseLoaded((v) => !v)}
        >
          <Library className="size-4" aria-hidden />
          Loaded texts
        </button>
      </div>
      {chooseLoaded && texts.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Pick phrases from a loaded text">
          {texts.map((t, i) => (
            <li key={`${t.name}-${i}`}>
              <button
                type="button"
                className="w-full rounded-md border border-cyan/25 p-2 text-left text-sm hover:bg-cyan/5"
                onClick={() => {
                  setChooseLoaded(false);
                  setSource({ name: t.name, phrases: phrasesFromText(t.lines.join("\n")) });
                }}
              >
                <span className="text-fg">{t.name}</span>{" "}
                <span className="text-xs text-muted">· {t.lines.length} lines</span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
          <p className="text-sm">
            Completed {saved.added.toLocaleString()}{" "}
            <span className="break-words">{item(saved.id)?.text}</span> in{" "}
            <span className="font-display text-gold">{clock(saved.took)}</span>{" "}
            <span className="text-muted">({seconds(saved.took).toLocaleString()} s)</span>
          </p>
          <p className="mt-1 font-display text-lg text-gold">
            {saved.total.toLocaleString()} · {clock(saved.time)}
          </p>
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
              {/* The whole phrase is a button: tap it to start a set. */}
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md p-1 text-left hover:bg-cyan/5 active:bg-cyan/10"
                onClick={() => start(it.id)}
                aria-label={`${it.total} ${it.text}, ${clock(it.ms)}. Start a set of ${state.set} reps`}
              >
                <span className="block break-words">
                  <span className="font-display text-xl text-gold">
                    {it.total.toLocaleString()}
                  </span>{" "}
                  <span className="text-fg">{it.text}</span>{" "}
                  <span className="text-cyan whitespace-nowrap">· {clock(it.ms)}</span>
                </span>
                <span className="block text-xs text-muted">
                  {it.sets > 0
                    ? `${it.sets} set${it.sets === 1 ? "" : "s"} · ${perRep(it)} s a rep · last set ${clock(it.last)}`
                    : `Tap to start a set of ${state.set.toLocaleString()}`}
                </span>
              </button>
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
            <span className="font-display text-gold">{grandTotal(state).toLocaleString()}</span> in{" "}
            <span className="text-cyan">{clock(grandTime(state))}</span>
          </p>
          {asking?.kind === "reset" ? (
            <Confirm
              text="Set every count and time back to 0? Your words and phrases stay."
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
