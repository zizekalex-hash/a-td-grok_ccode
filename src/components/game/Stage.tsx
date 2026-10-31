import { useEffect, useRef } from "react";
import { Armory, BattleHud, GameOver, TitleScreen, Toast, TomePanel } from "@/components/game/Chrome";
import { AgentsPanel } from "@/components/game/AgentsPanel";
import { ChessHud, ChessOver } from "@/components/game/ChessHud";
import { CourtHud } from "@/components/game/CourtHud";
import { DrillPanel } from "@/components/game/Drill";
import { FpsCounter } from "@/components/game/FpsCounter";
import { GameMenu } from "@/components/game/GameMenu";
import { OptionsWindow } from "@/components/game/OptionsWindow";
import { TdHud, TdOver } from "@/components/game/TdHud";
import { ChessGame } from "@/game/chess/chessgame";
import { CourtGame } from "@/game/court/courtgame";
import { Engine } from "@/game/engine";
import type { GameBase } from "@/game/registry";
import { TdGame } from "@/game/td/tdgame";
import { bootDone } from "@/game/cfg";
import { CFG_STATUS } from "@/game/config";
import { flashToast } from "@/game/engine";
import { onEscape } from "@/game/menu";
import { useGame } from "@/game/store";

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useGame((s) => s.phase);
  const tomeOpen = useGame((s) => s.tomeOpen);
  const armory = useGame((s) => s.hud.armory);
  const panel = useGame((s) => s.panel);
  const gameMode = useGame((s) => s.gameMode);
  const drawer = useGame((s) => s.drawer);
  const menu = useGame((s) => s.menu);

  // A fresh canvas per mode (see the key below), so each game gets its own context.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game: GameBase =
      gameMode === "td"
        ? new TdGame(canvas)
        : gameMode === "chess"
          ? new ChessGame(canvas)
          : gameMode === "court"
            ? new CourtGame(canvas)
            : new Engine(canvas);
    game.start();
    return () => game.stop();
  }, [gameMode]);

  // Esc opens the menu or closes the window on top.
  useEffect(() => {
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  // The game is up: changes from Options → Advanced did not stop it starting.
  useEffect(() => {
    if (CFG_STATUS.paused) flashToast("Cfg changes are off: the last start failed. See Options → Advanced.");
    const id = window.setTimeout(bootDone, 3000);
    return () => window.clearTimeout(id);
  }, []);

  const td = gameMode === "td";
  const chess = gameMode === "chess";
  const court = gameMode === "court";
  const arcade = !td && !chess && !court;

  return (
    <main className="stage">
      <canvas key={gameMode} ref={canvasRef} data-testid="battlefield" aria-label="Wake battlefield" />
      {phase === "title" && !tomeOpen && panel === "none" && <TitleScreen />}
      {phase === "battle" && !tomeOpen && td && <TdHud />}
      {phase === "battle" && !tomeOpen && chess && <ChessHud />}
      {phase === "battle" && !tomeOpen && court && <CourtHud />}
      {phase === "battle" && !tomeOpen && arcade && <BattleHud />}
      {phase === "battle" && armory && !tomeOpen && arcade && <Armory />}
      {phase === "over" && !tomeOpen && td && <TdOver />}
      {phase === "over" && !tomeOpen && chess && <ChessOver />}
      {phase === "over" && !tomeOpen && arcade && <GameOver />}
      {drawer && !tomeOpen && <OptionsWindow />}
      {menu && !tomeOpen && <GameMenu />}
      <FpsCounter />
      {tomeOpen && <TomePanel />}
      {panel === "drill" && <DrillPanel />}
      {panel === "agents" && <AgentsPanel />}
      <Toast />
    </main>
  );
}
