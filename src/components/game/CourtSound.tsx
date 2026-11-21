import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Minus, Pause, Play, Plus, SlidersHorizontal, X } from "lucide-react";
import { RehearseTab } from "@/components/game/RehearseTab";
import type { CourtGame } from "@/game/court/courtgame";
import { clampVoiceRepeats, phraseSubject, type RehearseSettings, type VoiceRaw } from "@/game/rehearse";
import { subscribeVoiceRaw, voiceRawLine } from "@/game/voiceRaw";
import { courtSoundNote, rehearseState, rehearseUpdate, subscribeRehearse } from "@/game/rehearseRun";
import { getGame } from "@/game/registry";
import type { CourtView } from "@/game/store";

function game(): CourtGame | null {
  const g = getGame();
  return g && "courtAway" in g ? (g as CourtGame) : null;
}

/** Rehearse's settings now, drawn again whenever one changes. */
function useRehearse(): RehearseSettings {
  return useSyncExternalStore(subscribeRehearse, rehearseState, rehearseState).settings;
}

/** One of Rehearse's settings changed from here (the Court's sound follows at once). */
function setOpt(patch: Partial<RehearseSettings>) {
  rehearseUpdate((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

const VOICE_RAW_CHOICES: [VoiceRaw, string][] = [
  ["off", "Off"],
  ["bits", "Raw bits"],
  ["bytes", "Raw bytes"],
  ["both", "Both"],
];

/**
 * The robot voices as raw binary too (Rehearse's Sound tab): every layer and copy
 * of the voice saying the phrase, mixed as one, its bytes read as samples and mixed
 * into the phrase's sound. How it stands for the phrase being recited shows beneath.
 */
function VoiceRawRow({ set, phrase }: { set: RehearseSettings; phrase: string }) {
  const [, again] = useState(0);
  useEffect(() => subscribeVoiceRaw(() => again((n) => n + 1)), []);
  useEffect(() => {
    const id = window.setInterval(() => again((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const line = voiceRawLine(phraseSubject(phrase), set);
  return (
    <div className="rounded-md border border-cyan/30 px-3 py-1.5">
      <span className="block text-xs">The robot voices as raw binary too</span>
      <span className="block text-[0.65rem] text-muted">
        Every layer and copy, mixed as one, its bytes read as samples and mixed into the phrase&apos;s sound (the phone&apos;s voice, in the app)
      </span>
      <div className="mt-1.5 grid grid-cols-4 gap-1" role="radiogroup" aria-label="The robot voices as raw binary">
        {VOICE_RAW_CHOICES.map(([e, label]) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={set.voiceRaw === e}
            data-on={set.voiceRaw === e}
            className="btn px-1 text-[0.65rem] tracking-normal normal-case"
            onClick={() => setOpt({ voiceRaw: e })}
          >
            {label}
          </button>
        ))}
      </div>
      {line && (
        <span className={`mt-1 block text-[0.65rem] ${line.bad ? "text-danger" : "text-muted"}`} role="status">
          {line.text}
        </span>
      )}
    </div>
  );
}

/** A switch as a row: what it is, a few words on it, on or off. */
function Row({
  label,
  note,
  on,
  flip,
}: {
  label: string;
  note: string;
  on: boolean;
  flip: () => void;
}) {
  return (
    <button
      type="button"
      className="btn w-full justify-between gap-3 px-3 text-left tracking-normal normal-case"
      data-on={on}
      aria-pressed={on}
      onClick={flip}
    >
      <span className="min-w-0">
        <span className="block text-xs">{label}</span>
        <span className="block text-[0.65rem] opacity-75">{note}</span>
      </span>
      <span className="shrink-0 font-display text-[0.65rem] tracking-wider">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

/**
 * All of Rehearse, shown over the Court: its own screen, every setting, voice
 * and text, as on its tab. The Court's clock is held meanwhile; Back returns to
 * the Court as it was.
 */
function RehearseOver({ onBack }: { onBack: () => void }) {
  // The Court waits (a pass being recited keeps its place) while Rehearse is up.
  useEffect(() => {
    game()?.courtAway(true);
    return () => game()?.courtAway(false);
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-bg"
      role="dialog"
      aria-label="Rehearse, in the Court"
    >
      <header className="glass m-2 mt-[max(0.5rem,env(safe-area-inset-top))] flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <p className="min-w-0 truncate font-display text-xs tracking-[0.14em] text-cyan">
          REHEARSE
        </p>
        <button type="button" className="btn btn-gold px-3!" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to the Court
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl">
          <RehearseTab />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The Court's sound, in one place: play or pause, the switches that matter, and
 * (one step further) all of Rehearse. A sheet over whatever the Court shows.
 */
function SoundSheet({ v, onClose }: { v: CourtView; onClose: () => void }) {
  const set = useRehearse();
  const [all, setAll] = useState(false);
  if (all) return <RehearseOver onBack={() => setAll(false)} />;
  const quiet = !set.sound && !set.voice;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <section
        className="glass flex max-h-[86dvh] w-full max-w-xl flex-col"
        role="dialog"
        aria-label="Sound in the Court"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <h2 className="font-display text-sm tracking-[0.16em] text-cyan uppercase">Sound</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close Sound">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {v.session ? (
            <button
              type="button"
              className="btn btn-gold min-h-12 w-full tracking-normal normal-case"
              data-on={v.soundMuted}
              aria-pressed={v.soundMuted}
              onClick={() => game()?.courtMute()}
            >
              {v.soundMuted ? (
                <>
                  <Play className="size-5" aria-hidden /> Play the recite&apos;s sound (paused)
                </>
              ) : (
                <>
                  <Pause className="size-5" aria-hidden /> Pause the recite&apos;s sound
                </>
              )}
            </button>
          ) : (
            <p className="rounded-md border border-cyan/30 px-3 py-2 text-xs text-muted">
              The sound starts by itself when you recite, and stops when you stop. Rehearse&apos;s
              settings are used, never its texts, and its own Pause all sound is left alone.
            </p>
          )}
          <p className="text-xs text-muted" aria-live="polite">
            {quiet
              ? "Nothing would sound: turn on the phrase's sound or the robot voice below."
              : `While you recite: ${courtSoundNote()}.`}
          </p>
          <Row
            label="The phrase's sound"
            note="The phrase's own bytes, as sound"
            on={set.sound}
            flip={() => setOpt({ sound: !set.sound })}
          />
          <Row
            label="All the time (Nonstop)"
            note={set.nonstop ? "It sounds while the phrase is up" : "It sounds once on each tap"}
            on={set.nonstop}
            flip={() => setOpt({ nonstop: !set.nonstop })}
          />
          <Row
            label="Robot voice"
            note="The phone says the phrase: the queen's own voice, over Rehearse's background voices"
            on={set.voice}
            flip={() => setOpt({ voice: !set.voice })}
          />
          <VoiceRawRow set={set} phrase={v.session?.phrase ?? ""} />
          <div className="flex items-center justify-between gap-2 rounded-md border border-cyan/30 px-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs">The main voice says it</span>
              <span className="block text-[0.65rem] text-muted">
                {set.voiceRepeats === 0
                  ? "Over and over, through every pass of the phrase"
                  : `${set.voiceRepeats} time${set.voiceRepeats === 1 ? "" : "s"}, then waits for the next phrase`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="btn px-2!"
                disabled={set.voiceRepeats <= 0}
                onClick={() => setOpt({ voiceRepeats: clampVoiceRepeats(set.voiceRepeats - 1) })}
                aria-label="The main voice says it fewer times"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-6 text-center font-mono text-sm">{set.voiceRepeats === 0 ? "∞" : set.voiceRepeats}</span>
              <button
                type="button"
                className="btn px-2!"
                onClick={() => setOpt({ voiceRepeats: clampVoiceRepeats(set.voiceRepeats + 1) })}
                aria-label="The main voice says it more times"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </span>
          </div>
          <p className="pt-1 font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">In the Court</p>
          <Row
            label="The phrase you recite sounds"
            note="Off: reciting in the Court is silent, whatever Rehearse is set to"
            on={v.save.sound.phrase}
            flip={() => game()?.courtSoundToggle("phrase")}
          />
          <Row
            label="Queens speak aloud"
            note="Each in her own voice (Her voice, on her sheet)"
            on={v.save.sound.lines}
            flip={() => game()?.courtSoundToggle("lines")}
          />
          <button
            type="button"
            className="btn w-full justify-between gap-3 px-3 text-left tracking-normal normal-case"
            onClick={() => setAll(true)}
          >
            <span className="min-w-0">
              <span className="block text-xs">All of Rehearse</span>
              <span className="block text-[0.65rem] opacity-75">
                Every setting, the voices and their layers, your texts and phrases, here, without
                leaving the Court
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * The Court's one button for sound: it shows whether sound is playing, and
 * opens everything about it (play and pause, the switches, all of Rehearse).
 */
export function SoundButton({ v, label = false }: { v: CourtView; label?: boolean }) {
  const set = useRehearse();
  const [open, setOpen] = useState(false);
  const muted = !!v.session && v.soundMuted;
  const off = muted || (!set.sound && !set.voice);
  const what = muted ? "paused" : off ? "off" : "on";
  return (
    <>
      <button
        type="button"
        className="btn px-2!"
        data-on={!off}
        onClick={() => setOpen(true)}
        aria-label={`Sound: ${what}. Play, pause and settings.`}
        title="Sound: play, pause and settings"
      >
        {muted ? (
          <Play className="size-4" aria-hidden />
        ) : (
          <SlidersHorizontal className="size-4" aria-hidden />
        )}
        {label && <span>Sound {what}</span>}
      </button>
      {open && <SoundSheet v={v} onClose={() => setOpen(false)} />}
    </>
  );
}
