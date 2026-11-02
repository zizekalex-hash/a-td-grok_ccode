import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Minus,
  Pause,
  Play,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp, loadCodexTexts, removeText } from "@/game/engine";
import { levelForXp, repXp } from "@/game/recite";
import { clock, logRead, readReps, writeReps } from "@/game/reps";
import {
  clampPasses,
  clampPhraseSize,
  clampWordMs,
  clampWordSize,
  FONTS,
  passAt,
  phrasesOfText,
  placeOf,
  readReader,
  setPlace,
  textKey,
  writeReader,
  type ReaderFont,
  type ReaderState,
} from "@/game/readtext";
import { holdRest } from "@/game/rest";
import { useGame } from "@/game/store";

const R = CONFIG.reader;
const FONT_CLASS: Record<ReaderFont, string> = {
  display: "font-display",
  plain: "font-sans",
  mono: "font-mono",
};
const FONT_NAME: Record<ReaderFont, string> = { display: "Display", plain: "Plain", mono: "Mono" };

/** A text to read: its name, its phrases in order, and its key for your place. */
interface OpenText {
  name: string;
  phrases: string[];
  key: string;
}

/**
 * The Read tab: your stored texts (the same ones the game reads; loading a
 * .txt adds to them), and a reader that goes through a whole text phrase by
 * phrase, word by word, like the Court's recite screen.
 */
export function ReadTab() {
  const texts = useGame((s) => s.texts);
  const custom = useGame((s) => s.custom);
  const lines = useGame((s) => s.lines);
  const [reader, setReader] = useState<ReaderState>(() => readReader());
  const [open, setOpen] = useState<OpenText | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const library = useMemo(
    () =>
      (custom && texts.length ? texts : [{ name: "Built-in text", lines }]).map((t) => ({
        name: t.name,
        lines: t.lines,
        key: textKey(t.name, t.lines),
      })),
    [custom, texts, lines],
  );

  const save = (next: ReaderState) => {
    setReader(next);
    writeReader(next);
  };

  const openText = (t: { name: string; lines: string[]; key: string }) => {
    const phrases = phrasesOfText(t.lines);
    if (!phrases.length) {
      flashToast("No phrases in that text");
      return;
    }
    setOpen({ name: t.name, phrases, key: t.key });
  };

  if (open)
    return (
      <Reader
        text={open}
        reader={reader}
        save={save}
        onClose={() => {
          setOpen(null);
          setReader(readReader());
        }}
      />
    );

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Read a whole text, phrase by phrase in order, word by word: the big word in the middle, the
        whole phrase below. Your texts stay here (the same ones the game reads), with your place in
        each.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2">
        <button type="button" className="btn min-h-11" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          Load .txt (adds to your texts)
        </button>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept=".txt,text/plain"
          multiple
          aria-label="Text files to read"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (!files.length) return;
            void Promise.all(files.map(async (f) => ({ name: f.name, raw: await f.text() }))).then(
              (loaded) => loadCodexTexts(loaded),
              () => flashToast("Could not read that file"),
            );
          }}
        />
      </div>

      <h3 className="mt-4 text-xs tracking-wider text-muted uppercase">
        Your texts ({library.length})
      </h3>
      <ul className="mt-1 space-y-2" aria-label="Your texts">
        {library.map((t, i) => {
          const at = reader.at[t.key] ?? 0;
          return (
            <li key={t.key} className="rounded-md border border-cyan/25 p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-md p-1 text-left hover:bg-cyan/5"
                  onClick={() => openText(t)}
                  aria-label={`Read ${t.name}${at ? `, from phrase ${at + 1}` : ""}`}
                >
                  <span className="block truncate text-fg">
                    <BookOpen className="mr-1 inline size-4 align-[-2px] text-cyan" aria-hidden />
                    {t.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.lines.length.toLocaleString()} sector{t.lines.length === 1 ? "" : "s"}
                    {at > 0 ? ` · go on from phrase ${(at + 1).toLocaleString()}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-gold shrink-0"
                  onClick={() => openText(t)}
                  aria-label={`Read ${t.name}`}
                >
                  <Play className="size-4" aria-hidden />
                  {at > 0 ? "Go on" : "Read"}
                </button>
                {custom && texts.length > 0 && (
                  <button
                    type="button"
                    className="btn shrink-0 px-2"
                    onClick={() => setAsking(i)}
                    aria-label={`Remove ${t.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              {asking === i && (
                <Confirm
                  text={`Take “${t.name}” out of your texts?`}
                  yes="Yes, take it out"
                  no="No, keep it"
                  onYes={() => {
                    removeText(i);
                    setAsking(null);
                  }}
                  onNo={() => setAsking(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A + and − pair around a value, for the reader's own controls. */
function Stepper({
  label,
  value,
  onLess,
  onMore,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 rounded-md border border-cyan/20 px-1 py-0.5">
      <button type="button" className="btn stepper" onClick={onLess} aria-label={`Less: ${label}`}>
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="min-w-0 text-center text-[0.65rem] leading-tight text-muted">
        <span className="block text-fg tabular-nums">{value}</span>
        {label}
      </span>
      <button type="button" className="btn stepper" onClick={onMore} aria-label={`More: ${label}`}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * A text read through, phrase by phrase: each phrase `passes` times, its words
 * lit one at a time. After a pass, a tap (anywhere in the middle, or the big
 * button) goes on, or it goes on by itself with Auto. Everything changes right
 * here and is kept. The game behind rests meanwhile.
 */
function Reader({
  text,
  reader,
  save,
  onClose,
}: {
  text: OpenText;
  reader: ReaderState;
  save: (s: ReaderState) => void;
  onClose: () => void;
}) {
  const total = text.phrases.length;
  const [index, setIndex] = useState(() => placeOf(reader, text.key, total));
  const [pass, setPass] = useState(0);
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const session = useRef({ began: Date.now(), phrases: 0, logged: false });

  // The game behind stops drawing while you read.
  useEffect(() => holdRest(), []);

  useEffect(() => {
    if (heldAt !== null || finished) return;
    const id = window.setInterval(() => setNow(performance.now()), 60);
    return () => window.clearInterval(id);
  }, [heldAt, finished]);

  const phrase = text.phrases[index] ?? "";
  const words = phrase.split(/\s+/).filter(Boolean);
  const at = passAt(words.length, reader.wordMs, (heldAt ?? now) - start);

  /** The time read so far goes into the history (once). */
  const logSession = (done: boolean) => {
    const s = session.current;
    if (s.logged || (!s.phrases && !done)) return;
    s.logged = true;
    writeReps(
      logRead(readReps(), {
        at: Date.now(),
        text: text.name,
        phrases: s.phrases,
        ms: Date.now() - s.began,
        done,
      }),
    );
  };

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(total - 1, i));
    setIndex(next);
    setPass(0);
    setStart(performance.now());
    setNow(performance.now());
    save(setPlace(reader, text.key, next));
  };

  /** A pass done: Recitation XP; then the next pass, or the next phrase, or the end. */
  const complete = () => {
    if (!at.over || heldAt !== null || finished) return;
    const before = levelForXp(useGame.getState().skills.recitation);
    grantSkillXp("recitation", repXp(words.length, 1));
    const after = levelForXp(useGame.getState().skills.recitation);
    if (after > before) flashToast(`Recitation level ${after}`);
    const t = performance.now();
    if (pass + 1 < reader.passes) {
      setPass(pass + 1);
      setStart(t);
      setNow(t);
      return;
    }
    session.current.phrases += 1;
    if (index + 1 >= total) {
      // The whole text: logged, and next time it starts from the top.
      setFinished(true);
      save(setPlace(reader, text.key, 0));
      logSession(true);
      return;
    }
    setIndex(index + 1);
    setPass(0);
    setStart(t);
    setNow(t);
    save(setPlace(reader, text.key, index + 1));
  };

  // Auto: on by itself, a moment after the words finish (once per pass).
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const over = at.over;
  useEffect(() => {
    if (!reader.auto || !over || heldAt !== null || finished) return;
    const id = window.setTimeout(() => completeRef.current(), Math.max(0, R.autoPauseMs));
    return () => window.clearTimeout(id);
  }, [reader.auto, over, heldAt, finished, index, pass]);

  const setSpeed = (ms: number) => {
    const wordMs = clampWordMs(ms);
    // Keep the lit word where it is: re-anchor the pass at the new pace.
    const t = heldAt ?? performance.now();
    if (!at.over) setStart(t - at.word * wordMs);
    save({ ...reader, wordMs });
  };

  const hold = () => {
    if (heldAt === null) setHeldAt(performance.now());
    else {
      const away = performance.now() - heldAt;
      setStart(start + away);
      setHeldAt(null);
      setNow(performance.now());
    }
  };

  const leave = () => {
    logSession(false);
    onClose();
  };

  const font = FONT_CLASS[reader.font];
  return createPortal(
    <div
      className="rest-screen fixed inset-0 z-[70] flex flex-col bg-bg p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-fg"
      role="dialog"
      aria-label={`Reading ${text.name}`}
    >
      <header className="glass flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-display text-xs tracking-[0.12em] text-cyan">
            {text.name.toUpperCase()}
          </p>
          <p className="text-xs text-muted tabular-nums">
            Phrase {(index + 1).toLocaleString()} / {total.toLocaleString()} · pass {pass + 1} /{" "}
            {reader.passes}
          </p>
        </div>
        <button type="button" className="btn shrink-0 px-2" onClick={leave}>
          <LogOut className="size-4" aria-hidden />
          Leave
        </button>
      </header>

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center" role="status">
          <p className="font-display text-xl tracking-[0.12em] text-gold">TEXT FINISHED ✓</p>
          <p className="mt-2 text-sm">
            “{text.name}”: {total.toLocaleString()} phrases, in{" "}
            {clock(Date.now() - session.current.began)}. It is in your History.
          </p>
          <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-gold min-h-12"
              onClick={() => {
                session.current = { began: Date.now(), phrases: 0, logged: false };
                setFinished(false);
                goTo(0);
              }}
            >
              Again from the top
            </button>
            <button type="button" className="btn min-h-12" onClick={onClose}>
              Back to my texts
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* The middle answers a tap too, once the words of the pass have finished. */}
          <div
            className="flex min-h-0 flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center select-none"
            onPointerDown={(e) => {
              if (e.button > 0) return;
              complete();
            }}
          >
            <div className="flex min-h-[1.2em] w-full items-center justify-center overflow-hidden">
              <p
                className={`${font} max-w-full leading-none whitespace-nowrap text-fg`}
                style={{
                  fontSize: `min(${reader.wordSize}rem, ${(92 / Math.max(1, (words[at.word] ?? "").length * 0.6)).toFixed(2)}vw)`,
                }}
                aria-live="off"
              >
                {words[at.word] ?? ""}
              </p>
            </div>
            <div
              className="mt-4 h-2 w-full max-w-md overflow-hidden rounded bg-cyan/10"
              aria-hidden
            >
              <div
                className={`h-2 rounded ${at.over ? "bg-gold" : "bg-cyan"}`}
                style={{ width: `${Math.round(at.progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {heldAt !== null
                ? "Held"
                : at.over
                  ? reader.auto
                    ? "On it goes…"
                    : "Done reading: tap here or the button"
                  : "Read along"}
            </p>
          </div>

          <div className="glass p-3">
            <p
              className={`${font} max-h-[30dvh] overflow-y-auto text-center leading-relaxed`}
              style={{ fontSize: `${reader.phraseSize}rem` }}
              aria-label="The whole phrase"
            >
              {words.map((w, i) => (
                <span
                  key={i}
                  className={
                    i === at.word && !at.over
                      ? "text-cyan"
                      : i <= at.word
                        ? "text-fg"
                        : "text-fg/45"
                  }
                >
                  {w}{" "}
                </span>
              ))}
            </p>
            <button
              type="button"
              className={`btn mt-3 min-h-16 w-full text-lg ${at.over ? "btn-gold" : "opacity-70"}`}
              aria-disabled={!at.over}
              onPointerDown={(e) => {
                e.preventDefault();
                complete();
              }}
            >
              {at.over ? "Complete ✓" : "Reading…"}
            </button>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className="btn min-h-10 px-1"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-label="Previous phrase"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Back
              </button>
              <button type="button" className="btn min-h-10 px-1" onClick={hold}>
                {heldAt === null ? (
                  <>
                    <Pause className="size-4" aria-hidden />
                    Hold
                  </>
                ) : (
                  <>
                    <Play className="size-4" aria-hidden />
                    Go
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn min-h-10 px-1"
                onClick={() => goTo(index + 1)}
                disabled={index + 1 >= total}
                aria-label="Next phrase"
              >
                Skip
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stepper
                label="s a word"
                value={(reader.wordMs / 1000).toFixed(2)}
                onLess={() => setSpeed(reader.wordMs - 100)}
                onMore={() => setSpeed(reader.wordMs + 100)}
              />
              <Stepper
                label="passes"
                value={`${reader.passes}×`}
                onLess={() => save({ ...reader, passes: clampPasses(reader.passes - 1) })}
                onMore={() => save({ ...reader, passes: clampPasses(reader.passes + 1) })}
              />
              <Stepper
                label="word size"
                value={`${reader.wordSize.toFixed(1)}`}
                onLess={() => save({ ...reader, wordSize: clampWordSize(reader.wordSize - 0.2) })}
                onMore={() => save({ ...reader, wordSize: clampWordSize(reader.wordSize + 0.2) })}
              />
              <Stepper
                label="phrase size"
                value={`${reader.phraseSize.toFixed(2)}`}
                onLess={() =>
                  save({ ...reader, phraseSize: clampPhraseSize(reader.phraseSize - 0.05) })
                }
                onMore={() =>
                  save({ ...reader, phraseSize: clampPhraseSize(reader.phraseSize + 0.05) })
                }
              />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className="btn min-h-10"
                onClick={() =>
                  save({
                    ...reader,
                    font: FONTS[(FONTS.indexOf(reader.font) + 1) % FONTS.length]!,
                  })
                }
                aria-label={`Font: ${FONT_NAME[reader.font]}. Change it`}
              >
                Font: {FONT_NAME[reader.font]}
              </button>
              <button
                type="button"
                className="btn min-h-10"
                data-on={reader.auto}
                aria-pressed={reader.auto}
                onClick={() => save({ ...reader, auto: !reader.auto })}
              >
                Auto: {reader.auto ? "on" : "off (tap)"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
