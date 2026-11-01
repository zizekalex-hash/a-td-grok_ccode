import { useState } from "react";
import { ClipboardPaste, FileText, Library, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { DANGER } from "@/components/game/feel";
import { RepsPicker } from "@/components/game/RepsPicker";
import { RestSet } from "@/components/game/RestSet";
import { CONFIG } from "@/game/config";
import { flashToast } from "@/game/engine";
import {
  addItem,
  addMany,
  phrasesFromText,
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

  // ---- A set in progress: the rest screen, over everything ----
  if (active) {
    return (
      <RestSet
        state={state}
        onChange={save}
        title="Reps"
        onDone={(d) =>
          setSaved({ id: d.id, added: d.added, total: d.total, took: d.took, time: d.time })
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
