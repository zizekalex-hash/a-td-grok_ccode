import { useEffect, useState, useSyncExternalStore } from "react";
import { BookOpen, History, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { clearPostureLog } from "@/game/postures";
import { postureState, postureUpdate, subscribePostures } from "@/game/postureRun";
import { SITTING_IDLE_MS, sittingMs } from "@/game/rehearse";
import {
  closeIdleSitting,
  rehearseLibrary,
  rehearseState,
  subscribeRehearse,
} from "@/game/rehearseRun";
import {
  clearHistory,
  clock,
  grandTime,
  grandTotal,
  historyOf,
  localDay,
  readReps,
  writeReps,
  type LogEntry,
  type RepsState,
  type Tally,
} from "@/game/reps";

/** Days of history shown at first; "Show more" adds this many again. */
const DAYS_STEP = 7;

function dayLabel(at: number, now: number): string {
  const d = localDay(now) - localDay(at);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Seconds a rep, to one decimal. */
function perRep(t: { reps: number; ms: number }): string {
  return t.reps > 0 ? (Math.round(t.ms / t.reps / 100) / 10).toString() : "0";
}

function TallyCard({
  title,
  t,
}: {
  title: string;
  t: Pick<Tally, "reps" | "ms"> & { sets?: number };
}) {
  return (
    <div className="rounded-md border border-cyan/25 p-2 text-center">
      <p className="text-[0.65rem] tracking-wider text-muted uppercase">{title}</p>
      <p className="font-display text-xl text-gold">{t.reps.toLocaleString()}</p>
      <p className="text-xs text-cyan">{clock(t.ms)}</p>
      {t.sets !== undefined && (
        <p className="text-[0.65rem] text-muted">
          {t.sets} set{t.sets === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

/**
 * Everything done in Reps: totals for today, since the last reset and all time;
 * each word or phrase over all time; and every set, day by day, with resets
 * marked. Resets in Reps do not clear it; Clear history does, after asking,
 * and puts the totals in Reps back to 0 with it, so the two always agree.
 */
export function RepsHistory() {
  const [state, setState] = useState<RepsState>(() => readReps());
  const [asking, setAsking] = useState(false);
  const [days, setDays] = useState(DAYS_STEP);
  const postures = useSyncExternalStore(subscribePostures, postureState, postureState);
  const reh = useSyncExternalStore(subscribeRehearse, rehearseState, rehearseState);
  // A sitting idle long enough: over, in the history, before it is read.
  useEffect(() => {
    closeIdleSitting();
    setState(readReps());
  }, []);
  const now = Date.now();
  const sit = reh.sitting && now - reh.sitting.last <= SITTING_IDLE_MS ? reh.sitting : null;
  const sitName = sit ? (rehearseLibrary().find((t) => t.key === sit.key)?.name ?? "a text") : "";
  // The postures' sittings (kept by the Postures tab) with the rest, by time.
  const merged: LogEntry[] = [
    ...state.log,
    ...postures.log.map((p): LogEntry => ({
      kind: "posture",
      at: p.at,
      text: p.name,
      reps: 0,
      ms: p.ms,
    })),
  ].sort((a, b) => b.at - a.at);
  const h = historyOf(merged, now);
  const sumOf = (es: LogEntry[], kind: LogEntry["kind"]) =>
    es.reduce((t, e) => t + (e.kind === kind ? e.ms : 0), 0);
  const todayEntries = h.days.find((d) => localDay(d.at) === localDay(now))?.entries ?? [];
  const todayPosture = sumOf(todayEntries, "posture");
  const todayRehearse = sumOf(todayEntries, "rehearse");
  const active = state.active;
  const activeText = active ? state.items.find((i) => i.id === active.id)?.text : "";

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <TallyCard title="Today" t={h.today} />
        <TallyCard title="Since reset" t={{ reps: grandTotal(state), ms: grandTime(state) }} />
        <TallyCard title="All time" t={h.all} />
      </div>
      {active && (
        <p className="mt-2 rounded-md border border-gold/50 p-2 text-xs text-gold">
          A set is going: {active.target.toLocaleString()} {activeText}. Finish it in Reps.
        </p>
      )}

      {sit && (
        <p className="mt-2 rounded-md border border-gold/50 p-2 text-xs text-gold" role="status">
          Rehearsing “{sitName}” now · {sit.reps.toLocaleString()} phrase{sit.reps === 1 ? "" : "s"}{" "}
          · {clock(sittingMs(reh, sit.key, now))}. It goes in below when it is over: another text,
          or 10 minutes without a rep.
        </p>
      )}
      {(todayPosture > 0 || todayRehearse > 0) && (
        <p className="mt-2 text-xs text-muted">
          Today
          {todayRehearse > 0 ? ` · Rehearse ${clock(todayRehearse)}` : ""}
          {todayPosture > 0 ? ` · 🧘 postures ${clock(todayPosture)}` : ""}
        </p>
      )}
      {merged.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          <History className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          Nothing yet. Every set you finish in Reps shows up here, with its time; so do your
          readings, your sittings on a text in Rehearse, and your postures.
        </p>
      ) : (
        <>
          <h3 className="mt-4 text-xs tracking-wider text-muted uppercase">
            Every word and phrase
          </h3>
          <ul className="mt-1 space-y-1" aria-label="Every word and phrase, all time">
            {h.phrases.map((p) => (
              <li key={p.text} className="rounded-md border border-cyan/15 px-2 py-1.5">
                <p className="break-words">
                  <span className="font-display text-gold">{p.reps.toLocaleString()}</span>{" "}
                  <span className="text-fg">{p.text}</span>{" "}
                  <span className="whitespace-nowrap text-cyan">· {clock(p.ms)}</span>
                </p>
                <p className="text-xs text-muted">
                  {p.sets} set{p.sets === 1 ? "" : "s"} · {perRep(p)} s a rep
                </p>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-xs tracking-wider text-muted uppercase">Every set, by day</h3>
          {h.days.slice(0, days).map((d) => (
            <section key={d.day} className="mt-2" aria-label={dayLabel(d.at, now)}>
              <p className="flex items-baseline justify-between gap-2 border-b border-cyan/20 pb-0.5 text-sm">
                <span className="font-display text-cyan">{dayLabel(d.at, now)}</span>
                <span className="text-right text-xs text-muted">
                  {[
                    d.sets > 0 ? (
                      <>
                        <span className="text-gold">{d.reps.toLocaleString()}</span> reps ·{" "}
                        {clock(d.ms)} · {d.sets} set{d.sets === 1 ? "" : "s"}
                      </>
                    ) : null,
                    sumOf(d.entries, "rehearse") > 0
                      ? `Rehearse ${clock(sumOf(d.entries, "rehearse"))}`
                      : null,
                    sumOf(d.entries, "posture") > 0
                      ? `🧘 ${clock(sumOf(d.entries, "posture"))}`
                      : null,
                  ]
                    .filter((x) => x !== null)
                    .map((x, i) => (
                      <span key={i}>
                        {i ? " · " : ""}
                        {x}
                      </span>
                    ))}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {d.entries.map((e, i) =>
                  e.kind === "posture" ? (
                    <li key={`${e.at}-${i}`} className="flex gap-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs text-muted tabular-nums">
                        {timeOf(e.at)}
                      </span>
                      <span className="min-w-0 break-words text-fg">
                        🧘 {e.text}{" "}
                        <span className="whitespace-nowrap text-cyan">· {clock(e.ms)}</span>
                      </span>
                    </li>
                  ) : e.kind === "rehearse" ? (
                    <li key={`${e.at}-${i}`} className="flex gap-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs text-muted tabular-nums">
                        {timeOf(e.at)}
                      </span>
                      <span className="min-w-0 break-words text-gold">
                        <Repeat className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                        Rehearsed “{e.text}” · {e.reps.toLocaleString()} phrase
                        {e.reps === 1 ? "" : "s"}
                        {e.passes ? ` · ${e.passes} pass${e.passes === 1 ? "" : "es"}` : ""}{" "}
                        <span className="whitespace-nowrap text-cyan">· {clock(e.ms)}</span>
                      </span>
                    </li>
                  ) : e.kind === "read" ? (
                    <li key={`${e.at}-${i}`} className="flex gap-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs text-muted tabular-nums">
                        {timeOf(e.at)}
                      </span>
                      <span className="min-w-0 break-words text-violet">
                        <BookOpen className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                        {e.done ? "Finished" : "Read"} “{e.text}” · {e.reps.toLocaleString()} phrase
                        {e.reps === 1 ? "" : "s"}{" "}
                        <span className="whitespace-nowrap text-cyan">· {clock(e.ms)}</span>
                      </span>
                    </li>
                  ) : e.kind === "reset" ? (
                    <li key={`${e.at}-${i}`} className="flex gap-2 text-xs text-danger/90">
                      <span className="w-11 shrink-0 text-muted tabular-nums">{timeOf(e.at)}</span>
                      <span>
                        <RotateCcw className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                        Reset to 0 (cleared {e.reps.toLocaleString()} reps · {clock(e.ms)})
                      </span>
                    </li>
                  ) : (
                    <li key={`${e.at}-${i}`} className="flex gap-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs text-muted tabular-nums">
                        {timeOf(e.at)}
                      </span>
                      <span className="min-w-0 break-words">
                        {e.timed && (
                          <span className="mr-1 text-violet" title="A timed set">
                            ⏱
                          </span>
                        )}
                        {(!e.timed || e.reps > 0) && (
                          <span className="text-gold">{e.reps.toLocaleString()} </span>
                        )}
                        {e.text}{" "}
                        <span className="whitespace-nowrap text-cyan">· {clock(e.ms)}</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
          {h.days.length > days && (
            <button
              type="button"
              className="btn mt-3 w-full"
              onClick={() => setDays((n) => n + DAYS_STEP)}
            >
              Show {Math.min(DAYS_STEP, h.days.length - days)} more day
              {Math.min(DAYS_STEP, h.days.length - days) === 1 ? "" : "s"}
            </button>
          )}

          <div className="mt-4 border-t border-cyan/20 pt-3">
            {asking ? (
              <Confirm
                text="Clear the whole history, and every total in Reps with it (back to 0), and the postures' times? Your words, phrases and postures stay."
                yes="Yes, clear it"
                no="No, keep it"
                onYes={() => {
                  const next = clearHistory(state);
                  setState(next);
                  writeReps(next);
                  postureUpdate(clearPostureLog);
                  setAsking(false);
                }}
                onNo={() => setAsking(false)}
              />
            ) : (
              <button
                type="button"
                className="btn w-full"
                style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                onClick={() => setAsking(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                Clear history
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
