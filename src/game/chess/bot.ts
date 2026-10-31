/** A plain computer player for auto chess, used by the tests to play whole games. */

import { CONFIG } from "../config.ts";
import { boardLimit, boardPieces, buy, buyXp, nextRound, owned, refresh, runFight, startFight, type ChessState } from "./sim.ts";
import { MAX_LEVEL, PIECES } from "./rules.ts";

const CH = CONFIG.chess;

/** Spends a planning phase the way a careful player might: pairs first, then the best it can field. */
export function botPlan(s: ChessState) {
  for (let guard = 0; guard < 30; guard++) {
    let bought = false;
    // Copies of what it already owns, toward a merge.
    for (let i = 0; i < s.shop.length; i++) {
      const k = s.shop[i];
      if (k && owned(s, k, 1) >= 1 && s.gold >= PIECES[k].cost && buy(s, i).ok) bought = true;
    }
    // Fill the board with the dearest piece it can pay for.
    if (boardPieces(s).length < boardLimit(s.level)) {
      const best = s.shop
        .map((k, i) => ({ k, i }))
        .filter((x) => x.k && s.gold >= PIECES[x.k].cost)
        .sort((a, b) => PIECES[b.k!].cost - PIECES[a.k!].cost)[0];
      if (best && buy(s, best.i).ok) bought = true;
    }
    if (s.level < MAX_LEVEL && s.round >= 3 && s.gold >= CH.xpCost + 10 && buyXp(s).ok) bought = true;
    if (!bought && s.gold >= 20 + CH.refreshCost && refresh(s).ok) bought = true;
    if (!bought) break;
  }
}

/** Plays a whole game and returns the round it ended on (capped). */
export function botGame(s: ChessState, maxRounds = 80): number {
  while (s.phase !== "over" && s.round <= maxRounds) {
    botPlan(s);
    if (!startFight(s).ok) break;
    runFight(s);
    if (s.phase === "result") nextRound(s);
  }
  return s.round;
}
