import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { clock, phraseIndex, type PhraseStatus, type RepsState } from "@/game/reps";

/** Rows shown at first; "Show more" adds this many again, so a long text stays quick. */
const STEP = 200;

type Filter = "all" | "new" | "on";

/**
 * The phrases of a text, to pick from: tick the ones you want and add them to the
 * Reps list. Phrases already on the list show their reps and time and cannot be
 * added again; ones done before (in the history) say so. The text itself is not kept.
 */
export function RepsPicker({
  name,
  phrases,
  state,
  onAdd,
  onClose,
}: {
  name: string;
  phrases: string[];
  state: RepsState;
  onAdd: (texts: string[]) => void;
  onClose: () => void;
}) {
  const statusOf = useMemo(() => phraseIndex(state), [state]);
  const rows = useMemo(
    () => phrases.map((text, i) => ({ i, text, status: statusOf(text) })),
    [phrases, statusOf],
  );
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(STEP);
  const count = (k: PhraseStatus["kind"]) => rows.filter((r) => r.status.kind === k).length;
  const on = count("on");
  const done = count("done");
  const fresh = count("new");
  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "new" ? r.status.kind !== "on" : r.status.kind === "on",
  );

  const toggle = (i: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs tracking-wider text-muted uppercase">Pick phrases from</p>
          <p className="truncate font-display text-sm text-cyan">{name}</p>
        </div>
        <button type="button" className="btn shrink-0 px-2" onClick={onClose} aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        {phrases.length.toLocaleString()} phrases · <span className="text-gold">{on}</span> on your
        list · <span className="text-cyan">{done}</span> done before · {fresh} new. Only the phrases
        you add are kept, not the text.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["new", "Not on list"],
            ["on", "On list"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="btn px-1 text-[0.6rem]"
            data-on={filter === k}
            aria-pressed={filter === k}
            onClick={() => {
              setFilter(k);
              setShown(STEP);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn text-[0.6rem]"
          disabled={!fresh}
          onClick={() =>
            setPicked(new Set(rows.filter((r) => r.status.kind === "new").map((r) => r.i)))
          }
        >
          Pick all new ({fresh})
        </button>
        <button
          type="button"
          className="btn text-[0.6rem]"
          disabled={!picked.size}
          onClick={() => setPicked(new Set())}
        >
          Clear picks
        </button>
      </div>

      <ul className="mt-2 space-y-1" aria-label="Phrases in the text">
        {visible.slice(0, shown).map(({ i, text, status }) => {
          const isOn = status.kind === "on";
          const checked = picked.has(i);
          return (
            <li key={i}>
              <label
                className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                  isOn
                    ? "border-gold/40 opacity-75"
                    : checked
                      ? "border-cyan bg-cyan/10"
                      : "border-cyan/20"
                } ${isOn ? "" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-cyan"
                  checked={isOn || checked}
                  disabled={isOn}
                  onChange={() => toggle(i)}
                  aria-label={text}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-fg">{text}</span>
                  {status.kind === "on" && (
                    <span className="block text-xs text-gold">
                      <Check className="mr-0.5 inline size-3 align-[-1px]" aria-hidden />
                      On your list · {status.item.total.toLocaleString()} · {clock(status.item.ms)}
                    </span>
                  )}
                  {status.kind === "done" && (
                    <span className="block text-xs text-cyan">
                      Done before · {status.reps.toLocaleString()} · {clock(status.ms)}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="text-sm text-muted">Nothing here.</li>}
      </ul>
      {visible.length > shown && (
        <button type="button" className="btn mt-2 w-full" onClick={() => setShown((n) => n + STEP)}>
          Show more ({(visible.length - shown).toLocaleString()} left)
        </button>
      )}

      {/* Stays at the bottom of the screen while you scroll the phrases. */}
      <div className="sticky bottom-0 mt-3 grid grid-cols-[1fr_auto] gap-2 bg-bg/95 py-2">
        <button
          type="button"
          className="btn btn-gold min-h-12"
          disabled={!picked.size}
          onClick={() => onAdd(rows.filter((r) => picked.has(r.i)).map((r) => r.text))}
        >
          <Plus className="size-4" aria-hidden />
          Add {picked.size.toLocaleString()} to the list
        </button>
        <button type="button" className="btn min-h-12" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
