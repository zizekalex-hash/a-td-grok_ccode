import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Coins,
  Crown,
  Droplets,
  Flame,
  Gift,
  Heart,
  LogOut,
  Minus,
  Newspaper,
  Plus,
  ScrollText,
  Shuffle,
  SkipForward,
  Sparkles,
  Store,
  Trophy,
  X,
} from "lucide-react";
import { MenuButton } from "@/components/game/BattleButtons";
import { BinaryWall } from "@/components/game/BinaryWall";
import { RestSet } from "@/components/game/RestSet";
import { useChromeInsets } from "@/components/game/useChromeInsets";
import { CONFIG } from "@/game/config";
import { CourtGame, STANCE_COLOR } from "@/game/court/courtgame";
import {
  gateOf,
  GIFT_KEYS,
  meetsNeed,
  needLabel,
  needMet,
  needText,
  QUEEN_KEYS,
  queenAt,
  queensIn,
  REGION_KEYS,
  regionOf,
  SKILL_KEYS,
  skillAt,
  skillLevel,
  tierOf,
  type PlaceKey,
  type QueenKey,
  type SkillKey,
  bonusReward,
} from "@/game/court/rules";
import { canBlink, placeBanner, queenAir, queenPortrait } from "@/game/court/portrait";
import {
  BOND_NAME,
  bondsOf,
  GALLERY_SIZE,
  hasSeen,
  MOOD_INFO,
  MOODS,
  seenCount,
  type Mood,
} from "@/game/court/hearts";
import { ago } from "@/game/court/news";
import { xpForLevel } from "@/game/recite";
import { clock, pickBonus, readReps, startSet, writeReps, type RepsState } from "@/game/reps";
import { getGame } from "@/game/registry";
import { useGame, type CourtView } from "@/game/store";

const C = CONFIG.court;

function game(): CourtGame | null {
  const g = getGame();
  return g instanceof CourtGame ? g : null;
}

function useCourt(): CourtView | null {
  return useGame((s) => s.courtView);
}

/** Progress through the current level of a skill, 0 to 100. */
function levelPct(xp: number): number {
  const level = skillLevel(xp);
  const floor = xpForLevel(level);
  const next = level >= 99 ? floor : xpForLevel(level + 1);
  return next > floor ? Math.min(100, ((xp - floor) / (next - floor)) * 100) : 100;
}

/** Whether the viewer asked for less motion: portraits then stay still. */
function prefersStill(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * A queen's portrait that moves cheaply: the still picture breathes (a scale of
 * the whole), she blinks (a picture with her eyes shut fades in for a moment),
 * and a light overlay carries what floats around her. Only scale and fades
 * animate, which the screen does without redrawing the picture. Still for
 * anyone who asks for less motion.
 */
function LivePortrait({
  q,
  mood,
  tier,
  alt,
  className = "",
  style,
}: {
  q: QueenKey;
  mood: Mood;
  tier: number;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (prefersStill()) {
    return (
      <img
        src={queenPortrait(q, { mood, tier })}
        alt={alt}
        className={className}
        style={style}
        draggable={false}
      />
    );
  }
  const seed = QUEEN_KEYS.indexOf(q);
  const air = queenAir(q, mood, tier);
  const layer = "pointer-events-none absolute inset-0 size-full";
  return (
    <div
      role="img"
      aria-label={alt}
      className={`court-breathe relative overflow-hidden ${className}`}
      style={{ ...style, animationDelay: `-${seed * 0.7}s` }}
    >
      <img
        src={queenPortrait(q, { mood, tier, air: false })}
        alt=""
        className={layer}
        draggable={false}
      />
      {canBlink(C.queens[q].look, mood) && (
        <img
          src={queenPortrait(q, { mood, tier, air: false, blink: true })}
          alt=""
          className={`court-blink ${layer}`}
          style={{ animationDuration: `${4.2 + (seed % 5) * 0.6}s` }}
          draggable={false}
        />
      )}
      {air && <img src={air} alt="" className={layer} draggable={false} />}
    </div>
  );
}

/**
 * A queen's portrait, round, with a soft glow in her colour: in her mood now (or
 * the one given), with her tier's jewels. Large ones move; small ones stay still.
 */
function QueenAvatar({ q, size, mood }: { q: QueenKey; size: number; mood?: Mood }) {
  const v = useCourt();
  const spec = C.queens[q];
  const m = mood ?? v?.moods[q] ?? "smile";
  const tier = v ? tierOf(v.save.affection[q]).index : 1;
  const alt = `${spec.name}, ${spec.title}: ${MOOD_INFO[m].name.toLowerCase()}`;
  const style = {
    width: size,
    height: size,
    boxShadow: `0 0 ${Math.round(size / 4)}px ${spec.color}88`,
  };
  if (size >= 96)
    return (
      <LivePortrait
        q={q}
        mood={m}
        tier={tier}
        alt={alt}
        className="shrink-0 rounded-full"
        style={style}
      />
    );
  return (
    <img
      src={queenPortrait(q, { mood: m, tier })}
      alt={alt}
      width={size}
      height={size}
      className="shrink-0 rounded-full"
      style={style}
      draggable={false}
    />
  );
}

/** A queen's portrait filling the screen; any tap closes it. */
function PortraitView({
  q,
  affection,
  mood,
  onClose,
}: {
  q: QueenKey;
  affection: number;
  /** A mood from the gallery; her mood now when left out. */
  mood?: Mood;
  onClose: () => void;
}) {
  const v = useCourt();
  const spec = C.queens[q];
  const tier = tierOf(affection);
  const m = mood ?? v?.moods[q] ?? "smile";
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4"
      style={{
        background: `radial-gradient(circle at 50% 42%, ${spec.color}66, ${spec.color}00 65%), rgba(6, 2, 14, 0.97)`,
      }}
      role="dialog"
      aria-label={`${spec.name}'s portrait`}
      onClick={onClose}
    >
      <LivePortrait
        q={q}
        mood={m}
        tier={tier.index}
        alt={`${spec.name}, ${spec.title}: ${MOOD_INFO[m].name.toLowerCase()}`}
        className="aspect-square w-[min(88vw,64dvh,560px)] rounded-full"
        style={{ boxShadow: `0 0 64px ${spec.color}aa, 0 0 140px ${spec.color}44` }}
      />
      <p className="font-display text-xl tracking-[0.18em]" style={{ color: spec.color }}>
        {spec.name.toUpperCase()}
      </p>
      <p className="-mt-2 text-sm text-muted">
        {spec.title} · {tier.name} · {MOOD_INFO[m].name}
      </p>
      <button type="button" className="btn" onClick={onClose} aria-label="Close portrait">
        <X className="size-4" aria-hidden />
        Close
      </button>
    </div>
  );
}

/** A queen's avatar you can tap to see her portrait full screen (in a gallery mood, if given). */
function PortraitButton({
  q,
  size,
  affection,
  mood,
}: {
  q: QueenKey;
  size: number;
  affection: number;
  mood?: Mood;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="shrink-0 rounded-full"
        onClick={() => setOpen(true)}
        aria-label={`View ${C.queens[q].name}'s portrait${mood ? `: ${MOOD_INFO[mood].name.toLowerCase()}` : ""}`}
      >
        <QueenAvatar q={q} size={size} mood={mood} />
      </button>
      {/* On the page itself: a sheet's backdrop blur would hold a fixed overlay inside the sheet. */}
      {open &&
        createPortal(
          <PortraitView q={q} affection={affection} mood={mood} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}

/** Her nine moods: the ones you have seen, and locks with how to see the rest. */
function MoodRow({ q, v, size }: { q: QueenKey; v: CourtView; size: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`${C.queens[q].name}'s portraits`}>
      {MOODS.map((m) =>
        hasSeen(v.save, q, m) ? (
          <li key={m}>
            <PortraitButton q={q} size={size} affection={v.save.affection[q]} mood={m} />
          </li>
        ) : (
          <li
            key={m}
            className="flex shrink-0 items-center justify-center rounded-full border border-dashed font-display text-xs text-muted"
            style={{ width: size, height: size, borderColor: `${C.queens[q].color}66` }}
            title={`${MOOD_INFO[m].name}: ${MOOD_INFO[m].hint}`}
            aria-label={`${MOOD_INFO[m].name}, locked: ${MOOD_INFO[m].hint}`}
          >
            ?
          </li>
        ),
      )}
    </ul>
  );
}

function Sheet({
  title,
  onClose,
  children,
  wide = false,
  tint,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** A colour washed over the sheet: a queen's, or her region's. */
  tint?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <section
        className={`glass pointer-events-auto flex max-h-[70dvh] w-full flex-col ${wide ? "max-w-3xl" : "max-w-xl"}`}
        role="dialog"
        aria-label={title}
        style={
          tint
            ? {
                background: `linear-gradient(160deg, ${tint}40, rgba(12, 6, 26, 0.94) 55%)`,
                borderColor: `${tint}99`,
              }
            : undefined
        }
      >
        <header className="flex items-center justify-between gap-3 border-b border-cyan/30 px-3 py-2">
          <h2
            className="font-display text-sm tracking-[0.16em] uppercase"
            style={{ color: tint ?? undefined }}
          >
            <span className={tint ? "" : "text-cyan"}>{title}</span>
          </h2>
          <button type="button" className="btn" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </section>
    </div>
  );
}

function close() {
  game()?.courtOpen(null);
}

function Hearts({ q, affection }: { q: QueenKey; affection: number }) {
  const t = tierOf(affection);
  const max = C.affectionTiers.length - 1;
  const pct = t.next
    ? Math.min(
        100,
        ((affection - (C.affectionTiers[t.index]?.at ?? 0)) /
          (t.next - (C.affectionTiers[t.index]?.at ?? 0))) *
          100,
      )
    : 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span style={{ color: C.queens[q].color }} aria-label={`${t.name}, ${t.index} of ${max}`}>
          {"♥".repeat(t.index)}
          <span className="text-muted">{"♡".repeat(max - t.index)}</span> {t.name}
        </span>
        <span className="text-muted">
          {t.next ? `${Math.floor(affection)} / ${t.next}` : "Devoted"}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-cyan/10">
        <div
          className="h-1.5 rounded"
          style={{ width: `${pct}%`, background: C.queens[q].color }}
        />
      </div>
    </div>
  );
}

function SkillChip({ skill, xp }: { skill: SkillKey; xp: number }) {
  const spec = C.skills[skill];
  const color = STANCE_COLOR[spec.element === "water" ? "water" : "fire"];
  return (
    <div className="rounded-md border border-cyan/25 px-2 py-1.5" title={spec.copy}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs" style={{ color }}>
          {spec.name}
        </span>
        <span className="font-display text-sm text-fg">{skillLevel(xp)}</span>
      </div>
      <div className="mt-1 h-1 rounded bg-cyan/10">
        <div className="h-1 rounded" style={{ width: `${levelPct(xp)}%`, background: color }} />
      </div>
    </div>
  );
}

function PlaceSheet({ place, v }: { place: PlaceKey; v: CourtView }) {
  const spec = C.places[place];
  const gate = gateOf(place);
  if (gate) {
    const open = needMet(gate.need, v.save.skills);
    return (
      <Sheet title={spec.name} onClose={close} tint={C.regions[gate.to].tint}>
        <img
          src={placeBanner(gate.toPlace)}
          alt=""
          className="mb-2 h-28 w-full rounded-md object-cover"
          draggable={false}
        />
        <p className="text-sm leading-relaxed text-muted">{spec.blurb}</p>
        <p className="mt-2 text-xs text-muted">{C.regions[gate.to].blurb}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {queensIn(gate.to).map((qq) => (
            <QueenAvatar key={qq} q={qq} size={44} />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-gold mt-3 min-h-12 w-full"
          disabled={!open}
          onClick={() => game()?.courtTravel(place)}
        >
          Travel to {C.regions[gate.to].name}
        </button>
        {!open && (
          <p className="mt-2 rounded-md border border-danger/50 p-2 text-xs text-danger">
            Opens at {needLabel(gate.need)}. You are at total level {v.total}.
          </p>
        )}
      </Sheet>
    );
  }
  const q = queenAt(place);
  const skill = skillAt(place, v.save.stance);
  const other = skillAt(place, v.save.stance === "fire" ? "water" : "fire");
  const watching = q && meetsNeed(q, v.save.skills);
  const tint = q ? C.queens[q].color : C.regions[regionOf(place)].tint;
  return (
    <Sheet title={spec.name} onClose={close} tint={tint}>
      <img
        src={placeBanner(place)}
        alt=""
        className="mb-2 h-28 w-full rounded-md object-cover"
        style={{ boxShadow: `inset 0 0 0 1px ${tint}66` }}
        draggable={false}
      />
      <p className="text-sm leading-relaxed text-muted">{spec.blurb}</p>
      {skill && (
        <button
          type="button"
          className="btn btn-gold mt-3 min-h-14 w-full flex-col gap-0"
          onClick={() => game()?.courtRecite(place)}
        >
          <span className="flex items-center gap-2">
            <ScrollText className="size-4" aria-hidden />
            Recite: train {C.skills[skill].name}
          </span>
          <span className="text-[0.65rem] tracking-normal normal-case opacity-90">
            Level {skillLevel(v.save.skills[skill])}
            {watching && q
              ? ` · ${C.queens[q].name} watches: +${Math.round(C.watchedBonus * 100)}% XP`
              : ""}
            {v.save.elixirReps > 0 ? ` · elixir ×${C.elixir.mult} (${v.save.elixirReps})` : ""}
          </span>
        </button>
      )}
      {other && (
        <p className="mt-2 text-xs text-muted">
          In the {v.save.stance === "fire" ? "Water" : "Fire"} style this place trains{" "}
          {C.skills[other].name} (level {skillLevel(v.save.skills[other])}). Switch style at the
          top.
        </p>
      )}
      {q && (
        <button
          type="button"
          className="btn mt-3 min-h-14 w-full justify-start gap-3"
          onClick={() => game()?.courtVisit(q)}
        >
          <QueenAvatar q={q} size={40} />
          <span>Talk to {C.queens[q].name}</span>
        </button>
      )}
    </Sheet>
  );
}

/** How she feels about you, today's wish, the passes she remembers, and her portraits. */
function HeartStatus({ q, v }: { q: QueenKey; v: CourtView }) {
  const spec = C.queens[q];
  const mood = v.moods[q];
  const wish = v.wishes[q];
  const rival = v.rivals[q];
  const devotion = v.save.devotion[q];
  const next = C.hearts.memories.find((m) => m > devotion);
  const skill = C.skills[wish.skill];
  const where = Object.values(C.places)
    .filter((p) => p.fire === wish.skill || p.water === wish.skill)
    .map((p) => p.name);
  const feeling =
    mood === "jealous"
      ? `Jealous${rival ? ` of ${C.queens[rival].name}` : ""}. A gift, or a whole phrase recited for her, makes up.`
      : mood === "longing"
        ? "She missed you so much."
        : mood === "fierce"
          ? "Your streak has her burning."
          : mood === "delighted"
            ? "Delighted with you."
            : `${MOOD_INFO[mood].name}.`;
  return (
    <div
      className="mt-3 space-y-2 rounded-md border p-2 text-xs"
      style={{ borderColor: `${spec.color}55` }}
    >
      <p>
        <span className="font-display tracking-wider" style={{ color: spec.color }}>
          MOOD
        </span>{" "}
        {feeling}
      </p>
      <Feeling q={q} v={v} />
      <div>
        <p className="flex justify-between gap-2">
          <span>
            <span className="font-display tracking-wider text-gold">TODAY'S WISH</span>{" "}
            {wish.passes} passes of {skill.name}
          </span>
          <span className={wish.done ? "text-gold" : ""}>
            {wish.done ? "Granted ✓" : `${wish.progress}/${wish.passes}`}
          </span>
        </p>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded bg-white/10"
          role="progressbar"
          aria-label={`${spec.name}'s wish`}
          aria-valuemin={0}
          aria-valuemax={wish.passes}
          aria-valuenow={wish.progress}
        >
          <div
            className="h-full rounded"
            style={{ width: `${(wish.progress / wish.passes) * 100}%`, background: spec.color }}
          />
        </div>
        {!wish.done && (
          <p className="mt-0.5 text-muted">
            {skill.element === "water" ? "Water" : "Fire"} style
            {where.length ? `, at ${where.join(" or ")}` : ""}. Granting it: +
            {C.hearts.wishAffection} affection, +{C.hearts.wishGold} gold.
          </p>
        )}
      </div>
      <p className="text-muted">
        Passes recited for her: {devotion.toLocaleString()}
        {next ? ` · she will remember ${next}` : ""}
      </p>
      <YourStory q={q} v={v} />
      <div>
        <p className="mb-1 flex justify-between">
          <span className="font-display tracking-wider" style={{ color: spec.color }}>
            PORTRAITS
          </span>
          <span className="text-muted">
            {seenCount(v.save, q)}/{MOODS.length}
          </span>
        </p>
        <MoodRow q={q} v={v} size={34} />
      </div>
    </div>
  );
}

/** A feeling she has for a while (lonely, looking for you, hurt...), and how long it lasts. */
function Feeling({ q, v }: { q: QueenKey; v: CourtView }) {
  const f = v.feelings[q];
  if (!f) return null;
  const spec = C.hearts.arcs[f.id];
  const mins = Math.max(1, Math.ceil((f.ends - Date.now()) / 60_000));
  const mult = spec.affection !== 1 ? ` · ×${spec.affection} ♥` : "";
  return (
    <p>
      <span className="font-display tracking-wider" style={{ color: C.queens[q].color }}>
        FEELING
      </span>{" "}
      {spec.name}: {spec.copy}{" "}
      <span className="text-muted">
        ({mins} min{mult})
      </span>
    </p>
  );
}

/** Your story with her: since when, dates, gifts, and what the town says about her. */
function YourStory({ q, v }: { q: QueenKey; v: CourtView }) {
  const spec = C.queens[q];
  const met = v.save.met[q];
  const rumor = v.save.news.find((n) => n.queen === q && n.kind === "rumor");
  return (
    <div>
      <p className="font-display tracking-wider" style={{ color: spec.color }}>
        YOUR STORY
      </p>
      <p className="text-muted">
        {met
          ? `Together since ${new Date(met).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
          : "You have only just met"}{" "}
        · {v.save.dates[q]} date{v.save.dates[q] === 1 ? "" : "s"} · {v.save.given[q]} gift
        {v.save.given[q] === 1 ? "" : "s"}
      </p>
      {rumor && <p className="mt-0.5 italic">The town says: {rumor.text}</p>}
    </div>
  );
}

/** Her sisters, friends and rivals: tap one to see her. */
function Bonds({ q }: { q: QueenKey }) {
  const bonds = bondsOf(q);
  if (!bonds.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs tracking-wider text-muted uppercase">
        Sisters, friends and rivals
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {bonds.map((b) => (
          <li key={b.queen}>
            <button
              type="button"
              className="btn min-h-10 gap-1.5 py-1 pr-2.5 pl-1 text-xs tracking-normal normal-case"
              onClick={() => game()?.courtOpen({ kind: "queen", queen: b.queen })}
              style={{ borderColor: `${C.queens[b.queen].color}88` }}
            >
              <QueenAvatar q={b.queen} size={28} />
              <span>
                <span style={{ color: C.queens[b.queen].color }}>{C.queens[b.queen].name}</span>
                <span className="text-muted">
                  {" "}
                  · {b.kind === "rival" ? "rival 💢" : `${BOND_NAME[b.kind]} ♥`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[0.7rem] text-muted">
        Court her and her sisters and friends put in a good word (+{C.news.goodWord} ♥); her rivals
        grow jealous wherever they are.
      </p>
    </div>
  );
}

/** Notices about the queens and the town's rumors: on screen for a while; tap one away. */
function Notices({ v, className, max = 3 }: { v: CourtView; className: string; max?: number }) {
  const list = v.notices.slice(-max);
  if (!list.length) return null;
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-1.5 ${className}`}>
      {list.map((n) => (
        <button
          key={n.id}
          type="button"
          className="court-notice pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs leading-snug"
          style={{
            animationDuration: `${C.news.noticeSeconds}s`,
            borderColor: `${n.color}99`,
            background: `linear-gradient(90deg, ${n.color}38, rgba(12, 6, 26, 0.94) 55%)`,
            boxShadow: `0 4px 18px rgba(0,0,0,0.5), 0 0 12px ${n.color}33`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => game()?.courtNotice(n.id)}
          aria-label={`${n.text}. Tap to ${n.queen && !v.session ? "see her" : "dismiss"}.`}
        >
          {n.queen ? (
            <QueenAvatar q={n.queen} size={30} />
          ) : (
            <Newspaper className="size-5 shrink-0 text-gold" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-fg">{n.text}</span>
        </button>
      ))}
    </div>
  );
}

/** News and rumors: the queen the town talks about today, then everything said, newest first. */
function NewsSheet({ v, since }: { v: CourtView; since: number }) {
  const now = Date.now();
  const buzz = C.queens[v.buzz];
  return (
    <Sheet title="News & rumors" onClose={close}>
      <div
        className="flex items-center gap-3 rounded-md border p-2"
        style={{
          borderColor: `${buzz.color}99`,
          background: `linear-gradient(90deg, ${buzz.color}30, transparent 70%)`,
        }}
      >
        <QueenAvatar q={v.buzz} size={52} />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-display tracking-[0.14em] text-gold">TALK OF THE TOWN 🔥</p>
          <p className="mt-0.5">
            Everyone is talking about <span style={{ color: buzz.color }}>{buzz.name}</span> today:
            everything you do for her counts ×{C.news.buzzMult} ♥ until midnight.
          </p>
        </div>
        <button type="button" className="btn shrink-0" onClick={() => game()?.courtVisit(v.buzz)}>
          Go
        </button>
      </div>
      {v.save.news.length ? (
        <ul className="mt-3 space-y-1.5" aria-label="What the Court has said">
          {v.save.news.map((n, i) => (
            <li
              key={`${n.at}-${i}`}
              className="flex items-start gap-2 rounded-md border border-cyan/20 p-1.5 text-xs leading-snug"
              style={n.queen ? { borderColor: `${C.queens[n.queen].color}44` } : undefined}
            >
              {n.queen ? (
                <QueenAvatar q={n.queen} size={28} />
              ) : (
                <Newspaper className="mt-1 size-4 shrink-0 text-gold" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                {n.kind === "rumor" && <span className="text-muted">Rumor: </span>}
                {n.text}
                <span className="block text-[0.65rem] text-muted">
                  {n.at > since && <span className="mr-1 font-bold text-gold">NEW</span>}
                  {ago(n.at, now)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Nothing yet. Walk the map, and the town will start to talk about you.
        </p>
      )}
    </Sheet>
  );
}

/** Every queen's every mood, and how to see the ones still locked. */
function GallerySheet({ v }: { v: CourtView }) {
  return (
    <Sheet title={`Gallery ${seenCount(v.save)}/${GALLERY_SIZE}`} onClose={close} wide>
      <p className="mb-2 text-xs text-muted">
        Every queen has nine faces. Each new one you see is kept here and pays{" "}
        {C.hearts.galleryGold} gold. Tap one to see it full size.
      </p>
      <ul className="mb-3 grid grid-cols-1 gap-x-3 gap-y-0.5 text-[0.7rem] text-muted sm:grid-cols-2">
        {MOODS.map((m) => (
          <li key={m}>
            <span className="font-display text-gold">{MOOD_INFO[m].name}</span>: {MOOD_INFO[m].hint}
          </li>
        ))}
      </ul>
      {QUEEN_KEYS.map((q) => (
        <section key={q} className="mb-2">
          <p className="mb-1 font-display text-xs" style={{ color: C.queens[q].color }}>
            {C.queens[q].name}{" "}
            <span className="text-muted">
              {seenCount(v.save, q)}/{MOODS.length}
            </span>
          </p>
          <MoodRow q={q} v={v} size={40} />
        </section>
      ))}
    </Sheet>
  );
}

function QueenSheet({ q, v }: { q: QueenKey; v: CourtView }) {
  const spec = C.queens[q];
  const ok = meetsNeed(q, v.save.skills);
  const affection = v.save.affection[q];
  const tier = tierOf(affection).index;
  const owned = GIFT_KEYS.filter((g) => v.save.gifts[g] > 0);
  const element = spec.element === "water" ? "water" : "fire";
  return (
    <Sheet title={spec.name} onClose={close} tint={spec.color}>
      <div className="flex items-start gap-3">
        <PortraitButton q={q} size={104} affection={affection} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs tracking-[0.12em]" style={{ color: spec.color }}>
            {spec.title.toUpperCase()}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Loves the{" "}
            <span style={{ color: STANCE_COLOR[element] }}>
              {element === "fire" ? "Fire" : "Water"}
            </span>{" "}
            style · favourite skills:{" "}
            {spec.favored.map((k) => C.skills[k as SkillKey]?.name).join(", ")} · favourite gift:{" "}
            {C.gifts[spec.gift as keyof typeof C.gifts]?.name}
          </p>
          <div className="mt-2">
            <Hearts q={q} affection={affection} />
          </div>
        </div>
      </div>
      {v.out.includes(q) && (
        <p
          className="mt-3 rounded-md border p-2 text-xs"
          style={{ borderColor: `${spec.color}99`, color: spec.color }}
        >
          She is out on the map, looking for you. Talk to her, give her a gift or recite while she
          is with you, and she goes home happy; ignore her, and she goes home hurt.
        </p>
      )}
      {v.buzz === q && (
        <p className="mt-3 rounded-md border border-gold/60 p-2 text-xs text-gold">
          🔥 The talk of the town today: everything you do for her counts ×{C.news.buzzMult} ♥ until
          midnight.
        </p>
      )}
      {!ok && (
        <p className="mt-3 rounded-md border border-danger/50 p-2 text-xs text-danger">
          She wants {needText(q)} before more than hello.
        </p>
      )}
      {ok && <HeartStatus q={q} v={v} />}
      <Bonds q={q} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-gold"
          disabled={!ok}
          onClick={() => game()?.courtRecite(spec.place as PlaceKey, { queen: q })}
        >
          <ScrollText className="size-4" aria-hidden />
          Recite for her
        </button>
        <button type="button" className="btn" onClick={() => game()?.courtGreet(q)}>
          <Sparkles className="size-4" aria-hidden />
          Charm her
        </button>
        <button
          type="button"
          className="btn col-span-2 flex-col gap-0"
          disabled={!ok || tier < C.dateTier}
          onClick={() => game()?.courtDate(q)}
        >
          <span className="flex items-center gap-2">
            <Heart className="size-4" aria-hidden />
            Date: {spec.date}
          </span>
          <span className="text-[0.65rem] tracking-normal normal-case opacity-80">
            {tier < C.dateTier
              ? `Opens at ${C.affectionTiers[C.dateTier]?.name}`
              : `${C.datePhrases} phrases · ×${C.affection.dateMult} affection · ×${C.dateXpMult} XP`}
          </span>
        </button>
      </div>
      <p className="mt-3 text-xs tracking-wider text-muted uppercase">Give a gift</p>
      {owned.length ? (
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {owned.map((g) => (
            <button
              key={g}
              type="button"
              className="btn flex-col gap-0"
              disabled={!ok}
              onClick={() => game()?.courtGift(q, g)}
            >
              <span className="flex items-center gap-1">
                <Gift className="size-3.5" aria-hidden />
                {C.gifts[g].name} ×{v.save.gifts[g]}
              </span>
              <span className="text-[0.6rem] tracking-normal normal-case opacity-80">
                +{C.gifts[g].value * (spec.gift === g ? 2 : 1)} affection
                {spec.gift === g ? " · her favourite" : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">No gifts yet. The Moon Market sells them.</p>
      )}
    </Sheet>
  );
}

function ShopSheet({ v }: { v: CourtView }) {
  const items = [
    ...GIFT_KEYS.map((g) => ({ key: g, ...C.gifts[g] })),
    { key: "elixir" as const, ...C.elixir, value: 0 },
  ];
  return (
    <Sheet title="Moon Market" onClose={close}>
      <p className="text-sm text-muted">
        You have <span className="text-gold">{Math.floor(v.save.gold).toLocaleString()} gold</span>.
        The Forest and the Mine pay best.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.key} className="rounded-md border border-cyan/30 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-xs text-fg">{it.name}</p>
              <p className="text-xs text-muted">
                {it.key === "elixir"
                  ? `${v.save.elixirReps} reps left`
                  : `own ${v.save.gifts[it.key]}`}
              </p>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted">
              {it.copy}
              {it.key !== "elixir"
                ? ` +${it.value} affection; double for the queen who loves it.`
                : ""}
            </p>
            <button
              type="button"
              className="btn mt-2 w-full"
              disabled={v.save.gold < it.cost}
              onClick={() => game()?.courtBuy(it.key)}
            >
              Buy · {it.cost} gold
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function SkillsSheet({ v }: { v: CourtView }) {
  return (
    <Sheet title={`Skills · total ${v.total}`} onClose={close} wide>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {SKILL_KEYS.map((k) => (
          <SkillChip key={k} skill={k} xp={v.save.skills[k]} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {v.save.stats.reps.toLocaleString()} reps · {v.save.stats.phrases.toLocaleString()} phrases
        · best streak {v.save.stats.bestStreak}. Fire skills in orange, Water skills in blue. Each
        place trains one of each.
      </p>
    </Sheet>
  );
}

function QueensSheet({ v }: { v: CourtView }) {
  return (
    <Sheet title="The queens" onClose={close}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => game()?.courtOpen({ kind: "gallery" })}
        >
          <Sparkles className="size-4" aria-hidden />
          Gallery {seenCount(v.save)}/{GALLERY_SIZE}
        </button>
        <button type="button" className="btn" onClick={() => game()?.courtOpen({ kind: "news" })}>
          <Newspaper className="size-4" aria-hidden />
          News{v.unread > 0 ? ` (${v.unread})` : ""}
        </button>
      </div>
      {REGION_KEYS.map((region) => (
        <section key={region} className="mb-3">
          <h3
            className="mb-1 font-display text-xs tracking-[0.14em] uppercase"
            style={{ color: C.regions[region].tint }}
          >
            {C.regions[region].name}
            {region === v.region ? <span className="text-muted"> · you are here</span> : ""}
          </h3>
          <ul className="space-y-2">
            {queensIn(region).map((q) => {
              const spec = C.queens[q];
              const ok = meetsNeed(q, v.save.skills);
              return (
                <li key={q} className="rounded-md border border-cyan/25 p-2">
                  <div className="flex items-center gap-2">
                    <PortraitButton q={q} size={48} affection={v.save.affection[q]} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xs" style={{ color: spec.color }}>
                        {spec.name}
                        {v.buzz === q ? " 🔥" : ""}{" "}
                        <span className="text-muted">
                          · {C.places[spec.place as PlaceKey].name}
                        </span>
                        {regionOf(spec.place as PlaceKey) !== v.region && (
                          <span className="text-muted"> (walk through the gate)</span>
                        )}
                      </p>
                      <Hearts q={q} affection={v.save.affection[q]} />
                      {ok && (
                        <p className="mt-0.5 text-[0.7rem] text-muted">
                          {MOOD_INFO[v.moods[q]].name}
                          {v.save.jealous[q] > 0 ? " 💔" : ""}
                          {v.feelings[q] ? ` · ${C.hearts.arcs[v.feelings[q].id].name}` : ""}
                          {v.out.includes(q) ? " · out looking for you" : ""} ·{" "}
                          {v.wishes[q].done
                            ? "wish granted ✓"
                            : `wish ${v.wishes[q].progress}/${v.wishes[q].passes} ${C.skills[v.wishes[q].skill].name}`}
                        </p>
                      )}
                      {!ok && (
                        <p className="mt-0.5 text-[0.7rem] text-danger">Needs {needText(q)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn shrink-0"
                      onClick={() => game()?.courtVisit(q)}
                    >
                      Go
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

/** The recite screen: the lit word, the whole phrase, the pass bar and one big tap. */
/**
 * The pass bar. It fills by itself over the pass (a CSS animation the screen runs
 * on its own), so it stays smooth without the page redrawing. Keyed by its pass,
 * it starts from however far the pass already is.
 */
function PassBar({
  passMs,
  progress,
  waiting,
  color,
}: {
  passMs: number;
  progress: number;
  waiting: boolean;
  color: string;
}) {
  const held = useGame((st) => st.paused || st.tomeOpen || st.menu);
  const [delay] = useState(() => -progress * passMs);
  return (
    <div
      className="mt-3 h-2 w-full max-w-md shrink-0 overflow-hidden rounded bg-cyan/10"
      aria-hidden
    >
      {waiting ? (
        <div className="h-2 w-full rounded" style={{ background: color }} />
      ) : (
        <div
          className="court-fill h-2 w-full rounded"
          style={{
            background: color,
            animationDuration: `${passMs}ms`,
            animationDelay: `${delay}ms`,
            animationPlayState: held ? "paused" : "running",
          }}
        />
      )}
    </div>
  );
}

/**
 * The current phrase flashing in the middle of the recite screen, as the other
 * modes flash their text: it fades in, holds and fades out, again and again
 * (court.flash). It stays up, still, for anyone who asks for less motion.
 */
function MiddleFlash({ phrase, color }: { phrase: string; color: string }) {
  const F = C.flash;
  const [beat, setBeat] = useState(0);
  const [size, setSize] = useState(F.size);
  const box = useRef<HTMLDivElement>(null);
  const still = prefersStill();
  useEffect(() => {
    if (!F.enabled || still) return;
    const timer = window.setInterval(() => setBeat((b) => b + 1), Math.max(500, F.everyMs));
    return () => window.clearInterval(timer);
  }, [F.enabled, F.everyMs, still]);
  // As large as fits the room in the middle, so the whole phrase always shows.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const text = el.firstElementChild as HTMLElement | null;
      if (!text) return;
      let px = F.size;
      text.style.fontSize = `${px}px`;
      while (px > 9 && (text.scrollHeight > el.clientHeight || text.scrollWidth > el.clientWidth)) {
        px -= 1;
        text.style.fontSize = `${px}px`;
      }
      setSize(px);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phrase, F.size]);
  if (!F.enabled) return null;
  return (
    <div
      ref={box}
      className="mt-3 flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-1"
      aria-hidden
    >
      <p
        key={`${phrase}|${beat}`}
        className={`${still ? "" : "court-flash"} max-w-xl text-center leading-snug font-display`}
        style={
          {
            fontSize: size,
            color,
            textShadow: `0 0 14px ${color}88`,
            opacity: still ? F.opacity : undefined,
            animationDuration: `${F.lifeMs}ms`,
            "--flash-opacity": F.opacity,
          } as React.CSSProperties
        }
      >
        {phrase}
      </p>
    </div>
  );
}

/** Font size for the lit word: as large as reads well, never wider than the screen. */
function wordSize(word: string): string {
  return `min(3.75rem, 8dvh, ${(92 / Math.max(1, word.length * 0.62)).toFixed(2)}vw)`;
}

/** Text size for the whole phrase, smaller as it grows, so it never runs off. */
function phraseClass(phrase: string): string {
  const n = phrase.length;
  // A step smaller again on short screens, to leave room for the flash in the middle.
  if (n <= 60) return "text-lg [@media(max-height:720px)]:text-base";
  if (n <= 120) return "text-base [@media(max-height:720px)]:text-sm";
  if (n <= 190) return "text-sm [@media(max-height:720px)]:text-xs";
  return "text-xs";
}

/**
 * A queen who walks with you is hungry: feed her a set of reps of one of your
 * Reps phrases (on the rest screen), or put her off for a little while. She
 * waits a few minutes, then goes home hungry and hurt.
 */
function FeedCard({ v }: { v: CourtView }) {
  const [reps, setReps] = useState<RepsState | null>(null);
  const h = v.hungry;
  if (!h) return null;
  const spec = C.queens[h.queen];
  const minutes = Math.max(1, Math.ceil((h.until - Date.now()) / 60_000));

  const feed = () => {
    let next = readReps();
    // A set already going in Reps feeds her too; else a new one of what she asked for.
    if (!next.active) next = startSet(next, h.id, Date.now());
    if (!next.active) return;
    writeReps(next);
    setReps(next);
  };

  return (
    <div
      className="glass mb-2 flex items-center gap-3 px-3 py-2"
      style={{
        background: `linear-gradient(90deg, ${spec.color}40, rgba(12, 6, 26, 0.92) 65%)`,
        borderColor: `${spec.color}aa`,
      }}
      role="status"
    >
      <QueenAvatar q={h.queen} size={44} mood="longing" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[0.7rem] tracking-[0.14em]" style={{ color: spec.color }}>
          {spec.name.toUpperCase()} IS HUNGRY
        </p>
        <p className="text-sm leading-snug break-words">
          Feed her <span className="text-gold">{h.size.toLocaleString()}</span> × “{h.text}”
        </p>
        <p className="text-[0.65rem] text-muted">
          She waits about {minutes} min, then goes home hurt.
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button type="button" className="btn btn-gold min-h-10 px-3" onClick={feed}>
          Feed her ▶
        </button>
        <button
          type="button"
          className="btn min-h-9 px-3 text-[0.6rem]"
          onClick={() => game()?.courtFeedLater(h.queen)}
        >
          Later
        </button>
      </div>
      {reps?.active && (
        <RestSet
          state={reps}
          title={`Feeding ${spec.name}`}
          color={spec.color}
          reward={`On Done: ${spec.name} is fed (+${C.presence.feed.affection} ♥)`}
          onChange={(next) => {
            writeReps(next);
            // Stopped without Done (no new set in the history): she waits again.
            if (!next.active && next.log[0] === reps.log[0]) game()?.courtFeedStop(h.queen);
            setReps(next.active ? next : null);
          }}
          onDone={(d) => game()?.courtFed(h.queen, d.text, d.added)}
        />
      )}
    </div>
  );
}

/**
 * The +1 after every round: a set of reps of a word or phrase from the
 * Recitation drill's Reps, picked at random, done on the rest screen. It counts
 * in Reps (total, time, history) and pays here as that many passes.
 */
function BonusRound({ v, color }: { v: CourtView; color: string }) {
  const s = v.session;
  const [reps, setReps] = useState<RepsState>(() => readReps());
  const [pick, setPick] = useState(
    () => reps.active?.id ?? pickBonus(reps, Math.random, C.bonus.maxWords)?.id ?? "",
  );
  const [running, setRunning] = useState(false);
  const [paid, setPaid] = useState<null | {
    text: string;
    added: number;
    took: number;
    xp: number;
    gold: number;
  }>(null);
  if (!s || !C.bonus.enabled) return null;
  const skill = C.skills[s.skill];
  const item = reps.items.find((i) => i.id === pick);

  const save = (next: RepsState) => {
    setReps(next);
    writeReps(next);
    if (!next.active) setRunning(false);
  };

  if (paid)
    return (
      <p className="mt-2 rounded-md border border-cyan/50 p-2 text-sm" role="status">
        <span className="font-display text-xs tracking-[0.14em] text-cyan">BONUS ✓</span>{" "}
        <span className="text-gold">+{paid.added.toLocaleString()}</span> {paid.text} in{" "}
        {clock(paid.took)} · +{Math.round(paid.xp).toLocaleString()} {skill.name} XP · +{paid.gold}{" "}
        gold
      </p>
    );
  if (!item)
    return (
      <p className="mt-2 text-xs text-muted">
        Bonus +1: put words or phrases in Recitation drill → Reps, and after every round a set of
        one of them pays here too.
      </p>
    );

  const going = reps.active?.id === item.id;
  const size = going && reps.active ? reps.active.target : reps.set;
  const would = bonusReward(item.text, size, s.place, s.queen !== null);
  const start = () => {
    let next = readReps();
    if (!next.active) next = startSet(next, item.id, Date.now());
    if (!next.active) return;
    setPick(next.active.id);
    save(next);
    setRunning(true);
  };

  return (
    <div className="mt-3 rounded-md border border-cyan/50 p-2 text-left">
      <p className="font-display text-xs tracking-[0.14em] text-cyan">BONUS +1 · FROM YOUR REPS</p>
      <p className="mt-1 text-base leading-snug break-words">
        <span className="font-display text-gold">{size.toLocaleString()}</span> × {item.text}
      </p>
      <p className="text-xs text-muted">
        {item.total.toLocaleString()} so far · {clock(item.ms)} · on Done +
        {Math.round(would.xp).toLocaleString()} {skill.name} XP · +{would.gold} gold
        {s.queen && would.affection ? ` · +${would.affection} ♥` : ""}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" className="btn btn-gold min-h-12" onClick={start}>
          {going ? "Go on with the set ▶" : "Start the bonus set ▶"}
        </button>
        <button
          type="button"
          className="btn min-h-12 px-3"
          disabled={going || reps.items.length < 2}
          onClick={() =>
            setPick(pickBonus(reps, Math.random, C.bonus.maxWords, item.id)?.id ?? item.id)
          }
          aria-label="Another word or phrase"
        >
          <Shuffle className="size-4" aria-hidden />
        </button>
      </div>
      {running && reps.active && (
        <RestSet
          state={reps}
          onChange={save}
          title={`Court bonus · ${skill.name}`}
          color={color}
          reward={`On Done: +${Math.round(would.xp).toLocaleString()} ${skill.name} XP · +${would.gold} gold`}
          onDone={(d) => {
            const r = game()?.courtBonus(d.text, d.added);
            setPaid({
              text: d.text,
              added: d.added,
              took: d.took,
              xp: r?.xp ?? 0,
              gold: r?.gold ?? 0,
            });
            setRunning(false);
          }}
        />
      )}
    </div>
  );
}

function ReciteScreen({ v }: { v: CourtView }) {
  const s = v.session;
  if (!s) return null;
  const skill = C.skills[s.skill];
  const xp = v.save.skills[s.skill];
  const q = s.queen ? C.queens[s.queen] : null;
  const element = skill.element === "water" ? "water" : "fire";
  const color = STANCE_COLOR[element];
  const mult = Math.min(C.streakMax, 1 + C.streakStep * Math.max(0, s.streak - 1));
  const word = s.words[s.word] ?? "";
  const toGo = s.words.length - s.word - 1;
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      style={{
        background:
          element === "water"
            ? "radial-gradient(ellipse at 50% 30%, rgba(40,110,200,0.35), rgba(40,110,200,0) 70%), rgba(2,0,5,0.9)"
            : "radial-gradient(ellipse at 50% 30%, rgba(200,80,30,0.32), rgba(200,80,30,0) 70%), rgba(2,0,5,0.9)",
      }}
    >
      {/* The current phrase in raw binary, standing still behind it all. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <BinaryWall text={s.phrase} color={color} spec={C.wall} />
      </div>
      <header className="glass flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="font-display text-xs tracking-[0.14em]" style={{ color }}>
            {s.date && q ? `DATE · ${q.name.toUpperCase()}` : C.places[s.place].name.toUpperCase()}{" "}
            · {skill.name.toUpperCase()} {skillLevel(xp)}
          </p>
          <div className="mt-1 h-1 w-40 max-w-full rounded bg-cyan/10">
            <div className="h-1 rounded" style={{ width: `${levelPct(xp)}%`, background: color }} />
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            className="btn px-2"
            disabled={s.date}
            onClick={() => game()?.courtSkip()}
            aria-label="Skip this phrase"
          >
            <SkipForward className="size-4" aria-hidden />
            <span className="max-[480px]:sr-only">Skip</span>
          </button>
          <button type="button" className="btn px-2" onClick={() => game()?.courtEndSession()}>
            <LogOut className="size-4" aria-hidden />
            Leave
          </button>
        </div>
      </header>

      {q && (
        <div
          className="glass mt-2 flex items-center gap-3 px-3 py-2"
          style={{
            background: `linear-gradient(90deg, ${q.color}38, rgba(12, 6, 26, 0.9) 60%)`,
            borderColor: `${q.color}99`,
          }}
        >
          <QueenAvatar q={s.queen!} size={48} />
          <p className="text-sm leading-snug" aria-live="polite">
            <span
              className="font-display text-[0.7rem] tracking-[0.14em]"
              style={{ color: q.color }}
            >
              {(v.line?.speaker ?? q.name).toUpperCase()}
            </span>
            <br />
            {v.line?.text ?? `${q.name} is watching you.`}
          </p>
        </div>
      )}

      {/* The middle answers a tap too, like the big button (a round's summary waits for its own buttons). */}
      <div
        className={`relative flex min-h-0 flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center rounded-xl text-center select-none ${s.waiting && !s.roundDone ? "ring-1 ring-gold/50" : ""}`}
        onPointerDown={(e) => {
          if (e.button > 0 || s.roundDone) return;
          e.preventDefault();
          game()?.courtTap();
        }}
      >
        {/* The lit word, on one line in a box of its own height, so nothing below it jumps. */}
        <div className="flex h-[min(4.6rem,9.6dvh)] w-full shrink-0 items-center justify-center overflow-hidden">
          <p
            key={`${s.phrase}-${s.pass}-${s.word}`}
            className="court-word max-w-full font-display leading-none whitespace-nowrap text-fg"
            style={{ fontSize: wordSize(word), textShadow: `0 0 18px ${color}` }}
            aria-live="off"
          >
            {word}
          </p>
        </div>
        <PassBar
          key={`${s.phrase}|${s.roundPhrases}|${s.pass}|${s.passMs}|${s.waiting}`}
          passMs={s.passMs}
          progress={s.progress}
          waiting={s.waiting}
          color={color}
        />
        <p
          className="mt-2 shrink-0 text-xs text-muted"
          aria-label={`Phrase ${Math.min(s.roundPhrases + 1, s.round)} of ${s.round}, pass ${s.pass + 1} of ${s.reps}`}
        >
          <span className="mr-2 font-display tracking-wider">
            PHRASE {Math.min(s.roundPhrases + 1, s.round)}/{s.round}
          </span>
          {v.deck.total > 1 && (
            <span
              className="mr-2 tabular-nums"
              title="Phrases of your texts so far: none comes again until all have"
            >
              {v.deck.done.toLocaleString()}/{v.deck.total.toLocaleString()} of your texts
            </span>
          )}
          {Array.from({ length: s.reps }, (_, i) => (
            <span
              key={i}
              className="mx-0.5 text-base"
              style={{
                color: s.counted.includes(i) ? PALETTE_GOLD : i === s.pass ? color : undefined,
              }}
            >
              {s.counted.includes(i) ? "●" : i === s.pass ? "◉" : "○"}
            </span>
          ))}
        </p>
        <p
          className={`mt-1 shrink-0 font-display text-sm ${s.streak > 1 ? "" : "[@media(max-height:720px)]:hidden"}`}
          style={{ color: s.streak > 1 ? PALETTE_GOLD : undefined }}
        >
          {s.streak > 1
            ? `STREAK ${s.streak} · ×${mult.toFixed(1)} XP`
            : s.waiting
              ? "Done reading: tap here or the button"
              : "Read along: tap when the words finish"}
        </p>
        <MiddleFlash phrase={s.phrase} color={color} />
        <Notices v={v} max={2} className="absolute inset-x-0 bottom-1 z-10" />
      </div>

      <div className="glass relative p-3">
        <p
          className={`max-h-[42dvh] overflow-y-auto text-center leading-relaxed ${phraseClass(s.phrase)}`}
          aria-label="The whole phrase"
        >
          {s.words.map((w, i) => (
            <span
              key={i}
              style={{
                color:
                  i === s.word && !s.waiting
                    ? color
                    : i <= s.word
                      ? "rgba(244,247,255,0.88)"
                      : "rgba(244,247,255,0.45)",
              }}
            >
              {w}{" "}
            </span>
          ))}
        </p>
        {s.roundDone ? (
          // The round is complete: what it paid, and another round or home.
          <div className="mt-3 rounded-md border border-gold/60 p-3 text-center" role="status">
            <p className="font-display text-lg tracking-[0.14em] text-gold">ROUND COMPLETE ✓</p>
            <p className="mt-1 text-sm">
              +{Math.round(s.roundTotals.xp).toLocaleString()} {skill.name} XP · +
              {s.roundTotals.gold} gold · {s.roundTotals.reps} reps · {s.roundTotals.phrases}{" "}
              phrases
            </p>
            <BonusRound v={v} color={color} />
            <div className="mt-2 flex items-center justify-center gap-1 text-xs">
              <button
                type="button"
                className="btn stepper"
                aria-label="Fewer phrases per round"
                onClick={() => game()?.courtRound(-1)}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="text-muted">{v.save.phrasesPerRound} phrases a round</span>
              <button
                type="button"
                className="btn stepper"
                aria-label="More phrases per round"
                onClick={() => game()?.courtRound(1)}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-gold min-h-14"
                onClick={() => game()?.courtNextRound()}
              >
                Continue ▶
              </button>
              <button
                type="button"
                className="btn min-h-14"
                onClick={() => game()?.courtEndSession()}
              >
                <LogOut className="size-4" aria-hidden />
                Leave
              </button>
            </div>
          </div>
        ) : (
          // Reading; when the words finish, a tap completes the pass and goes on.
          <button
            type="button"
            className={`btn mt-3 min-h-20 w-full flex-col gap-0 text-lg ${s.waiting ? "btn-gold" : "opacity-70"}`}
            aria-disabled={!s.waiting}
            onPointerDown={(e) => {
              e.preventDefault();
              game()?.courtTap();
            }}
          >
            {s.waiting ? "Complete ✓" : "Reading…"}
            <span className="text-[0.65rem] tracking-normal normal-case opacity-80">
              {s.waiting
                ? s.pass + 1 < s.reps
                  ? `Tap: pass ${s.pass + 1} of ${s.reps} done, on to the next`
                  : s.roundPhrases + 1 < s.round
                    ? `Tap: phrase ${s.roundPhrases + 1} of ${s.round} done, on to the next`
                    : "Tap: the round is done"
                : `${toGo > 0 ? `${toGo} word${toGo === 1 ? "" : "s"} to go` : "last word"} · pass ${s.pass + 1} of ${s.reps} · phrase ${s.roundPhrases + 1} of ${s.round}`}
            </span>
          </button>
        )}
        <div className="mt-2 grid grid-cols-2 items-center gap-2 text-xs">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="btn stepper"
              aria-label="Slower words"
              onClick={() => game()?.courtPace(1)}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="text-center text-muted">
              {(v.save.wordMs / 1000).toFixed(1)} s/word
            </span>
            <button
              type="button"
              className="btn stepper"
              aria-label="Faster words"
              onClick={() => game()?.courtPace(-1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="btn stepper"
              aria-label="Fewer passes per phrase"
              onClick={() => game()?.courtReps(-1)}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="text-center text-muted">{v.save.repsPerPhrase}× each</span>
            <button
              type="button"
              className="btn stepper"
              aria-label="More passes per phrase"
              onClick={() => game()?.courtReps(1)}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted [@media(max-height:720px)]:hidden">
          This session: +{Math.round(s.totals.xp).toLocaleString()} XP · +{s.totals.gold} gold ·{" "}
          {s.totals.reps} reps
        </p>
      </div>
      <Drops v={v} />
    </div>
  );
}

const PALETTE_GOLD = "#e8c872";

/** RuneScape-style XP drops, floating up the right side. */
function Drops({ v }: { v: CourtView }) {
  return (
    <div
      className="pointer-events-none absolute top-1/3 right-3 z-40 flex flex-col items-end gap-1"
      aria-live="polite"
    >
      {v.drops.map((d) => (
        <span
          key={d.id}
          className="court-drop rounded px-2 py-0.5 font-display text-xs"
          style={{
            color: d.color,
            background: "rgba(2,0,5,0.7)",
            animationDuration: `${C.news.dropMs}ms`,
          }}
        >
          {d.text}
        </span>
      ))}
    </div>
  );
}

/** The header's buttons: narrower on phones, so the row always fits. */
const HEAD_BTN = "btn min-h-9 px-2 text-[0.7rem] max-[520px]:px-2!";

/** Gold and the like, short enough for the header: 9,999, then 12.3k, 123k, 1.2M. */
function shortNumber(n: number): string {
  const v = Math.floor(n);
  if (v < 10_000) return v.toLocaleString("en");
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 100_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

export function CourtHud() {
  const v = useCourt();
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  useChromeInsets(headerRef, footerRef);
  if (!v) return null;
  const water = v.save.stance === "water";
  const panel = v.panel;
  // During a session the recite screen is all there is; the world's bars would show through it.
  const hide = v.session ? "invisible" : "";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header ref={headerRef} className={`pointer-events-auto ${hide}`}>
        {/* One row on every phone: on narrow screens the buttons keep only their icons. */}
        <div className="glass flex items-center justify-between gap-2 px-2 py-1.5 font-display text-xs tracking-wider whitespace-nowrap max-[520px]:gap-0.5 max-[520px]:px-1.5">
          <span
            className="flex items-center gap-1 px-1 text-gold"
            aria-label={`${Math.floor(v.save.gold)} gold`}
          >
            <Coins className="size-3.5 max-[380px]:hidden" aria-hidden /> {shortNumber(v.save.gold)}
          </span>
          <button
            type="button"
            className={`${HEAD_BTN}`}
            onClick={() => game()?.courtStance()}
            aria-label={`Style: ${water ? "Water" : "Fire"}. Tap to switch.`}
            style={{ color: STANCE_COLOR[v.save.stance] }}
          >
            {water ? (
              <Droplets className="size-4" aria-hidden />
            ) : (
              <Flame className="size-4" aria-hidden />
            )}
            <span className="max-[520px]:sr-only">{water ? "Water" : "Fire"}</span>
          </button>
          <button
            type="button"
            className={HEAD_BTN}
            onClick={() => game()?.courtOpen({ kind: "skills" })}
            aria-label={`Skills: total level ${v.total}`}
          >
            <Trophy className="size-3.5 min-[521px]:hidden" aria-hidden />
            <span className="max-[520px]:hidden">Total</span> {v.total}
          </button>
          <button
            type="button"
            className={HEAD_BTN}
            onClick={() => game()?.courtOpen({ kind: "queens" })}
          >
            <Crown className="size-4" aria-hidden />
            <span className="max-[640px]:sr-only">Queens</span>
          </button>
          <button
            type="button"
            className={HEAD_BTN}
            onClick={() => game()?.courtOpen({ kind: "shop" })}
            aria-label="Moon Market"
          >
            <Store className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={`${HEAD_BTN} relative`}
            onClick={() => game()?.courtOpen({ kind: "news" })}
            aria-label={`News and rumors${v.unread > 0 ? `: ${v.unread} new` : ""}`}
          >
            <Newspaper className="size-4" aria-hidden />
            {v.unread > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-gold px-1 text-center font-sans text-[0.6rem] leading-4 font-bold text-black"
                aria-hidden
              >
                {v.unread > 9 ? "9+" : v.unread}
              </span>
            )}
          </button>
          <MenuButton className={HEAD_BTN} labelClass="max-[640px]:sr-only" />
        </div>
      </header>

      <footer ref={footerRef} className={`pointer-events-auto mx-auto w-full max-w-xl ${hide}`}>
        <FeedCard v={v} />
        <div
          className="glass flex min-h-14 items-center gap-3 px-3 py-2"
          style={
            v.line
              ? {
                  background: `linear-gradient(90deg, ${v.line.color}33, rgba(12, 6, 26, 0.9) 60%)`,
                  borderColor: `${v.line.color}88`,
                }
              : undefined
          }
        >
          {v.line?.queen && <QueenAvatar q={v.line.queen} size={52} />}
          {v.line ? (
            <p className="text-sm leading-snug" aria-live="polite">
              <span
                className="font-display text-[0.7rem] tracking-[0.14em]"
                style={{ color: v.line.color }}
              >
                {v.line.speaker.toUpperCase()}
              </span>
              <br />
              {v.line.text}
            </p>
          ) : (
            <p className="text-sm text-muted">{v.message}</p>
          )}
        </div>
        {v.line && <p className="mt-1 text-center text-xs text-gold">{v.message}</p>}
      </footer>

      {panel?.kind === "place" && <PlaceSheet place={panel.place} v={v} />}
      {panel?.kind === "queen" && <QueenSheet q={panel.queen} v={v} />}
      {panel?.kind === "shop" && <ShopSheet v={v} />}
      {panel?.kind === "skills" && <SkillsSheet v={v} />}
      {panel?.kind === "queens" && <QueensSheet v={v} />}
      {panel?.kind === "gallery" && <GallerySheet v={v} />}
      {panel?.kind === "news" && <NewsSheet v={v} since={panel.since ?? 0} />}
      <ReciteScreen v={v} />
      {!v.session && (
        <Notices
          v={v}
          className="absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-40 px-3"
        />
      )}
      {!v.session && <Drops v={v} />}
    </div>
  );
}

/** Under the mode buttons on the title screen. */
export function CourtIntro() {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-center gap-1.5" aria-label="The queens">
        {QUEEN_KEYS.map((q) => (
          <QueenAvatar key={q} q={q} size={36} />
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Walk three regions by tapping. At the Inn, the Shire, the Void, the Isles' harbor, the
        Peaks' forge and more, recite random phrases from your texts to raise 20 skills, Fire style
        or Water style: longer phrases, more passes and streaks earn more XP and gold. Eleven
        queens, Azshara and her dark sister Xal'atath among them, watch you, wish for things each
        day, miss you when you are gone, gossip about you and grow jealous of each other. Charm
        them, bring gifts, take them on dates, and collect all 99 of their faces.
      </p>
    </div>
  );
}
