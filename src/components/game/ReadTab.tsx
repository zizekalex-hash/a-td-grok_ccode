import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Lock,
  LockOpen,
  LogOut,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { CONFIG } from "@/game/config";
import { flashToast, grantSkillXp, loadCodexTexts, removeText, updateText } from "@/game/engine";
import { levelForXp, repXp } from "@/game/recite";
import { clock, logRead, readReps, writeReps } from "@/game/reps";
import {
  ACCENT_NAMES,
  ACCENTS,
  BYTES_MODES,
  clampFlashEvery,
  clampFlashMs,
  clampFlashSize,
  clampFps,
  clampOpacity,
  clampPanelOpacity,
  clampPasses,
  clampPhraseChars,
  clampPhraseSize,
  clampPlace,
  clampSpeed,
  clampWordMs,
  clampWordSize,
  editPhrase,
  FONTS,
  newReader,
  nudge,
  PANEL_TABS,
  passAt,
  percentDone,
  placeOf,
  readReader,
  readUnits,
  setPlace,
  textKey,
  wordTime,
  writeReader,
  type BytesMode,
  type PanelTab,
  type ReaderFont,
  type ReaderState,
} from "@/game/readtext";
import { bytesPicture, flashPages, wrapWords } from "@/game/readview";
import { holdRest } from "@/game/rest";
import { useGame } from "@/game/store";

const R = CONFIG.reader;
const FONT_CLASS: Record<ReaderFont, string> = {
  display: "font-display",
  plain: "font-sans",
  mono: "font-mono",
};
const FONT_NAME: Record<ReaderFont, string> = { display: "Display", plain: "Plain", mono: "Mono" };
const TAB_NAME: Record<PanelTab, string> = {
  play: "Play",
  look: "Look",
  bytes: "Bytes",
  flash: "Flash",
};
const CHARS_STEPS: [number, number][] = [
  [20, 1],
  [Infinity, 5],
];

/** Step sizes: fine low down, coarser higher up. */
const OPACITY_STEPS: [number, number][] = [
  [0.1, 0.01],
  [0.4, 0.02],
  [Infinity, 0.05],
];
const EVERY_STEPS: [number, number][] = [
  [10, 0.1],
  [60, 1],
  [Infinity, 5],
];
const MS_STEPS: [number, number][] = [
  [10, 0.1],
  [100, 1],
  [Infinity, 10],
];
const PX_STEPS: [number, number][] = [
  [12, 0.5],
  [Infinity, 1],
];

/** A text to read: its name and lines. */
interface OpenText {
  name: string;
  lines: string[];
}

/** "notes.txt", safe for a file name (or "notes.png"). */
function fileName(name: string, ext = "txt"): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "text";
  const base = clean.replace(/\.txt$/i, "");
  return `${base}.${ext}`;
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * A file out of the app: on the phone, the share sheet (save it to Files,
 * Drive, a chat, a computer, …); in a browser, a download.
 */
async function saveFile(file: string, blob: Blob, title: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const out = await Filesystem.writeFile({
        path: file,
        data: await base64Of(blob),
        directory: Directory.Cache,
      });
      await Share.share({ title: file, dialogTitle: title, files: [out.uri] });
      return;
    }
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  flashToast(`Saved ${file}`);
}

/** A text as a .txt. */
async function exportText(name: string, lines: string[]) {
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
  await saveFile(fileName(name), blob, "Save or send the text");
}

/** The whole text's bytes, as the background draws them. */
function textBytes(lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join("\n"));
}

/** The screen's size in device pixels (at most 2048 on the long side), for the bytes picture. */
function screenPixels(): { w: number; h: number } {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  let w = Math.max(1, Math.round(window.innerWidth * dpr));
  let h = Math.max(1, Math.round(window.innerHeight * dpr));
  const k = Math.min(1, 2048 / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  return { w, h };
}

/** One byte picture on a canvas of its own size. */
function pictureCanvas(bytes: Uint8Array, mode: BytesMode, aspect: number): HTMLCanvasElement {
  const pic = bytesPicture(bytes, mode, aspect);
  const c = document.createElement("canvas");
  c.width = pic.width;
  c.height = pic.height;
  c.getContext("2d")?.putImageData(new ImageData(pic.data, pic.width, pic.height), 0, 0);
  return c;
}

/**
 * The three byte pictures on one canvas of w × h, each at its own opacity,
 * blended with "screen" (light adds up: none hides another).
 */
function drawLayers(
  c: HTMLCanvasElement,
  pictures: (mode: BytesMode) => HTMLCanvasElement,
  layers: Record<BytesMode, number>,
  sharp: boolean,
  w: number,
  h: number,
) {
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = !sharp;
  ctx.globalCompositeOperation = "screen";
  for (const m of BYTES_MODES) {
    if (layers[m] <= 0) continue;
    ctx.globalAlpha = layers[m];
    ctx.drawImage(pictures(m), 0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** The bytes picture as a .png, as the background shows it (at full strength). */
async function exportPicture(
  name: string,
  lines: string[],
  layers: Record<BytesMode, number>,
  sharp: boolean,
) {
  const { w, h } = screenPixels();
  const bytes = textBytes(lines);
  const c = document.createElement("canvas");
  drawLayers(c, (m) => pictureCanvas(bytes, m, w / h), layers, sharp, w, h);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) {
    flashToast("Could not make the picture");
    return;
  }
  await saveFile(fileName(name, "png"), blob, "Save or send the picture");
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
    () => (custom && texts.length ? texts : [{ name: "Built-in text", lines }]),
    [custom, texts, lines],
  );

  const save = (next: ReaderState) => {
    setReader(next);
    writeReader(next);
  };

  const openText = (t: OpenText) => {
    if (!readUnits(t.lines).length) {
      flashToast("No phrases in that text");
      return;
    }
    setOpen({ name: t.name, lines: t.lines });
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
        each; fix a phrase while reading (Edit), and take any text out as a .txt (⬇).
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
          const at = placeOf(reader, textKey(t.name), Number.MAX_SAFE_INTEGER);
          return (
            <li key={`${i}-${t.name}`} className="rounded-md border border-cyan/25 p-2">
              <div className="flex items-center gap-1.5">
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
                    {t.lines.length.toLocaleString()} line{t.lines.length === 1 ? "" : "s"}
                    {at > 0 ? ` · go on from phrase ${(at + 1).toLocaleString()}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-gold shrink-0 px-2"
                  onClick={() => openText(t)}
                  aria-label={`Read ${t.name}`}
                >
                  <Play className="size-4" aria-hidden />
                  {at > 0 ? "Go on" : "Read"}
                </button>
                <button
                  type="button"
                  className="btn shrink-0 px-2"
                  onClick={() => void exportText(t.name, t.lines)}
                  aria-label={`Export ${t.name} as .txt`}
                >
                  <Download className="size-4" aria-hidden />
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

/** An on/off button for the reader's panel. */
function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn min-h-10 px-1"
      data-on={on}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The whole text as a picture: its raw bytes as pixels in three layers (RGB:
 * three bytes a pixel; Gray: one; Bits: one bit a pixel), each at its own
 * opacity, blended so none hides another, shaped like the screen and stretched
 * over all of it, with one opacity over all. Drawn once, into one still canvas
 * (again only when the text or a layer changes).
 */
function BytesBackground({
  lines,
  layers,
  opacity,
  sharp,
}: {
  lines: string[];
  layers: Record<BytesMode, number>;
  opacity: number;
  sharp: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size] = useState(screenPixels);
  const bytes = useMemo(() => textBytes(lines), [lines]);
  // Each layer's own picture, made once for this text.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new store for each text's bytes
  const made = useMemo(() => new Map<BytesMode, HTMLCanvasElement>(), [bytes]);
  const { rgb, gray, bits } = layers;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const pictures = (m: BytesMode) => {
      let p = made.get(m);
      if (!p) {
        p = pictureCanvas(bytes, m, size.w / size.h);
        made.set(m, p);
      }
      return p;
    };
    drawLayers(c, pictures, { rgb, gray, bits }, sharp, size.w, size.h);
  }, [bytes, made, rgb, gray, bits, sharp, size]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-bytes={BYTES_MODES.filter((m) => layers[m] > 0).join(" ")}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
    />
  );
}

/**
 * The whole text flashed: every `every` seconds, a screen of it for `ms`
 * milliseconds (at least one frame), tiny and faint. Each screen holds as many
 * whole phrases as fit; the next flash shows the next screen, through the whole
 * text and round again. The flash is drawn straight into the page, not by React.
 */
function SubliminalFlash({
  phrases,
  every,
  ms,
  size,
  opacity,
  font,
  running,
  onScreens,
  test,
}: {
  phrases: string[];
  every: number;
  ms: number;
  size: number;
  opacity: number;
  font: string;
  running: boolean;
  onScreens: (n: number) => void;
  /** Set here: a flash now, for ms at an opacity (the Test buttons). */
  test: MutableRefObject<((ms: number, opacity: number) => void) | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const pages = useRef<string[]>([]);
  const next = useRef(0);
  const frame = useRef(0);
  const hide = useRef(0);
  const latest = useRef({ ms, opacity });

  useEffect(() => {
    latest.current = { ms, opacity };
  }, [ms, opacity]);

  /** The next screen of the text: shown in the next frame, gone ms later (a frame at the least). */
  const show = useCallback((forMs: number, atOpacity: number) => {
    const el = box.current;
    const list = pages.current;
    if (!el || !list.length) return;
    const k = next.current % list.length;
    next.current = (k + 1) % list.length;
    cancelAnimationFrame(frame.current);
    window.clearTimeout(hide.current);
    frame.current = requestAnimationFrame(() => {
      el.textContent = list[k] ?? "";
      el.style.opacity = String(atOpacity);
      el.style.display = "block";
      el.dataset.screen = String(k + 1);
      hide.current = window.setTimeout(() => {
        el.style.display = "none";
        el.textContent = "";
      }, forMs);
    });
  }, []);

  useEffect(() => {
    test.current = show;
    return () => {
      test.current = null;
    };
  }, [test, show]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(hide.current);
    },
    [],
  );
  const [view, setView] = useState(() => `${window.innerWidth}x${window.innerHeight}`);

  useEffect(() => {
    const onResize = () => setView(`${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The screens: as many whole phrases as fit at this size, measured for real.
  useLayoutEffect(() => {
    const p = probe.current;
    if (!p) return;
    p.style.display = "block";
    pages.current = flashPages(phrases, (t) => {
      p.textContent = t;
      return p.scrollHeight <= p.clientHeight + 1;
    });
    p.textContent = "";
    p.style.display = "none";
    if (next.current >= pages.current.length) next.current = 0;
    onScreens(pages.current.length);
  }, [phrases, size, font, view, onScreens]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(
      () => show(latest.current.ms, latest.current.opacity),
      every * 1000,
    );
    return () => window.clearInterval(id);
  }, [running, every, show]);

  const style: CSSProperties = { fontSize: `${size}px`, lineHeight: 1.15, display: "none" };
  return (
    <>
      <div
        ref={probe}
        aria-hidden
        className={`${font} pointer-events-none fixed inset-0 overflow-hidden p-2 break-words`}
        style={{ ...style, visibility: "hidden" }}
      />
      <div
        ref={box}
        aria-hidden
        data-flash
        className={`${font} pointer-events-none fixed inset-0 z-[90] overflow-hidden p-2 break-words text-fg`}
        style={style}
      />
    </>
  );
}

type Spot = "word" | "phrase";

/**
 * A text read through, phrase by phrase: each phrase `passes` times, its words
 * lit one at a time. After a pass, a tap (anywhere on the screen, or the big
 * button) goes on, or it goes on by itself with Auto. Everything changes right
 * here, in the panel's tabs, and is kept. Nothing moves between words: the
 * screen is redrawn only when the word changes (at most `fps` times a second),
 * and the game behind rests.
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
  const key = textKey(text.name);
  const [lines, setLines] = useState(text.lines);
  const units = useMemo(() => readUnits(lines), [lines]);
  const phrases = useMemo(() => units.map((u) => u.text), [units]);
  const total = units.length;
  const [index, setIndex] = useState(() => placeOf(reader, key, total));
  const [pass, setPass] = useState(0);
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  /** The phrase being rewritten, and whether Edit held the reading. */
  const [editing, setEditing] = useState<string | null>(null);
  const heldByEdit = useRef(false);
  const session = useRef({ began: Date.now(), phrases: 0, logged: false });
  const [screens, setScreens] = useState(0);
  const testFlash = useRef<((ms: number, opacity: number) => void) | null>(null);
  /** The word or phrase being dragged (unlocked), and where. */
  const [drag, setDrag] = useState<{ spot: Spot; x: number; y: number } | null>(null);
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // The game behind stops drawing while you read.
  useEffect(() => holdRest(), []);

  const ms = wordTime(reader);
  const unit = units[Math.min(index, total - 1)];
  const phrase = unit?.text ?? "";
  const words = phrase.split(/\s+/).filter(Boolean);
  const at = passAt(words.length, ms, (heldAt ?? now) - start);

  // Redraw only when the next word is due (never more than fps times a second).
  // A phone's timer can fire a moment early, before the word has changed: the
  // redraw then just sets the next timer (now is a dependency), so it never stops.
  useEffect(() => {
    if (heldAt !== null || finished || at.over) return;
    const t = performance.now();
    const due = start + (at.word + 1) * ms - t + 4;
    const gap = now + 1000 / reader.fps - t;
    const id = window.setTimeout(() => setNow(performance.now()), Math.max(0, due, gap));
    return () => window.clearTimeout(id);
  }, [heldAt, finished, at.over, at.word, start, ms, reader.fps, now]);

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

  /** The pass starts over now (still held, if it was). */
  const restart = () => {
    const t = performance.now();
    setStart(t);
    setNow(t);
    if (heldAt !== null) setHeldAt(t);
  };

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(total - 1, i));
    setIndex(next);
    setPass(0);
    restart();
    save(setPlace(reader, key, next));
  };

  /** A pass done: Recitation XP; then the next pass, or the next phrase, or the end. */
  const complete = () => {
    if (!at.over || heldAt !== null || finished || editing !== null) return;
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
      save(setPlace(reader, key, 0));
      logSession(true);
      return;
    }
    setIndex(index + 1);
    setPass(0);
    setStart(t);
    setNow(t);
    save(setPlace(reader, key, index + 1));
  };

  // Auto: on by itself, a moment after the words finish (once per pass).
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const over = at.over;
  useEffect(() => {
    if (!reader.auto || !over || heldAt !== null || finished || editing !== null) return;
    const id = window.setTimeout(() => completeRef.current(), Math.max(0, R.autoPauseMs));
    return () => window.clearTimeout(id);
  }, [reader.auto, over, heldAt, finished, editing, index, pass]);

  /** Seconds a word, or the playback speed: the lit word stays where it is. */
  const setPace = (next: ReaderState) => {
    const t = heldAt ?? performance.now();
    if (!at.over) setStart(t - at.word * wordTime(next));
    save(next);
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

  /** Edit: the reading holds, and the phrase can be rewritten. */
  const edit = () => {
    if (heldAt === null) {
      heldByEdit.current = true;
      setHeldAt(performance.now());
    } else heldByEdit.current = false;
    setEditing(phrase);
  };

  const endEdit = () => {
    setEditing(null);
    if (heldByEdit.current && heldAt !== null) {
      heldByEdit.current = false;
      setStart(performance.now());
      setNow(performance.now());
      setHeldAt(null);
    }
  };

  /** The rewritten phrase goes into the stored text, in its place; this phrase starts again. */
  const saveEdit = () => {
    if (editing === null || !unit) return;
    const next = editPhrase(lines, unit, editing);
    if (next !== lines && next.join("\n") !== lines.join("\n")) {
      updateText(text.name, next);
      setLines(next);
      const left = readUnits(next).length;
      if (index >= left) setIndex(Math.max(0, left - 1));
      setPass(0);
      flashToast("Saved into the text");
    }
    setStart(performance.now());
    setNow(performance.now());
    endEdit();
  };

  const leave = () => {
    logSession(false);
    onClose();
  };

  // ---- Where the big word and the phrase are, and dragging them (unlocked) ----

  const spotAt = (spot: Spot) =>
    drag?.spot === spot
      ? drag
      : spot === "word"
        ? { x: reader.wordX, y: reader.wordY }
        : { x: reader.phraseX, y: reader.phraseY };

  const spotProps = (spot: Spot) => {
    const p = spotAt(spot);
    const style: CSSProperties = {
      left: `${p.x * 100}%`,
      top: `${p.y * 100}%`,
      transform: "translate(-50%, -50%)",
    };
    if (reader.locked) return { style: { ...style, pointerEvents: "none" as const } };
    const end = () => {
      const d = dragFrom.current && drag;
      dragFrom.current = null;
      setDrag(null);
      if (!d) return;
      save(
        spot === "word"
          ? { ...reader, wordX: d.x, wordY: d.y }
          : { ...reader, phraseX: d.x, phraseY: d.y },
      );
    };
    return {
      style: {
        ...style,
        touchAction: "none" as const,
        cursor: "move",
        outline: "1px dashed var(--color-cyan)",
        outlineOffset: "6px",
      },
      "data-spot": spot,
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragFrom.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
        setDrag({ spot, x: p.x, y: p.y });
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const f = dragFrom.current;
        if (!f) return;
        setDrag({
          spot,
          x: clampPlace(f.x + (e.clientX - f.px) / Math.max(1, window.innerWidth)),
          y: clampPlace(f.y + (e.clientY - f.py) / Math.max(1, window.innerHeight)),
        });
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  };

  const wordSpot = spotProps("word");
  const phraseSpot = spotProps("phrase");
  const font = FONT_CLASS[reader.font];
  const set = (patch: Partial<ReaderState>) => save({ ...reader, ...patch });
  const setLayer = (m: BytesMode, dir: 1 | -1) =>
    set({
      layers: { ...reader.layers, [m]: clampOpacity(nudge(reader.layers[m], dir, OPACITY_STEPS)) },
    });
  const pct = (v: number) => v.toFixed(2);
  const lit = heldAt !== null ? "text-muted" : "text-fg";

  const tabBody: Record<PanelTab, ReactNode> = {
    play: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Stepper
            label="s a word"
            value={(reader.wordMs / 1000).toFixed(2)}
            onLess={() => setPace({ ...reader, wordMs: clampWordMs(reader.wordMs - 100) })}
            onMore={() => setPace({ ...reader, wordMs: clampWordMs(reader.wordMs + 100) })}
          />
          <Stepper
            label="speed"
            value={`${reader.speed.toFixed(2)}×`}
            onLess={() => setPace({ ...reader, speed: clampSpeed(reader.speed - 0.05) })}
            onMore={() => setPace({ ...reader, speed: clampSpeed(reader.speed + 0.05) })}
          />
          <Stepper
            label="passes"
            value={`${reader.passes}×`}
            onLess={() => set({ passes: clampPasses(reader.passes - 1) })}
            onMore={() => set({ passes: clampPasses(reader.passes + 1) })}
          />
          <Stepper
            label="fps (most)"
            value={String(reader.fps)}
            onLess={() => set({ fps: clampFps(reader.fps - (reader.fps > 10 ? 5 : 1)) })}
            onMore={() => set({ fps: clampFps(reader.fps + (reader.fps >= 10 ? 5 : 1)) })}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Toggle on={reader.auto} onClick={() => set({ auto: !reader.auto })}>
            Auto: {reader.auto ? "on" : "off"}
          </Toggle>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => void exportText(text.name, lines)}
            aria-label={`Export ${text.name} as .txt`}
          >
            <Download className="size-4" aria-hidden />
            .txt
          </button>
        </div>
      </>
    ),
    look: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Stepper
            label="big word size"
            value={reader.wordSize.toFixed(1)}
            onLess={() => set({ wordSize: clampWordSize(reader.wordSize - 0.2) })}
            onMore={() => set({ wordSize: clampWordSize(reader.wordSize + 0.2) })}
          />
          <Stepper
            label="phrase size"
            value={reader.phraseSize.toFixed(2)}
            onLess={() => set({ phraseSize: clampPhraseSize(reader.phraseSize - 0.05) })}
            onMore={() => set({ phraseSize: clampPhraseSize(reader.phraseSize + 0.05) })}
          />
          <Stepper
            label="panel opacity"
            value={pct(reader.panelOpacity)}
            onLess={() =>
              set({
                panelOpacity: clampPanelOpacity(nudge(reader.panelOpacity, -1, OPACITY_STEPS)),
              })
            }
            onMore={() =>
              set({ panelOpacity: clampPanelOpacity(nudge(reader.panelOpacity, 1, OPACITY_STEPS)) })
            }
          />
          <Stepper
            label="chars a line"
            value={String(reader.phraseChars)}
            onLess={() =>
              set({ phraseChars: clampPhraseChars(nudge(reader.phraseChars, -1, CHARS_STEPS)) })
            }
            onMore={() =>
              set({ phraseChars: clampPhraseChars(nudge(reader.phraseChars, 1, CHARS_STEPS)) })
            }
          />
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ wordX: 0.5, phraseX: 0.5 })}
            aria-label="Center the word and the phrase"
          >
            ↔ Center
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() =>
              set({
                accent:
                  ACCENT_NAMES[(ACCENT_NAMES.indexOf(reader.accent) + 1) % ACCENT_NAMES.length]!,
              })
            }
            aria-label={`Colour: ${reader.accent}. Change it`}
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ background: ACCENTS[reader.accent] }}
              aria-hidden
            />
            Colour: {reader.accent}
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ font: FONTS[(FONTS.indexOf(reader.font) + 1) % FONTS.length]! })}
            aria-label={`Font: ${FONT_NAME[reader.font]}. Change it`}
          >
            Font: {FONT_NAME[reader.font]}
          </button>
          <Toggle on={!reader.locked} onClick={() => set({ locked: !reader.locked })}>
            {reader.locked ? (
              <>
                <Lock className="size-4" aria-hidden /> Locked
              </>
            ) : (
              <>
                <LockOpen className="size-4" aria-hidden /> Drag, then lock
              </>
            )}
          </Toggle>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => {
              const d = newReader();
              set({ wordX: d.wordX, wordY: d.wordY, phraseX: d.phraseX, phraseY: d.phraseY });
            }}
          >
            Reset places
          </button>
        </div>
      </>
    ),
    bytes: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle on={reader.bytes} onClick={() => set({ bytes: !reader.bytes })}>
            Bytes background: {reader.bytes ? "on" : "off"}
          </Toggle>
          <Stepper
            label="all bytes (over all)"
            value={pct(reader.bytesOpacity)}
            onLess={() =>
              set({ bytesOpacity: clampOpacity(nudge(reader.bytesOpacity, -1, OPACITY_STEPS)) })
            }
            onMore={() =>
              set({ bytesOpacity: clampOpacity(nudge(reader.bytesOpacity, 1, OPACITY_STEPS)) })
            }
          />
          <Stepper
            label="RGB layer"
            value={pct(reader.layers.rgb)}
            onLess={() => setLayer("rgb", -1)}
            onMore={() => setLayer("rgb", 1)}
          />
          <Stepper
            label="Gray layer"
            value={pct(reader.layers.gray)}
            onLess={() => setLayer("gray", -1)}
            onMore={() => setLayer("gray", 1)}
          />
          <Stepper
            label="Bits layer"
            value={pct(reader.layers.bits)}
            onLess={() => setLayer("bits", -1)}
            onMore={() => setLayer("bits", 1)}
          />
          <p className="self-center text-center text-[0.65rem] leading-tight text-muted">
            The three blend (light adds up), so none hides another; 0 leaves one out
          </p>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ bytesSharp: !reader.bytesSharp })}
          >
            {reader.bytesSharp ? "Sharp" : "Smooth"}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => void exportPicture(text.name, lines, reader.layers, reader.bytesSharp)}
            aria-label={`Export ${text.name} as a .png picture`}
          >
            <Download className="size-4" aria-hidden />
            .png
          </button>
        </div>
      </>
    ),
    flash: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle on={reader.flash} onClick={() => set({ flash: !reader.flash })}>
            Flash: {reader.flash ? "on" : "off"}
          </Toggle>
          <Stepper
            label="every (s)"
            value={reader.flashEvery.toFixed(1)}
            onLess={() =>
              set({ flashEvery: clampFlashEvery(nudge(reader.flashEvery, -1, EVERY_STEPS)) })
            }
            onMore={() =>
              set({ flashEvery: clampFlashEvery(nudge(reader.flashEvery, 1, EVERY_STEPS)) })
            }
          />
          <Stepper
            label="for (ms)"
            value={reader.flashMs.toFixed(1)}
            onLess={() => set({ flashMs: clampFlashMs(nudge(reader.flashMs, -1, MS_STEPS)) })}
            onMore={() => set({ flashMs: clampFlashMs(nudge(reader.flashMs, 1, MS_STEPS)) })}
          />
          <Stepper
            label="size (px)"
            value={String(reader.flashSize)}
            onLess={() => set({ flashSize: clampFlashSize(nudge(reader.flashSize, -1, PX_STEPS)) })}
            onMore={() => set({ flashSize: clampFlashSize(nudge(reader.flashSize, 1, PX_STEPS)) })}
          />
          <Stepper
            label="flash opacity"
            value={pct(reader.flashOpacity)}
            onLess={() =>
              set({ flashOpacity: clampOpacity(nudge(reader.flashOpacity, -1, OPACITY_STEPS)) })
            }
            onMore={() =>
              set({ flashOpacity: clampOpacity(nudge(reader.flashOpacity, 1, OPACITY_STEPS)) })
            }
          />
          <p className="self-center text-center text-[0.65rem] leading-tight text-muted">
            The whole text, {screens.toLocaleString()} screen{screens === 1 ? "" : "s"} of whole
            phrases, then round again
          </p>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => testFlash.current?.(reader.flashMs, reader.flashOpacity)}
          >
            Test once (as set)
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => testFlash.current?.(1500, Math.max(0.6, reader.flashOpacity))}
          >
            Test slow (1.5 s, clear)
          </button>
        </div>
      </>
    ),
  };

  return createPortal(
    <div
      className="rest-screen fixed inset-0 z-[70] overflow-hidden bg-bg text-fg"
      style={{ "--color-cyan": ACCENTS[reader.accent] } as CSSProperties}
      role="dialog"
      aria-label={`Reading ${text.name}`}
    >
      {reader.bytes && reader.bytesOpacity > 0 && (
        <BytesBackground
          lines={lines}
          layers={reader.layers}
          opacity={reader.bytesOpacity}
          sharp={reader.bytesSharp}
        />
      )}

      {finished ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center"
          role="status"
        >
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
          {/* A tap anywhere (not on the panel) goes on once the words of the pass have finished. */}
          <div
            className="absolute inset-0 cursor-pointer touch-manipulation select-none"
            onPointerDown={(e) => {
              if (e.button > 0) return;
              complete();
            }}
          />
          <p
            {...wordSpot}
            className={`${font} absolute z-10 leading-none whitespace-nowrap select-none ${lit}`}
            style={{
              ...wordSpot.style,
              fontSize: `min(${reader.wordSize}rem, ${(92 / Math.max(1, (words[at.word] ?? "").length * 0.6)).toFixed(2)}vw)`,
            }}
            aria-live="off"
          >
            {words[at.word] ?? ""}
          </p>
          <p
            {...phraseSpot}
            className={`${font} absolute z-10 w-max max-w-[94vw] text-center leading-relaxed select-none`}
            style={{ ...phraseSpot.style, fontSize: `${reader.phraseSize}rem` }}
            aria-label="The whole phrase"
          >
            {wrapWords(words, reader.phraseChars).map((row, r) => (
              <span key={r} className="block">
                {row.map((i) => (
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
                    {words[i]}
                    {i === row[row.length - 1] ? "" : " "}
                  </span>
                ))}
              </span>
            ))}
          </p>
        </>
      )}

      <header className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-cyan/40 bg-black px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-display text-xs tracking-[0.12em] text-cyan">
              {text.name.toUpperCase()}
            </p>
            <p className="text-xs text-muted tabular-nums">
              Phrase {(index + 1).toLocaleString()} / {total.toLocaleString()} · pass {pass + 1} /{" "}
              {reader.passes} ·{" "}
              <span className="text-gold">{percentDone(finished ? total : index, total)}%</span>
            </p>
          </div>
          <button type="button" className="btn shrink-0 px-2" onClick={leave}>
            <LogOut className="size-4" aria-hidden />
            Leave
          </button>
        </div>
      </header>

      {!finished && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div
            className="rounded-[var(--radius)] border border-cyan/40 bg-black p-3"
            style={{ opacity: reader.panelOpacity }}
            data-panel
          >
            {editing !== null ? (
              <div>
                <label className="text-xs tracking-wider text-muted uppercase" htmlFor="read-edit">
                  Rewrite this phrase (it is saved into the text)
                </label>
                <textarea
                  id="read-edit"
                  className="mt-1 min-h-24 w-full"
                  value={editing}
                  onChange={(e) => setEditing(e.target.value)}
                  autoFocus
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-gold min-h-12" onClick={saveEdit}>
                    Save
                  </button>
                  <button type="button" className="btn min-h-12" onClick={endEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`btn min-h-12 w-full text-base ${at.over ? "btn-gold" : "opacity-70"}`}
                aria-disabled={!at.over}
                onPointerDown={(e) => {
                  e.preventDefault();
                  complete();
                }}
              >
                {heldAt !== null ? "Held" : at.over ? "Complete ✓" : "Reading…"}
              </button>
            )}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <button
                type="button"
                className="btn min-h-10 px-1"
                onClick={() => goTo(index - 1)}
                disabled={index === 0 || editing !== null}
                aria-label="Previous phrase"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Back
              </button>
              <button
                type="button"
                className="btn min-h-10 px-1"
                onClick={hold}
                disabled={editing !== null}
              >
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
                onClick={edit}
                disabled={editing !== null}
                aria-label="Edit this phrase"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </button>
              <button
                type="button"
                className="btn min-h-10 px-1"
                onClick={() => goTo(index + 1)}
                disabled={index + 1 >= total || editing !== null}
                aria-label="Next phrase"
              >
                Skip
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            {reader.controls && (
              <>
                <div className="mt-2 grid grid-cols-4 gap-1.5" role="tablist" aria-label="Settings">
                  {PANEL_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={reader.tab === t}
                      data-on={reader.tab === t}
                      className="btn min-h-9 px-1"
                      onClick={() => set({ tab: t })}
                    >
                      {TAB_NAME[t]}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5" role="tabpanel" aria-label={TAB_NAME[reader.tab]}>
                  {tabBody[reader.tab]}
                </div>
              </>
            )}
            <button
              type="button"
              className="mt-1.5 flex w-full items-center justify-center gap-1 text-[0.65rem] text-muted"
              onClick={() => set({ controls: !reader.controls })}
              aria-expanded={reader.controls}
            >
              {reader.controls ? (
                <>
                  <ChevronDown className="size-3" aria-hidden /> Fold the settings away
                </>
              ) : (
                <>
                  <ChevronUp className="size-3" aria-hidden /> Settings: play, look, bytes, flash
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <SubliminalFlash
        phrases={phrases}
        every={reader.flashEvery}
        ms={reader.flashMs}
        size={reader.flashSize}
        opacity={reader.flashOpacity}
        font={font}
        running={reader.flash && !finished && heldAt === null && editing === null}
        onScreens={setScreens}
        test={testFlash}
      />
    </div>,
    document.body,
  );
}
