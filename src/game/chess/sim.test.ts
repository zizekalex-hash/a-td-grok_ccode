import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.ts";
import { botGame, botPlan } from "./bot.ts";
import {
  bonusFor,
  hitChance,
  MAX_LEVEL,
  PIECE_KEYS,
  PIECES,
  pieceStats,
  sellValue,
  shopPiece,
  SIZE,
  traitsFor,
  xpNeed,
} from "./rules.ts";
import {
  benchPieces,
  boardPieces,
  bossFor,
  buy,
  buyXp,
  createGame,
  enemyBudget,
  fightTick,
  makeEnemy,
  move,
  nextRound,
  refresh,
  runFight,
  sell,
  startFight,
  step,
  type ChessEvent,
  type ChessState,
  type EnemyPiece,
} from "./sim.ts";
import type { PieceKey } from "./rules.ts";

const CH = CONFIG.chess;

/** A game with nothing bought and an empty shop to fill by hand. */
function blank(seed = 1): ChessState {
  const s = createGame(seed);
  s.gold = 100;
  return s;
}

function stock(s: ChessState, ...kinds: PieceKey[]) {
  s.shop = [...kinds];
}

function enemyOf(kind: PieceKey, col: number, row: number, star = 1): EnemyPiece {
  return { kind, star, col, row, hpMult: 1, hitMult: 1 };
}

function events<T extends ChessEvent["type"]>(s: ChessState, type: T) {
  return s.events.filter((e): e is Extract<ChessEvent, { type: T }> => e.type === type);
}

describe("auto chess rules", () => {
  it("rolls hits like RuneScape: better accuracy hits more, never always", () => {
    assert.ok(hitChance(10, 50) < hitChance(50, 50));
    assert.ok(hitChance(50, 50) < hitChance(90, 50));
    for (const [a, d] of [
      [0, 0],
      [1, 1000],
      [1000, 1],
      [40, 40],
    ] as const) {
      const p = hitChance(a, d);
      assert.ok(p >= 0 && p < 1, `hit chance ${p} for ${a} vs ${d}`);
    }
  });

  it("makes stars stronger and traits add their bonus", () => {
    for (const key of PIECE_KEYS) {
      const one = pieceStats(key, 1);
      const two = pieceStats(key, 2);
      assert.ok(two.hp > one.hp && two.maxHit >= one.maxHit && two.acc >= one.acc, key);
    }
    const traits = traitsFor(["pawn", "pawn", "pawn", "bishop", "bishop"]);
    const phalanx = traits.find((t) => t.key === "pawn");
    assert.equal(phalanx?.step, 1);
    const pawnBonus = bonusFor("pawn", traits);
    const knightBonus = bonusFor("knight", traits);
    assert.ok((pawnBonus.def ?? 0) > 0, "Phalanx guards pawns");
    assert.equal(knightBonus.def ?? 0, 0, "Phalanx is only for pawns");
    assert.ok((knightBonus.acc ?? 0) > 0, "Clergy helps every piece");
    assert.ok(pieceStats("pawn", 1, pawnBonus).def > pieceStats("pawn", 1).def);
  });

  it("only offers tiers the level's odds allow", () => {
    for (let i = 0; i < 400; i++) {
      const k = shopPiece(1, i / 400, (i * 7919) % 400 / 400);
      const odds = CH.odds[0]!;
      assert.ok((odds[PIECES[k].tier - 1] ?? 0) > 0, `${k} at level 1`);
    }
  });

  it("sells a merged piece for every copy in it", () => {
    assert.equal(sellValue("knight", 1), PIECES.knight.cost);
    assert.equal(sellValue("knight", 2), PIECES.knight.cost * 3);
  });
});

describe("auto chess shop and board", () => {
  it("is the same game for the same seed", () => {
    const a = createGame(42);
    const b = createGame(42);
    assert.deepEqual(a.shop, b.shop);
    assert.deepEqual(a.enemy, b.enemy);
    assert.equal(a.hp, CH.startHp);
    assert.equal(a.gold, CH.startGold);
  });

  it("puts a bought piece on the board while there is room, then on the bench", () => {
    const s = blank();
    stock(s, "pawn", "knight", "rook");
    for (let i = 0; i < 3; i++) assert.ok(buy(s, i).ok);
    assert.equal(boardPieces(s).length, s.level);
    assert.equal(benchPieces(s).length, 3 - s.level);
    assert.equal(s.gold, 100 - 1 - 2 - 3);
    for (const p of boardPieces(s)) assert.ok(p.row >= SIZE - 4, "on your half");
    assert.equal(s.shop[0], null);
    assert.equal(buy(s, 0).ok, false, "a bought slot is empty");
  });

  it("merges three copies into a star more, and nine into three stars", () => {
    const s = blank();
    for (let i = 0; i < 9; i++) {
      stock(s, "pawn");
      assert.ok(buy(s, 0).ok);
    }
    assert.equal(s.pieces.length, 1);
    assert.equal(s.pieces[0]?.star, 3);
    assert.equal(events(s, "merge").length, 4);
  });

  it("lets a buy that completes a merge through a full board and bench", () => {
    const s = blank();
    s.level = 1;
    const fill: PieceKey[] = ["rook", "pawn", "pawn", "bishop", "bishop", "queen", "queen", "king", "king"];
    for (const k of fill) {
      stock(s, k);
      buy(s, 0);
    }
    assert.equal(s.pieces.length, 1 + CH.benchSize);
    stock(s, "knight");
    assert.equal(buy(s, 0).ok, false, "no room and nothing to merge");
    stock(s, "pawn");
    assert.ok(buy(s, 0).ok);
    assert.ok(s.pieces.some((p) => p.kind === "pawn" && p.star === 2));
    assert.ok(s.pieces.every((p) => p.area === "board" || p.col >= 0), "every piece has a place");
  });

  it("sells, refreshes and buys XP for gold", () => {
    const s = blank();
    stock(s, "queen");
    buy(s, 0);
    const id = s.pieces[0]!.id;
    const before = s.gold;
    assert.ok(sell(s, id).ok);
    assert.equal(s.gold, before + PIECES.queen.cost);
    assert.ok(refresh(s).ok);
    assert.equal(s.gold, before + PIECES.queen.cost - CH.refreshCost);
    const level = s.level;
    let guard = 0;
    while (s.level === level && guard++ < 10) assert.ok(buyXp(s).ok);
    assert.equal(s.level, level + 1);
    s.gold = 0;
    assert.equal(refresh(s).ok, false);
    assert.equal(buyXp(s).ok, false);
  });

  it("stops levelling at the top level", () => {
    const s = blank();
    s.gold = 10_000;
    for (let i = 0; i < 200; i++) buyXp(s);
    assert.equal(s.level, MAX_LEVEL);
    assert.equal(xpNeed(MAX_LEVEL), 0);
    assert.equal(buyXp(s).ok, false);
  });

  it("moves and swaps pieces on your half only, within the level's limit", () => {
    const s = blank();
    stock(s, "pawn", "knight", "rook");
    for (let i = 0; i < 3; i++) buy(s, i);
    const [a, b] = boardPieces(s);
    const bench = benchPieces(s)[0]!;
    assert.equal(move(s, a!.id, "board", 0, 0).ok, false, "not on the other half");
    assert.ok(move(s, a!.id, "board", 7, 4).ok);
    assert.equal(a!.col, 7);
    const spot = { col: b!.col, row: b!.row };
    assert.ok(move(s, a!.id, "board", spot.col, spot.row).ok, "swap");
    assert.equal(b!.col, 7);
    assert.equal(move(s, bench.id, "board", 0, 4).ok, false, "board is full at this level");
    assert.ok(move(s, bench.id, "board", a!.col, a!.row).ok, "a swap keeps the count");
    assert.equal(a!.area, "bench");
  });

  it("fills empty board places from the bench when the fight starts", () => {
    const s = blank();
    s.level = 3;
    stock(s, "pawn", "knight", "rook");
    for (let i = 0; i < 3; i++) buy(s, i);
    for (const p of [...boardPieces(s)]) move(s, p.id, "bench", benchPieces(s).length);
    assert.equal(boardPieces(s).length, 0);
    assert.ok(startFight(s).ok);
    assert.equal(boardPieces(s).length, 3);
    assert.equal(s.fighters.filter((f) => f.side === 0).length, 3);
  });

  it("will not fight with nothing to field", () => {
    const s = blank();
    assert.equal(startFight(s).ok, false);
  });
});

describe("auto chess fights", () => {
  it("never puts two pieces on one square, and pawns never step back", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(seed);
      s.gold = 60;
      s.level = 6;
      botPlan(s);
      s.enemy = makeEnemy(s, 12);
      assert.ok(startFight(s).ok);
      const rows = new Map(s.fighters.map((f) => [f.id, f.row]));
      while (s.phase === "fight") {
        fightTick(s);
        const seen = new Set<string>();
        for (const f of s.fighters) {
          if (f.dead) continue;
          const key = `${f.col},${f.row}`;
          assert.ok(!seen.has(key), `two pieces on ${key}`);
          seen.add(key);
          assert.ok(f.col >= 0 && f.col < SIZE && f.row >= 0 && f.row < SIZE);
          const was = rows.get(f.id)!;
          if (f.kind === "pawn") assert.ok(f.side === 0 ? f.row <= was : f.row >= was, "a pawn went back");
          rows.set(f.id, f.row);
        }
      }
    }
  });

  it("ends every fight with a winner before the tick limit", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame(seed);
      s.gold = 40;
      s.level = 5;
      botPlan(s);
      s.enemy = makeEnemy(s, 10);
      startFight(s);
      runFight(s);
      assert.notEqual(s.phase, "fight");
      const r = events(s, "result").at(-1);
      assert.ok(r && !r.timeout, `seed ${seed} timed out`);
    }
  });

  it("is fair to both sides: the same pieces facing each other win about half the time", () => {
    let wins = 0;
    const n = 80;
    const kinds: PieceKey[] = ["knight", "bishop", "rook", "pawn", "pawn"];
    for (let seed = 1; seed <= n; seed++) {
      const s = blank(seed);
      s.level = kinds.length;
      for (const k of kinds) {
        stock(s, k);
        buy(s, 0);
      }
      s.enemy = boardPieces(s).map((p) => enemyOf(p.kind, p.col, SIZE - 1 - p.row));
      startFight(s);
      runFight(s);
      if (s.lastWin) wins += 1;
    }
    assert.ok(wins > n * 0.3 && wins < n * 0.7, `mirror matches won ${wins} of ${n}`);
  });

  it("splats misses as 0 and hits from 1 to the max hit", () => {
    const s = blank(3);
    stock(s, "knight");
    buy(s, 0);
    s.enemy = [enemyOf("rook", 3, 3)];
    startFight(s);
    runFight(s);
    const attacks = events(s, "attack");
    assert.ok(attacks.length > 0);
    assert.ok(attacks.some((a) => !a.hit && a.dmg === 0), "some misses");
    for (const a of attacks) if (a.hit) assert.ok(a.dmg >= 1);
    const knight = s.fighters.find((f) => f.side === 0)!;
    for (const a of attacks.filter((x) => x.from === knight.id && !x.ability)) assert.ok(a.dmg <= knight.maxHit * 2);
  });

  it("promotes a pawn that reaches the far row to a queen", () => {
    const s = blank();
    stock(s, "pawn");
    buy(s, 0);
    s.enemy = [enemyOf("rook", 7, 7 - 4)];
    startFight(s);
    // One square from the far row, with the rook far off.
    const pawn = s.fighters.find((f) => f.side === 0)!;
    pawn.col = 0;
    pawn.row = 1;
    fightTick(s, () => "a phrase.");
    const promo = events(s, "promote")[0];
    assert.ok(promo, "promoted");
    assert.equal(promo.text, "a phrase.");
    assert.equal(pawn.kind, "queen");
    assert.equal(pawn.row, 0);
  });

  it("casts every ability with a full mana bar", () => {
    const s = blank(5);
    s.level = 5;
    for (const k of ["knight", "rook", "queen", "king", "bishop"] as PieceKey[]) {
      stock(s, k);
      buy(s, 0);
    }
    // Two tough targets that barely hit back, so every piece lives long enough to cast.
    s.enemy = [
      { ...enemyOf("king", 3, 3, 3), hpMult: 40, hitMult: 0 },
      { ...enemyOf("king", 4, 3, 3), hpMult: 40, hitMult: 0 },
    ];
    startFight(s);
    const rook = s.fighters.find((f) => f.side === 0 && f.kind === "rook")!;
    rook.hp = Math.round(rook.maxHp / 2);
    runFight(s, () => "spell.");
    const casts = new Set(events(s, "cast").map((c) => c.name));
    for (const k of ["knight", "rook", "queen", "king", "bishop"] as PieceKey[]) {
      assert.ok(casts.has(PIECES[k].ability.name), PIECES[k].ability.name);
    }
    assert.ok(events(s, "heal").length > 0 && events(s, "shield").length > 0);
    for (const c of events(s, "attack").filter((a) => a.ability)) assert.ok(c.hit, "abilities always hit");
  });

  it("puts a phrase on the first attack and every Nth after it", () => {
    const s = blank(9);
    stock(s, "knight");
    buy(s, 0);
    s.enemy = [{ ...enemyOf("king", 3, 3, 2), hpMult: 20, hitMult: 0 }];
    startFight(s);
    runFight(s, () => "words.", 3);
    const me = s.fighters.find((f) => f.side === 0)!;
    const plain = events(s, "attack").filter((a) => a.from === me.id && !a.ability);
    assert.ok(plain.length >= 6);
    plain.forEach((a, i) => assert.equal(Boolean(a.text), i % 3 === 0, `attack ${i}`));
  });
});

describe("auto chess rounds", () => {
  it("pays income, interest and a win bonus, and opens a new shop", () => {
    const s = blank();
    s.gold = 23;
    stock(s, "queen");
    buy(s, 0);
    s.enemy = [enemyOf("pawn", 0, 0)];
    startFight(s);
    runFight(s);
    assert.equal(s.lastWin, true);
    const gold = s.gold;
    step(s, CH.resultSeconds + 0.1, 1, () => "");
    assert.equal(s.phase, "plan");
    assert.equal(s.round, 2);
    assert.equal(s.gold, gold + CH.income + Math.min(CH.maxInterest, Math.floor(gold / CH.interestPer)) + CH.winGold);
    assert.ok(s.shop.every((k) => k !== null));
  });

  it("costs life for a lost round and ends the game at zero", () => {
    const s = blank();
    stock(s, "pawn");
    buy(s, 0);
    s.enemy = [enemyOf("king", 3, 0, 3), enemyOf("queen", 4, 0, 3)];
    startFight(s);
    runFight(s);
    assert.equal(s.lastWin, false);
    assert.ok(s.lastDamage > 0);
    assert.equal(s.hp, CH.startHp - s.lastDamage);
    s.hp = 1;
    nextRound(s);
    s.enemy = [enemyOf("king", 3, 0, 3)];
    startFight(s);
    runFight(s);
    assert.equal(s.phase, "over");
    assert.equal(events(s, "over").length, 1);
    assert.equal(buy(s, 0).ok, false);
  });

  it("brings a boss every few rounds and stronger boards later", () => {
    const every = CH.enemy.bossEvery;
    assert.equal(bossFor(1), null);
    const boss = bossFor(every);
    assert.ok(boss);
    const s = createGame(7);
    const withBoss = makeEnemy(s, every);
    assert.equal(withBoss.filter((p) => p.boss).length, 1);
    assert.ok(enemyBudget(20) > enemyBudget(10) && enemyBudget(10) > enemyBudget(1));
    const early = makeEnemy(s, 1);
    assert.ok(early.length >= 1);
    for (const p of early) assert.ok(PIECES[p.kind].cost * 3 ** (p.star - 1) <= enemyBudget(1) + 1e-9);
    for (const p of makeEnemy(s, 30)) assert.ok(p.row < 4, "the other side sets up on the top half");
  });

  it("plays whole games to an end, deterministically", () => {
    const a = botGame(createGame(11));
    const b = botGame(createGame(11));
    assert.equal(a, b);
    const ends: number[] = [];
    for (let seed = 1; seed <= 12; seed++) ends.push(botGame(createGame(seed * 101)));
    const avg = ends.reduce((x, y) => x + y, 0) / ends.length;
    assert.ok(avg > 8 && avg < 60, `games end around round ${avg}`);
  });
});
