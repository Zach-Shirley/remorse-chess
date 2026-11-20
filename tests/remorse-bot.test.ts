import { describe, expect, it } from "vitest";
import { chooseBotAction, evaluate, type BotLevel } from "../src/bot";
import {
  PASS_MOVE_ID,
  applyMove,
  canPass,
  createInitialState,
  findKing,
  findPiece,
  fromFen,
  getLegalMoves,
  getMaterial,
  parseSquare,
  type GameRules,
  type GameState,
  type Player
} from "../src/game";
import { RULE_SETS, scriptedDice, withMind } from "../src/variant/remorse";

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function options(state: GameState): string[] {
  const ids = getLegalMoves(state).map((move) => move.id);
  if (canPass(state)) ids.push(PASS_MOVE_ID);
  return ids;
}

function playGame(rules: GameRules, white: BotLevel, black: BotLevel, seed: number, maxPlies: number, timeLimitMs: number) {
  const random = seeded(seed);
  const dice = seeded(seed + 1000);
  let state = createInitialState(rules);
  for (let ply = 0; ply < maxPlies && state.status.phase === "playing"; ply += 1) {
    const level = state.currentPlayer === "white" ? white : black;
    const action = chooseBotAction(state, level, { random, timeLimitMs });
    if (!action) break;
    expect(options(state)).toContain(action.moveId);
    state = applyMove(state, action.moveId, dice);
  }
  return state;
}

function lead(state: GameState, player: Player) {
  if (state.status.phase === "won") return state.status.winner === player ? 100 : -100;
  const { score } = getMaterial(state);
  return score[player] - score[player === "white" ? "black" : "white"];
}

// Things that must hold in every reachable position.
function checkInvariants(state: GameState) {
  for (const id of Object.keys(state.minds)) {
    expect(findPiece(state, id), `mind without a piece: ${id}`).not.toBeNull();
  }
  if (state.extraMove) {
    expect(state.status.phase).toBe("playing");
    expect(getLegalMoves(state).length).toBeGreaterThan(0);
    if (state.extraMove.pieceId) expect(findPiece(state, state.extraMove.pieceId)).not.toBeNull();
  }
  const lostToDespair = state.status.phase === "won" && (state.status.reason === "despair" || state.status.reason === "king-captured");
  if (!lostToDespair) {
    expect(findKing(state, "white")).not.toBeNull();
    expect(findKing(state, "black")).not.toBeNull();
  }
  if (state.status.phase === "playing") expect(options(state).length).toBeGreaterThan(0);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
}

describe("random play keeps the engine consistent", () => {
  for (const ruleSet of RULE_SETS) {
    it(`${ruleSet}: 12 random games`, () => {
      let rolls = 0;
      let extraMoves = 0;
      for (let game = 0; game < 12; game += 1) {
        const random = seeded(game * 7 + 11);
        let state = createInitialState({ ruleSet });
        for (let ply = 0; ply < 260 && state.status.phase === "playing"; ply += 1) {
          const choices = options(state);
          // Prefer captures now and then so the consciences get busy.
          const captures = getLegalMoves(state).filter((move) => move.captures.length > 0);
          const moveId =
            captures.length > 0 && random() < 0.6
              ? captures[Math.floor(random() * captures.length)].id
              : choices[Math.floor(random() * choices.length)];
          state = applyMove(state, moveId, random);
          rolls += state.lastEvents.filter((event) => event.type === "roll").length;
          if (state.extraMove) extraMoves += 1;
          checkInvariants(state);
        }
      }
      if (ruleSet === "classic") expect(rolls).toBe(0);
      else {
        expect(rolls).toBeGreaterThan(50);
        expect(extraMoves).toBeGreaterThan(0);
      }
    }, 60_000);
  }
});

describe("bot under Remorse Chess rules", () => {
  it("returns a legal move at every level in every rule set", () => {
    for (const ruleSet of RULE_SETS) {
      const state = createInitialState({ ruleSet });
      for (const level of ["easy", "medium", "hard"] as const) {
        const action = chooseBotAction(state, level, { random: seeded(5), timeLimitMs: 120 });
        expect(options(state)).toContain(action?.moveId);
      }
    }
  });

  it("uses a Sadist's extra move to win material", () => {
    // Rook takes d5 and rolls a 6; the queen on d6 is then free.
    const start = fromFen("4k3/8/3q4/3p4/8/8/3R4/4K3 w - - 0 1", { ruleSet: "reactions" });
    const pending = applyMove(start, "d2d5", scriptedDice(6));
    expect(pending.extraMove).not.toBeNull();
    expect(chooseBotAction(pending, "hard", { timeLimitMs: 300 })?.moveId).toBe("d5d6");
  });

  it("answers a pending extra move with a move by the Sadist or by ending the turn", () => {
    const start = fromFen("4k3/8/8/p7/8/8/8/R3K3 w - - 0 1", { ruleSet: "reactions" });
    const pending = applyMove(start, "a1a5", scriptedDice(6));
    expect(options(pending)).toContain(PASS_MOVE_ID);
    for (const level of ["easy", "medium", "hard"] as const) {
      const action = chooseBotAction(pending, level, { random: seeded(9), timeLimitMs: 150 });
      expect(options(pending)).toContain(action?.moveId);
    }
  });

  it("a Sadist king's extra move ends the turn either way", () => {
    const start = fromFen("7k/8/5ppp/8/8/8/5PPr/5RK1 w - - 0 1", { ruleSet: "reactions" });
    const sadistKing = withMind(start, parseSquare("g1"), { reaction: "sadist", captures: 1 });
    const pending = applyMove(sadistKing, "g1h2", scriptedDice());
    expect(pending.extraMove).not.toBeNull();
    const action = chooseBotAction(pending, "hard", { timeLimitMs: 200 });
    expect(options(pending)).toContain(action?.moveId);
    const after = applyMove(pending, action?.moveId as string, scriptedDice());
    expect(after.currentPlayer).toBe("black");
  });

  it("prices consciences: guilt costs, devastation costs more, a Sadist is a plus", () => {
    const fen = "4k3/8/8/8/8/8/3R4/4K3 w - - 0 1";
    const rules: GameRules = { ruleSet: "reactions" };
    const base = evaluate(fromFen(fen, rules), "white");
    const withRook = (mind: Parameters<typeof withMind>[2]) => evaluate(withMind(fromFen(fen, rules), parseSquare("d2"), mind), "white");
    const guilty = withRook({ affliction: "guilty" });
    const devastated3 = withRook({ affliction: "devastated", turnsLeft: 3 });
    const devastated1 = withRook({ affliction: "devastated", turnsLeft: 1 });
    expect(guilty).toBeLessThan(base);
    expect(devastated3).toBeLessThan(guilty);
    expect(devastated1).toBeLessThan(devastated3);
    expect(withRook({ reaction: "sadist" })).toBeGreaterThan(base);
    expect(withRook({ reaction: "sadist", bloodlust: true })).toBeLessThan(base);
  });

  it("saves a devastated king with a bishop when it can", () => {
    // White's king is devastated with one turn left; only the bishop landing next to it (Bd2) saves it.
    const start = withMind(
      fromFen("4k3/8/8/8/8/8/8/2B1K2R w - - 0 1", { ruleSet: "reactions" }),
      parseSquare("e1"),
      { reaction: "devastated", affliction: "devastated", turnsLeft: 1 }
    );
    const action = chooseBotAction(start, "hard", { timeLimitMs: 300 });
    expect(action?.moveId).toBe("c1d2");
  });

  it("medium beats easy more often than not, with real dice", () => {
    let total = 0;
    for (let seed = 1; seed <= 3; seed += 1) {
      total += Math.sign(lead(playGame({ ruleSet: "reactions" }, "medium", "easy", seed, 100, 40), "white"));
      total += Math.sign(lead(playGame({ ruleSet: "reactions" }, "easy", "medium", seed + 50, 100, 40), "black"));
    }
    expect(total).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it("hard beats easy in Witnesses", () => {
    const asWhite = lead(playGame({ ruleSet: "witnesses" }, "hard", "easy", 3, 120, 60), "white");
    const asBlack = lead(playGame({ ruleSet: "witnesses" }, "easy", "hard", 4, 120, 60), "black");
    // The search is cut off by a wall clock, so on a busy machine one game may come out level.
    expect(Math.sign(asWhite) + Math.sign(asBlack)).toBeGreaterThanOrEqual(1);
    expect(Math.min(asWhite, asBlack)).toBeGreaterThanOrEqual(0);
  }, 90_000);

  it("hard answers within about 1.5 seconds", () => {
    const busy = withMind(
      withMind(
        fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", { ruleSet: "witnesses" }),
        parseSquare("f3"),
        { reaction: "sadist", captures: 2 }
      ),
      parseSquare("e5"),
      { reaction: "guilty", affliction: "guilty" }
    );
    for (const state of [createInitialState({ ruleSet: "witnesses" }), busy]) {
      const started = performance.now();
      const action = chooseBotAction(state, "hard");
      expect(performance.now() - started).toBeLessThan(1500);
      expect(options(state)).toContain(action?.moveId);
    }
  });
});
