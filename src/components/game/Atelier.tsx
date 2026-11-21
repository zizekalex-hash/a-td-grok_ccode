import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Check, Dices, ImagePlus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { applyArt, artFor, readArtFile } from "@/game/court/artkeep";
import { CONFIG, type CourtQueenKey } from "@/game/config";
import {
  COLOURS,
  NAME_MAX,
  originalLook,
  PAGES,
  randomLook,
  sameLook,
  SLIDERS,
  TRAITS,
  whoName,
  withShape,
  type ColourKey,
  type TraitKey,
  type Who,
} from "@/game/court/atelier";
import { applyLook, applyName, lookChanged, youName } from "@/game/court/looks";
import { useLooks } from "@/components/game/useLooks";
import { ShaderBackdrop } from "@/components/game/ShaderBackdrop";
import { nebulaLook } from "@/game/shaderart";
import { MOOD_INFO, MOODS, type Mood } from "@/game/court/hearts";
import { FIGURE_H, FIGURE_W, figureUrl } from "@/game/court/figure";
import {
  lookOf,
  portraitUrl,
  queenPortrait,
  youLook,
  youPortrait,
  type Look,
  type ShapeKey,
} from "@/game/court/portrait";

const C = CONFIG.court;
/** The page after the others: a picture brought in for the portrait. */
const ART_PAGE = "art";
const QUEENS = Object.keys(C.queens) as CourtQueenKey[];

/** Whose look it is now: a queen's, or yours. */
function lookNow(who: Who): Look {
  return who === "you" ? youLook() : lookOf(who);
}

/** A small round picture of someone, as they look now. */
function Face({ who, size }: { who: Who; size: number }) {
  useLooks();
  return (
    <img
      src={who === "you" ? youPortrait() : queenPortrait(who, { mood: "smile", tier: 1 })}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full"
      draggable={false}
    />
  );
}

/** Round swatches for one colour: those offered, any other colour, and (where it may be) none. */
function Swatches({
  name,
  value,
  palette,
  none,
  onPick,
}: {
  name: string;
  value: string;
  palette: string[];
  /** What leaving it to itself is called; left out when it must be a colour. */
  none?: string;
  onPick: (v: string) => void;
}) {
  const now = value.toLowerCase();
  return (
    <div className="mb-3">
      <p className="mb-1 font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">{name}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {none && (
          <button
            type="button"
            className="btn atelier-chip"
            data-on={value === ""}
            aria-pressed={value === ""}
            onClick={() => onPick("")}
          >
            {none}
          </button>
        )}
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            className="atelier-swatch"
            data-on={c.toLowerCase() === now}
            aria-pressed={c.toLowerCase() === now}
            aria-label={`${name}: ${c}`}
            style={{ background: c }}
            onClick={() => onPick(c)}
          />
        ))}
        <label className="atelier-swatch atelier-any" title={`Any colour for ${name.toLowerCase()}`}>
          <span className="sr-only">Any colour for {name.toLowerCase()}</span>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"}
            onChange={(e) => onPick(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/** The things a trait can be, as buttons. */
function Choice({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">{name}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={name}>
        {options.map(([v, label]) => (
          <button
            key={v || "none"}
            type="button"
            className="btn atelier-chip"
            data-on={v === value}
            aria-pressed={v === value}
            onClick={() => onPick(v)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Picture art: a picture brought in (any style, any source) for someone's portrait.
 * It sits over the drawn one in the round frame, which stays underneath; where it
 * sits, how large and how much of it shows are set here, live. Kept on the device.
 */
function ArtPanel({ who }: { who: Who }) {
  useLooks();
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const art = artFor(who);
  const hers = who === "you" ? "your" : "her";
  const save = (next: typeof art) => {
    const ok = applyArt(who, next);
    setNote(ok ? "" : "It shows now but did not fit on this device to keep: a smaller picture, or fewer of them.");
  };
  const bring = async (list: FileList | null) => {
    const f = list?.[0];
    if (file.current) file.current.value = "";
    if (!f) return;
    try {
      save(await readArtFile(f));
    } catch (e) {
      setNote(String((e as Error)?.message ?? e));
    }
  };
  const set = (patch: Partial<NonNullable<typeof art>>) => art && save({ ...art, ...patch });
  const slider = (id: string, label: string, v: number, min: number, max: number, step: number, put: (n: number) => void, text: string) => (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`art-${id}`} className="font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">
          {label}
        </label>
        <span className="font-mono text-xs text-cyan">{text}</span>
      </div>
      <input
        id={`art-${id}`}
        type="range"
        className="atelier-range w-full"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => put(Number(e.target.value))}
      />
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-xs leading-snug text-muted">
        Bring a picture for {hers} portrait (a jpg, png or webp, from anywhere). It is made smaller, kept on this device and shown in the round frame everywhere {hers} portrait is, over the drawn one, which stays under it. Nothing is lost: Remove brings back the drawn portrait alone.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          <ImagePlus className="size-4" aria-hidden />
          {art ? "Change picture" : "Bring a picture"}
        </button>
        <button type="button" className="btn" disabled={!art} onClick={() => save(null)}>
          <Trash2 className="size-4" aria-hidden />
          Remove
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={`Picture for ${whoName(who)}`}
        onChange={(e) => void bring(e.target.files)}
      />
      {note && (
        <p className="mb-2 text-xs text-danger" role="status">
          {note}
        </p>
      )}
      {art ? (
        <>
          {slider("fx", "Across: which part", art.fx, 0, 1, 0.01, (n) => set({ fx: n }), `${Math.round(art.fx * 100)}%`)}
          {slider("fy", "Down: which part", art.fy, 0, 1, 0.01, (n) => set({ fy: n }), `${Math.round(art.fy * 100)}%`)}
          {slider("zoom", "Closer", art.zoom, 1, 4, 0.05, (n) => set({ zoom: n }), `×${art.zoom.toFixed(2)}`)}
          {slider(
            "mix",
            "Picture or drawn",
            art.mix,
            0,
            1,
            0.05,
            (n) => set({ mix: n }),
            art.mix >= 1 ? "picture" : art.mix <= 0 ? "drawn" : `${Math.round(art.mix * 100)}% picture`,
          )}
        </>
      ) : (
        <p className="text-xs text-muted">No picture yet: the drawn portrait is {hers} portrait.</p>
      )}
    </div>
  );
}

/** One slider of her shape: its name, its two ends, and a tap to set it back to 0. */
function Slider({ id, value, onSet }: { id: ShapeKey; value: number; onSet: (v: number) => void }) {
  const s = SLIDERS[id];
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`atelier-${id}`} className="font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">
          {s.name}
        </label>
        <button
          type="button"
          className="font-mono text-xs text-cyan disabled:text-muted"
          disabled={value === 0}
          onClick={() => onSet(0)}
          aria-label={`${s.name}: back to as drawn`}
        >
          {value === 0 ? "as drawn" : `${value > 0 ? "+" : ""}${Math.round(value * 100)} ↺`}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-right text-[0.65rem] text-muted">{s.low}</span>
        <input
          id={`atelier-${id}`}
          type="range"
          className="atelier-range min-w-0 flex-1"
          min={-1}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onSet(Number(e.target.value))}
          aria-valuetext={`${Math.round(value * 100)}: from ${s.low} to ${s.high}`}
        />
        <span className="w-12 shrink-0 text-[0.65rem] text-muted">{s.high}</span>
      </div>
    </div>
  );
}

/**
 * The Atelier: someone's look changed by hand, on a live picture. Choose who
 * (you, or a queen), a page (face, eyes, nose and lips, hair, body, dress), then
 * colours, traits and sliders. Nothing changes in the game until Apply.
 */
export function Atelier({
  who: first,
  onLeave,
}: {
  who: Who;
  /** Leaving: back to where it was opened from, for whoever is shown now. */
  onLeave: (who: Who) => void;
}) {
  const artRev = useLooks();
  const [who, setWho] = useState<Who>(first);
  const [draft, setDraft] = useState<Look>(() => lookNow(first));
  const [page, setPage] = useState(PAGES[0]!.id);
  const [mood, setMood] = useState<Mood>("smile");
  const [name, setName] = useState(() => youName());
  /** What to do once the changes are kept or dropped: leave, or turn to someone else. */
  const [asking, setAsking] = useState<{ then: Who | "leave" } | null>(null);
  const shown = useDeferredValue(draft);

  const applied = lookNow(who);
  const dirty = !sameLook(draft, applied) || (who === "you" && name.trim() !== youName());
  const original = originalLook(who);
  const spec = who === "you" ? null : C.queens[who];
  const ring = spec?.color ?? draft.accent;
  const onArt = page === ART_PAGE;
  const drawn = useMemo(() => {
    const region = spec
      ? (C.places as Record<string, { region: string }>)[spec.place]?.region
      : undefined;
    return portraitUrl(shown, spec?.color ?? shown.accent, spec?.element ?? "", {
      mood,
      tier: 2,
      scene: spec?.place,
      region,
      style: C.portraits.style,
    });
  }, [shown, mood, spec]);
  // The picture page shows the portrait as it is in the game (the picture over the drawn one); it follows the pictures kept (artRev).
  const picture =
    onArt && artRev >= 0
      ? who === "you"
        ? youPortrait({ mood })
        : queenPortrait(who, { mood, tier: 2 })
      : drawn;

  // The Body and Dress pages show her whole, standing.
  const whole = page === "body" || page === "dress";
  const standing = useMemo(
    () => (whole ? figureUrl(shown, spec?.color ?? shown.accent, { mood, style: C.portraits.style }) : ""),
    [whole, shown, mood, spec],
  );

  const apply = () => {
    applyLook(who, draft);
    if (who === "you") {
      applyName(name);
      setName(youName());
    }
  };
  /** Turns to someone else, or leaves: asked first when there are changes not applied. */
  const go = (then: Who | "leave") => {
    if (dirty) return setAsking({ then });
    move(then);
  };
  const move = (then: Who | "leave") => {
    setAsking(null);
    if (then === "leave") return onLeave(who);
    setWho(then);
    setDraft(lookNow(then));
    setName(youName());
  };
  const set = (patch: Partial<Look>) => setDraft((d) => ({ ...d, ...patch }));
  const p = PAGES.find((x) => x.id === page) ?? PAGES[0]!;
  const picturePage = page === ART_PAGE;
  const palettes = C.atelier.palettes;
  const hers = who === "you" ? "your" : "her";

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      style={{
        background: `radial-gradient(ellipse at 50% 22%, ${ring}40, ${ring}00 62%), rgba(4, 1, 10, 0.97)`,
      }}
      role="dialog"
      aria-label={`The Atelier: ${whoName(who)}`}
    >
      {/* A nebula in the colour of whoever is shown. */}
      <ShaderBackdrop look={nebulaLook(ring)} className="-z-10" maxOpacity={0.85} />
      <header className="glass flex items-center justify-between gap-2 px-3 py-2">
        <p className="min-w-0 flex-1 truncate font-display text-xs tracking-[0.14em]" style={{ color: ring }}>
          ATELIER · {whoName(who).toUpperCase()}
          {lookChanged(who) ? <span className="text-muted"> · changed</span> : null}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className="btn px-2!"
            onClick={() => setDraft(randomLook())}
            aria-label="A random look"
            title="A random look"
          >
            <Dices className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn px-2!" onClick={() => go("leave")} aria-label="Leave the Atelier">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* Who: you first, then every queen. */}
      <div className="mt-2 flex shrink-0 gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Whose look">
        {(["you", ...QUEENS] as Who[]).map((w) => (
          <button
            key={w}
            type="button"
            className="atelier-who"
            data-on={w === who}
            aria-pressed={w === who}
            aria-label={`${whoName(w)}${lookChanged(w) ? ", changed" : ""}`}
            onClick={() => (w === who ? undefined : go(w))}
          >
            <Face who={w} size={38} />
            <span>{whoName(w)}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 flex shrink-0 items-center justify-center gap-3">
        {whole ? (
          <img
            src={standing}
            alt={`${whoName(who)}, standing, as ${who === "you" ? "you" : "she"} would look`}
            className="h-[min(34dvh,300px)] w-auto rounded-lg"
            style={{ aspectRatio: `${FIGURE_W} / ${FIGURE_H}`, background: `radial-gradient(ellipse at 50% 40%, ${draft.bg[0]}, ${draft.bg[1]})`, boxShadow: `0 0 24px ${ring}66` }}
            draggable={false}
          />
        ) : (
          <img
            src={picture}
            alt={`${whoName(who)}, as ${who === "you" ? "you" : "she"} would look`}
            className="aspect-square w-[min(24dvh,44vw,200px)] rounded-full"
            style={{ boxShadow: `0 0 30px ${ring}88` }}
            draggable={false}
          />
        )}
        {/* Her face in each mood, to see the look hold up in all of them. */}
        <div className={`flex ${whole ? "max-h-[min(34dvh,300px)]" : "max-h-[min(24dvh,44vw,200px)]"} flex-col gap-1 overflow-y-auto`} role="group" aria-label="Seen in a mood">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              className="btn atelier-chip"
              data-on={m === mood}
              aria-pressed={m === mood}
              onClick={() => setMood(m)}
            >
              {MOOD_INFO[m].name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="What to change">
        {[...PAGES.map((x) => ({ id: x.id, name: x.name })), { id: ART_PAGE, name: "Picture" }].map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === page}
            className="btn atelier-chip shrink-0"
            data-on={x.id === page}
            onClick={() => setPage(x.id)}
          >
            {x.name}
          </button>
        ))}
      </div>

      <div className="glass mt-1 min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel" aria-label={picturePage ? "Picture" : p.name}>
        {picturePage && <ArtPanel who={who} />}
        {!picturePage && who === "you" && p.id === "body" && (
          <div className="mb-3">
            <label htmlFor="atelier-name" className="mb-1 block font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">
              Your name, over your figure on the map
            </label>
            <input
              id="atelier-name"
              className="w-full rounded-md border border-cyan/40 bg-black/40 px-2 py-1.5 font-mono text-sm text-fg"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        {!picturePage && p.colours.map((key: ColourKey) => (
          <Swatches
            key={key}
            name={COLOURS[key].name}
            value={draft[key] ?? ""}
            palette={palettes[COLOURS[key].palette] as string[]}
            none={COLOURS[key].none}
            // A new hair colour takes its shine with it (the old shine was the old hair's).
            onPick={(v) => set(key === "hair" ? { hair: v, sheen: "" } : { [key]: v })}
          />
        ))}
        {!picturePage && p.traits.map((key: TraitKey) => (
          <Choice
            key={key}
            name={who === "you" ? TRAITS[key].name.replace("her", "your") : TRAITS[key].name}
            value={draft[key] ?? TRAITS[key].options[0]![0]}
            options={TRAITS[key].options}
            onPick={(v) => set({ [key]: v })}
          />
        ))}
        {!picturePage && p.bg && (
          <div className="mb-3">
            <p className="mb-1 font-display text-[0.65rem] tracking-[0.14em] text-muted uppercase">Behind {who === "you" ? "you" : "her"}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {palettes.bg.map((pair) => {
                const on = pair[0] === draft.bg[0] && pair[1] === draft.bg[1];
                return (
                  <button
                    key={pair.join()}
                    type="button"
                    className="atelier-swatch"
                    data-on={on}
                    aria-pressed={on}
                    aria-label={`Background ${pair[0]} to ${pair[1]}`}
                    style={{ background: `radial-gradient(circle, ${pair[0]} 30%, ${pair[1]} 90%)` }}
                    onClick={() => set({ bg: [pair[0]!, pair[1]!] })}
                  />
                );
              })}
            </div>
          </div>
        )}
        {!picturePage && p.sliders.map((key) => (
          <Slider
            key={key}
            id={key}
            value={draft.shape?.[key] ?? 0}
            onSet={(v) => setDraft((d) => withShape(d, key, v))}
          />
        ))}
        {!picturePage && p.sliders.includes("hornSize") && !draft.horns && (
          <p className="text-xs text-muted">Horn size shows once a colour for horns is chosen.</p>
        )}
      </div>

      <div className="mt-2 shrink-0">
        {asking ? (
          <div className="glass flex flex-wrap items-center justify-between gap-2 px-3 py-2" role="alertdialog" aria-label="Changes not applied">
            <p className="text-sm">Keep the changes to {who === "you" ? "your" : `${whoName(who)}'s`} look?</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  apply();
                  move(asking.then);
                }}
              >
                Apply
              </button>
              <button type="button" className="btn" onClick={() => move(asking.then)}>
                Drop them
              </button>
              <button type="button" className="btn" onClick={() => setAsking(null)}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className="btn"
              disabled={sameLook(draft, original)}
              onClick={() => setDraft(original)}
              title={`The look ${who === "you" ? "you start with" : "she comes with"}`}
            >
              <RotateCcw className="size-4" aria-hidden />
              Original
            </button>
            <button type="button" className="btn" disabled={!dirty} onClick={() => {
              setDraft(applied);
              setName(youName());
            }}>
              <Undo2 className="size-4" aria-hidden />
              Undo
            </button>
            <button type="button" className="btn btn-gold" disabled={!dirty} onClick={apply}>
              <Check className="size-4" aria-hidden />
              Apply
            </button>
          </div>
        )}
        {/* On a short screen the room goes to the sliders. */}
        <p className="mt-1.5 text-center text-[0.65rem] text-muted [@media(max-height:700px)]:hidden">
          {dirty
            ? `Apply makes this ${hers} look everywhere in the Court. Undo goes back to ${hers} look now.`
            : `This is ${hers} look in the Court now. It is kept on this device; Original brings back the first one.`}
        </p>
      </div>
    </div>
  );
}
