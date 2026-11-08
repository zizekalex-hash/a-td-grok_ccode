import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { flashToast, grantSkillXp } from "@/game/engine";
import { levelForXp, repXp } from "@/game/recite";
import { wordsOf } from "@/game/reps";
import { bytesPicture } from "@/game/readview";
import { BYTES_MODES, type BytesMode } from "@/game/readtext";
import { useGame } from "@/game/store";
import { fileLoop, phraseLoop, type FileLoop, type PhraseLoop } from "@/game/phraseSound";
import {
  folderFileUrl,
  folderName,
  hasFolder,
  listFolder,
  pickFolder,
  writeFolderText,
} from "@/game/azsFolder";
import {
  addPhrases,
  clampAmp,
  clampLayer,
  clampPlays,
  clampRawRate,
  clampTopSpeed,
  cycleSpeeds,
  MAX_CYCLE_MS,
  clampSignalMs,
  clampTapHeight,
  countRep,
  PHRASE_FOLDER,
  phraseFileNames,
  currentPhrase,
  loadRehearse,
  newRehearse,
  phraseBytes,
  soundOf,
  phrasesOf,
  rawSamples,
  REHEARSE_KEY,
  removePhrase,
  resetCount,
  resetCounts,
  select,
  signalFit,
  step,
  totalReps,
  type RehearseSettings,
  type RehearseState,
} from "@/game/rehearse";

function readRehearse(): RehearseState {
  try {
    const raw = localStorage.getItem(REHEARSE_KEY);
    return loadRehearse(raw ? JSON.parse(raw) : null);
  } catch {
    return newRehearse();
  }
}

function writeRehearse(s: RehearseState) {
  try {
    localStorage.setItem(REHEARSE_KEY, JSON.stringify(s));
  } catch {
    /* private mode or full */
  }
}

// ---- The tap's sound and picture ----

let audio: AudioContext | null = null;

/** The page's audio, made (or woken) on a tap. */
function audioContext(): AudioContext | null {
  try {
    if (!audio) {
      const AC =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** The phrase's three byte pictures, blended over black on a canvas the size of the screen. */
function drawPicture(c: HTMLCanvasElement, text: string, layers: Record<BytesMode, number>) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = Math.max(1, Math.round(window.innerWidth * dpr));
  let h = Math.max(1, Math.round(window.innerHeight * dpr));
  const k = Math.min(1, 2048 / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "screen";
  const bytes = phraseBytes(text);
  for (const m of BYTES_MODES) {
    if (layers[m] <= 0) continue;
    const pic = bytesPicture(bytes, m, w / h);
    const one = document.createElement("canvas");
    one.width = pic.width;
    one.height = pic.height;
    one.getContext("2d")?.putImageData(new ImageData(pic.data, pic.width, pic.height), 0, 0);
    ctx.globalAlpha = layers[m];
    ctx.drawImage(one, 0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * The phrase's sound and picture on a press: start() when pressed, stop() when
 * let go. They last as long as the press, or (set so) at least the whole
 * signal; the sound loops while held. Shown and stopped straight away, not
 * through React, so a short tap stays short.
 */
function useEmitter(text: string, settings: RehearseSettings) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const made = useRef<{ key: string; buf: AudioBuffer } | null>(null);
  const until = useRef(0);
  const timer = useRef(0);
  const held = useRef(false);
  const { rgb, gray, bits } = settings.layers;

  useEffect(() => {
    if (canvas.current) drawPicture(canvas.current, text, { rgb, gray, bits });
  }, [text, rgb, gray, bits]);

  const halt = () => {
    window.clearTimeout(timer.current);
    if (canvas.current) canvas.current.style.visibility = "hidden";
    const l = live.current;
    live.current = null;
    if (!l) return;
    try {
      const t = l.gain.context.currentTime;
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setValueAtTime(l.gain.gain.value, t);
      l.gain.gain.linearRampToValueAtTime(0, t + 0.008);
      l.src.stop(t + 0.012);
    } catch {
      /* already over */
    }
  };

  const signal = (ctx: AudioContext) => {
    const key = JSON.stringify([
      ctx.sampleRate,
      settings.signalMs,
      settings.amp,
      settings.rawRate,
      settings.mode,
      settings.plays,
      settings.topSpeed,
      text,
    ]);
    if (made.current?.key !== key) {
      const data = soundOf(text, ctx.sampleRate, settings);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      made.current = { key, buf };
    }
    return made.current.buf;
  };

  const start = () => {
    halt();
    held.current = true;
    until.current = performance.now() + (settings.emit === "full" ? settings.signalMs : 0);
    if (settings.picture && canvas.current) canvas.current.style.visibility = "visible";
    // With Nonstop the sound plays already: a tap shows the picture.
    if (!settings.sound || settings.amp <= 0 || settings.nonstop) return;
    const ctx = audioContext();
    if (!ctx) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = signal(ctx);
      src.loop = true;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + 0.003);
      src.connect(gain).connect(ctx.destination);
      src.start(t);
      live.current = { src, gain };
    } catch {
      /* no sound on this device */
    }
  };

  const stop = () => {
    if (!held.current) return;
    held.current = false;
    const left = until.current - performance.now();
    if (left > 0) timer.current = window.setTimeout(halt, left);
    else halt();
  };

  // Gone with the tab.
  useEffect(() => halt, []);

  const picture = createPortal(
    <canvas
      ref={canvas}
      aria-hidden
      data-rehearse-picture
      className="pointer-events-none fixed inset-0 z-[80] h-full w-full"
      style={{
        visibility: "hidden",
        opacity: settings.pictureOpacity,
        imageRendering: "pixelated",
      }}
    />,
    document.body,
  );
  return { start, stop, picture };
}

// ---- Small controls ----

/** A number with − and +, and typed exactly. */
function Num({
  label,
  value,
  step: by,
  digits = 0,
  set,
}: {
  label: string;
  value: number;
  step: number;
  digits?: number;
  set: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(",", "."));
    if (Number.isFinite(v)) set(v);
    setText(null);
  };
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="btn stepper"
          onClick={() => set(value - by)}
          aria-label={`${label}: less`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          className="w-16 rounded border border-cyan/40 bg-transparent px-1 py-2 text-center text-fg"
          inputMode="decimal"
          value={text ?? value.toFixed(digits)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          aria-label={label}
        />
        <button
          type="button"
          className="btn stepper"
          onClick={() => set(value + by)}
          aria-label={`${label}: more`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}

function Toggle({ label, on, flip }: { label: string; on: boolean; flip: () => void }) {
  return (
    <button
      type="button"
      className="btn w-full justify-between px-2 tracking-normal normal-case"
      data-on={on}
      aria-pressed={on}
      onClick={flip}
    >
      <span>{label}</span>
      <span className="font-display text-[0.6rem] tracking-wider uppercase">
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

/**
 * The Rehearse tab: your phrases, a tap a rep. Tap the phrase (the big area) for
 * one rep of the whole phrase; hold it to keep its sound and picture on. Each
 * phrase keeps its own count; reset one and the phrase stays.
 */
export function RehearseTab() {
  const lines = useGame((s) => s.lines);
  const [st, setSt] = useState<RehearseState>(readRehearse);
  const [tune, setTune] = useState(false);
  const [draft, setDraft] = useState("");
  const [bySentence, setBySentence] = useState(false);
  const [armed, setArmed] = useState("");
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const item = currentPhrase(st);
  const set = st.settings;
  const emitter = useEmitter(item?.text ?? "", set);
  const index = item ? st.items.indexOf(item) : -1;

  // Nonstop: the current phrase's sound all the time while this tab is open.
  const loop = useRef<PhraseLoop | null>(null);
  const phraseText = item?.text ?? "";
  const { nonstop, sound, signalMs, amp, rawRate, mode, plays, topSpeed } = set;
  useEffect(() => {
    loop.current ??= phraseLoop();
    if (nonstop && sound && phraseText) {
      loop.current.play(phraseText, { signalMs, amp, rawRate, mode, plays, topSpeed });
    } else {
      loop.current.stop();
    }
  }, [nonstop, sound, phraseText, signalMs, amp, rawRate, mode, plays, topSpeed]);
  useEffect(() => () => loop.current?.stop(), []);

  // azs-folder: each phrase as input_perphrase/<name>.txt, its own .wav next to it (made outside, by Termux).
  const names = useMemo(() => phraseFileNames(st.items.map((i) => i.text)), [st.items]);
  const name = index >= 0 ? (names[index] ?? "") : "";
  const [phone, setPhone] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [wavs, setWavs] = useState<Set<string>>(() => new Set());
  /** In a browser: .wav files picked by hand, by name (lower case), for this visit. */
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map());
  const [folderNote, setFolderNote] = useState("");
  const wavPick = useRef<HTMLInputElement>(null);
  const lookForWavs = async () => {
    const files = await listFolder(PHRASE_FOLDER);
    const found = new Set(
      files.filter((f) => /\.wav$/i.test(f.name)).map((f) => f.name.toLowerCase()),
    );
    setWavs(found);
    return found.size;
  };
  useEffect(() => {
    let live = true;
    void (async () => {
      const ok = await hasFolder();
      if (!live) return;
      setPhone(ok);
      const n = ok ? await folderName() : null;
      if (!live) return;
      setFolder(n);
      if (n) await lookForWavs();
    })();
    return () => {
      live = false;
    };
  }, []);
  const hasWav = (base: string) => {
    const key = `${base}.wav`.toLowerCase();
    return wavs.has(key) || picked.has(key);
  };
  const choose = async () => {
    try {
      const n = await pickFolder();
      if (!n) return;
      setFolder(n);
      const count = await lookForWavs();
      setFolderNote(
        `azs-folder: ${n}. ${count} .wav file${count === 1 ? "" : "s"} in ${PHRASE_FOLDER}.`,
      );
    } catch (e) {
      setFolderNote(String((e as Error)?.message ?? e));
    }
  };
  const exportAll = async () => {
    const list = st.items;
    try {
      for (let i = 0; i < list.length; i++) {
        setFolderNote(`Saving ${i + 1} of ${list.length}…`);
        await writeFolderText(`${PHRASE_FOLDER}/${names[i]}.txt`, list[i]!.text);
      }
      setFolderNote(
        `${list.length} phrase${list.length === 1 ? "" : "s"} saved in ${folder}/${PHRASE_FOLDER} as .txt.`,
      );
    } catch (e) {
      setFolderNote(String((e as Error)?.message ?? e));
    }
  };
  const pickWavs = (files: FileList | null) => {
    if (!files?.length) return;
    setPicked((old) => {
      const next = new Map(old);
      for (const f of Array.from(files)) next.set(f.name.toLowerCase(), URL.createObjectURL(f));
      return next;
    });
    setFolderNote(
      `${files.length} .wav file${files.length === 1 ? "" : "s"} loaded for this visit.`,
    );
    if (wavPick.current) wavPick.current.value = "";
  };

  // The current phrase's own .wav, looped as it is, at its gain.
  const wav = useRef<FileLoop | null>(null);
  const { wavLoop, wavVolume } = set;
  const wavHere = !!name && hasWav(name);
  const [wavPlaying, setWavPlaying] = useState(false);
  useEffect(() => {
    wav.current ??= fileLoop();
    const w = wav.current;
    if (!wavLoop || !wavHere || !name) {
      w.stop();
      setWavPlaying(false);
      return;
    }
    let live = true;
    void (async () => {
      const key = `${name}.wav`.toLowerCase();
      const url = picked.get(key) ?? (await folderFileUrl(`${PHRASE_FOLDER}/${name}.wav`));
      if (!live) return;
      const ok = url ? await w.play(url, wavVolume) : false;
      if (live) setWavPlaying(ok);
    })();
    return () => {
      live = false;
    };
    // The gain alone changes without restarting it (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavLoop, wavHere, name, picked]);
  useEffect(() => wav.current?.gain(wavVolume), [wavVolume]);
  useEffect(() => () => wav.current?.stop(), []);

  const update = (fn: (s: RehearseState) => RehearseState) =>
    setSt((prev) => {
      const next = fn(prev);
      writeRehearse(next);
      return next;
    });
  const setOpt = (next: Partial<RehearseSettings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...next } }));
  // A second tap within 3 s does it.
  const arm = (key: string, act: () => void) => {
    if (armed === key) {
      setArmed("");
      act();
      return;
    }
    setArmed(key);
    window.setTimeout(() => setArmed((a) => (a === key ? "" : a)), 3000);
  };

  const rep = () => {
    if (!item) return;
    const before = levelForXp(useGame.getState().skills.recitation);
    grantSkillXp("recitation", repXp(wordsOf(item.text), 1));
    const after = levelForXp(useGame.getState().skills.recitation);
    if (after > before) flashToast(`Recitation level ${after}`);
    const id = item.id;
    update((s) => countRep(s, id, Date.now()));
  };
  const press = (count: boolean) => {
    if (!item) return;
    emitter.start();
    if (count) rep();
  };
  const holdProps = (count: boolean) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      press(count);
    },
    onPointerUp: emitter.stop,
    onPointerCancel: emitter.stop,
    onLostPointerCapture: emitter.stop,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        press(count);
      }
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        emitter.stop();
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const add = (texts: string[], from: string) => {
    const r = addPhrases(st, texts, Date.now());
    if (r.added) update(() => r.state);
    setNote(
      r.added
        ? `${r.added} phrase${r.added > 1 ? "s" : ""} added from ${from}.`
        : `Nothing new in ${from}.`,
    );
  };
  const addDraft = () => {
    const texts = phrasesOf(draft, bySentence);
    if (!texts.length) return;
    add(texts, "what you wrote");
    setDraft("");
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const texts: string[] = [];
    for (const f of Array.from(files)) texts.push(...phrasesOf(await f.text(), bySentence));
    add(texts, files.length > 1 ? `${files.length} files` : (files[0]?.name ?? "the file"));
    if (file.current) file.current.value = "";
  };

  const fit = item
    ? signalFit(rawSamples(phraseBytes(item.text)).length, set.rawRate, set.signalMs)
    : null;
  const bytes = item ? phraseBytes(item.text).length : 0;

  return (
    <div>
      {emitter.picture}
      <p className="text-sm leading-relaxed text-muted">
        A tap is one rep of the whole phrase (a word is a phrase of one). Each tap can sound the
        phrase's own bytes and show them as a picture, as long as you hold it.
      </p>
      {item ? (
        <>
          <button
            type="button"
            className="glass mt-3 flex w-full flex-col items-center justify-center gap-2 p-4 text-center select-none"
            style={{
              height: `${set.tapHeight}dvh`,
              touchAction: "none",
              WebkitTouchCallout: "none",
            }}
            {...holdProps(true)}
            aria-label={`Rep: ${item.text}. ${item.count} so far`}
          >
            <span className="font-display text-[0.65rem] tracking-[0.14em] text-violet">
              TAP = 1 REP · HOLD TO KEEP IT ON
            </span>
            <span className="line-clamp-5 text-lg leading-snug text-fg">{item.text}</span>
            <span className="font-display text-3xl text-cyan" aria-live="polite">
              {item.count.toLocaleString()}
            </span>
            {wavHere && (
              <span className="text-[0.65rem] text-violet">
                ♪ {name}.wav{" "}
                {wavLoop
                  ? wavPlaying
                    ? `looping at ${Math.round(wavVolume * 100)}%`
                    : "loading…"
                  : "(off)"}
              </span>
            )}
          </button>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              className="btn stepper"
              onClick={() => update((s) => step(s, -1))}
              disabled={st.items.length < 2}
              aria-label="Previous phrase"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 text-center text-xs text-muted">
              Phrase {index + 1} of {st.items.length} · {totalReps(st).toLocaleString()} reps in all
              · +{repXp(wordsOf(item.text), 1)} XP a rep
            </p>
            <button
              type="button"
              className="btn stepper"
              onClick={() => update((s) => step(s, 1))}
              disabled={st.items.length < 2}
              aria-label="Next phrase"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn select-none"
              style={{ touchAction: "none" }}
              {...holdProps(false)}
            >
              Hold to test (no rep)
            </button>
            <button
              type="button"
              className="btn"
              data-on={tune}
              aria-pressed={tune}
              onClick={() => setTune((t) => !t)}
            >
              <Settings2 className="size-4" aria-hidden /> Sound and picture
            </button>
          </div>
          <div className="mt-2">
            <Toggle
              label={`Nonstop: its sound all the time${mode === "cycle" ? " (rising cycle)" : ""}`}
              on={nonstop}
              flip={() => setOpt({ nonstop: !nonstop, sound: true })}
            />
          </div>
          {wavHere && (
            <div className="mt-2 space-y-1.5">
              <Toggle
                label={`Its .wav in a loop (${name}.wav)`}
                on={wavLoop}
                flip={() => setOpt({ wavLoop: !wavLoop })}
              />
              <Num
                label="WAV volume (0 to 1, the file as it is)"
                value={wavVolume}
                step={0.05}
                digits={2}
                set={(v) => setOpt({ wavVolume: clampAmp(v) })}
              />
            </div>
          )}
        </>
      ) : (
        <p className="glass mt-3 p-4 text-sm text-muted">
          No phrases yet. Write one below, import a .txt, or add the loaded text's phrases.
        </p>
      )}

      {tune && (
        <div className="glass mt-2 space-y-1.5 p-3">
          <p className="font-display text-[0.6rem] tracking-[0.14em] text-violet">
            THE SOUND: THE PHRASE'S OWN BYTES
          </p>
          <Toggle
            label="Sound (on a tap, or nonstop)"
            on={set.sound}
            flip={() => setOpt({ sound: !set.sound })}
          />
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={set.mode === "steady"}
              aria-pressed={set.mode === "steady"}
              onClick={() => setOpt({ mode: "steady" })}
            >
              Steady
            </button>
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={set.mode === "cycle"}
              aria-pressed={set.mode === "cycle"}
              onClick={() => setOpt({ mode: "cycle" })}
            >
              Rising cycle
            </button>
          </div>
          {set.mode === "cycle" && (
            <>
              <Num
                label="Plays a cycle"
                value={set.plays}
                step={1}
                set={(v) => setOpt({ plays: clampPlays(v) })}
              />
              <Num
                label="Top speed (×, pitch and pace)"
                value={set.topSpeed}
                step={1}
                digits={set.topSpeed % 1 ? 2 : 0}
                set={(v) => setOpt({ topSpeed: clampTopSpeed(v) })}
              />
            </>
          )}
          <Num
            label="Length (ms)"
            value={set.signalMs}
            step={100}
            set={(v) => setOpt({ signalMs: clampSignalMs(v) })}
          />
          <Num
            label="Peak loudness (0 to 1)"
            value={set.amp}
            step={0.05}
            digits={2}
            set={(v) => setOpt({ amp: clampAmp(v) })}
          />
          <Num
            label="Raw samples a second"
            value={set.rawRate}
            step={1000}
            set={(v) => setOpt({ rawRate: clampRawRate(v) })}
          />
          {set.mode === "cycle" && (
            <p className="text-[0.65rem] leading-snug text-muted">
              A cycle: {set.plays} plays of{" "}
              {Math.round(Math.min(set.signalMs, MAX_CYCLE_MS / set.plays))} ms, from ×1 to ×
              {set.topSpeed} (×
              {cycleSpeeds(set.plays, set.topSpeed)
                .map((v) => +v.toFixed(2))
                .join(", ×")}
              ), each at the peak, then round again. A phone plays up to about 24,000 Hz: faster
              than that folds back down.
            </p>
          )}
          {fit && (
            <p className="text-[0.65rem] leading-snug text-muted">
              This phrase: {bytes} bytes, {fit.naturalMs.toFixed(1)} ms raw →{" "}
              {fit.speed > 1
                ? `sped up ×${fit.speed.toFixed(2)} to fit ${set.signalMs} ms`
                : `played ${fit.plays.toFixed(1)} times in ${set.signalMs} ms`}
              , its loudest point at {set.amp}.
            </p>
          )}
          <p className="pt-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">
            THE PICTURE: ITS BYTES, THREE LAYERS
          </p>
          <Toggle
            label="Picture on a tap"
            on={set.picture}
            flip={() => setOpt({ picture: !set.picture })}
          />
          {BYTES_MODES.map((m) => (
            <Num
              key={m}
              label={`${m === "rgb" ? "RGB" : m === "gray" ? "Gray" : "Bits"} layer`}
              value={set.layers[m]}
              step={0.05}
              digits={2}
              set={(v) => setOpt({ layers: { ...set.layers, [m]: clampLayer(v) } })}
            />
          ))}
          <Num
            label="Whole picture opacity"
            value={set.pictureOpacity}
            step={0.05}
            digits={2}
            set={(v) => setOpt({ pictureOpacity: Math.max(0.05, clampLayer(v)) })}
          />
          <p className="pt-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">THE TAP</p>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={set.emit === "press"}
              aria-pressed={set.emit === "press"}
              onClick={() => setOpt({ emit: "press" })}
            >
              As long as pressed
            </button>
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={set.emit === "full"}
              aria-pressed={set.emit === "full"}
              onClick={() => setOpt({ emit: "full" })}
            >
              At least the length
            </button>
          </div>
          <Num
            label="Tap area height (% of screen)"
            value={set.tapHeight}
            step={5}
            set={(v) => setOpt({ tapHeight: clampTapHeight(v) })}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        <textarea
          className="w-full rounded border border-cyan/40 bg-transparent p-2 text-sm text-fg"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a phrase or a word (one a line for several)"
          aria-label="New phrase"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn" onClick={addDraft} disabled={!draft.trim()}>
            <Plus className="size-4" aria-hidden /> Add
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            <Upload className="size-4" aria-hidden /> Import .txt
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept=".txt,text/plain"
          multiple
          className="hidden"
          onChange={(e) => void importFiles(e.target.files)}
        />
        <button
          type="button"
          className="btn w-full tracking-normal normal-case"
          onClick={() => add(lines, "the loaded text")}
          disabled={!lines.length}
        >
          Add the loaded text's phrases ({lines.length})
        </button>
        <Toggle
          label="Split lines into sentences"
          on={bySentence}
          flip={() => setBySentence((b) => !b)}
        />
        {note && (
          <p className="text-xs text-gold" role="status">
            {note}
          </p>
        )}
      </div>

      <div className="glass mt-4 space-y-2 p-3">
        <p className="font-display text-[0.6rem] tracking-[0.14em] text-violet">
          AZS-FOLDER · EACH PHRASE A .TXT, ITS .WAV NEXT TO IT
        </p>
        {phone ? (
          <>
            <button
              type="button"
              className="btn w-full tracking-normal normal-case"
              onClick={() => void choose()}
            >
              <FolderOpen className="size-4" aria-hidden />
              {folder
                ? `azs-folder: ${folder} (change)`
                : "Choose azs-folder (e.g. Documents/azs-folder)"}
            </button>
            {folder && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn tracking-normal normal-case"
                  onClick={() => void exportAll()}
                  disabled={!st.items.length}
                >
                  Save phrases to {PHRASE_FOLDER}
                </button>
                <button
                  type="button"
                  className="btn tracking-normal normal-case"
                  onClick={() =>
                    void lookForWavs().then((n) =>
                      setFolderNote(`${n} .wav file${n === 1 ? "" : "s"} in ${PHRASE_FOLDER}.`),
                    )
                  }
                >
                  Look for .wav files
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted">
              The azs-folder is in the Android app. Here, load .wav files named like the phrases.
            </p>
            <button
              type="button"
              className="btn w-full tracking-normal normal-case"
              onClick={() => wavPick.current?.click()}
            >
              <Upload className="size-4" aria-hidden /> Load .wav files
            </button>
            <input
              ref={wavPick}
              type="file"
              accept=".wav,audio/wav,audio/x-wav"
              multiple
              className="hidden"
              aria-label="Load .wav files"
              onChange={(e) => pickWavs(e.target.files)}
            />
          </>
        )}
        <p className="text-[0.65rem] leading-snug text-muted">
          A phrase is saved as {PHRASE_FOLDER}/&lt;phrase&gt;.txt. Make its sound outside (Termux)
          and put it next to it with the same name, .wav: picking the phrase here then loops it, as
          it is, at the WAV volume.
        </p>
        {folderNote && (
          <p className="text-xs text-gold" role="status">
            {folderNote}
          </p>
        )}
      </div>

      {st.items.length > 0 && (
        <>
          <ul className="mt-4 max-h-[45dvh] overflow-y-auto" aria-label="Phrases and their reps">
            {st.items.map((it, i) => (
              <li
                key={it.id}
                className={`flex items-center gap-1 border-b border-cyan/10 py-1 ${it.id === item?.id ? "bg-violet/15" : ""}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-2 text-left text-sm text-fg"
                  onClick={() => update((s) => select(s, it.id))}
                  aria-current={it.id === item?.id}
                >
                  <span className="text-muted">{i + 1}.</span> {hasWav(names[i] ?? "") ? "♪ " : ""}
                  {it.text}
                </button>
                <span className="w-12 text-right font-display text-xs text-cyan">
                  {it.count.toLocaleString()}
                </span>
                <button
                  type="button"
                  className="btn stepper"
                  onClick={() => update((s) => resetCount(s, it.id))}
                  disabled={!it.count}
                  aria-label={`Reset the count of: ${it.text}`}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn stepper"
                  data-on={armed === `rm-${it.id}`}
                  onClick={() => arm(`rm-${it.id}`, () => update((s) => removePhrase(s, it.id)))}
                  aria-label={
                    armed === `rm-${it.id}`
                      ? `Tap again to remove: ${it.text}`
                      : `Remove: ${it.text}`
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={armed === "zero"}
              onClick={() => arm("zero", () => update(resetCounts))}
              disabled={!totalReps(st)}
            >
              {armed === "zero" ? "Tap again: all counts to 0" : "Reset all counts"}
            </button>
            <button
              type="button"
              className="btn tracking-normal normal-case"
              data-on={armed === "clear"}
              onClick={() => arm("clear", () => update((s) => ({ ...s, items: [], current: "" })))}
            >
              {armed === "clear" ? "Tap again: remove all" : "Remove all phrases"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
