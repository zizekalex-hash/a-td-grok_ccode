import { useState } from "react";
import {
  ClipboardPaste,
  FileText,
  Library,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { DANGER, buzz } from "@/components/game/feel";
import { RepsPicker } from "@/components/game/RepsPicker";
import { RestSet } from "@/components/game/RestSet";
import { alarmLog, playAlarmNow } from "@/game/alarm";
import { CONFIG } from "@/game/config";
import { flashToast } from "@/game/engine";
import {
  addItem,
  addMany,
  phrasesFromText,
  clampAlarmVolume,
  clampMinutes,
  clampSet,
  clock,
  grandTime,
  grandTotal,
  perRep,
  readReps,
  removeItem,
  resetAll,
  seconds,
  setMs,
  startSet,
  writeReps,
  type RepItem,
  type RepsState,
} from "@/game/reps";
import { useGame } from "@/game/store";

const R = CONFIG.reps;
/**
 * Reps of your own words and phrases: write one, pick how many reps a set has,
 * and start a set. It takes at least a second a rep (by the clock, so the screen
 * can be off); then one tap of Done adds the whole set to the total. Reset sets
 * every total back to 0 and keeps the phrases.
 */
/** One call's level: − + or typed, 0.01 to 1. */
function CallLevel({
  label,
  value,
  set,
}: {
  label: string;
  value: number;
  set: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn stepper"
          onClick={() => set(value - 0.05)}
          aria-label={`${label}: less`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          className="w-16 rounded border border-cyan/40 bg-transparent px-1 py-2 text-center text-sm"
          inputMode="decimal"
          value={text ?? value.toFixed(2)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number((text ?? "").replace(",", "."));
            if (text !== null && Number.isFinite(v)) set(v);
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={label}
        />
        <button
          type="button"
          className="btn stepper"
          onClick={() => set(value + 0.05)}
          aria-label={`${label}: more`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}

export function RepsTab() {
  const [state, setState] = useState<RepsState>(() => readReps());
  const [draft, setDraft] = useState("");
  const [setText, setSetText] = useState(String(state.set));
  const [volText, setVolText] = useState<string | null>(null);
  const [alarmNote, setAlarmNote] = useState("");
  const [alarmLines, setAlarmLines] = useState<string | null>(null);
  const [minText, setMinText] = useState(String(state.minutes));
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
    timed: boolean;
  }>(null);
  /** A text's phrases being picked from (only the picked ones are kept), and the loaded texts' list being open. */
  const [source, setSource] = useState<null | { name: string; phrases: string[] }>(null);
  const [chooseLoaded, setChooseLoaded] = useState(false);
  const texts = useGame((s) => s.texts);

  const save = (next: RepsState) => {
    setState(next);
    writeReps(next);
  };
  const item = (id: string) => state.items.find((i) => i.id === id);
  const active = state.active;

  /**
   * Adds what was written or pasted: one line is one phrase, as it is; several
   * lines (a pasted block) open the picker, to choose which phrases to add.
   */
  const add = (text = draft) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      // Pasted lines stay whole: each line is one phrase.
      const phrases = phrasesFromText(text, 5000, false);
      if (phrases.length) {
        setDraft("");
        setChooseLoaded(false);
        setSource({ name: "Pasted text", phrases });
        return;
      }
    }
    const { state: next, id } = addItem(state, text, Date.now());
    if (!id) return;
    save(next);
    setDraft("");
  };

  /**
   * Pastes what was copied (from a file, a note, anywhere): through the phone's
   * clipboard in the app, the browser's elsewhere. Several lines go to the picker;
   * one goes into the box to add.
   */
  const paste = async () => {
    let text = "";
    try {
      const { Clipboard } = await import("@capacitor/clipboard");
      text = (await Clipboard.read()).value ?? "";
    } catch {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = "";
      }
    }
    if (!text.trim()) {
      flashToast("Nothing to paste. Copy a word or phrase first, or long-press the box to paste.");
      return;
    }
    if (text.split(/\r?\n/).filter((l) => l.trim()).length > 1) add(text);
    else setDraft(text.trim());
  };

  const start = (id: string) => {
    setAsking(null);
    setSaved(null);
    save(startSet(state, id, Date.now()));
  };

  const pickSet = (n: number) => {
    const set = clampSet(n);
    save({ ...state, set });
    setSetText(String(set));
  };

  const pickMinutes = (n: number) => {
    const minutes = clampMinutes(n);
    save({ ...state, minutes });
    setMinText(String(minutes));
  };

  /** What a set is now, in words: "100" or "3 min". */
  /** A timer in the set (Timer or Both), and reps in it (Reps or Both). */
  const timed = state.mode !== "count";
  const counts = state.mode !== "timer";
  const setLabel =
    state.mode === "both"
      ? `${state.set.toLocaleString()} + ${state.minutes} min`
      : timed
        ? `${state.minutes} min`
        : state.set.toLocaleString();
  /** "a set of 100 reps", "3 min", "100 reps + 3 min". */
  const setWords =
    state.mode === "both"
      ? `${state.set} reps + ${state.minutes} min`
      : timed
        ? `${state.minutes} min`
        : `a set of ${state.set} reps`;

  // ---- A set in progress: the rest screen, over everything ----
  if (active) {
    return (
      <RestSet
        state={state}
        onChange={save}
        title="Reps"
        repeat
        onDone={(d) =>
          setSaved({
            id: d.id,
            added: d.added,
            total: d.total,
            took: d.took,
            time: d.time,
            timed: d.timed,
          })
        }
      />
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
        Your words and phrases stay here. Tap one to start a set: a number of reps (100 takes at
        least {clock(setMs(100))}), or a timer to repeat it nonstop until the time is up. Done adds
        it with its time.
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        {/* A box that keeps line breaks, so a pasted block arrives whole. */}
        <textarea
          className="text-input min-h-11 min-w-0 flex-1 resize-y py-2"
          rows={draft.includes("\n") ? 4 : 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds; Shift+Enter starts a new line.
            if (e.key === "Enter" && !e.shiftKey && !draft.includes("\n")) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Write or paste a word or phrase"
          aria-label="A word or phrase to add"
          maxLength={20000}
        />
        <div className="flex shrink-0 flex-col gap-1.5">
          <button type="submit" className="btn" disabled={!draft.trim()}>
            <Plus className="size-4" aria-hidden />
            Add
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void paste()}
            aria-label="Paste what you copied"
          >
            <ClipboardPaste className="size-4" aria-hidden />
            Paste
          </button>
        </div>
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

      <p className="mt-3 text-xs tracking-wider text-muted uppercase">A set is</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-label="A set is">
        {(
          [
            ["count", "Reps", "a number of reps"],
            ["timer", "Timer", "a time, repeating nonstop"],
            ["both", "Both", "reps, then a timer"],
          ] as const
        ).map(([mode, label, hint]) => (
          <button
            key={mode}
            type="button"
            className="btn min-h-11 flex-col gap-0"
            data-on={state.mode === mode}
            aria-pressed={state.mode === mode}
            onClick={() => save({ ...state, mode })}
          >
            {label}
            <span className="text-[0.55rem] tracking-normal normal-case opacity-80">{hint}</span>
          </button>
        ))}
      </div>
      {timed && (
        <>
          <p className="mt-3 text-xs tracking-wider text-muted uppercase">Minutes</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {R.timer.choices.map((n) => (
              <button
                key={n}
                type="button"
                className="btn min-w-10 px-2"
                data-on={state.minutes === n}
                aria-pressed={state.minutes === n}
                onClick={() => pickMinutes(n)}
              >
                {n}
              </button>
            ))}
            <input
              className="text-input w-20"
              type="number"
              inputMode="numeric"
              min={1}
              max={R.timer.maxMinutes}
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              onBlur={() => pickMinutes(Number(minText))}
              onKeyDown={(e) => {
                if (e.key === "Enter") pickMinutes(Number(minText));
              }}
              aria-label="Minutes in a timed set"
            />
          </div>
          {state.mode === "both" && (
            <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label="Which first">
              {(
                [
                  ["reps", "Reps first, then timer"],
                  ["timer", "Timer first, then reps"],
                ] as const
              ).map(([first, label]) => (
                <button
                  key={first}
                  type="button"
                  className="btn min-h-10 text-[0.6rem]"
                  data-on={state.first === first}
                  aria-pressed={state.first === first}
                  onClick={() => save({ ...state, first })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <p className={`mt-3 text-xs tracking-wider text-muted uppercase ${counts ? "" : "hidden"}`}>
        Reps in a set
      </p>
      <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${counts ? "" : "hidden"}`}>
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
      <label className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span>
          Start sets on a blank screen
          <span className="block text-xs text-muted">
            All black from the first second; tap it to see the clock and Done.
          </span>
        </span>
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-cyan"
          checked={state.blank}
          onChange={(e) => save({ ...state, blank: e.target.checked })}
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <label className="flex flex-1 items-center justify-between gap-3">
          <span>
            Alarm when a timer is up
            <span className="block text-xs text-muted">
              The phrase itself as sound, as Rehearse makes it (its raw bytes, at Rehearse's length
              and peak loudness), three times. On the phone it rings with the screen off or the app
              away, on the alarm sound, whatever the media volume.
            </span>
          </span>
          <input
            type="checkbox"
            className="size-6 shrink-0 accent-cyan"
            checked={state.alarm}
            onChange={(e) => save({ ...state, alarm: e.target.checked })}
            aria-label="Alarm when a timer is up"
          />
        </label>
        <button
          type="button"
          className="btn shrink-0 px-2"
          onClick={() => {
            // The phrase repped last (the current one), else the first.
            const current = state.items.reduce<RepItem | undefined>(
              (best, i) => (!best || i.last > best.last ? i : best),
              undefined,
            );
            const phrase = current?.text ?? "done";
            setAlarmNote(`Ringing “${phrase}”…`);
            void playAlarmNow(phrase, state.alarmVolume).then((note) =>
              setAlarmNote(`“${phrase}”: ${note}`),
            );
            buzz(400);
          }}
        >
          Test
        </button>
      </div>
      {alarmNote && (
        <p className="mt-1 text-xs leading-snug text-gold" role="status">
          {alarmNote}
        </p>
      )}
      {state.alarm && (
        <div className="mt-1 text-xs">
          <button
            type="button"
            className="text-cyan underline"
            onClick={() =>
              alarmLines === null
                ? void alarmLog().then((l) =>
                    setAlarmLines(l || "Nothing yet (or not the phone app)."),
                  )
                : setAlarmLines(null)
            }
          >
            {alarmLines === null ? "Alarm log" : "Hide the alarm log"}
          </button>
          {alarmLines !== null && (
            <pre className="mt-1 max-h-48 overflow-auto rounded border border-cyan/30 p-2 text-[0.65rem] leading-snug whitespace-pre-wrap text-muted">
              {alarmLines}
            </pre>
          )}
        </div>
      )}
      {state.alarm && (
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span>
            Alarm volume
            <span className="block text-xs text-muted">
              How loud, like a knob: 1 is the phone's full alarm volume, 0.9 is 7 dB below, 0.6 is
              28 dB below, 0.3 is 49 dB below (quiet). Never louder; the phone's alarm volume is put
              back after. Not answered, it calls again at 0.3, 0.6, 0.9 till answered.
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="btn stepper"
              onClick={() =>
                save({ ...state, alarmVolume: clampAlarmVolume(state.alarmVolume - 0.05) })
              }
              aria-label="Alarm volume: less"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <input
              className="w-16 rounded border border-cyan/40 bg-transparent px-1 py-2 text-center"
              inputMode="decimal"
              value={volText ?? state.alarmVolume.toFixed(2)}
              onChange={(e) => setVolText(e.target.value)}
              onBlur={() => {
                const v = Number((volText ?? "").replace(",", "."));
                if (volText !== null && Number.isFinite(v)) {
                  save({ ...state, alarmVolume: clampAlarmVolume(v) });
                }
                setVolText(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label="Alarm volume"
            />
            <button
              type="button"
              className="btn stepper"
              onClick={() =>
                save({ ...state, alarmVolume: clampAlarmVolume(state.alarmVolume + 0.05) })
              }
              aria-label="Alarm volume: more"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </span>
        </div>
      )}
      {state.alarm && (
        <div className="mt-2 text-sm">
          <span>
            Calls if not answered
            <span className="block text-xs text-muted">
              Till Done (or Done and again): 3 s after the ring at the 1st level, 6 s later at the
              2nd, 9 s later at the 3rd, and round again. Same knob as the Alarm volume.
            </span>
          </span>
          {[0, 1, 2].map((i) => (
            <CallLevel
              key={i}
              label={`${["1st", "2nd", "3rd"][i]} (after ${3 * (i + 1)} s)`}
              value={state.alarmCalls[i] ?? 0.3 * (i + 1)}
              set={(v) =>
                save({
                  ...state,
                  alarmCalls: state.alarmCalls.map((c, k) => (k === i ? clampAlarmVolume(v) : c)),
                })
              }
            />
          ))}
        </div>
      )}

      {saved && item(saved.id) && (
        <div className="mt-3 rounded-md border border-gold/60 p-3 text-center" role="status">
          <p className="text-sm">
            {saved.timed ? (
              <>
                Completed <span className="font-display text-gold">{clock(saved.took)}</span> of{" "}
                <span className="break-words">{item(saved.id)?.text}</span>
                {saved.added > 0 && <> · {saved.added.toLocaleString()} reps</>}
              </>
            ) : (
              <>
                Completed {saved.added.toLocaleString()}{" "}
                <span className="break-words">{item(saved.id)?.text}</span> in{" "}
                <span className="font-display text-gold">{clock(saved.took)}</span>{" "}
                <span className="text-muted">({seconds(saved.took).toLocaleString()} s)</span>
              </>
            )}
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
            Another {setLabel}
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
                aria-label={`${it.total} ${it.text}, ${clock(it.ms)}. Start ${setWords}`}
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
                    : `Tap to start ${setWords}`}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-gold shrink-0"
                onClick={() => start(it.id)}
                aria-label={`Start ${setWords} of ${it.text}`}
              >
                <Play className="size-4" aria-hidden />
                {setLabel}
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
