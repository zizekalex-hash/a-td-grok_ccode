import { BookOpen, Gamepad2, LogOut, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { closeMenu, openOptions } from "@/game/menu";
import { getGame } from "@/game/registry";
import { useGame } from "@/game/store";

/** The menu Esc opens: resume, options, controls, the tome, restart or leave. */
export function GameMenu() {
  const phase = useGame((s) => s.phase);
  const held = useGame((s) => s.paused);
  const fighting = phase === "battle";
  const leave = (then: () => void) => {
    closeMenu();
    then();
  };
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-bg/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMenu();
      }}
    >
      <section className="glass w-full max-w-xs p-4" role="dialog" aria-label="Menu">
        <h2 className="font-display text-center text-sm tracking-[0.22em] text-cyan">MENU</h2>
        <p className="mt-1 text-center text-xs text-muted">{fighting && held ? "The game is held." : "Esc closes this."}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn w-full" onClick={closeMenu} autoFocus>
            <Play className="size-4" aria-hidden />
            Resume
          </button>
          <button type="button" className="btn w-full" onClick={() => openOptions()}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Options
          </button>
          <button type="button" className="btn w-full" onClick={() => openOptions("controls")}>
            <Gamepad2 className="size-4" aria-hidden />
            Controls
          </button>
          <button type="button" className="btn w-full" onClick={() => leave(() => getGame()?.toggleTome())}>
            <BookOpen className="size-4" aria-hidden />
            Tome
          </button>
          {fighting && (
            <>
              <button type="button" className="btn w-full" onClick={() => leave(() => getGame()?.engage())}>
                <RotateCcw className="size-4" aria-hidden />
                Restart
              </button>
              <button type="button" className="btn w-full" onClick={() => leave(() => getGame()?.toTitle())}>
                <LogOut className="size-4" aria-hidden />
                Quit to title
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
