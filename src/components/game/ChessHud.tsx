import { useRef } from "react";
import { ArrowUpCircle, Coins, FastForward, Heart, RefreshCw, Swords, Trash2 } from "lucide-react";
import { MenuButton } from "@/components/game/BattleButtons";
import { useChromeInsets } from "@/components/game/useChromeInsets";
import { CONFIG } from "@/game/config";
import { ChessGame } from "@/game/chess/chessgame";
import { PIECE_FONT } from "@/game/pieceFont";
import { GLYPH, PIECES, pieceStats } from "@/game/chess/rules";
import { getGame } from "@/game/registry";
import { useGame } from "@/game/store";

const CH = CONFIG.chess;

function game(): ChessGame | null {
  const g = getGame();
  return g instanceof ChessGame ? g : null;
}

/** Shop colours by tier, cheapest first. */
const TIER_COLOR = ["#cbd5e1", "#86efac", "#00ffff", "#c084fc", "#e8c872"];

function tierColor(tier: number) {
  return TIER_COLOR[Math.max(0, Math.min(TIER_COLOR.length - 1, tier - 1))];
}

/** Five pieces for sale. Dots show how many alike you own: three merge. */
function Shop() {
  const shop = useGame((s) => s.chessView.shop);
  const gold = useGame((s) => s.chessView.gold);
  return (
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Shop">
      {shop.map((slot, i) => {
        if (!slot) {
          return (
            <div
              key={i}
              className="flex min-h-16 items-center justify-center rounded-md border border-dashed border-cyan/20 text-xs text-muted"
            >
              sold
            </div>
          );
        }
        const spec = PIECES[slot.kind];
        const poor = gold < spec.cost;
        return (
          <button
            key={i}
            type="button"
            className="btn min-h-16 flex-col gap-0 px-0.5 py-1"
            disabled={poor}
            title={`${spec.name}: ${spec.copy} ${spec.ability.name}: ${spec.ability.copy} (key ${i + 1})`}
            aria-label={`Buy ${spec.name} for ${spec.cost} gold${slot.owned ? `, you own ${slot.owned}` : ""}`}
            onClick={() => game()?.chessBuy(i)}
          >
            <span className="text-2xl leading-none" style={{ fontFamily: PIECE_FONT, color: poor ? undefined : tierColor(spec.tier) }}>
              {GLYPH[slot.kind]}
            </span>
            <span className="text-[0.6rem] tracking-normal normal-case">
              {spec.name} · {spec.cost}g
            </span>
            <span className="h-2 text-[0.5rem] leading-none tracking-[0.2em] text-gold" aria-hidden>
              {slot.owned > 0 ? "●".repeat(Math.min(2, slot.owned)) + "○".repeat(Math.max(0, 2 - slot.owned)) : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The picked piece, with its numbers and a sell button; otherwise the latest message. */
function InfoLine() {
  const sel = useGame((s) => s.chessView.selected);
  const message = useGame((s) => s.chessView.message);
  if (!sel) {
    return (
      <p className="line-clamp-2 text-xs leading-snug text-gold" role="status">
        {message}
      </p>
    );
  }
  const spec = PIECES[sel.kind];
  const st = pieceStats(sel.kind, sel.star);
  return (
    <div className="flex items-center gap-2">
      <span className="text-3xl leading-none text-cyan" style={{ fontFamily: PIECE_FONT }} aria-hidden>
        {GLYPH[sel.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xs text-fg">
          {spec.name} {sel.star > 1 && <span className="text-gold">{"★".repeat(sel.star)}</span>}
          <span className="ml-1 text-muted">{sel.area === "bench" ? "· bench" : ""}</span>
        </p>
        <p className="truncate text-[0.7rem] text-muted">
          {st.hp} life · hit {st.maxHit} · acc {st.acc} · def {st.def} · reach {st.range}
        </p>
        <p className="truncate text-[0.7rem] text-violet">
          {spec.ability.name}: {spec.ability.copy}
        </p>
      </div>
      <button
        type="button"
        className="btn shrink-0 flex-col gap-0 px-2"
        onClick={() => game()?.chessSell()}
        aria-label={`Sell ${spec.name} for ${sel.sell} gold`}
      >
        <Trash2 className="size-3.5" aria-hidden />
        <span className="text-[0.6rem] tracking-normal">+{sel.sell}g</span>
      </button>
    </div>
  );
}

function Traits() {
  const traits = useGame((s) => s.chessView.traits);
  if (!traits.length) {
    return <p className="text-[0.7rem] text-muted">Traits light up as alike pieces join the board.</p>;
  }
  return (
    <ul className="flex gap-1 overflow-x-auto" aria-label="Traits">
      {traits.map((t) => (
        <li
          key={t.key}
          title={t.copy}
          data-on={t.step > 0}
          className="shrink-0 rounded-full border border-cyan/30 px-2 py-0.5 text-[0.65rem] whitespace-nowrap text-muted data-[on=true]:border-gold/70 data-[on=true]:text-gold"
        >
          <span style={{ fontFamily: PIECE_FONT }} aria-hidden>
            {GLYPH[t.key]}
          </span>{" "}
          {t.name} {t.count}
          {t.next ? `/${t.next}` : " ✓"}
        </li>
      ))}
    </ul>
  );
}

export function ChessHud() {
  const v = useGame((s) => s.chessView);
  const paused = useGame((s) => s.paused);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  useChromeInsets(headerRef, footerRef);
  const lifePct = Math.max(0, Math.min(100, (v.hp / Math.max(1, v.maxHp)) * 100));
  const fighting = v.phase === "fight";
  const status = paused
    ? "Held"
    : fighting
      ? `Fighting · ${v.enemies} left`
      : v.phase === "result"
        ? v.lastWin
          ? "Won"
          : `Lost · −${v.lastDamage}`
        : `${v.enemies} enemy piece${v.enemies === 1 ? "" : "s"}${v.boss ? ` · boss: ${v.boss}` : ""}`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header ref={headerRef} className="pointer-events-auto">
        <div className="glass flex items-center justify-between gap-2 px-3 py-2 font-display text-xs tracking-wider whitespace-nowrap">
          <span className="flex items-center gap-1 text-danger" aria-label={`${v.hp} life`}>
            <Heart className="size-3.5" aria-hidden /> {v.hp}
          </span>
          <span className="flex items-center gap-1 text-gold" aria-label={`${v.gold} gold`}>
            <Coins className="size-3.5" aria-hidden /> {v.gold}
          </span>
          <span className="text-violet" aria-label={`Level ${v.level}`}>
            LV {v.level}
            {v.xpNext > 0 && <span className="text-[0.6rem] text-muted"> {v.xp}/{v.xpNext}</span>}
          </span>
          <span className="text-cyan">ROUND {v.round}</span>
        </div>
        <div
          className="meter mt-2"
          data-low={lifePct <= 35}
          role="meter"
          aria-label="Life"
          aria-valuenow={Math.round(lifePct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${lifePct}%` }} />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>
            Board {v.onBoard}/{v.limit} · bench {v.bench}/{CH.benchSize}
          </span>
          <span className="truncate text-right">{status}</span>
        </div>
        <div className="mt-1">
          <Traits />
        </div>
      </header>

      <footer
        ref={footerRef}
        className="pointer-events-auto mx-auto w-full max-w-xl lg:absolute lg:right-3 lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:w-[24rem]"
      >
        <div className="glass p-2">
          <div className="mb-2 h-12 overflow-hidden">
            <InfoLine />
          </div>
          <Shop />
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          <button
            type="button"
            className={`btn flex-col gap-0 px-1 ${v.phase === "plan" ? "btn-gold" : ""}`}
            disabled={fighting || v.phase === "over"}
            onClick={() => game()?.chessFight()}
          >
            <Swords className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal">{v.phase === "result" ? "Next" : "Fight"}</span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            disabled={v.gold < CH.refreshCost}
            onClick={() => game()?.chessRefresh()}
            aria-label={`New shop for ${CH.refreshCost} gold`}
          >
            <RefreshCw className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal">Shop {CH.refreshCost}g</span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            disabled={v.gold < CH.xpCost || v.xpNext === 0}
            onClick={() => game()?.chessXp()}
            aria-label={`Buy ${CH.xpPerBuy} XP for ${CH.xpCost} gold`}
          >
            <ArrowUpCircle className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal">XP {CH.xpCost}g</span>
          </button>
          <button
            type="button"
            className="btn flex-col gap-0 px-1"
            onClick={() => game()?.chessSpeed()}
            aria-label={`Speed ${v.speed} times`}
          >
            <FastForward className="size-4" aria-hidden />
            <span className="text-[0.6rem] tracking-normal">{v.speed}×</span>
          </button>
          <MenuButton className="btn flex-col gap-0 px-1" compact />
        </div>
      </footer>
    </div>
  );
}

/** Under the mode buttons on the title screen. */
export function ChessIntro() {
  const best = useGame((s) => s.chessView.best);
  return (
    <p className="mt-3 text-xs leading-relaxed text-muted">
      Buy chess pieces, set them on your half of the board, and watch them march and fight on their own. Every hit
      rolls like RuneScape: red splats for damage, blue 0 for a miss. Three alike merge into a stronger piece; a boss
      comes every {CH.enemy.bossEvery} rounds.{best > 0 ? ` Best: round ${best}.` : ""}
    </p>
  );
}

/** Shown when your life runs out. */
export function ChessOver() {
  const v = useGame((s) => s.chessView);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section className="glass pointer-events-auto w-full max-w-md p-4">
        <p className="font-display text-xs tracking-[0.22em] text-danger">CHECKMATE</p>
        <h2 className="font-display mt-1 text-2xl text-fg">The board is lost</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Round</dt>
            <dd className="font-display text-cyan">{v.round}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Won</dt>
            <dd className="font-display text-fg">{v.wins}</dd>
          </div>
          <div className="rounded-md border border-cyan/40 px-2 py-2">
            <dt className="text-xs text-muted">Best</dt>
            <dd className="font-display text-gold">{v.best}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          {v.message} {v.kills} enemy pieces taken.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn w-full" onClick={() => game()?.engage()}>
            <Swords className="size-4" aria-hidden />
            Play again
          </button>
          <button type="button" className="btn w-full" onClick={() => game()?.toTitle()}>
            Return to the glass
          </button>
        </div>
      </section>
    </div>
  );
}
