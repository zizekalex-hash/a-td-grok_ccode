import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp } from "@/game/engine";
import { sectorWords } from "@/game/reader";
import {
  coreDamageMultiplier,
  coreLevel,
  cycleMs,
  levelForXp,
  recallScore,
  recallXp,
  repAt,
  repXp,
  SKILLS,
  tapRep,
  wordIndexAt,
  WORD_MS,
  xpForLevel,
  type RepState,
  type SkillKey,
} from "@/game/recite";
import { useGame } from "@/game/store";
import { RepsTab } from "@/components/game/RepsTab";
import { RepsHistory } from "@/components/game/RepsHistory";

type DrillTab = "rehearse" | "recall" | "reps" | "history";
const TAB_KEY = "azshara-drill-tab";

/** The tab last used, so the drill opens where you left it. */
function lastTab(): DrillTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return t === "recall" || t === "reps" || t === "history" ? t : "rehearse";
  } catch {
    return "rehearse";
  }
}

/** Recitation levels the wake core, which hits harder in core defense. */
function CoreLine() {
  const level = useGame((s) => coreLevel(s.skills));
  const bonus = Math.round((coreDamageMultiplier(level, CONFIG.core.damagePerLevel, CONFIG.core.maxDamageBonus) - 1) * 100);
  return (
    <p className="mt-3 text-sm leading-relaxed text-muted">
      Recitation levels the wake core. Core level <span className="text-gold">{level}</span>
      {bonus > 0 ? `: your shots hit ${bonus}% harder in core defense.` : ": every Recitation level adds shot damage in core defense."}
    </p>
  );
}

function SkillBar({ skill }: { skill: SkillKey }) {
  const xp = useGame((s) => s.skills[skill]);
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = level >= 99 ? floor : xpForLevel(level + 1);
  const pct = next > floor ? Math.min(100, ((xp - floor) / (next - floor)) * 100) : 100;
  const name = SKILLS.find((s) => s.key === skill)?.name ?? skill;
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs tracking-[0.12em] text-fg uppercase">{name}</p>
        <p className="font-display text-xs text-gold">
          Level {level} · {Math.floor(xp).toLocaleString()} XP
        </p>
      </div>
      <div className="meter mt-1" role="meter" aria-label={`${name} progress`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Says a sector to the beat, one word every 0.9 s, and taps once per repetition. */
function Rehearse({ words }: { words: string[] }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rep, setRep] = useState<RepState>({ reps: 0, lastCountedRep: -1 });
  const [note, setNote] = useState("Press start, then tap once for every full pass through the sector.");
  const baseRef = useRef(0);
  const startRef = useRef(0);
  const n = words.length;

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      setElapsed(baseRef.current + performance.now() - startRef.current);
    }, 40);
    return () => {
      window.clearInterval(id);
      baseRef.current += performance.now() - startRef.current;
    };
  }, [running]);

  const reset = () => {
    setRunning(false);
    baseRef.current = 0;
    setElapsed(0);
    setRep({ reps: 0, lastCountedRep: -1 });
    setNote("Press start, then tap once for every full pass through the sector.");
  };

  if (!n) {
    return <p className="text-sm text-muted">This sector has no words.</p>;
  }

  const current = wordIndexAt(n, elapsed);
  const pass = repAt(n, elapsed);
  const passProgress = (elapsed % cycleMs(n)) / cycleMs(n);

  const tap = () => {
    if (!running) return;
    const next = tapRep(rep, pass);
    if (!next.counted) {
      setNote("One tap per pass. Wait for the next pass to start.");
      return;
    }
    const before = levelForXp(useGame.getState().skills.recitation);
    const xp = repXp(n, 1);
    grantSkillXp("recitation", xp);
    const after = levelForXp(useGame.getState().skills.recitation);
    setRep(next.state);
    setNote(`Rep ${next.state.reps} · +${xp} XP`);
    if (after > before) flashToast(`Recitation level ${after}`);
  };

  return (
    <div>
      <div className="glass p-3 text-center" aria-live="polite">
        <p className="text-xs tracking-wider text-muted uppercase">Pass {pass + 1} · word {current + 1} of {n}</p>
        <p className="font-display mt-2 min-h-[3.5rem] text-3xl text-cyan">{words[current]}</p>
        <div className="meter mt-3" aria-hidden>
          <span style={{ width: `${Math.round(passProgress * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">Each word stays on screen for {WORD_MS / 1000} s. One pass is {(cycleMs(n) / 1000).toFixed(1)} s.</p>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm leading-relaxed text-muted">
        {words.map((w, i) => (
          <span key={`${i}-${w}`} className={i === current && running ? "text-cyan" : undefined}>
            {w}
          </span>
        ))}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" className="btn" onClick={() => setRunning((r) => !r)}>
          {running ? "Hold" : "Start"}
        </button>
        <button type="button" className="btn btn-gold col-span-1" onClick={tap} disabled={!running} aria-label="Tap for one repetition">
          Rep · {rep.reps}
        </button>
        <button type="button" className="btn" onClick={reset}>
          Reset
        </button>
      </div>
      <p className="mt-2 text-sm text-muted" role="status">
        {note}
      </p>
    </div>
  );
}

/** Type the sector from memory. The closer the attempt, the more XP. */
function Recall({ words, text }: { words: string[]; text: string }) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<string>("");
  const n = words.length;

  const check = () => {
    if (!n) return;
    const score = recallScore(typed, text);
    const xp = recallXp(n, score);
    const before = levelForXp(useGame.getState().skills.recall);
    grantSkillXp("recall", xp);
    const after = levelForXp(useGame.getState().skills.recall);
    setResult(`${Math.round(score * 100)}% recalled · +${xp} XP`);
    if (after > before) flashToast(`Recall level ${after}`);
  };

  return (
    <div>
      <label htmlFor="recall-input" className="text-xs tracking-wider text-muted uppercase">
        Type the sector from memory
      </label>
      <textarea id="recall-input" className="mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Write it out, words in order." />
      <button type="button" className="btn mt-2 w-full" onClick={check} disabled={!typed.trim()}>
        Check my recall
      </button>
      {result && (
        <p className="mt-2 text-sm text-gold" role="status">
          {result}
        </p>
      )}
    </div>
  );
}

export function DrillPanel() {
  const lines = useGame((s) => s.lines);
  const setPanel = () => useGame.setState({ panel: "none" });
  const [index, setIndex] = useState(0);
  const [tab, setTabState] = useState<DrillTab>(lastTab);
  const setTab = (t: DrillTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* private mode */
    }
  };
  const count = lines.length;
  const safeIndex = count ? ((index % count) + count) % count : 0;
  const words = sectorWords(lines, safeIndex);
  const text = lines[safeIndex] ?? "";

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="glass flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <div>
            <h2 className="font-display text-sm tracking-[0.16em] text-cyan">RECITATION</h2>
            <p className="text-xs text-muted">Practise your sectors and level the skill.</p>
          </div>
          <button type="button" className="btn" onClick={setPanel} aria-label="Close drill">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <SkillBar skill="recitation" />
          {/* Reps only gives Recitation XP: the rest stays out of the way of your phrases. */}
          {tab !== "reps" && tab !== "history" && (
            <>
              <SkillBar skill="recall" />
              <CoreLine />
            </>
          )}

          {/* Four tabs: two rows of two on a phone. */}
          <div className="mt-4 grid grid-cols-4 gap-2 max-[480px]:grid-cols-2">
            <button type="button" className="btn" data-on={tab === "rehearse"} aria-pressed={tab === "rehearse"} onClick={() => setTab("rehearse")}>
              Rehearse
            </button>
            <button type="button" className="btn" data-on={tab === "recall"} aria-pressed={tab === "recall"} onClick={() => setTab("recall")}>
              Recall
            </button>
            <button type="button" className="btn" data-on={tab === "reps"} aria-pressed={tab === "reps"} onClick={() => setTab("reps")}>
              Reps
            </button>
            <button type="button" className="btn" data-on={tab === "history"} aria-pressed={tab === "history"} onClick={() => setTab("history")}>
              History
            </button>
          </div>

          {tab === "reps" || tab === "history" ? (
            <div className="mt-4">{tab === "reps" ? <RepsTab /> : <RepsHistory />}</div>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button type="button" className="btn" onClick={() => setIndex(safeIndex - 1)} disabled={count < 2}>
                  Previous
                </button>
                <p className="text-xs tracking-wider text-muted">
                  Sector {count ? safeIndex + 1 : 0} of {count}
                </p>
                <button type="button" className="btn" onClick={() => setIndex(safeIndex + 1)} disabled={count < 2}>
                  Next
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-fg">{text}</p>

              <div className="mt-4">
                {tab === "rehearse" ? (
                  <>
                    <p className="text-sm leading-relaxed text-muted">{SKILLS[0]?.copy}</p>
                    <Rehearse key={safeIndex} words={words} />
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-muted">{SKILLS[1]?.copy}</p>
                    <Recall key={safeIndex} words={words} text={text} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
