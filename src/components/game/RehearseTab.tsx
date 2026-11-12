import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FolderOpen,
  Lock,
  LockOpen,
  Pencil,
  PictureInPicture2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  flashToast,
  loadCodexTexts,
  loadTextFolder,
  nudgeSetting,
  updateText,
} from "@/game/engine";
import { parseCodex } from "@/game/codex";
import { unzipTexts } from "@/game/unzip";
import { saveConfirmed } from "@/game/textFiles";
import { repXp } from "@/game/recite";
import { clock, phraseKey, wordsOf } from "@/game/reps";
import { bytesPicture } from "@/game/readview";
import {
  BYTES_MODES,
  checkState,
  editPhrase,
  markChecked,
  readReader,
  readUnits,
  textSum,
  writeReader,
  type BytesMode,
} from "@/game/readtext";
import { useGame } from "@/game/store";
import {
  askUnrestricted,
  batteryUnrestricted,
  bubbleState,
  resetBubblePlace,
  type BubbleSetup,
} from "@/game/repBubble";
import { voiceEngines, voiceHere, voiceList, type VoiceInfo } from "@/game/voice";
import {
  bubbleShown,
  hideBubble,
  pickedWavs,
  playNonstop,
  playVoice,
  requestReader,
  playWav,
  rehearseOpen,
  rehearseState,
  rehearseUpdate,
  repXpFor,
  sendBubble,
  showBubble,
  startRehearseBackground,
  subscribeRehearse,
  wavGain,
  wavStyle as setWavStyle,
} from "@/game/rehearseRun";
import {
  folderFileUrl,
  folderName,
  hasFolder,
  listFolder,
  pickFolder,
  readFolderText,
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
  batchWaitMs,
  clampBatch,
  clampRepSeconds,
  countRep,
  tapReady,
  PHRASE_FOLDER,
  phraseFileNames,
  currentPhrase,
  phraseBytes,
  soundOf,
  soundRate,
  phrasesOf,
  rawSamples,
  removePhrase,
  resetCount,
  resetCounts,
  select,
  signalFit,
  step,
  totalReps,
  clampCycles,
  clampFade,
  clampPhraseSize,
  clampBubbleSp,
  clampRobot,
  clampRobotHz,
  clampVoiceCopies,
  clampVoiceMs,
  clampVoicePitch,
  clampVoiceRate,
  clampVoiceSpeedUp,
  VOICE_PRESETS,
  voicePresetOf,
  voiceShapeOf,
  levelsText,
  parseLevels,
  presetOf,
  resetText,
  TEXT_FOLDER,
  textAt,
  textFileNames,
  textProgress,
  textPercent,
  textStep,
  textTap,
  WAV_PRESETS,
  WAV_SHAPES,
  wavSettingsOf,
  wavStyleOf,
  bubbleId,
  libraryOf,
  type RehearseSettings,
  type RehearseState,
  type WavShape,
} from "@/game/rehearse";

/** What each text's .txt in input_pertext was last saved as (its fingerprint), so an edited text is saved again. */
const PERTEXT_SUMS = "azshara-pertext-sums";

function readSums(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PERTEXT_SUMS);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSums(sums: Record<string, string>) {
  try {
    localStorage.setItem(PERTEXT_SUMS, JSON.stringify(sums));
  } catch {
    /* private mode or full */
  }
}

const SHAPE_NAMES: Record<WavShape, string> = {
  flat: "Flat",
  fade: "Fade",
  sine: "Sine",
  saw: "Saw",
  square: "Square",
};

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
      settings.encoding,
      settings.mode,
      settings.plays,
      settings.topSpeed,
      text,
    ]);
    if (made.current?.key !== key) {
      const rate = soundRate(ctx.sampleRate, settings);
      const data = soundOf(text, rate, settings);
      const buf = ctx.createBuffer(1, data.length, rate);
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
  const texts = useGame((s) => s.texts);
  const custom = useGame((s) => s.custom);
  const folders = useGame((s) => s.folders);
  // One copy of the state, shared with the background (the floating window's taps come in there).
  const st = useSyncExternalStore(subscribeRehearse, rehearseState, rehearseState);
  const [tune, setTune] = useState(false);
  const [wavTune, setWavTune] = useState(false);
  const [draft, setDraft] = useState("");
  const [bySentence, setBySentence] = useState(false);
  const [armed, setArmed] = useState("");
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const textFile = useRef<HTMLInputElement>(null);
  const item = currentPhrase(st);
  const set = st.settings;
  const locked = set.locked;
  const index = item ? st.items.indexOf(item) : -1;

  // Texts: the Read tab's own (the same ones, edited and checked the same way), whole, phrase after phrase.
  const textsView = st.view === "texts";
  const library = useMemo(
    () => libraryOf(texts, custom, lines, folders),
    [custom, texts, lines, folders],
  );
  const textNow = library.find((t) => t.key === st.text) ?? library[0];
  const textIndex = textNow ? library.indexOf(textNow) : -1;
  const units = useMemo(() => (textNow ? readUnits(textNow.lines) : []), [textNow]);
  const phraseCounts = useMemo(() => library.map((t) => readUnits(t.lines).length), [library]);
  const total = units.length;
  const textKeyNow = textNow?.key ?? "";
  const at = textAt(st, textKeyNow, total);
  const unit = units[at];
  const prog = textProgress(st, textKeyNow);
  const textSumNow = useMemo(() => (textNow ? textSum(textNow.lines) : ""), [textNow]);
  /** The phrase being repped now: a single phrase, or the text's phrase it is at. */
  const activeText = textsView ? (unit?.text ?? "") : (item?.text ?? "");
  const emitter = useEmitter(activeText, set);
  // The screen's size (the whole app's, Options → Interface size), and the phrase's own.
  const uiScale = useGame((s) => s.settings.uiScale);
  const phraseBox = useRef<HTMLSpanElement>(null);
  const phraseEl = useRef<HTMLSpanElement>(null);
  const [fitPx, setFitPx] = useState(set.phraseSize);
  const phraseSize = set.phraseSize;
  /** The phrase at its size, or smaller till the whole of it fits the tap area. */
  const fitPhrase = useCallback(() => {
    const box = phraseBox.current;
    const el = phraseEl.current;
    if (!box || !el) return;
    let px = phraseSize;
    el.style.fontSize = `${px}px`;
    while (
      px > 8 &&
      (el.scrollHeight > box.clientHeight + 1 || el.scrollWidth > box.clientWidth + 1)
    ) {
      px = Math.max(8, Math.floor(px * 0.92));
      el.style.fontSize = `${px}px`;
    }
    setFitPx(px);
  }, [phraseSize]);
  /** A pass just done (the text's key): a check that it is all written right is offered. */
  const [passDone, setPassDone] = useState<string | null>(null);
  /** The phrase being rewritten (texts), and the check (read with the Read tab's, after a change). */
  const [editing, setEditing] = useState<string | null>(null);
  const [checkTick, setCheckTick] = useState(0);
  const checked = useMemo(
    () =>
      textNow ? checkState(readReader(), textNow.name, textNow.lines, textNow.folder) : "unchecked",
    // checkTick: read again after this tab checks one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textNow, checkTick],
  );

  // Reps a tap: above 1, a tap counts once batch x repSeconds have passed since the last that counted.
  const batchWait = batchWaitMs(set);
  const [, setClock] = useState(() => Date.now());
  const [tapNote, setTapNote] = useState("");
  const gateAt = st.lastTap + batchWait;
  useEffect(() => {
    const t0 = Date.now();
    setClock(t0);
    if (batchWait <= 0 || t0 >= gateAt) return;
    const id = window.setTimeout(
      () => {
        setClock(Date.now());
        setTapNote("");
      },
      gateAt - t0 + 4,
    );
    return () => window.clearTimeout(id);
  }, [gateAt, batchWait]);

  // Nonstop: the current phrase's sound all the time (on after the tab closes too, with Background on).
  const phraseText = activeText;
  const { nonstop, sound, signalMs, amp, rawRate, mode, plays, topSpeed, encoding } = set;
  useEffect(() => {
    if (nonstop && sound && phraseText) {
      playNonstop(phraseText, {
        signalMs,
        amp,
        rawRate,
        mode,
        plays,
        topSpeed,
        encoding,
      });
    } else {
      playNonstop(null);
    }
  }, [nonstop, sound, phraseText, signalMs, amp, rawRate, mode, plays, topSpeed, encoding]);
  // The robot voice: the current phrase said, over and over (on after the tab closes too, with Background on).
  const [voiceNote, setVoiceNote] = useState("");
  const voiceKey = JSON.stringify([
    set.voice,
    set.voiceEngine,
    set.voiceName,
    voiceShapeOf(set),
    phraseText,
  ]);
  useEffect(() => {
    let live = true;
    void playVoice(set.voice && phraseText ? phraseText : null).then((m) => {
      if (live) setVoiceNote(m);
    });
    return () => {
      live = false;
    };
    // voiceKey holds the phrase and every voice setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceKey]);
  // Open here; closed, the background takes over (or the sound stops, with Background off).
  useEffect(() => {
    startRehearseBackground();
    rehearseOpen(true);
    return () => rehearseOpen(false);
  }, []);

  // azs-folder: each phrase as input_perphrase/<name>.txt, its own .wav next to it (made outside, by Termux).
  // And each text as input_pertext/<name>.txt, its own .wav next to it.
  const names = useMemo(() => phraseFileNames(st.items.map((i) => i.text)), [st.items]);
  const textNames = useMemo(() => textFileNames(library), [library]);
  const dir = textsView ? TEXT_FOLDER : PHRASE_FOLDER;
  const name = textsView
    ? textIndex >= 0
      ? (textNames[textIndex] ?? "")
      : ""
    : index >= 0
      ? (names[index] ?? "")
      : "";
  const [phone, setPhone] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  /** The .wav files found, as "<folder>/<file>" (lower case). */
  const [wavs, setWavs] = useState<Set<string>>(() => new Set());
  /** The .txt files in input_perphrase (lower case), once looked at: each phrase is saved there by itself. */
  const [txts, setTxts] = useState<Set<string> | null>(null);
  /** The .txt files in input_pertext (as named), once looked at: each text is saved there by itself. */
  const [textTxts, setTextTxts] = useState<string[] | null>(null);
  /** Back in the app (Termux may have made .wav files meanwhile): the current phrase looked at again. */
  const [tick, setTick] = useState(0);
  /** In a browser: .wav files picked by hand, by name (lower case), for this visit (kept while the page is). */
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map(pickedWavs));
  const [folderNote, setFolderNote] = useState("");
  const wavPick = useRef<HTMLInputElement>(null);
  /** Both folders looked at: the number of .wav files in each. */
  const lookForWavs = async () => {
    const [ph, tx] = await Promise.all([listFolder(PHRASE_FOLDER), listFolder(TEXT_FOLDER)]);
    const lower = ph.map((f) => f.name.toLowerCase());
    const lowerT = tx.map((f) => f.name.toLowerCase());
    const wavOf = (d: string, list: string[]) =>
      list.filter((f) => f.endsWith(".wav")).map((f) => `${d}/${f}`);
    const found = new Set([...wavOf(PHRASE_FOLDER, lower), ...wavOf(TEXT_FOLDER, lowerT)]);
    setWavs(found);
    setTxts(new Set(lower.filter((f) => f.endsWith(".txt"))));
    setTextTxts(tx.map((f) => f.name).filter((f) => /\.txt$/i.test(f)));
    return {
      [PHRASE_FOLDER]: wavOf(PHRASE_FOLDER, lower).length,
      [TEXT_FOLDER]: wavOf(TEXT_FOLDER, lowerT).length,
    } as Record<string, number>;
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
    // Back in the app: the folder looked at again, for .wav files made meanwhile.
    const back = () => {
      if (document.hidden) return;
      void folderName().then((n) => {
        if (!live || !n) return;
        void lookForWavs();
        setTick((t) => t + 1);
      });
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  // Each phrase saved by itself as input_perphrase/<name>.txt (those not there yet).
  const saving = useRef(false);
  useEffect(() => {
    if (!folder || !txts || saving.current) return;
    const missing = st.items
      .map((it, i) => ({ text: it.text, file: `${names[i]}.txt` }))
      .filter((p) => !txts.has(p.file.toLowerCase()));
    if (!missing.length) return;
    saving.current = true;
    void (async () => {
      const done: string[] = [];
      for (const p of missing) {
        try {
          await writeFolderText(`${PHRASE_FOLDER}/${p.file}`, p.text);
          done.push(p.file.toLowerCase());
        } catch (e) {
          setFolderNote(String((e as Error)?.message ?? e));
          break;
        }
      }
      saving.current = false;
      setTxts((old) => new Set([...(old ?? []), ...done]));
      if (done.length) {
        setFolderNote(
          `${done.length === 1 ? `“${missing[0]!.file}”` : `${done.length} phrases`} saved in ${PHRASE_FOLDER}.`,
        );
      }
    })();
  }, [folder, txts, names, st.items]);
  // Each text saved by itself as input_pertext/<name>.txt: those not there yet, and again once edited.
  const savingTexts = useRef(false);
  useEffect(() => {
    if (!folder || !textTxts || savingTexts.current) return;
    const have = new Set(textTxts.map((f) => f.toLowerCase()));
    const sums = readSums();
    let adopted = false;
    const todo: { file: string; body: string; sum: string }[] = [];
    library.forEach((t, i) => {
      if (t.builtIn) return;
      const file = `${textNames[i]}.txt`;
      const k = file.toLowerCase();
      const sum = textSum(t.lines);
      const there = have.has(k);
      // A file there already, not saved from here: kept as it is (from now on, saved when the text changes).
      if (there && !sums[k]) {
        sums[k] = sum;
        adopted = true;
        return;
      }
      if (!there || sums[k] !== sum) todo.push({ file, body: `${t.lines.join("\n")}\n`, sum });
    });
    if (adopted) writeSums(sums);
    if (!todo.length) return;
    savingTexts.current = true;
    void (async () => {
      const done: string[] = [];
      for (const f of todo) {
        try {
          await writeFolderText(`${TEXT_FOLDER}/${f.file}`, f.body);
          sums[f.file.toLowerCase()] = f.sum;
          done.push(f.file);
        } catch (e) {
          setFolderNote(String((e as Error)?.message ?? e));
          break;
        }
      }
      writeSums(sums);
      savingTexts.current = false;
      if (!done.length) return;
      const low = new Set(done.map((d) => d.toLowerCase()));
      setTextTxts((old) => [...(old ?? []).filter((f) => !low.has(f.toLowerCase())), ...done]);
      setFolderNote(
        `${done.length === 1 ? `“${done[0]}”` : `${done.length} texts`} saved in ${TEXT_FOLDER}.`,
      );
    })();
  }, [folder, textTxts, textNames, library]);
  /** .txt files in input_pertext that are not one of the texts yet (put there from outside). */
  const newTextFiles = useMemo(() => {
    const mine = new Set(textNames.map((n) => `${n}.txt`.toLowerCase()));
    return (textTxts ?? []).filter((f) => !mine.has(f.toLowerCase()));
  }, [textTxts, textNames]);
  const loadNewTexts = async () => {
    const files: { name: string; raw: string }[] = [];
    for (const f of newTextFiles) {
      try {
        files.push({ name: f, raw: await readFolderText(`${TEXT_FOLDER}/${f}`) });
      } catch (e) {
        setFolderNote(String((e as Error)?.message ?? e));
      }
    }
    if (files.length) loadCodexTexts(files);
  };
  /** .txt files in input_perphrase holding a phrase that is not in the list yet (found by Refresh). */
  const [newPhrases, setNewPhrases] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  /** What the last Refresh found, shown under its button. */
  const [refreshNote, setRefreshNote] = useState("");
  /**
   * Refresh: the lists read again. In the phone app the azs-folder is looked at
   * afresh: a .txt changed outside the app replaces the text (or the phrase) it
   * belongs to, new .txt files are offered to load, and the .wav files are found
   * again. Anywhere, the checks and what is kept on the device are read again.
   */
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setCheckTick((t) => t + 1);
      const s = (n: number) => (n === 1 ? "" : "s");
      if (!folder) {
        const n = textsView ? library.length : st.items.length;
        setRefreshNote(
          `Refreshed: ${n.toLocaleString()} ${textsView ? "text" : "phrase"}${s(n)} shown, all there are.`,
        );
        return;
      }
      const wavCount = (await lookForWavs())[dir] ?? 0;
      setTick((t) => t + 1);
      const fold = (t: string) => t.replace(/\s+/g, " ").trim();
      if (textsView) {
        const files = (await listFolder(TEXT_FOLDER))
          .map((f) => f.name)
          .filter((f) => /\.txt$/i.test(f));
        const mine = new Map(textNames.map((n, i) => [`${n}.txt`.toLowerCase(), i]));
        const sums = readSums();
        const changed: { name: string; lines: string[]; folder?: string }[] = [];
        let fresh = 0;
        for (const [i, f] of files.entries()) {
          const at = mine.get(f.toLowerCase());
          const t = at === undefined ? undefined : library[at];
          if (!t) {
            fresh += 1;
            continue;
          }
          if (t.builtIn) continue;
          setRefreshNote(`Reading ${i + 1} of ${files.length}…`);
          let lines: string[];
          try {
            lines = parseCodex(await readFolderText(`${TEXT_FOLDER}/${f}`));
          } catch {
            continue;
          }
          if (!lines.length || lines.join("\n") === t.lines.join("\n")) continue;
          // A text changed here and not saved yet keeps its own words: it is saved over the file.
          const k = f.toLowerCase();
          if (sums[k] && sums[k] !== textSum(t.lines)) continue;
          sums[k] = textSum(lines);
          changed.push({ name: t.name, lines, folder: t.folder });
        }
        if (changed.length) {
          writeSums(sums);
          for (const c of changed) updateText(c.name, c.lines, c.folder);
        }
        setRefreshNote(
          `Refreshed from ${TEXT_FOLDER}: ${files.length} .txt file${s(files.length)}, ${changed.length} changed outside and read again${fresh ? `, ${fresh} new (load ${fresh === 1 ? "it" : "them"} with the button above)` : ""}; ${wavCount} .wav file${s(wavCount)}.`,
        );
        return;
      }
      const files = (await listFolder(PHRASE_FOLDER))
        .map((f) => f.name)
        .filter((f) => /\.txt$/i.test(f));
      const mine = new Map(names.map((n, i) => [`${n}.txt`.toLowerCase(), i]));
      const have = new Set(st.items.map((i) => phraseKey(i.text)));
      const fresh: string[] = [];
      const changed: { id: string; text: string }[] = [];
      for (const [i, f] of files.entries()) {
        setRefreshNote(`Reading ${i + 1} of ${files.length}…`);
        let text: string;
        try {
          text = fold(await readFolderText(`${PHRASE_FOLDER}/${f}`));
        } catch {
          continue;
        }
        const key = phraseKey(text);
        if (!text || have.has(key)) continue;
        have.add(key);
        // Its own phrase's file, rewritten outside: the phrase takes the new words (its count stays).
        const at = mine.get(f.toLowerCase());
        const it = at === undefined ? undefined : st.items[at];
        if (it) changed.push({ id: it.id, text });
        else fresh.push(text);
      }
      if (changed.length) {
        const next = new Map(changed.map((c) => [c.id, c.text]));
        update((st0) => ({
          ...st0,
          items: st0.items.map((it) => (next.has(it.id) ? { ...it, text: next.get(it.id)! } : it)),
        }));
      }
      setNewPhrases(fresh);
      setRefreshNote(
        `Refreshed from ${PHRASE_FOLDER}: ${files.length} .txt file${s(files.length)}, ${changed.length} changed outside and read again${fresh.length ? `, ${fresh.length} new (add ${fresh.length === 1 ? "it" : "them"} with the button above)` : ""}; ${wavCount} .wav file${s(wavCount)}.`,
      );
    } catch (e) {
      setRefreshNote(String((e as Error)?.message ?? e));
    } finally {
      setRefreshing(false);
    }
  };
  const hasWav = (base: string, d = dir) => {
    const key = `${base}.wav`.toLowerCase();
    return wavs.has(`${d}/${key}`) || picked.has(key);
  };
  const choose = async () => {
    try {
      const n = await pickFolder();
      if (!n) return;
      setFolder(n);
      setTick((t) => t + 1);
      const count = (await lookForWavs())[dir] ?? 0;
      setFolderNote(`azs-folder: ${n}. ${count} .wav file${count === 1 ? "" : "s"} in ${dir}.`);
    } catch (e) {
      setFolderNote(String((e as Error)?.message ?? e));
    }
  };
  const exportAll = async () => {
    const list = textsView
      ? library.flatMap((t, i) =>
          t.builtIn ? [] : [{ file: textNames[i]!, body: `${t.lines.join("\n")}\n`, t }],
        )
      : st.items.map((it, i) => ({ file: names[i]!, body: it.text, t: null }));
    const sums = readSums();
    try {
      for (let i = 0; i < list.length; i++) {
        setFolderNote(`Saving ${i + 1} of ${list.length}…`);
        const f = list[i]!;
        await writeFolderText(`${dir}/${f.file}.txt`, f.body);
        if (f.t) sums[`${f.file}.txt`.toLowerCase()] = textSum(f.t.lines);
      }
      if (textsView) writeSums(sums);
      const what = textsView ? "text" : "phrase";
      setFolderNote(
        `${list.length} ${what}${list.length === 1 ? "" : "s"} saved in ${folder}/${dir} as .txt.`,
      );
    } catch (e) {
      setFolderNote(String((e as Error)?.message ?? e));
    }
  };
  const pickWavs = (list: FileList | null) => {
    // Taken out of the picker now: clearing it below empties its list.
    const files = Array.from(list ?? []).map((f) => [f.name.toLowerCase(), URL.createObjectURL(f)]);
    if (!files.length) return;
    for (const [k, url] of files) pickedWavs.set(k!, url!);
    setPicked(new Map(pickedWavs));
    setFolderNote(
      `${files.length} .wav file${files.length === 1 ? "" : "s"} loaded for this visit.`,
    );
    if (wavPick.current) wavPick.current.value = "";
  };

  // Choosing a phrase: its own .wav (next to its .txt) looked for right then, and looped as it is, at its gain.
  const { wavLoop, wavVolume } = set;
  const wavStyle = wavStyleOf(set);
  const styleKey = JSON.stringify(wavStyle);
  const styleNow = useRef(wavStyle);
  styleNow.current = wavStyle;
  const wavHere = !!name && hasWav(name);
  const [wavPlaying, setWavPlaying] = useState(false);
  useEffect(() => {
    if (!name) {
      void playWav(null);
      setWavPlaying(false);
      return;
    }
    let live = true;
    void (async () => {
      const file = `${name}.wav`.toLowerCase();
      const key = `${dir}/${file}`;
      const url = picked.get(file) ?? (folder ? await folderFileUrl(`${dir}/${name}.wav`) : null);
      if (!live) return;
      // Found or not: the ♪ follows what is there now.
      setWavs((old) => {
        if (old.has(key) === !!url || picked.has(file)) return old;
        const next = new Set(old);
        if (url) next.add(key);
        else next.delete(key);
        return next;
      });
      if (!url || !wavLoop) {
        void playWav(null);
        setWavPlaying(false);
        return;
      }
      const ok = await playWav(url, wavVolume, styleNow.current);
      if (live) setWavPlaying(ok);
    })();
    return () => {
      live = false;
    };
    // The gain alone changes without restarting it (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavLoop, name, dir, picked, folder, tick]);
  useEffect(() => wavGain(wavVolume), [wavVolume]);
  // A new style: from the next loop (or the file again from its start, if that is far off).
  useEffect(() => setWavStyle(styleNow.current), [styleKey]);

  const update = (fn: (s: RehearseState) => RehearseState) => rehearseUpdate(fn);
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
  // The lists' rows only draw again when their own line changes, however many there are:
  // what they call stays the same from one draw to the next.
  const armNow = useRef(arm);
  armNow.current = arm;
  const pickText = useCallback((key: string) => rehearseUpdate((s) => ({ ...s, text: key })), []);
  const resetTextRow = useCallback(
    (key: string) => armNow.current(`rt-${key}`, () => rehearseUpdate((s) => resetText(s, key))),
    [],
  );
  const pickPhrase = useCallback((id: string) => rehearseUpdate((s) => select(s, id)), []);
  const resetPhraseRow = useCallback((id: string) => rehearseUpdate((s) => resetCount(s, id)), []);
  const removePhraseRow = useCallback(
    (id: string) => armNow.current(`rm-${id}`, () => rehearseUpdate((s) => removePhrase(s, id))),
    [],
  );

  const rep = () => {
    const text = activeText;
    if (!text) return;
    const t = Date.now();
    setClock(t);
    // A batch counts once its time has passed since the last tap that counted.
    const gate = tapReady(st, t);
    if (!gate.ready) {
      setTapNote(
        `${set.batch} reps take ${+(batchWait / 1000).toFixed(2)} s: ${(Math.ceil(gate.leftMs / 100) / 10).toFixed(1)} s to go`,
      );
      return;
    }
    setTapNote("");
    const n = set.batch;
    repXpFor(text, n);
    if (textsView) {
      // The phrase done: on to the next; after the last, a pass through the whole text.
      const key = textKeyNow;
      const count = total;
      const here = at;
      update((s) => textTap(s, key, count, t, n, here));
      // A pass through the whole text: done, and a check that it is all written right.
      if (here + 1 >= count && textNow) {
        flashToast(`“${textNow.name}”: pass ${prog.passes + 1} through it ✓`);
        setPassDone(key);
      }
      return;
    }
    if (!item) return;
    const id = item.id;
    update((s) => countRep(s, id, t, n));
  };
  // The floating window over other apps (the phone app): its taps count at once (rehearseRun), here or not.
  const [bubbleHere, setBubbleHere] = useState(false);
  const bubbleOn = useSyncExternalStore(subscribeRehearse, bubbleShown, bubbleShown);
  /** The app's battery use (the phone app): Unrestricted, so the phone never stops it in the background. */
  const [unrestricted, setUnrestricted] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void bubbleState().then((b) => {
      if (live) setBubbleHere(b.here);
    });
    void batteryUnrestricted().then((u) => {
      if (live) setUnrestricted(u);
    });
    return () => {
      live = false;
    };
  }, []);
  /** The window's look, as set here. */
  const bubbleLook = {
    phraseSp: set.bubblePhraseSp,
    barSp: set.bubbleBarSp,
    bottomSp: set.bubbleBottomSp,
    showBottom: set.bubbleBottom,
  };
  const bubbleSetup = (): BubbleSetup =>
    textsView
      ? {
          phrases: units.map((u, i) => ({
            id: bubbleId(i, textKeyNow),
            text: u.text,
            count: prog.reps,
          })),
          current: bubbleId(at, textKeyNow),
          batch: set.batch,
          waitMs: batchWait,
          lastTap: st.lastTap,
          advance: true,
          title: textNow?.name ?? "",
          passes: prog.passes,
          locked,
          ...bubbleLook,
        }
      : {
          phrases: st.items.map((i) => ({ id: i.id, text: i.text, count: i.count })),
          current: item?.id ?? "",
          batch: set.batch,
          waitMs: batchWait,
          lastTap: st.lastTap,
          advance: false,
          title: "",
          passes: 0,
          locked,
          ...bubbleLook,
        };
  // The window shows what is here: the phrases (or the text's), their counts, the batch and its wait.
  const bubbleKey = JSON.stringify(
    textsView
      ? [
          textKeyNow,
          textSumNow,
          at,
          prog.passes,
          prog.reps,
          set.batch,
          batchWait,
          st.lastTap,
          locked,
          bubbleLook,
        ]
      : [
          st.items.map((i) => [i.id, i.count]),
          item?.id,
          set.batch,
          batchWait,
          st.lastTap,
          locked,
          bubbleLook,
        ],
  );
  useEffect(() => {
    if (!bubbleOn) return;
    const id = window.setTimeout(() => void sendBubble(bubbleSetup()), 250);
    return () => window.clearTimeout(id);
    // bubbleKey holds everything the window shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleOn, bubbleKey]);
  const toggleBubble = async () => {
    if (bubbleOn) {
      await hideBubble();
      return;
    }
    const msg = await showBubble(bubbleSetup());
    if (msg) setTapNote(msg);
  };

  const press = (count: boolean) => {
    if (!activeText) return;
    // Unlocked: the settings work, and a tap does not count (nor sound).
    if (count && !locked) {
      setTapNote("Unlocked: taps don't count. Lock it to count them.");
      return;
    }
    // Locked: Hold to test waits too.
    if (!count && locked) return;
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

  const add = (list: string[], from: string) => {
    const r = addPhrases(st, list, Date.now());
    if (r.added) update(() => r.state);
    setNote(
      r.added
        ? `${r.added} phrase${r.added > 1 ? "s" : ""} added from ${from}.`
        : `Nothing new in ${from}.`,
    );
  };
  const addDraft = () => {
    const list = phrasesOf(draft, bySentence);
    if (!list.length) return;
    add(list, "what you wrote");
    setDraft("");
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: string[] = [];
    for (const f of Array.from(files)) list.push(...phrasesOf(await f.text(), bySentence));
    add(list, files.length > 1 ? `${files.length} files` : (files[0]?.name ?? "the file"));
    if (file.current) file.current.value = "";
  };
  /** Texts picked: each .zip a folder of its own, .txt files join the texts (the Read tab's, the same). */
  const importTexts = (files: FileList | null) => {
    const all = Array.from(files ?? []);
    for (const z of all.filter((f) => /\.zip$/i.test(f.name))) {
      void z
        .arrayBuffer()
        .then((buf) => unzipTexts(new Uint8Array(buf)))
        .then(
          (found) =>
            found.length
              ? loadTextFolder(
                  z.name,
                  found.map((f) => ({ name: f.name, raw: f.text })),
                )
              : flashToast(`No .txt files in ${z.name}`),
          (e: unknown) => flashToast(`${z.name}: ${String((e as Error)?.message ?? e)}`),
        );
    }
    const txt = all.filter((f) => !/\.zip$/i.test(f.name));
    if (txt.length)
      void Promise.all(txt.map(async (f) => ({ name: f.name, raw: await f.text() }))).then(
        (loaded) => loadCodexTexts(loaded),
        () => flashToast("Could not read that file"),
      );
    if (textFile.current) textFile.current.value = "";
  };

  // A text's phrase rewritten, into the text itself (the Read tab's too); and the text checked.
  useEffect(() => setEditing(null), [textKeyNow, at]);
  const saveEdit = () => {
    if (editing === null || !textNow || !unit) return;
    const next = editPhrase(textNow.lines, unit, editing);
    if (next.join("\n") !== textNow.lines.join("\n")) {
      if (!next.length) {
        flashToast("A text keeps at least one phrase: not saved");
        return;
      }
      updateText(textNow.name, next, textNow.folder);
      flashToast("Saved into the text (in the Read tab too)");
    }
    setEditing(null);
  };
  const confirmText = () => {
    if (!textNow) return;
    writeReader(markChecked(readReader(), textNow.name, textNow.lines, Date.now(), textNow.folder));
    setCheckTick((t) => t + 1);
    void saveConfirmed(textNow.name, textNow.lines, textNow.folder);
  };
  const rowChecks = useMemo(() => {
    const reader = readReader();
    return library.map((t) => checkState(reader, t.name, t.lines, t.folder));
    // checkTick: read again after this tab checks one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, checkTick]);

  const fit = activeText
    ? signalFit(
        rawSamples(phraseBytes(activeText), set.encoding === "pcm32" ? "pcm32" : "u8").length,
        set.rawRate,
        set.signalMs,
      )
    : null;
  const bytes = activeText ? phraseBytes(activeText).length : 0;
  const presetNow = presetOf(wavStyle);
  const presetName = WAV_PRESETS.find((p) => p.id === presetNow)?.name ?? "Custom";
  // Fitted again whenever the phrase, the sizes or what else the tap area shows change, and when it is resized.
  useLayoutEffect(fitPhrase, [
    fitPhrase,
    activeText,
    set.tapHeight,
    uiScale,
    tapNote,
    wavHere,
    textsView,
    locked,
  ]);
  useEffect(() => {
    const box = phraseBox.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fitPhrase());
    ro.observe(box);
    return () => ro.disconnect();
  }, [fitPhrase, activeText]);
  const tapHead = !locked
    ? "UNLOCKED · TAPS DON'T COUNT"
    : textsView
      ? set.batch > 1
        ? `TAP = ${set.batch} REPS DONE → NEXT · ONCE EVERY ${+(batchWait / 1000).toFixed(2)} S`
        : "TAP = DONE → NEXT PHRASE"
      : set.batch > 1
        ? `TAP = ${set.batch} REPS · ONCE EVERY ${+(batchWait / 1000).toFixed(2)} S`
        : "TAP = 1 REP · HOLD TO KEEP IT ON";

  return (
    <div>
      {emitter.picture}
      <p className="text-sm leading-relaxed text-muted">
        {textsView
          ? "A whole text, phrase after phrase: a tap does the phrase it is at and goes to the next. After the last, it counts a pass through the text and starts again."
          : "A tap is one rep of the whole phrase (a word is a phrase of one). Each tap can sound the phrase's own bytes and show them as a picture, as long as you hold it."}
      </p>
      <fieldset disabled={locked} className="mt-3 min-w-0">
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Rehearse">
          <button
            type="button"
            role="radio"
            aria-checked={!textsView}
            data-on={!textsView}
            className="btn tracking-normal normal-case"
            onClick={() => update((s) => ({ ...s, view: "phrases" }))}
          >
            Single phrases ({st.items.length})
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={textsView}
            data-on={textsView}
            className="btn tracking-normal normal-case"
            onClick={() => update((s) => ({ ...s, view: "texts" }))}
          >
            Whole texts ({library.length})
          </button>
        </div>
      </fieldset>
      {activeText ? (
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
            aria-label={
              textsView
                ? `Done${set.batch > 1 ? ` ×${set.batch}` : ""}, next: ${activeText}. Phrase ${at + 1} of ${total}`
                : `Rep${set.batch > 1 ? ` ×${set.batch}` : ""}: ${activeText}. ${item?.count ?? 0} so far`
            }
          >
            <span
              className={`font-display text-[0.65rem] tracking-[0.14em] ${locked ? "text-violet" : "text-gold"}`}
            >
              {tapHead}
            </span>
            {textsView && textNow && (
              <span className="max-w-full truncate text-[0.65rem] text-muted">
                {textNow.folder ? `${textNow.folder} / ` : ""}
                {textNow.name}
              </span>
            )}
            {/* The whole phrase, never cut off: its letters made smaller till it fits. */}
            <span
              ref={phraseBox}
              className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
            >
              <span ref={phraseEl} className="block w-full leading-snug break-words text-fg">
                {activeText}
              </span>
            </span>
            <span className="font-display text-3xl text-cyan" aria-live="polite">
              {textsView ? `${at + 1} / ${total}` : (item?.count ?? 0).toLocaleString()}
            </span>
            {textsView && (
              <span className="text-xs text-muted">
                {prog.passes.toLocaleString()} pass{prog.passes === 1 ? "" : "es"} ·{" "}
                {prog.reps.toLocaleString()} reps · {textPercent(at, total)}% ·{" "}
                {clock(prog.spentMs)} on it
              </span>
            )}
            {tapNote && (
              <span className="text-xs text-gold" role="status">
                {tapNote}
              </span>
            )}
            {wavHere && (
              <span className="text-[0.65rem] text-violet">
                ♪ {name}.wav{" "}
                {wavLoop
                  ? wavPlaying
                    ? `looping at ${Math.round(wavVolume * 100)}%${presetNow === "flat" ? "" : ` · ${presetName}`}`
                    : "loading…"
                  : "(off)"}
              </span>
            )}
          </button>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              className="btn stepper"
              onClick={() =>
                update((s) => (textsView ? textStep(s, textKeyNow, total, -1) : step(s, -1)))
              }
              disabled={locked || (textsView ? total : st.items.length) < 2}
              aria-label="Previous phrase"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 text-center text-xs text-muted">
              {textsView
                ? `Text ${textIndex + 1} of ${library.length} · phrase ${at + 1} of ${total}`
                : `Phrase ${index + 1} of ${st.items.length} · ${totalReps(st).toLocaleString()} reps in all`}{" "}
              · +{repXp(wordsOf(activeText), 1)} XP a rep
            </p>
            <button
              type="button"
              className="btn stepper"
              onClick={() =>
                update((s) => (textsView ? textStep(s, textKeyNow, total, 1) : step(s, 1)))
              }
              disabled={locked || (textsView ? total : st.items.length) < 2}
              aria-label="Next phrase"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </>
      ) : (
        <p className="glass mt-3 p-4 text-sm text-muted">
          {textsView
            ? "No phrases in this text. Choose another below, or edit it in the Read tab."
            : `No phrases yet. ${locked ? "Unlock below, then write" : "Write"} one, import a .txt, or add the loaded text's phrases.`}
        </p>
      )}
      <button
        type="button"
        className="btn mt-2 w-full tracking-normal normal-case"
        data-on={locked}
        aria-pressed={locked}
        onClick={() => {
          setOpt({ locked: !locked });
          setTapNote("");
        }}
      >
        {locked ? (
          <Lock className="size-4" aria-hidden />
        ) : (
          <LockOpen className="size-4" aria-hidden />
        )}
        {locked
          ? "Locked: only the tap works, everything else waits (tap to unlock)"
          : "Unlocked: settings work, taps don't count (tap to lock)"}
      </button>
      <fieldset disabled={locked} className="min-w-0">
        <div className="mt-2 grid grid-cols-2 gap-2">
          <SizeStep
            label="Screen"
            value={`${uiScale}%`}
            less={() => nudgeSetting("uiScale", -1)}
            more={() => nudgeSetting("uiScale", 1)}
          />
          <SizeStep
            label="Phrase"
            value={fitPx < set.phraseSize ? `${fitPx}/${set.phraseSize}` : `${set.phraseSize}`}
            less={() => setOpt({ phraseSize: clampPhraseSize(set.phraseSize - 2) })}
            more={() => setOpt({ phraseSize: clampPhraseSize(set.phraseSize + 2) })}
          />
        </div>
      </fieldset>
      {textsView && passDone === textKeyNow && textNow && (
        <div className="glass mt-2 space-y-2 border border-gold/60 p-3" role="status">
          <p className="text-sm text-gold">
            ✓ Pass {prog.passes} through “{textNow.name}” done · {clock(prog.spentMs)} on it in all.
            Is it all written right, no mistypes?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn tracking-normal normal-case"
              style={{ color: "#4ade80", borderColor: "#4ade80" }}
              data-on={armed === "check-done"}
              disabled={checked === "checked"}
              onClick={() =>
                arm("check-done", () => {
                  confirmText();
                  setPassDone(null);
                })
              }
            >
              <CircleCheck className="size-4" aria-hidden />
              {checked === "checked"
                ? "Checked ✓ already"
                : armed === "check-done"
                  ? "Tap again: save to confirmed_txt"
                  : "Checked: save to confirmed_txt"}
            </button>
            <button
              type="button"
              className="btn tracking-normal normal-case"
              onClick={() => setPassDone(null)}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {activeText && (
        <>
          <fieldset disabled={locked} className="min-w-0">
            {textsView && unit && (
              <div className="mt-2">
                <button
                  type="button"
                  className="btn mb-2 w-full tracking-normal normal-case"
                  onClick={() => requestReader(textKeyNow)}
                >
                  <BookOpen className="size-4" aria-hidden /> Read it in the reader (from phrase{" "}
                  {at + 1}, {textPercent(at, total)}%)
                </button>
                {editing === null ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn tracking-normal normal-case"
                      onClick={() => setEditing(unit.text)}
                    >
                      <Pencil className="size-4" aria-hidden /> Edit this phrase
                    </button>
                    <button
                      type="button"
                      className="btn tracking-normal normal-case"
                      style={
                        checked === "checked" ? { color: "#4ade80", borderColor: "#4ade80" } : {}
                      }
                      data-on={armed === "check"}
                      disabled={checked === "checked"}
                      onClick={() => arm("check", confirmText)}
                    >
                      <CircleCheck className="size-4" aria-hidden />
                      {checked === "checked"
                        ? "Checked ✓ (in confirmed_txt)"
                        : armed === "check"
                          ? "Tap again: save to confirmed_txt"
                          : checked === "changed"
                            ? "Checked again: save the new version"
                            : "Checked, all written right"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded border border-cyan/40 bg-transparent p-2 text-sm text-fg"
                      rows={3}
                      value={editing}
                      onChange={(e) => setEditing(e.target.value)}
                      aria-label="This phrase, rewritten"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className="btn btn-gold" onClick={saveEdit}>
                        Save into the text
                      </button>
                      <button type="button" className="btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                    <p className="text-[0.65rem] leading-snug text-muted">
                      Saved into the text in its place, the Read tab's too (empty takes the phrase
                      out). Check it again after, to save the new version to confirmed_txt.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div
              className="mt-2 grid grid-cols-5 items-center gap-1"
              role="radiogroup"
              aria-label="Reps a tap"
            >
              <span className="text-[0.65rem] leading-tight text-muted">Reps a tap</span>
              {[1, 10, 20, 30].map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={set.batch === b}
                  data-on={set.batch === b}
                  className="btn px-1"
                  onClick={() => setOpt({ batch: b })}
                >
                  ×{b}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn select-none"
              style={{ touchAction: "none" }}
              disabled={locked}
              {...holdProps(false)}
            >
              Hold to test (no rep)
            </button>
            <button
              type="button"
              className="btn"
              data-on={tune}
              aria-pressed={tune}
              disabled={locked}
              onClick={() => setTune((t) => !t)}
            >
              <Settings2 className="size-4" aria-hidden /> Sound and picture
            </button>
          </div>
          {bubbleHere && (
            <button
              type="button"
              className="btn mt-2 w-full tracking-normal normal-case"
              data-on={bubbleOn}
              aria-pressed={bubbleOn}
              disabled={locked}
              onClick={() => void toggleBubble()}
            >
              <PictureInPicture2 className="size-4" aria-hidden />
              {bubbleOn
                ? "Floating window on: tap it over other apps (tap here to close it)"
                : "Floating window over other apps: tap it to count reps"}
            </button>
          )}
          {bubbleHere && (
            <fieldset disabled={locked} className="mt-2 min-w-0">
              <div className="grid grid-cols-3 gap-1">
                <SizeStep
                  label="Its phrase"
                  value={`${set.bubblePhraseSp}`}
                  less={() => setOpt({ bubblePhraseSp: clampBubbleSp(set.bubblePhraseSp - 1) })}
                  more={() => setOpt({ bubblePhraseSp: clampBubbleSp(set.bubblePhraseSp + 1) })}
                />
                <SizeStep
                  label="Its top bar"
                  value={`${set.bubbleBarSp}`}
                  less={() => setOpt({ bubbleBarSp: Math.max(8, set.bubbleBarSp - 1) })}
                  more={() => setOpt({ bubbleBarSp: Math.min(48, set.bubbleBarSp + 1) })}
                />
                <SizeStep
                  label="Its bottom"
                  value={`${set.bubbleBottomSp}`}
                  less={() => setOpt({ bubbleBottomSp: Math.max(6, set.bubbleBottomSp - 1) })}
                  more={() => setOpt({ bubbleBottomSp: Math.min(48, set.bubbleBottomSp + 1) })}
                />
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Toggle
                  label="Its bottom line (count)"
                  on={set.bubbleBottom}
                  flip={() => setOpt({ bubbleBottom: !set.bubbleBottom })}
                />
                <button
                  type="button"
                  className="btn tracking-normal normal-case"
                  onClick={() => {
                    void resetBubblePlace();
                    setTapNote("Floating window: back in the middle, at its first size.");
                  }}
                >
                  Reset its place and size
                </button>
              </div>
            </fieldset>
          )}
          <fieldset disabled={locked} className="min-w-0">
            <div className="mt-2">
              <Toggle
                label={`Nonstop: its sound all the time${mode === "cycle" ? " (rising cycle)" : ""}`}
                on={nonstop}
                flip={() => setOpt({ nonstop: !nonstop, sound: true })}
              />
            </div>
            <div className="mt-2">
              <Toggle
                label="Background: its sound plays on away from here (other tabs, other apps)"
                on={set.background}
                flip={() => setOpt({ background: !set.background })}
              />
            </div>
            {unrestricted !== null && (
              <button
                type="button"
                className="btn mt-2 w-full tracking-normal normal-case"
                data-on={unrestricted}
                onClick={() =>
                  void askUnrestricted().then((u) => setUnrestricted(u ?? unrestricted))
                }
              >
                {unrestricted
                  ? "Battery: Unrestricted ✓, the app always runs (tap: its settings)"
                  : "Battery: optimized, the phone may stop it. Tap: Unrestricted"}
              </button>
            )}
            {wavHere && (
              <div className="mt-2 space-y-1.5">
                <Toggle
                  label={`Its .wav in a loop (${name}.wav)`}
                  on={wavLoop}
                  flip={() => setOpt({ wavLoop: !wavLoop })}
                />
                <Num
                  label="WAV volume (1 the file as it is; above 1 clips)"
                  value={wavVolume}
                  step={0.05}
                  digits={2}
                  set={(v) => setOpt({ wavVolume: clampAmp(v) })}
                />
                <button
                  type="button"
                  className="btn w-full justify-between px-2 tracking-normal normal-case"
                  data-on={wavTune}
                  aria-pressed={wavTune}
                  onClick={() => setWavTune((v) => !v)}
                >
                  <span>WAV style: {presetName}</span>
                  <span className="font-display text-[0.6rem] tracking-wider uppercase">
                    {wavTune ? "Close" : "Change"}
                  </span>
                </button>
                {wavTune && (
                  <div className="glass space-y-1.5 p-2">
                    <div
                      className="grid grid-cols-2 gap-1"
                      role="radiogroup"
                      aria-label="WAV style presets"
                    >
                      {WAV_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={presetNow === p.id}
                          data-on={presetNow === p.id}
                          className="btn px-1 text-[0.65rem] tracking-normal normal-case"
                          onClick={() => setOpt(wavSettingsOf(p.style))}
                        >
                          {p.name}
                        </button>
                      ))}
                      <span
                        className="btn px-1 text-[0.65rem] tracking-normal normal-case"
                        data-on={presetNow === "custom"}
                        aria-hidden
                      >
                        Custom (set below)
                      </span>
                    </div>
                    <p className="pt-1 text-[0.65rem] text-muted">Within each loop:</p>
                    <div
                      className="grid grid-cols-5 gap-1"
                      role="radiogroup"
                      aria-label="Shape within each loop"
                    >
                      {WAV_SHAPES.map((sh) => (
                        <button
                          key={sh}
                          type="button"
                          role="radio"
                          aria-checked={set.wavShape === sh}
                          data-on={set.wavShape === sh}
                          className="btn px-0.5 text-[0.6rem] tracking-normal normal-case"
                          onClick={() => setOpt({ wavShape: sh })}
                        >
                          {SHAPE_NAMES[sh]}
                        </button>
                      ))}
                    </div>
                    {set.wavShape === "fade" && (
                      <>
                        <Num
                          label="Fade in (share of a cycle)"
                          value={set.wavFadeIn}
                          step={0.01}
                          digits={2}
                          set={(v) => setOpt({ wavFadeIn: clampFade(v) })}
                        />
                        <Num
                          label="Fade out (share of a cycle)"
                          value={set.wavFadeOut}
                          step={0.01}
                          digits={2}
                          set={(v) => setOpt({ wavFadeOut: clampFade(v) })}
                        />
                        <p className="text-[0.65rem] text-muted">
                          Middle: {Math.max(0, 1 - set.wavFadeIn - set.wavFadeOut).toFixed(2)} (the
                          rest)
                        </p>
                      </>
                    )}
                    {set.wavShape !== "flat" && (
                      <>
                        <Num
                          label="Cycles a loop"
                          value={set.wavCycles}
                          step={1}
                          set={(v) => setOpt({ wavCycles: clampCycles(v) })}
                        />
                        <Num
                          label="Depth (1: down to silence)"
                          value={set.wavDepth}
                          step={0.05}
                          digits={2}
                          set={(v) => setOpt({ wavDepth: clampFade(v) })}
                        />
                      </>
                    )}
                    <LevelsField
                      levels={set.wavLevels}
                      set={(wavLevels) => setOpt({ wavLevels })}
                    />
                    <p className="text-[0.65rem] leading-snug text-muted">
                      Only the loudness changes, on playback: the file's sound itself plays as it
                      is. Levels are each loop's in turn, then round again, times the WAV volume (1
                      is the file as it is; above 1 is louder, and a file already at full loudness
                      then clips).
                    </p>
                  </div>
                )}
              </div>
            )}
          </fieldset>
        </>
      )}

      {tune && (
        <fieldset disabled={locked} className="glass mt-2 min-w-0 space-y-1.5 p-3">
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
          <p className="pt-1 text-[0.65rem] text-muted">Its bytes as samples:</p>
          <div
            className="grid grid-cols-3 gap-1"
            role="radiogroup"
            aria-label="Its bytes as samples"
          >
            {(
              [
                ["u8", "8-bit (a byte each)"],
                ["pcm32", "PCM 32 (4 bytes each)"],
                ["both", "Both, mixed"],
              ] as const
            ).map(([e, label]) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={set.encoding === e}
                data-on={set.encoding === e}
                className="btn px-1 text-[0.65rem] tracking-normal normal-case"
                onClick={() => setOpt({ encoding: e })}
              >
                {label}
              </button>
            ))}
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
            label="Reps a tap"
            value={set.batch}
            step={1}
            set={(v) => setOpt({ batch: clampBatch(v) })}
          />
          <Num
            label="Seconds a rep (a batch's wait)"
            value={set.repSeconds}
            step={0.01}
            digits={2}
            set={(v) => setOpt({ repSeconds: clampRepSeconds(v) })}
          />
          <Num
            label="Length of one play (ms), looped"
            value={set.signalMs}
            step={100}
            set={(v) => setOpt({ signalMs: clampSignalMs(v) })}
          />
          <p className="text-[0.65rem] leading-snug text-muted">
            One play is the phrase fitted to this length (repeated if shorter, sped up if longer).
            Nonstop plays it over and over with no gap, on the same phrase, till you tap it done:
            then the next phrase's sound takes over at once (never before). A tap plays it, looping,
            as long as you hold it.
          </p>
          <Num
            label="Peak loudness (1 full; above 1 clips: louder, harsher)"
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
          <VoicePanel set={set} setOpt={setOpt} note={voiceNote} />
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
        </fieldset>
      )}

      <fieldset disabled={locked} className="min-w-0">
        {textsView ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="btn w-full tracking-normal normal-case"
              onClick={() => textFile.current?.click()}
            >
              <Upload className="size-4" aria-hidden /> Import .txt or .zip (joins the Read tab's
              texts)
            </button>
            <input
              ref={textFile}
              type="file"
              accept=".txt,.zip,text/plain,application/zip"
              multiple
              className="hidden"
              aria-label="Import texts"
              onChange={(e) => importTexts(e.target.files)}
            />
            <p className="text-[0.65rem] leading-snug text-muted">
              The same texts as the Read tab: edited or checked here, they are edited or checked
              there too. Each text keeps its own place, passes and reps here.
            </p>
          </div>
        ) : (
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
        )}

        <div className="glass mt-4 space-y-2 p-3">
          <p className="font-display text-[0.6rem] tracking-[0.14em] text-violet">
            {textsView
              ? "AZS-FOLDER · EACH TEXT A .TXT, ITS .WAV NEXT TO IT"
              : "AZS-FOLDER · EACH PHRASE A .TXT, ITS .WAV NEXT TO IT"}
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
                    disabled={textsView ? !library.length : !st.items.length}
                  >
                    {textsView ? "Save all texts again" : "Save all phrases again"}
                  </button>
                  <button
                    type="button"
                    className="btn tracking-normal normal-case"
                    onClick={() =>
                      void lookForWavs().then((found) => {
                        const n = found[dir] ?? 0;
                        setFolderNote(`${n} .wav file${n === 1 ? "" : "s"} in ${dir}.`);
                      })
                    }
                  >
                    Look for .wav files
                  </button>
                </div>
              )}
              {folder && textsView && newTextFiles.length > 0 && (
                <button
                  type="button"
                  className="btn w-full tracking-normal normal-case"
                  onClick={() => void loadNewTexts()}
                >
                  Load {newTextFiles.length} new text{newTextFiles.length === 1 ? "" : "s"} from{" "}
                  {TEXT_FOLDER}
                </button>
              )}
              {folder && !textsView && newPhrases.length > 0 && (
                <button
                  type="button"
                  className="btn w-full tracking-normal normal-case"
                  onClick={() => {
                    add(newPhrases, PHRASE_FOLDER);
                    setNewPhrases([]);
                  }}
                >
                  Add {newPhrases.length} new phrase{newPhrases.length === 1 ? "" : "s"} from{" "}
                  {PHRASE_FOLDER}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted">
                The azs-folder is in the Android app. Here, load .wav files named like the{" "}
                {textsView ? "texts" : "phrases"}.
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
            {textsView
              ? `Each text is saved by itself as ${TEXT_FOLDER}/<text>.txt (again when it is edited), a text from a .zip as “<folder> - <text>”. Put its sound next to it with the same name, .wav: choosing the text here loops it, in the WAV style. A .txt you put there yourself can be loaded as a new text.`
              : `Each phrase is saved by itself as ${PHRASE_FOLDER}/<phrase>.txt (all of them when the folder is chosen, and each new one as it is added). Make its sound outside (Termux) and put it next to it with the same name, .wav: choosing the phrase here looks for it right then and loops it, as it is, at the WAV volume (also when you come back to the app).`}
          </p>
          {folderNote && (
            <p className="text-xs text-gold" role="status">
              {folderNote}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <p className="min-w-0 flex-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">
            {textsView
              ? `YOUR TEXTS · ${library.length.toLocaleString()} · ${phraseCounts.reduce((n, c) => n + c, 0).toLocaleString()} PHRASES IN ALL · TAP ONE TO REHEARSE IT`
              : `YOUR PHRASES · ${st.items.length.toLocaleString()} · TAP ONE TO REHEARSE IT`}
          </p>
          <button
            type="button"
            className="btn tracking-normal normal-case"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label={
              folder
                ? `Refresh: read ${dir} in the azs-folder again, for files changed or added outside the app`
                : "Refresh the list"
            }
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshing ? "Reading…" : "Refresh"}
          </button>
        </div>
        {refreshNote && (
          <p className="mt-1 text-xs text-gold" role="status">
            {refreshNote}
          </p>
        )}
        {textsView ? (
          <>
            <ul className="mt-2 max-h-[45dvh] overflow-y-auto" aria-label="Texts and their passes">
              {library.map((t, i) => {
                const p = textProgress(st, t.key);
                const n = phraseCounts[i] ?? 0;
                return (
                  <TextRow
                    key={t.key}
                    tkey={t.key}
                    index={i}
                    name={t.name}
                    folder={t.folder ?? ""}
                    current={t.key === textKeyNow}
                    wav={hasWav(textNames[i] ?? "", TEXT_FOLDER)}
                    checked={rowChecks[i] === "checked"}
                    at={Math.min(p.at, Math.max(0, n - 1))}
                    total={n}
                    passes={p.passes}
                    reps={p.reps}
                    armed={armed === `rt-${t.key}`}
                    onPick={pickText}
                    onReset={resetTextRow}
                  />
                );
              })}
            </ul>
            <div className="mt-2">
              <button
                type="button"
                className="btn w-full tracking-normal normal-case"
                data-on={armed === "zero-texts"}
                onClick={() => arm("zero-texts", () => update((s) => ({ ...s, progress: {} })))}
                disabled={!Object.keys(st.progress).length}
              >
                {armed === "zero-texts"
                  ? "Tap again: every text's progress back to 0"
                  : "Reset all progress: every text back to phrase 1, 0 passes, 0 reps"}
              </button>
              <p className="mt-1 text-[0.65rem] leading-snug text-muted">
                This only clears where you are in each text and what you have counted. The texts
                themselves stay. The ↺ beside a text does the same for that one text.
              </p>
            </div>
          </>
        ) : (
          st.items.length > 0 && (
            <>
              <ul
                className="mt-2 max-h-[45dvh] overflow-y-auto"
                aria-label="Phrases and their reps"
              >
                {st.items.map((it, i) => (
                  <PhraseRow
                    key={it.id}
                    id={it.id}
                    index={i}
                    text={it.text}
                    count={it.count}
                    current={it.id === item?.id}
                    wav={hasWav(names[i] ?? "")}
                    armed={armed === `rm-${it.id}`}
                    onPick={pickPhrase}
                    onReset={resetPhraseRow}
                    onRemove={removePhraseRow}
                  />
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
                  {armed === "zero"
                    ? "Tap again: all counts to 0"
                    : "Reset all counts to 0 (phrases stay)"}
                </button>
                <button
                  type="button"
                  className="btn tracking-normal normal-case"
                  data-on={armed === "clear"}
                  onClick={() =>
                    arm("clear", () => update((s) => ({ ...s, items: [], current: "" })))
                  }
                >
                  {armed === "clear" ? "Tap again: remove all" : "Remove all phrases"}
                </button>
              </div>
            </>
          )
        )}
      </fieldset>
    </div>
  );
}

/** A text in the list: its name, where you are in it, its reps, and the button that starts it over. */
const TextRow = memo(function TextRow(p: {
  tkey: string;
  index: number;
  name: string;
  folder: string;
  current: boolean;
  wav: boolean;
  checked: boolean;
  at: number;
  total: number;
  passes: number;
  reps: number;
  armed: boolean;
  onPick: (key: string) => void;
  onReset: (key: string) => void;
}) {
  return (
    <li
      className={`flex items-center gap-1 border-b border-cyan/10 py-1 ${p.current ? "bg-violet/15" : ""}`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 py-1 text-left text-sm text-fg"
        onClick={() => p.onPick(p.tkey)}
        aria-current={p.current}
      >
        <span className="block truncate">
          <span className="text-muted">{p.index + 1}.</span> {p.wav ? "♪ " : ""}
          {p.checked ? "✓ " : ""}
          {p.folder ? <span className="text-muted">{p.folder} / </span> : null}
          {p.name}
        </span>
        <span className="block text-[0.65rem] text-muted">
          phrase {(p.at + 1).toLocaleString()} of {p.total.toLocaleString()} · {p.passes} pass
          {p.passes === 1 ? "" : "es"}
        </span>
      </button>
      <span className="w-12 text-right font-display text-xs text-cyan">
        {p.reps.toLocaleString()}
      </span>
      <button
        type="button"
        className="btn stepper"
        data-on={p.armed}
        onClick={() => p.onReset(p.tkey)}
        disabled={!p.reps && !p.at && !p.passes}
        aria-label={
          p.armed
            ? `Tap again to start over: ${p.name}`
            : `Start over (place, passes and reps): ${p.name}`
        }
      >
        <RotateCcw className="size-4" aria-hidden />
      </button>
    </li>
  );
});

/** A phrase in the list: its words, its reps, and the buttons that reset its count or take it out. */
const PhraseRow = memo(function PhraseRow(p: {
  id: string;
  index: number;
  text: string;
  count: number;
  current: boolean;
  wav: boolean;
  armed: boolean;
  onPick: (id: string) => void;
  onReset: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li
      className={`flex items-center gap-1 border-b border-cyan/10 py-1 ${p.current ? "bg-violet/15" : ""}`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 truncate py-2 text-left text-sm text-fg"
        onClick={() => p.onPick(p.id)}
        aria-current={p.current}
      >
        <span className="text-muted">{p.index + 1}.</span> {p.wav ? "♪ " : ""}
        {p.text}
      </button>
      <span className="w-12 text-right font-display text-xs text-cyan">
        {p.count.toLocaleString()}
      </span>
      <button
        type="button"
        className="btn stepper"
        onClick={() => p.onReset(p.id)}
        disabled={!p.count}
        aria-label={`Reset the count of: ${p.text}`}
      >
        <RotateCcw className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className="btn stepper"
        data-on={p.armed}
        onClick={() => p.onRemove(p.id)}
        aria-label={p.armed ? `Tap again to remove: ${p.text}` : `Remove: ${p.text}`}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
});

/** Each loop's level in turn, typed as numbers apart ("0.5, 0.5, 2, 1"). */
function LevelsField({ levels, set }: { levels: number[]; set: (v: number[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = parseLevels(text);
    if (v) set(v);
    setText(null);
  };
  return (
    <label className="block text-xs">
      <span className="text-muted">Each loop's level in turn (e.g. 1 · 0.5, 0.5, 2, 1)</span>
      <input
        className="mt-1 w-full rounded border border-cyan/40 bg-transparent px-2 py-2 text-fg"
        inputMode="decimal"
        value={text ?? levelsText(levels)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        aria-label="Each loop's level in turn"
      />
    </label>
  );
}

/** A size with − and +: the screen's, or the phrase's. */
function SizeStep({
  label,
  value,
  less,
  more,
}: {
  label: string;
  value: string;
  less: () => void;
  more: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="btn stepper"
          onClick={less}
          aria-label={`${label}: smaller`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="min-w-10 text-center text-fg">{value}</span>
        <button
          type="button"
          className="btn stepper"
          onClick={more}
          aria-label={`${label}: bigger`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}

/** The robot voice's settings: engine and voice, presets, rate, pitch, copies, speed-ups, gap, robot. */
function VoicePanel({
  set,
  setOpt,
  note,
}: {
  set: RehearseSettings;
  setOpt: (next: Partial<RehearseSettings>) => void;
  note: string;
}) {
  const [where, setWhere] = useState<"phone" | "browser" | null>(null);
  const [engines, setEngines] = useState<{ name: string; label: string }[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  useEffect(() => {
    let live = true;
    void voiceHere().then((w) => live && setWhere(w));
    void voiceEngines().then((e) => live && setEngines(e));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!set.voice) return;
    let live = true;
    void voiceList(set.voiceEngine).then((v) => live && setVoices(v));
    return () => {
      live = false;
    };
  }, [set.voice, set.voiceEngine]);
  const preset = voicePresetOf(set);
  return (
    <>
      <p className="pt-1 font-display text-[0.6rem] tracking-[0.14em] text-violet">
        THE ROBOT VOICE: THE PHONE'S TEXT-TO-SPEECH
      </p>
      <Toggle
        label="Robot voice: it says the phrase"
        on={set.voice}
        flip={() => setOpt({ voice: !set.voice })}
      />
      {set.voice && (
        <>
          {where === "phone" && (
            <label className="block text-xs">
              <span className="text-muted">Voice engine</span>
              <select
                className="mt-1 w-full rounded border border-cyan/40 bg-bg p-2 text-fg"
                value={set.voiceEngine}
                onChange={(e) => setOpt({ voiceEngine: e.target.value, voiceName: "" })}
                aria-label="Voice engine"
              >
                <option value="">The phone's default</option>
                {engines.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            <span className="text-muted">Voice ({voices.length})</span>
            <select
              className="mt-1 w-full rounded border border-cyan/40 bg-bg p-2 text-fg"
              value={set.voiceName}
              onChange={(e) => setOpt({ voiceName: e.target.value })}
              aria-label="Voice"
            >
              <option value="">The engine's default</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.locale} · {v.name}
                  {v.network ? " (online)" : ""}
                  {v.notInstalled ? " (not installed)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Voice presets">
            {VOICE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                data-on={preset === p.id}
                className="btn px-1 text-[0.65rem] tracking-normal normal-case"
                onClick={() => setOpt(p.shape)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <Num
            label="Speaking rate (1 as it is)"
            value={set.voiceRate}
            step={0.1}
            digits={2}
            set={(v) => setOpt({ voiceRate: clampVoiceRate(v) })}
          />
          <Num
            label="Pitch (1 as it is)"
            value={set.voicePitch}
            step={0.1}
            digits={2}
            set={(v) => setOpt({ voicePitch: clampVoicePitch(v) })}
          />
          <Num
            label="Copies at once"
            value={set.voiceCopies}
            step={1}
            set={(v) => setOpt({ voiceCopies: clampVoiceCopies(v) })}
          />
          <Num
            label="Each copy starts after (ms)"
            value={set.voiceSpreadMs}
            step={10}
            set={(v) => setOpt({ voiceSpreadMs: clampVoiceMs(v) })}
          />
          <Num
            label="Each copy faster (×, pitch and pace)"
            value={set.voiceSpeedUp}
            step={0.05}
            digits={2}
            set={(v) => setOpt({ voiceSpeedUp: clampVoiceSpeedUp(v) })}
          />
          <Toggle
            label="Over and over while on the phrase"
            on={set.voiceLoop}
            flip={() => setOpt({ voiceLoop: !set.voiceLoop })}
          />
          <Num
            label="Silence between (ms)"
            value={set.voiceGapMs}
            step={50}
            set={(v) => setOpt({ voiceGapMs: clampVoiceMs(v) })}
          />
          <Num
            label="Robot (0 none, 1 all)"
            value={set.voiceRobot}
            step={0.05}
            digits={2}
            set={(v) => setOpt({ voiceRobot: clampRobot(v) })}
          />
          <Num
            label="Robot tone (Hz)"
            value={set.voiceRobotHz}
            step={5}
            set={(v) => setOpt({ voiceRobotHz: clampRobotHz(v) })}
          />
          <Num
            label="Voice volume (1 as it is; above 1 clips)"
            value={set.voiceVolume}
            step={0.1}
            digits={2}
            set={(v) => setOpt({ voiceVolume: clampAmp(v) })}
          />
          <p className="text-[0.65rem] leading-snug text-muted">
            {where === "browser"
              ? "Here the browser's own voice says it (its voice, rate and pitch, one copy). The copies, speed-ups and the robot are in the Android app."
              : "Said by the phone's text-to-speech, then played here: copies drift apart as each loops at its own speed. For truly robotic voices, install a voice engine such as eSpeak NG and choose it above (or set it in Android's Text-to-speech settings)."}
          </p>
          {note && (
            <p className="text-xs text-gold" role="status">
              {note}
            </p>
          )}
        </>
      )}
    </>
  );
}
