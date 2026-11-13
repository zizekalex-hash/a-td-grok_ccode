import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Num,
  StereoChoices,
  Toggle,
  TtsMake,
  type TtsJobHere,
} from "@/components/game/RehearseTab";
import { hasFolder, listFolder } from "@/game/azsFolder";
import {
  LEGION_FIELDS,
  LEGION_SECTIONS,
  legionValue,
  matrixLen,
  type LegionField,
  type LegionSettings,
} from "@/game/legion";
import { legionReset, legionState, legionUpdate, subscribeLegion } from "@/game/legionRun";
import { readUnits } from "@/game/readtext";
import {
  activeOf,
  currentPhrase,
  currentText,
  PHRASE_FOLDER,
  TEXT_FOLDER,
  type RehearseSettings,
} from "@/game/rehearse";
import {
  rehearseLibrary,
  rehearseState,
  rehearseUpdate,
  subscribeRehearse,
} from "@/game/rehearseRun";
import { useGame } from "@/game/store";
import { TTS_MADE } from "@/game/ttsExport";

/**
 * The Legion tab: the user's legion9 / expand engines' matrix, every setting by
 * its own name, for the phrase or text chosen in Rehearse. Its cross-mods per
 * phrase (mixed) or per text, the NaN / Inf guard on every sample; made into
 * that phrase's (or text's) .tts.wav under the voice, then its final two-
 * channel export.
 */
export function LegionTab() {
  const L = useSyncExternalStore(subscribeLegion, legionState, legionState);
  const st = useSyncExternalStore(subscribeRehearse, rehearseState, rehearseState);
  const texts = useGame((s) => s.texts);
  const custom = useGame((s) => s.custom);
  const lines = useGame((s) => s.lines);
  const folders = useGame((s) => s.folders);
  const library = useMemo(
    () => rehearseLibrary(),
    // The library follows these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texts, custom, lines, folders],
  );
  const a = activeOf(st, library);
  const textsView = st.view === "texts";
  const job = useMemo((): TtsJobHere | null => {
    if (!a.name) return null;
    if (textsView) {
      const t = currentText(st, library);
      const units = t ? readUnits(t.lines).map((u) => u.text) : [];
      return units.length
        ? { kind: "text", phrases: units, path: `${TEXT_FOLDER}/${a.name}.tts.wav` }
        : null;
    }
    const it = currentPhrase(st);
    return it
      ? { kind: "phrase", phrases: [it.text], path: `${PHRASE_FOLDER}/${a.name}.tts.wav` }
      : null;
  }, [a.name, textsView, st, library]);
  const [phone, setPhone] = useState(false);
  const [made, setMade] = useState(false);
  useEffect(() => {
    void hasFolder().then(setPhone);
  }, []);
  // Its .tts.wav there already (the final export is made from it)?
  useEffect(() => {
    let live = true;
    const file = `${a.name}.tts.wav`.toLowerCase();
    void listFolder(a.dir).then(
      (fs) => live && setMade(fs.some((f) => f.name.toLowerCase() === file)),
    );
    const madeNow = (e: Event) => {
      if (String((e as CustomEvent).detail ?? "").toLowerCase() === `${a.dir}/${file}`)
        setMade(true);
    };
    window.addEventListener(TTS_MADE, madeNow);
    return () => {
      live = false;
      window.removeEventListener(TTS_MADE, madeNow);
    };
  }, [a.dir, a.name]);
  const setOpt = (next: Partial<RehearseSettings>) =>
    rehearseUpdate((s) => ({ ...s, settings: { ...s.settings, ...next } }));
  const [openSec, setOpenSec] = useState<Set<string>>(() => new Set(["Legion"]));
  const [armed, setArmed] = useState(false);
  const M = matrixLen(L, st.settings.ttsRate);
  return (
    <div className="space-y-3">
      <div className="glass space-y-1 p-3">
        <p className="font-display text-[0.6rem] tracking-[0.14em] text-violet">
          LEGION · THE LEGION9 / EXPAND MATRIX, IN THE APP
        </p>
        <p className="text-sm text-fg">
          {job
            ? job.kind === "text"
              ? `The whole text: ${currentText(st, library)?.name ?? a.name} (${job.phrases.length.toLocaleString()} phrases)`
              : `This phrase: “${job.phrases[0]}”`
            : "Choose a phrase or a text in Rehearse."}
        </p>
        <p className="text-[0.65rem] leading-snug text-muted">
          What it is made from is chosen in Rehearse (single phrases, or a whole text). The matrix
          is {(M / st.settings.ttsRate).toFixed(2)} s at {st.settings.ttsRate / 1000} kHz (
          {M.toLocaleString()} samples), repeated under the voice for the whole file. Every sample
          passes the guard: NaN becomes 0, ±Inf (and anything past it) ±3.2667e38 (96 % of float32's
          largest).
        </p>
      </div>
      {LEGION_SECTIONS.map((sec) => {
        const fields = LEGION_FIELDS.filter((f) => f.section === sec);
        const isOpen = openSec.has(sec);
        return (
          <div key={sec} className="glass p-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 py-1 text-left font-display text-[0.65rem] tracking-[0.14em] text-cyan uppercase"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenSec((old) => {
                  const next = new Set(old);
                  if (next.has(sec)) next.delete(sec);
                  else next.add(sec);
                  return next;
                })
              }
            >
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
              {sec} ({fields.length})
            </button>
            {isOpen && (
              <div
                className={sec === "Layers" ? "mt-1 grid grid-cols-2 gap-1" : "mt-1 space-y-1.5"}
              >
                {fields.map((f) => (
                  <Field key={f.key} f={f} s={L} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="glass space-y-1.5 p-2">
        <p className="font-display text-[0.65rem] tracking-[0.14em] text-cyan uppercase">
          Make it, then its two channels
        </p>
        <p className="text-[0.65rem] leading-snug text-muted">
          {L.LEGION_ON
            ? "Legion is on: the .tts.wav is made with the matrix under the voice (the same button in Rehearse)."
            : "Legion is off: the .tts.wav is the voice alone. Turn it on above (Legion matrix in the .tts.wav)."}
        </p>
        {st.settings.voice || !L.CON_TTS ? (
          <TtsMake set={st.settings} setOpt={setOpt} job={job} phone={phone} made={made} />
        ) : (
          <>
            <p className="text-xs text-gold">
              The voice is on top of it: turn on the robot voice in Rehearse (Sound and picture), or
              turn the voice off here (The voice on top) for the matrix alone.
            </p>
            <StereoChoices set={st.settings} setOpt={setOpt} busy={false} />
          </>
        )}
      </div>
      <button
        type="button"
        className="btn w-full tracking-normal normal-case"
        data-on={armed}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            window.setTimeout(() => setArmed(false), 3000);
            return;
          }
          setArmed(false);
          legionReset();
        }}
      >
        {armed
          ? "Tap again: every Legion setting back to the engines' own"
          : "Every setting back to the engines' own"}
      </button>
      <p className="text-[0.65rem] leading-snug text-muted">
        Not here: the engines' other voices (gTTS, espeak, Piper, the multilingual legions), the
        video, and their RAM / CPU settings: the phone's own voice is the voice on top (Rehearse's
        robot voice, every layer of it), and everything else runs in the app. Made a piece at a
        time, the matrix off the page's thread: the app stays usable while it works.
      </p>
    </div>
  );
}

/** One setting: a switch, a number, a choice or a list, labelled with its own name too. */
function Field({ f, s }: { f: LegionField; s: LegionSettings }) {
  const v = s[f.key];
  const set = (x: unknown) => legionUpdate({ [f.key]: legionValue(f, x) });
  const label = f.label === f.key ? f.key : `${f.label} · ${f.key}`;
  if (f.kind === "toggle")
    return f.section === "Layers" ? (
      <button
        type="button"
        className="btn px-1 text-[0.6rem] tracking-normal normal-case"
        data-on={v === true}
        aria-pressed={v === true}
        onClick={() => set(!v)}
        title={f.help}
      >
        {f.label}
      </button>
    ) : (
      <Toggle label={label} on={v === true} flip={() => set(!v)} />
    );
  if (f.kind === "choice")
    return (
      <div className={f.section === "Layers" ? "col-span-2 space-y-1" : "space-y-1"}>
        <p className="text-xs text-muted">{label}</p>
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={f.label}>
          {f.choices?.map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={v === id}
              data-on={v === id}
              className="btn px-1 text-[0.65rem] tracking-normal normal-case"
              onClick={() => set(id)}
            >
              {text}
            </button>
          ))}
        </div>
        {f.help && <p className="text-[0.6rem] leading-snug text-muted">{f.help}</p>}
      </div>
    );
  if (f.kind === "list")
    return <ListField f={f} value={(v as number[]) ?? []} set={set} label={label} />;
  return (
    <>
      <Num
        label={label}
        value={Number(v)}
        step={f.step ?? 0.001}
        digits={f.digits ?? 3}
        set={(x) => set(x)}
      />
      {f.help && <p className="text-[0.6rem] leading-snug text-muted">{f.help}</p>}
    </>
  );
}

/** Numbers apart ("9.99, 6.66, 3.69"), taken on Enter or leaving the box. */
function ListField({
  f,
  value,
  set,
  label,
}: {
  f: LegionField;
  value: number[];
  set: (x: unknown) => void;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const xs = text
      .split(/[\s,;]+/)
      .map((t) => Number(t))
      .filter((x) => Number.isFinite(x));
    if (xs.length) set(xs);
    setText(null);
  };
  return (
    <label className="block text-xs">
      <span className="text-muted">{label}</span>
      <input
        className="mt-1 w-full rounded border border-cyan/40 bg-transparent p-2 text-fg"
        value={text ?? value.join(", ")}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        aria-label={f.label}
      />
    </label>
  );
}
