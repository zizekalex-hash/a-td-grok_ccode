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
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FolderArchive,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  LogOut,
  Minus,
  Pause,
  Pencil,
  PictureInPicture2,
  Play,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import { CONFIG } from "@/game/config";
import {
  flashToast,
  grantSkillXp,
  loadCodexTexts,
  loadTextFolder,
  removeFolder,
  removeFolderText,
  removeText,
  updateText,
} from "@/game/engine";
import { unzipTexts } from "@/game/unzip";
import { levelForXp, repXp } from "@/game/recite";
import { clock, logRead, readReps, writeReps } from "@/game/reps";
import {
  ACCENT_NAMES,
  ACCENTS,
  BYTES_MODES,
  clampFlashEvery,
  clampCopies,
  clampFlashChars,
  clampFlashMs,
  clampFlashSize,
  clampFps,
  clampGap,
  clampOpacity,
  clampPanelOpacity,
  clampPasses,
  clampPerHit,
  clampPhraseChars,
  clampPhraseSize,
  clampPlace,
  clampSilence,
  clampSpeed,
  clampStreamMs,
  clampStreamSize,
  clampWordMs,
  checkState,
  clampWordSize,
  editPhrase,
  FLASH_REVERSE,
  FONTS,
  markChecked,
  newReader,
  nudge,
  PANEL_TABS,
  passAt,
  STREAM_FLOWS,
  STREAM_PLACES,
  percentDone,
  placeOf,
  readReader,
  readUnits,
  setPlace,
  textKey,
  unmarkChecked,
  wordTime,
  writeReader,
  type BytesMode,
  type FlashReverse,
  type Order,
  type PanelTab,
  type ReaderFont,
  type ReaderState,
  type StreamFlow,
  type StreamPlace,
} from "@/game/readtext";
import {
  bytesPicture,
  flashPages,
  flashRounds,
  hitCount,
  hitWords,
  reversedPhrases,
  roundOf,
  shuffled,
  streamHit,
  streamStart,
  streamWords,
  wrapWords,
} from "@/game/readview";
import { savedSound } from "@/game/phraseSound";
import {
  backToRehearse,
  readerSound,
  rehearseState,
  rehearseUpdate,
  takeReaderRequest,
} from "@/game/rehearseRun";
import { textAt, textGo, textPass, textRep } from "@/game/rehearse";
import { exportText, fileName, saveConfirmed, saveFile } from "@/game/textFiles";
import { holdRest } from "@/game/rest";
import { useGame } from "@/game/store";

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
  stream: "Stream",
};
const REVERSE_NAME: Record<FlashReverse, string> = {
  off: "off",
  phrases: "phrases",
  words: "words",
  letters: "letters",
};
const SILENCE_STEPS: [number, number][] = [
  [1, 0.01],
  [10, 0.1],
  [Infinity, 1],
];
const FLASH_CHARS_STEPS: [number, number][] = [
  [100, 5],
  [Infinity, 10],
];
const STREAM_MS_STEPS: [number, number][] = [
  [50, 1],
  [200, 5],
  [Infinity, 25],
];
const COPIES_NAME = (n: number) => `${n} cop${n === 1 ? "y" : "ies"}`;
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

/** The Android app's mini window (picture in picture): MiniWindowPlugin.java. */
interface MiniWindowApi {
  available(): Promise<{ available: boolean }>;
  enter(o: { width: number; height: number }): Promise<{ entered: boolean }>;
  setAuto(o: { on: boolean; width: number; height: number }): Promise<void>;
}

let mini: Promise<{ api: MiniWindowApi } | null> | null = null;

/** The mini window, in the Android app only (wrapped: a plugin is not a promise's result). */
function miniWindow(): Promise<{ api: MiniWindowApi } | null> {
  mini ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.getPlatform() === "android"
        ? { api: registerPlugin<MiniWindowApi>("MiniWindow") }
        : null,
    )
    .catch(() => null);
  return mini;
}

/** The mini window's shape: the words' area, a little wider than tall. */
const MINI_SHAPE = { width: 16, height: 10 };

/** A text to read: its name and lines, and its folder for a text from a .zip. */
interface OpenText {
  name: string;
  lines: string[];
  folder?: string;
}

/** "3 Nov", for when a text was checked. */
function dayOf(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
  const folders = useGame((s) => s.folders);
  const [reader, setReader] = useState<ReaderState>(() => readReader());
  const [open, setOpen] = useState<OpenText | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

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
    setOpen({ name: t.name, lines: t.lines, folder: t.folder });
  };

  // Opened from Rehearse ("Read it"): that text, at the phrase it is at there; closed, back to Rehearse.
  const [fromRehearse, setFromRehearse] = useState(false);
  useEffect(() => {
    const k = takeReaderRequest();
    if (!k) return;
    const all: OpenText[] = [
      ...library.map((t) => ({ name: t.name, lines: t.lines })),
      ...folders.flatMap((f) =>
        f.texts.map((t) => ({ name: t.name, lines: t.lines, folder: f.name })),
      ),
    ];
    const t = all.find((x) => textKey(x.name, x.folder) === k);
    if (!t) return;
    openText(t);
    setFromRehearse(true);
    // Once, when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Files picked: each .zip becomes a folder of its own; .txt files join your texts. */
  const load = (files: File[]) => {
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    const txts = files.filter((f) => !/\.zip$/i.test(f.name));
    for (const z of zips) {
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
    if (txts.length)
      void Promise.all(txts.map(async (f) => ({ name: f.name, raw: await f.text() }))).then(
        (loaded) => loadCodexTexts(loaded),
        () => flashToast("Could not read that file"),
      );
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
          if (fromRehearse) {
            setFromRehearse(false);
            backToRehearse();
          }
        }}
      />
    );

  const checkedIn = (list: { name: string; lines: string[] }[], folder?: string) =>
    list.filter((t) => checkState(reader, t.name, t.lines, folder) === "checked").length;

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Read a whole text, phrase by phrase in order, word by word: the big word in the middle, the
        whole phrase below. Your texts stay here (the same ones the game reads), with your place in
        each; fix a phrase while reading (Edit), and take any text out as a .txt (⬇). A .zip of
        texts becomes a folder of its own, kept apart from the rest.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn min-h-11" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          Load .txt
        </button>
        <button type="button" className="btn min-h-11" onClick={() => zipRef.current?.click()}>
          <FolderArchive className="size-4" aria-hidden />
          Load .zip (a folder)
        </button>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept=".txt,text/plain,.zip,application/zip,application/x-zip-compressed"
          multiple
          aria-label="Text files to read"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) load(files);
          }}
        />
        <input
          ref={zipRef}
          className="hidden"
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          multiple
          aria-label="Zip files of texts"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) load(files);
          }}
        />
      </div>

      <h3 className="mt-4 text-xs tracking-wider text-muted uppercase">
        Your texts ({library.length}) ·{" "}
        <span className="text-green-400">checked {checkedIn(library).toLocaleString()}</span>
      </h3>
      <ul className="mt-1 space-y-2" aria-label="Your texts">
        {library.map((t, i) => (
          <TextRow
            key={`${i}-${t.name}`}
            text={t}
            reader={reader}
            save={save}
            onOpen={() => openText(t)}
            onRemove={custom && texts.length > 0 ? () => removeText(i) : undefined}
          />
        ))}
      </ul>

      {folders.map((f) => (
        <details
          key={f.name}
          className="mt-4 rounded-md border border-violet/40 p-2"
          open={folders.length === 1}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <FolderArchive className="size-4 shrink-0 text-violet" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{f.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {f.texts.length} text{f.texts.length === 1 ? "" : "s"} ·{" "}
              <span className="text-green-400">checked {checkedIn(f.texts, f.name)}</span>
            </span>
            <button
              type="button"
              className="btn shrink-0 px-2"
              onClick={(e) => {
                e.preventDefault();
                setDropping(dropping === f.name ? null : f.name);
              }}
              aria-label={`Remove the folder ${f.name}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </summary>
          {dropping === f.name && (
            <Confirm
              text={`Take the whole folder “${f.name}” (${f.texts.length} texts) out? Your other texts stay.`}
              yes="Yes, take it out"
              no="No, keep it"
              onYes={() => {
                removeFolder(f.name);
                setDropping(null);
              }}
              onNo={() => setDropping(null)}
            />
          )}
          <ul className="mt-2 space-y-2" aria-label={`Folder ${f.name}`}>
            {f.texts.map((t, i) => (
              <TextRow
                key={`${i}-${t.name}`}
                text={{ ...t, folder: f.name }}
                reader={reader}
                save={save}
                onOpen={() => openText({ ...t, folder: f.name })}
                onRemove={() => removeFolderText(f.name, i)}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** A text in the list: read it, check it, take it out as a .txt, or out of the list. */
function TextRow({
  text: t,
  reader,
  save,
  onOpen,
  onRemove,
}: {
  text: OpenText;
  reader: ReaderState;
  save: (s: ReaderState) => void;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [asking, setAsking] = useState(false);
  const key = textKey(t.name, t.folder);
  const at = placeOf(reader, key, Number.MAX_SAFE_INTEGER);
  const state = checkState(reader, t.name, t.lines, t.folder);
  const when = reader.checked[key]?.at ?? 0;
  return (
    <li className="rounded-md border border-cyan/25 p-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md p-1 text-left hover:bg-cyan/5"
          onClick={onOpen}
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
          <span
            className={`block text-xs ${state === "checked" ? "text-green-400" : state === "changed" ? "text-gold" : "text-muted"}`}
          >
            {state === "checked"
              ? `✓ Checked ${dayOf(when)}`
              : state === "changed"
                ? `Changed since checked (${dayOf(when)}): read it again`
                : "Not checked yet"}
          </span>
        </button>
        <button
          type="button"
          className="btn shrink-0 px-2"
          data-on={state === "checked"}
          onClick={() => setChecking((c) => !c)}
          aria-label={
            state === "checked" ? `${t.name} is checked. Uncheck it` : `Mark ${t.name} as checked`
          }
        >
          <CircleCheck className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-gold shrink-0 px-2"
          onClick={onOpen}
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
        {onRemove && (
          <button
            type="button"
            className="btn shrink-0 px-2"
            onClick={() => setAsking(true)}
            aria-label={`Remove ${t.name}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {checking && (
        <Confirm
          text={
            state === "checked"
              ? `Mark “${t.name}” as not checked? (The saved copy in ${CONFIG.reader.confirmedFolder} stays.)`
              : `Mark “${t.name}” as checked (read through, written right) and save it to Documents/${CONFIG.reader.confirmedFolder}${t.folder ? `/${t.folder}` : ""}?`
          }
          yes={state === "checked" ? "Yes, uncheck it" : "Yes, checked: save it"}
          no="No"
          onYes={() => {
            if (state === "checked") save(unmarkChecked(reader, t.name, t.folder));
            else {
              save(markChecked(reader, t.name, t.lines, Date.now(), t.folder));
              void saveConfirmed(t.name, t.lines, t.folder);
            }
            setChecking(false);
          }}
          onNo={() => setChecking(false)}
        />
      )}
      {asking && onRemove && (
        <Confirm
          text={`Take “${t.name}” out of ${t.folder ? `the folder “${t.folder}”` : "your texts"}?`}
          yes="Yes, take it out"
          no="No, keep it"
          onYes={() => {
            onRemove();
            setAsking(false);
          }}
          onNo={() => setAsking(false)}
        />
      )}
    </li>
  );
}

/**
 * A + and − pair around a value, for the reader's own controls. Tap the value
 * to type an exact one (Enter or tapping away sets it; it is checked like the
 * buttons are).
 */
function Stepper({
  label,
  value,
  raw,
  onLess,
  onMore,
  onType,
}: {
  label: string;
  value: string;
  /** The number to start typing from. */
  raw: number;
  onLess: () => void;
  onMore: () => void;
  onType: (v: number) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    if (typing === null) return;
    const v = Number(typing.replace(",", ".").trim());
    if (typing.trim() !== "" && Number.isFinite(v)) onType(v);
    setTyping(null);
  };
  return (
    <div className="flex items-center justify-between gap-1 rounded-md border border-cyan/20 px-1 py-0.5">
      <button type="button" className="btn stepper" onClick={onLess} aria-label={`Less: ${label}`}>
        <Minus className="size-4" aria-hidden />
      </button>
      {typing !== null ? (
        <input
          type="text"
          inputMode="decimal"
          className="w-16 min-w-0 rounded border border-cyan/50 bg-black px-1 py-1 text-center text-sm text-fg tabular-nums"
          value={typing}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setTyping(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label={`Type: ${label}`}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 rounded px-1 text-center text-[0.65rem] leading-tight text-muted underline decoration-cyan/30 decoration-dotted underline-offset-2"
          onClick={() => setTyping(String(raw))}
          aria-label={`Type a value: ${label}`}
        >
          <span className="block text-fg tabular-nums">{value}</span>
          {label}
        </button>
      )}
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
 * whole phrases as fit in the room it has (between `top` and `bottom`, in a
 * column of `chars` characters if set); the next flash shows the next screen,
 * through the whole text, then (if set) through it reversed, and round again.
 * The flash is drawn straight into the page, not by React.
 */
function SubliminalFlash({
  phrases,
  reverse,
  order,
  every,
  ms,
  size,
  opacity,
  color,
  chars,
  top,
  bottom,
  font,
  running,
  onScreens,
  test,
}: {
  phrases: string[];
  /** A reversed round after each forward one (off: none). */
  reverse: FlashReverse;
  /** The phrases in order, or shuffled each round. */
  order: Order;
  every: number;
  ms: number;
  size: number;
  opacity: number;
  color: string;
  chars: number;
  /** Room left free at the top and the bottom (px). */
  top: number;
  bottom: number;
  font: string;
  running: boolean;
  onScreens: (forward: number, back: number) => void;
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
  /** Rounds so far: a random order shuffles again for each. */
  const [round, setRound] = useState(0);
  const shuffleEach = useRef(order === "random");
  shuffleEach.current = order === "random";

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
    // A round done: at random, the next round is shuffled again.
    if (next.current === 0 && shuffleEach.current) setRound((r) => r + 1);
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

  // The screens: as many whole phrases as fit in the room there is, measured for real.
  useLayoutEffect(() => {
    const p = probe.current;
    if (!p) return;
    p.style.display = "block";
    const fits = (t: string) => {
      p.textContent = t;
      return p.scrollHeight <= p.clientHeight + 1;
    };
    const ordered = roundOf(phrases, order, Math.random);
    const forward = flashPages(ordered, fits);
    const reversed = reversedPhrases(ordered, reverse);
    const back = reversed.length ? flashPages(reversed, fits) : [];
    pages.current = flashRounds(forward, back);
    p.textContent = "";
    p.style.display = "none";
    if (next.current >= pages.current.length) next.current = 0;
    onScreens(forward.length, back.length);
  }, [phrases, reverse, order, round, size, font, chars, top, bottom, view, onScreens]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(
      () => show(latest.current.ms, latest.current.opacity),
      every * 1000,
    );
    return () => window.clearInterval(id);
  }, [running, every, show]);

  const style: CSSProperties = {
    fontSize: `${size}px`,
    lineHeight: 1.15,
    display: "none",
    color,
    top: `${Math.max(0, top)}px`,
    bottom: `${Math.max(0, bottom)}px`,
    left: 0,
    right: 0,
    ...(chars > 0
      ? {
          width: `min(100%, ${chars}ch)`,
          marginLeft: "auto",
          marginRight: "auto",
          textAlign: "center",
        }
      : {}),
  };
  return (
    <>
      <div
        ref={probe}
        aria-hidden
        className={`${font} pointer-events-none fixed overflow-hidden p-2 break-words`}
        style={{ ...style, visibility: "hidden" }}
      />
      <div
        ref={box}
        aria-hidden
        data-flash
        className={`${font} pointer-events-none fixed z-[90] overflow-hidden p-2 break-words`}
        style={style}
      />
    </>
  );
}

/**
 * The stream: a second, fast word looper over the whole text (subliminal), next
 * to the big word, in `copies` copies in each place switched on: above the word,
 * below the phrase, and at both sides (a column on the left and one on the
 * right), stacked or in a row, `gap` em apart. In order it starts at the phrase
 * being read and goes round the text; at random it shuffles the phrases, shows
 * each once, and shuffles again. Each hit is written straight into the page (no
 * React redraw), so a fast stream stays light.
 */
function StreamLayer({
  phrases,
  start,
  order,
  ms,
  perHit,
  copies,
  places,
  flow,
  size,
  gap,
  opacity,
  color,
  font,
  running,
  anchor,
}: {
  phrases: string[];
  /** The phrase being read: in order, the stream starts there. */
  start: number;
  order: Order;
  ms: number;
  perHit: number;
  copies: number;
  places: Record<StreamPlace, boolean>;
  flow: StreamFlow;
  size: number;
  gap: number;
  opacity: number;
  color: string;
  font: string;
  running: boolean;
  /** Where the big word stands: its middle across, its top and middle (px), and below the phrase (px). */
  anchor: { x: number; wordTop: number; wordMid: number; below: number };
}) {
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const seq = useRef<string[]>([]);
  const at = useRef(0);
  const startRef = useRef(start);
  startRef.current = start;
  // A new text or order starts again: in order at the phrase being read, at random from a new shuffle.
  useEffect(() => {
    if (order === "random") {
      seq.current = streamWords(shuffled(phrases, Math.random));
      at.current = 0;
    } else {
      seq.current = streamWords(phrases);
      at.current = streamStart(phrases, startRef.current);
    }
  }, [phrases, order]);
  useEffect(() => {
    if (!running || !phrases.length) return;
    const tick = () => {
      const words = seq.current;
      if (!words.length) return;
      const text = streamHit(words, at.current, perHit);
      at.current += perHit;
      if (at.current >= words.length) {
        // Round done: at random, a new shuffle; in order, round again.
        if (order === "random") seq.current = streamWords(shuffled(phrases, Math.random));
        at.current = order === "random" ? 0 : at.current % words.length;
      }
      for (const el of spans.current) if (el) el.textContent = text;
    };
    tick();
    const id = window.setInterval(tick, Math.max(16, ms));
    return () => window.clearInterval(id);
  }, [running, phrases, order, ms, perHit, copies, places.above, places.below, places.sides]);

  let n = 0;
  spans.current.length = 0;
  const many = () =>
    Array.from({ length: copies }, () => {
      const i = n++;
      return (
        <span
          key={i}
          ref={(el) => {
            spans.current[i] = el;
          }}
          className="whitespace-nowrap"
        />
      );
    });
  const base: CSSProperties = {
    fontSize: `${size}rem`,
    lineHeight: 1.15,
    opacity,
    color,
    gap: `${gap}em`,
  };
  const dir = flow === "row" ? "flex-row" : "flex-col";
  const cls = `${font} pointer-events-none absolute z-[9] flex w-max`;
  return (
    <>
      {places.above && (
        <div
          className={`${cls} items-center ${flow === "row" ? "flex-row" : "flex-col-reverse"}`}
          style={{
            ...base,
            left: anchor.x,
            transform: "translateX(-50%)",
            bottom: `calc(100% - ${Math.round(anchor.wordTop)}px)`,
          }}
          data-stream="above"
          aria-hidden
        >
          {many()}
        </div>
      )}
      {places.below && (
        <div
          className={`${cls} items-center ${dir}`}
          style={{
            ...base,
            left: anchor.x,
            transform: "translateX(-50%)",
            top: Math.round(anchor.below),
          }}
          data-stream="below"
          aria-hidden
        >
          {many()}
        </div>
      )}
      {places.sides &&
        (["left", "right"] as const).map((side) => (
          <div
            key={side}
            className={`${cls} ${dir} ${side === "left" ? "items-start" : "items-end"}`}
            style={{
              ...base,
              [side]: "0.5rem",
              top: anchor.wordMid,
              transform: "translateY(-50%)",
            }}
            data-stream={side}
            aria-hidden
          >
            {many()}
          </div>
        ))}
    </>
  );
}

/** The app's toasts, shown on the reader too (the page under it is hidden while you read). */
function ReaderToast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast z-[95]" role="status">
      {toast}
    </div>
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
  const key = textKey(text.name, text.folder);
  const [lines, setLines] = useState(text.lines);
  const units = useMemo(() => readUnits(lines), [lines]);
  const phrases = useMemo(() => units.map((u) => u.text), [units]);
  const total = units.length;
  // The place is shared with Rehearse's Whole texts: where either left it.
  const [index, setIndex] = useState(() => {
    const r = rehearseState();
    return r.progress[key] ? textAt(r, key, total) : placeOf(reader, key, total);
  });
  useEffect(() => {
    if (total > 0) rehearseUpdate((s) => textGo(s, key, index, total));
  }, [key, index, total]);
  const [pass, setPass] = useState(0);
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  /** The phrase being rewritten, and whether Edit held the reading. */
  const [editing, setEditing] = useState<string | null>(null);
  const heldByEdit = useRef(false);
  const session = useRef({ began: Date.now(), phrases: 0, logged: false });
  const [screens, setScreens] = useState({ forward: 0, back: 0 });
  const onScreens = useCallback(
    (forward: number, back: number) => setScreens({ forward, back }),
    [],
  );
  /** Everything but the words hidden (the corner button brings it back). */
  const [bare, setBare] = useState(false);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  /** A small window (the mini window, or a small split screen): only the words. */
  const small = vp.h < 360 || vp.w < 280;
  const plain = bare || small;
  /** Sizes follow the window when it is smaller than a phone. */
  const scale = Math.max(0.3, Math.min(1, vp.w / 360, vp.h / 640));
  const [hasMini, setHasMini] = useState(false);
  useEffect(() => {
    let live = true;
    void miniWindow().then(async (m) => {
      const ok = m
        ? (await m.api.available().catch(() => ({ available: false }))).available
        : false;
      if (live) setHasMini(ok);
    });
    return () => {
      live = false;
    };
  }, []);
  // "Mini window when leaving": on while this text is open, off when it closes.
  useEffect(() => {
    if (!hasMini) return;
    void miniWindow().then((m) => m?.api.setAuto({ on: reader.miniAuto, ...MINI_SHAPE }));
    return () => {
      void miniWindow().then((m) => m?.api.setAuto({ on: false, ...MINI_SHAPE }));
    };
  }, [hasMini, reader.miniAuto]);
  const openMini = () => {
    void miniWindow().then((m) => {
      if (!m) {
        flashToast("The mini window is in the Android app");
        return;
      }
      m.api.enter(MINI_SHAPE).catch((e: unknown) => flashToast(String((e as Error)?.message ?? e)));
    });
  };
  // The room the flash has: clear of the header and the panel while they show.
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    if (plain) {
      setRoom((r) => (r.top || r.bottom ? { top: 0, bottom: 0 } : r));
      return;
    }
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect();
      const p = panelRef.current?.getBoundingClientRect();
      const top = Math.round(h ? h.bottom : 0);
      const bottom = Math.round(p ? window.innerHeight - p.top : 0);
      setRoom((r) => (r.top === top && r.bottom === bottom ? r : { top, bottom }));
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (headerRef.current) ro?.observe(headerRef.current);
    if (panelRef.current) ro?.observe(panelRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [plain, finished]);
  const testFlash = useRef<((ms: number, opacity: number) => void) | null>(null);
  /** The word or phrase being dragged (unlocked), and where. */
  const [drag, setDrag] = useState<{ spot: Spot; x: number; y: number } | null>(null);
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // The game behind stops drawing while you read.
  useEffect(() => holdRest(), []);

  // The phrase's sound: its raw bytes, as Rehearse shapes them, all the while it is read.

  const loopSound = useMemo(() => (reader.phraseSound ? savedSound() : null), [reader.phraseSound]);
  const reading = heldAt === null && !finished && editing === null;
  const loopText = units[Math.min(index, total - 1)]?.text ?? "";
  useEffect(() => {
    // Through Rehearse's phrase player (one for the app, so two never play at once).
    readerSound(loopSound && reading && loopText ? loopText : null);
  }, [loopSound, reading, loopText]);
  useEffect(() => () => readerSound(null), []);

  const ms = wordTime(reader);
  const unit = units[Math.min(index, total - 1)];
  const phrase = unit?.text ?? "";
  const words = phrase.split(/\s+/).filter(Boolean);
  // The big word shows perHit words at a time (a hit), each hit lasting ms.
  const perHit = reader.perHit;
  const at = passAt(hitCount(words.length, perHit), ms, (heldAt ?? now) - start);
  const shown = hitWords(words, at.word, perHit).join(" ");
  const hitOf = (i: number) => Math.floor(i / perHit);

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
    // A rep of the phrase in Rehearse's count of this text (and its time).
    rehearseUpdate((s) => textRep(s, key, Date.now()));
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
      // A pass through the whole text, in Rehearse too.
      rehearseUpdate((s) => textPass(s, key));
      logSession(true);
      return;
    }
    setIndex(index + 1);
    setPass(0);
    setStart(t);
    setNow(t);
    save(setPlace(reader, key, index + 1));
  };

  // Auto: on by itself after a silence once the words finish (once per pass): silence after
  // a pass, phraseSilence after a phrase's last pass. The words stay on the screen meanwhile.
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const over = at.over;
  const silenceMs = (pass + 1 >= reader.passes ? reader.phraseSilence : reader.silence) * 1000;
  useEffect(() => {
    if (!reader.auto || !over || heldAt !== null || finished || editing !== null) return;
    const id = window.setTimeout(() => completeRef.current(), Math.max(0, silenceMs));
    return () => window.clearTimeout(id);
  }, [reader.auto, over, heldAt, finished, editing, index, pass, silenceMs]);

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
      updateText(text.name, next, text.folder);
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

  const spotAt = (spot: Spot) => {
    const p =
      drag?.spot === spot
        ? drag
        : spot === "word"
          ? { x: reader.wordX, y: reader.wordY }
          : { x: reader.phraseX, y: reader.phraseY };
    // Kept centred: always in the middle across (dragging moves it up and down only).
    return reader.centered ? { x: 0.5, y: p.y } : p;
  };

  const spotProps = (spot: Spot) => {
    const p = spotAt(spot);
    // In the room between the header and the panel: the word stands on its line, the phrase hangs from its.
    const style: CSSProperties = {
      left: `${p.x * 100}%`,
      top: `calc(${room.top}px + (100% - ${room.top + room.bottom}px) * ${p.y})`,
      transform: spot === "word" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
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
          x: reader.centered
            ? 0.5
            : clampPlace(f.x + (e.clientX - f.px) / Math.max(1, window.innerWidth)),
          y: clampPlace(
            f.y + (e.clientY - f.py) / Math.max(1, window.innerHeight - room.top - room.bottom),
          ),
        });
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  };

  // The phrase's foot on the screen (the stream can stand below it).
  const phraseRef = useRef<HTMLParagraphElement>(null);
  const [phraseBottom, setPhraseBottom] = useState(0);
  const phraseKey = `${phrase}|${reader.phraseSize}|${reader.phraseChars}|${reader.phraseY}|${reader.font}|${scale}|${room.top}|${room.bottom}|${vp.w}x${vp.h}|${drag?.y ?? ""}`;
  useLayoutEffect(() => {
    const b = Math.round(phraseRef.current?.getBoundingClientRect().bottom ?? 0);
    setPhraseBottom((v) => (v === b ? v : b));
  }, [phraseKey]);
  const wordSpot = spotProps("word");
  // Where the big word stands, for the stream beside it.
  const wordAt = spotAt("word");
  const wordFoot = room.top + (vp.h - room.top - room.bottom) * wordAt.y;
  const wordPx = reader.wordSize * scale * 16;
  const anchor = {
    x: vp.w * wordAt.x,
    wordTop: wordFoot - wordPx * 1.05,
    wordMid: wordFoot - wordPx / 2,
    below: (phraseBottom || wordFoot + wordPx) + 6,
  };
  const allWords = streamWords(phrases);
  const phraseSpot = spotProps("phrase");
  const font = FONT_CLASS[reader.font];
  const set = (patch: Partial<ReaderState>) => save({ ...reader, ...patch });
  const setLayer = (m: BytesMode, dir: 1 | -1) =>
    set({
      layers: { ...reader.layers, [m]: clampOpacity(nudge(reader.layers[m], dir, OPACITY_STEPS)) },
    });
  const pct = (v: number) => v.toFixed(2);
  const lit = heldAt !== null ? "text-muted" : "text-fg";

  const cycle = <T,>(list: readonly T[], now: T): T => list[(list.indexOf(now) + 1) % list.length]!;

  const tabBody: Record<PanelTab, ReactNode> = {
    stream: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle on={reader.stream} onClick={() => set({ stream: !reader.stream })}>
            Stream: {reader.stream ? "on" : "off"}
          </Toggle>
          <Stepper
            label="ms a hit"
            value={String(reader.streamMs)}
            raw={reader.streamMs}
            onLess={() =>
              set({ streamMs: clampStreamMs(nudge(reader.streamMs, -1, STREAM_MS_STEPS)) })
            }
            onMore={() =>
              set({ streamMs: clampStreamMs(nudge(reader.streamMs, 1, STREAM_MS_STEPS)) })
            }
            onType={(v) => set({ streamMs: clampStreamMs(v) })}
          />
          <Stepper
            label="words a hit"
            value={String(reader.streamPerHit)}
            raw={reader.streamPerHit}
            onLess={() => set({ streamPerHit: clampPerHit(reader.streamPerHit - 1) })}
            onMore={() => set({ streamPerHit: clampPerHit(reader.streamPerHit + 1) })}
            onType={(v) => set({ streamPerHit: clampPerHit(v) })}
          />
          <Stepper
            label="copies"
            value={String(reader.streamCopies)}
            raw={reader.streamCopies}
            onLess={() => set({ streamCopies: clampCopies(reader.streamCopies - 1) })}
            onMore={() => set({ streamCopies: clampCopies(reader.streamCopies + 1) })}
            onType={(v) => set({ streamCopies: clampCopies(v) })}
          />
          <Stepper
            label="stream size"
            value={reader.streamSize.toFixed(2)}
            raw={reader.streamSize}
            onLess={() => set({ streamSize: clampStreamSize(reader.streamSize - 0.1) })}
            onMore={() => set({ streamSize: clampStreamSize(reader.streamSize + 0.1) })}
            onType={(v) => set({ streamSize: clampStreamSize(v) })}
          />
          <Stepper
            label="stream opacity"
            value={pct(reader.streamOpacity)}
            raw={reader.streamOpacity}
            onLess={() =>
              set({ streamOpacity: clampOpacity(nudge(reader.streamOpacity, -1, OPACITY_STEPS)) })
            }
            onMore={() =>
              set({ streamOpacity: clampOpacity(nudge(reader.streamOpacity, 1, OPACITY_STEPS)) })
            }
            onType={(v) => set({ streamOpacity: clampOpacity(v) })}
          />
          <Stepper
            label="spacing (em)"
            value={reader.streamGap.toFixed(2)}
            raw={reader.streamGap}
            onLess={() => set({ streamGap: clampGap(reader.streamGap - 0.1) })}
            onMore={() => set({ streamGap: clampGap(reader.streamGap + 0.1) })}
            onType={(v) => set({ streamGap: clampGap(v) })}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {STREAM_PLACES.map((p) => (
            <Toggle
              key={p}
              on={reader.streamPlaces[p]}
              onClick={() =>
                set({ streamPlaces: { ...reader.streamPlaces, [p]: !reader.streamPlaces[p] } })
              }
            >
              {{ above: "Above", below: "Below", sides: "Sides" }[p]}:{" "}
              {reader.streamPlaces[p] ? "on" : "off"}
            </Toggle>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() =>
              set({ streamOrder: reader.streamOrder === "random" ? "order" : "random" })
            }
            aria-label={`Stream order: ${reader.streamOrder === "random" ? "random" : "in order"}. Change it`}
          >
            {reader.streamOrder === "random" ? "Random" : "In order"}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ streamFlow: cycle(STREAM_FLOWS, reader.streamFlow) })}
            aria-label={`Stream flow: ${reader.streamFlow}. Change it`}
          >
            {reader.streamFlow === "row" ? "In a row" : "Stacked"}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ streamColor: cycle(ACCENT_NAMES, reader.streamColor) })}
            aria-label={`Stream colour: ${reader.streamColor}. Change it`}
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ background: ACCENTS[reader.streamColor] }}
              aria-hidden
            />
            {reader.streamColor}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.65rem] leading-tight text-muted">
          The whole text ({allWords.length.toLocaleString()} words), {reader.streamPerHit} a hit
          every {reader.streamMs} ms (
          {Math.round(
            ((allWords.length / reader.streamPerHit) * reader.streamMs) / 1000,
          ).toLocaleString()}{" "}
          s a round), in {COPIES_NAME(reader.streamCopies)} in each place,{" "}
          {reader.streamOrder === "random"
            ? "the phrases at random (each once, then shuffled again)"
            : "from the phrase you read on, round and round"}
        </p>
      </>
    ),
    play: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Stepper
            label={perHit > 1 ? "s a hit" : "s a word"}
            value={(reader.wordMs / 1000).toFixed(2)}
            raw={reader.wordMs / 1000}
            onLess={() => setPace({ ...reader, wordMs: clampWordMs(reader.wordMs - 100) })}
            onMore={() => setPace({ ...reader, wordMs: clampWordMs(reader.wordMs + 100) })}
            onType={(v) => setPace({ ...reader, wordMs: clampWordMs(v * 1000) })}
          />
          <Stepper
            label="speed"
            value={`${reader.speed.toFixed(2)}×`}
            raw={reader.speed}
            onLess={() => setPace({ ...reader, speed: clampSpeed(reader.speed - 0.05) })}
            onMore={() => setPace({ ...reader, speed: clampSpeed(reader.speed + 0.05) })}
            onType={(v) => setPace({ ...reader, speed: clampSpeed(v) })}
          />
          <Stepper
            label="words a hit"
            value={String(reader.perHit)}
            raw={reader.perHit}
            onLess={() => set({ perHit: clampPerHit(reader.perHit - 1) })}
            onMore={() => set({ perHit: clampPerHit(reader.perHit + 1) })}
            onType={(v) => set({ perHit: clampPerHit(v) })}
          />
          <Stepper
            label="passes"
            value={`${reader.passes}×`}
            raw={reader.passes}
            onLess={() => set({ passes: clampPasses(reader.passes - 1) })}
            onMore={() => set({ passes: clampPasses(reader.passes + 1) })}
            onType={(v) => set({ passes: clampPasses(v) })}
          />
          <Stepper
            label="fps (most)"
            value={String(reader.fps)}
            raw={reader.fps}
            onLess={() => set({ fps: clampFps(reader.fps - (reader.fps > 10 ? 5 : 1)) })}
            onMore={() => set({ fps: clampFps(reader.fps + (reader.fps >= 10 ? 5 : 1)) })}
            onType={(v) => set({ fps: clampFps(v) })}
          />
          <Stepper
            label="silence after a pass (s)"
            value={reader.silence.toFixed(3)}
            raw={reader.silence}
            onLess={() => set({ silence: clampSilence(nudge(reader.silence, -1, SILENCE_STEPS)) })}
            onMore={() => set({ silence: clampSilence(nudge(reader.silence, 1, SILENCE_STEPS)) })}
            onType={(v) => set({ silence: clampSilence(v) })}
          />
          <Stepper
            label="silence after a phrase (s)"
            value={reader.phraseSilence.toFixed(3)}
            raw={reader.phraseSilence}
            onLess={() =>
              set({ phraseSilence: clampSilence(nudge(reader.phraseSilence, -1, SILENCE_STEPS)) })
            }
            onMore={() =>
              set({ phraseSilence: clampSilence(nudge(reader.phraseSilence, 1, SILENCE_STEPS)) })
            }
            onType={(v) => set({ phraseSilence: clampSilence(v) })}
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
            value={reader.wordSize.toFixed(2)}
            raw={reader.wordSize}
            onLess={() => set({ wordSize: clampWordSize(reader.wordSize - 0.2) })}
            onMore={() => set({ wordSize: clampWordSize(reader.wordSize + 0.2) })}
            onType={(v) => set({ wordSize: clampWordSize(v) })}
          />
          <Stepper
            label="phrase size"
            value={reader.phraseSize.toFixed(2)}
            raw={reader.phraseSize}
            onLess={() => set({ phraseSize: clampPhraseSize(reader.phraseSize - 0.05) })}
            onMore={() => set({ phraseSize: clampPhraseSize(reader.phraseSize + 0.05) })}
            onType={(v) => set({ phraseSize: clampPhraseSize(v) })}
          />
          <Stepper
            label="chars a line"
            value={String(reader.phraseChars)}
            raw={reader.phraseChars}
            onLess={() =>
              set({ phraseChars: clampPhraseChars(nudge(reader.phraseChars, -1, CHARS_STEPS)) })
            }
            onMore={() =>
              set({ phraseChars: clampPhraseChars(nudge(reader.phraseChars, 1, CHARS_STEPS)) })
            }
            onType={(v) => set({ phraseChars: clampPhraseChars(v) })}
          />
          <Stepper
            label="panel opacity"
            value={pct(reader.panelOpacity)}
            raw={reader.panelOpacity}
            onLess={() =>
              set({
                panelOpacity: clampPanelOpacity(nudge(reader.panelOpacity, -1, OPACITY_STEPS)),
              })
            }
            onMore={() =>
              set({ panelOpacity: clampPanelOpacity(nudge(reader.panelOpacity, 1, OPACITY_STEPS)) })
            }
            onType={(v) => set({ panelOpacity: clampPanelOpacity(v) })}
          />
          <Toggle on={reader.centered} onClick={() => set({ centered: !reader.centered })}>
            Keep centred: {reader.centered ? "on" : "off"}
          </Toggle>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ wordX: 0.5, phraseX: 0.5 })}
            aria-label="Center the word and the phrase"
          >
            ↔ Center
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ accent: cycle(ACCENT_NAMES, reader.accent) })}
            aria-label={`Colour: ${reader.accent}. Change it`}
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ background: ACCENTS[reader.accent] }}
              aria-hidden
            />
            Colour: {reader.accent}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ font: cycle(FONTS, reader.font) })}
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
          {hasMini && (
            <>
              <button type="button" className="btn min-h-10 px-1" onClick={openMini}>
                <PictureInPicture2 className="size-4" aria-hidden />
                Mini window now
              </button>
              <Toggle on={reader.miniAuto} onClick={() => set({ miniAuto: !reader.miniAuto })}>
                Mini on leaving: {reader.miniAuto ? "on" : "off"}
              </Toggle>
            </>
          )}
        </div>
      </>
    ),
    bytes: (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle on={reader.bytes} onClick={() => set({ bytes: !reader.bytes })}>
            Bytes background: {reader.bytes ? "on" : "off"}
          </Toggle>
          <Toggle on={reader.phraseSound} onClick={() => set({ phraseSound: !reader.phraseSound })}>
            Phrase sound: {reader.phraseSound ? "on" : "off"}
          </Toggle>
          <Stepper
            label="all bytes (over all)"
            value={pct(reader.bytesOpacity)}
            raw={reader.bytesOpacity}
            onLess={() =>
              set({ bytesOpacity: clampOpacity(nudge(reader.bytesOpacity, -1, OPACITY_STEPS)) })
            }
            onMore={() =>
              set({ bytesOpacity: clampOpacity(nudge(reader.bytesOpacity, 1, OPACITY_STEPS)) })
            }
            onType={(v) => set({ bytesOpacity: clampOpacity(v) })}
          />
          {BYTES_MODES.map((m) => (
            <Stepper
              key={m}
              label={`${{ rgb: "RGB", gray: "Gray", bits: "Bits" }[m]} layer`}
              value={pct(reader.layers[m])}
              raw={reader.layers[m]}
              onLess={() => setLayer(m, -1)}
              onMore={() => setLayer(m, 1)}
              onType={(v) => set({ layers: { ...reader.layers, [m]: clampOpacity(v) } })}
            />
          ))}
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
            value={reader.flashEvery.toFixed(2)}
            raw={reader.flashEvery}
            onLess={() =>
              set({ flashEvery: clampFlashEvery(nudge(reader.flashEvery, -1, EVERY_STEPS)) })
            }
            onMore={() =>
              set({ flashEvery: clampFlashEvery(nudge(reader.flashEvery, 1, EVERY_STEPS)) })
            }
            onType={(v) => set({ flashEvery: clampFlashEvery(v) })}
          />
          <Stepper
            label="for (ms)"
            value={reader.flashMs.toFixed(1)}
            raw={reader.flashMs}
            onLess={() => set({ flashMs: clampFlashMs(nudge(reader.flashMs, -1, MS_STEPS)) })}
            onMore={() => set({ flashMs: clampFlashMs(nudge(reader.flashMs, 1, MS_STEPS)) })}
            onType={(v) => set({ flashMs: clampFlashMs(v) })}
          />
          <Stepper
            label="size (px)"
            value={String(reader.flashSize)}
            raw={reader.flashSize}
            onLess={() => set({ flashSize: clampFlashSize(nudge(reader.flashSize, -1, PX_STEPS)) })}
            onMore={() => set({ flashSize: clampFlashSize(nudge(reader.flashSize, 1, PX_STEPS)) })}
            onType={(v) => set({ flashSize: clampFlashSize(v) })}
          />
          <Stepper
            label="flash opacity"
            value={pct(reader.flashOpacity)}
            raw={reader.flashOpacity}
            onLess={() =>
              set({ flashOpacity: clampOpacity(nudge(reader.flashOpacity, -1, OPACITY_STEPS)) })
            }
            onMore={() =>
              set({ flashOpacity: clampOpacity(nudge(reader.flashOpacity, 1, OPACITY_STEPS)) })
            }
            onType={(v) => set({ flashOpacity: clampOpacity(v) })}
          />
          <Stepper
            label="chars a line (0: all)"
            value={reader.flashChars ? String(reader.flashChars) : "all"}
            raw={reader.flashChars}
            onLess={() =>
              set({
                flashChars: clampFlashChars(
                  reader.flashChars <= 10 ? 0 : nudge(reader.flashChars, -1, FLASH_CHARS_STEPS),
                ),
              })
            }
            onMore={() =>
              set({
                flashChars: clampFlashChars(
                  reader.flashChars ? nudge(reader.flashChars, 1, FLASH_CHARS_STEPS) : 10,
                ),
              })
            }
            onType={(v) => set({ flashChars: clampFlashChars(v) })}
          />
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ flashColor: cycle(ACCENT_NAMES, reader.flashColor) })}
            aria-label={`Flash colour: ${reader.flashColor}. Change it`}
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ background: ACCENTS[reader.flashColor] }}
              aria-hidden
            />
            Colour: {reader.flashColor}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ flashReverse: cycle(FLASH_REVERSE, reader.flashReverse) })}
            aria-label={`Reversed round: ${REVERSE_NAME[reader.flashReverse]}. Change it`}
          >
            Reverse: {REVERSE_NAME[reader.flashReverse]}
          </button>
          <button
            type="button"
            className="btn min-h-10 px-1"
            onClick={() => set({ flashOrder: reader.flashOrder === "random" ? "order" : "random" })}
            aria-label={`Flash order: ${reader.flashOrder === "random" ? "random" : "in order"}. Change it`}
          >
            Order: {reader.flashOrder === "random" ? "random" : "in order"}
          </button>
          <Toggle on={reader.flashAvoid} onClick={() => set({ flashAvoid: !reader.flashAvoid })}>
            Clear of the panel: {reader.flashAvoid ? "on" : "off"}
          </Toggle>
          <p className="col-span-2 text-center text-[0.65rem] leading-tight text-muted">
            The whole text: {screens.forward.toLocaleString()} screen
            {screens.forward === 1 ? "" : "s"} of whole phrases
            {screens.back
              ? `, then ${screens.back.toLocaleString()} reversed (${REVERSE_NAME[reader.flashReverse]})`
              : ""}
            , then round again
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
          {checkState(reader, text.name, lines, text.folder) === "checked" ? (
            <p className="mt-3 text-sm text-green-400">
              ✓ Checked: saved in Documents/{CONFIG.reader.confirmedFolder}
            </p>
          ) : (
            <button
              type="button"
              className="btn mt-4 min-h-12 w-full max-w-sm"
              style={{ color: "#4ade80", borderColor: "#4ade80" }}
              onClick={() => {
                save(markChecked(reader, text.name, lines, Date.now(), text.folder));
                void saveConfirmed(text.name, lines, text.folder);
              }}
            >
              <CircleCheck className="size-4" aria-hidden />
              {checkState(reader, text.name, lines, text.folder) === "changed"
                ? "Checked again: save the new version"
                : "Checked, all written right: save to confirmed_txt"}
            </button>
          )}
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
              fontSize: `min(${(reader.wordSize * scale).toFixed(3)}rem, ${(92 / Math.max(1, shown.length * 0.6)).toFixed(2)}vw)`,
            }}
            aria-live="off"
          >
            {shown}
          </p>
          <p
            {...phraseSpot}
            ref={phraseRef}
            className={`${font} absolute z-10 w-max max-w-[94vw] text-center leading-relaxed select-none`}
            style={{
              ...phraseSpot.style,
              fontSize: `${(reader.phraseSize * scale).toFixed(3)}rem`,
            }}
            aria-label="The whole phrase"
          >
            {wrapWords(words, reader.phraseChars).map((row, r) => (
              <span key={r} className="block">
                {row.map((i) => (
                  <span
                    key={i}
                    className={
                      hitOf(i) === at.word && !at.over
                        ? "text-cyan"
                        : hitOf(i) <= at.word
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

      {plain ? (
        !small && (
          <button
            type="button"
            className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 z-30 rounded-full border border-cyan/40 bg-black/60 p-2 text-cyan opacity-30"
            onClick={() => setBare(false)}
            aria-label="Show the panel again"
          >
            <Eye className="size-4" aria-hidden />
          </button>
        )
      ) : (
        <header
          ref={headerRef}
          className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
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
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className="btn px-2"
                onClick={openMini}
                aria-label="Mini window, over other apps"
                title="Mini window"
              >
                <PictureInPicture2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="btn px-2"
                onClick={() => setBare(true)}
                aria-label="Hide everything but the words"
                title="Hide all"
              >
                <EyeOff className="size-4" aria-hidden />
              </button>
              <button type="button" className="btn px-2" onClick={leave}>
                <LogOut className="size-4" aria-hidden />
                Leave
              </button>
            </div>
          </div>
        </header>
      )}

      {!finished && !plain && (
        <div
          ref={panelRef}
          className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
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
                <div className="mt-2 grid grid-cols-5 gap-1" role="tablist" aria-label="Settings">
                  {PANEL_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={reader.tab === t}
                      data-on={reader.tab === t}
                      className="btn min-h-9 px-0.5"
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
                  <ChevronUp className="size-3" aria-hidden /> Settings: play, look, bytes, flash,
                  stream
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <SubliminalFlash
        phrases={phrases}
        reverse={reader.flashReverse}
        order={reader.flashOrder}
        every={reader.flashEvery}
        ms={reader.flashMs}
        size={reader.flashSize}
        opacity={reader.flashOpacity}
        color={ACCENTS[reader.flashColor]}
        chars={reader.flashChars}
        top={reader.flashAvoid ? room.top : 0}
        bottom={reader.flashAvoid ? room.bottom : 0}
        font={font}
        running={reader.flash && !finished && heldAt === null && editing === null}
        onScreens={onScreens}
        test={testFlash}
      />
      {reader.stream && !finished && (
        <StreamLayer
          phrases={phrases}
          start={index}
          order={reader.streamOrder}
          ms={reader.streamMs}
          perHit={reader.streamPerHit}
          copies={reader.streamCopies}
          places={reader.streamPlaces}
          gap={reader.streamGap}
          flow={reader.streamFlow}
          size={reader.streamSize * scale}
          opacity={reader.streamOpacity}
          color={ACCENTS[reader.streamColor]}
          font={font}
          running={heldAt === null && editing === null}
          anchor={anchor}
        />
      )}
      <ReaderToast />
    </div>,
    document.body,
  );
}
