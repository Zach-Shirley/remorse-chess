import { describe, expect, it } from "vitest";
import { chooseBotAction, evaluate, type BotLevel } from "../src/bot";
import {
  applyMove,
  createInitialState,
  fromFen,
  getLegalMoves,
  getMaterial,
  type GameState,
  type Player
} from "./plain";

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function botMove(state: GameState, level: BotLevel = "hard", timeLimitMs = 900) {
  const action = chooseBotAction(state, level, { random: seeded(12345), timeLimitMs });
  if (!action) throw new Error("The bot returned no move");
  expect(getLegalMoves(state).map((move) => move.id)).toContain(action.moveId);
  return action.moveId;
}

// True when the bot, to move in `state`, forces checkmate within `moves` of its own moves
// against every defence.
function forcesMate(state: GameState, moves: number): boolean {
  const me = state.currentPlayer;
  const after = applyMove(state, botMove(state));
  if (after.status.phase === "won") return after.status.winner === me;
  if (after.status.phase !== "playing" || moves <= 1) return false;
  return getLegalMoves(after).every((reply) => forcesMate(applyMove(after, reply.id), moves - 1));
}

function playGame(white: BotLevel, black: BotLevel, seed: number, maxPlies: number, timeLimitMs: number) {
  const random = seeded(seed);
  let state = createInitialState();
  for (let ply = 0; ply < maxPlies && state.status.phase === "playing"; ply += 1) {
    const level = state.currentPlayer === "white" ? white : black;
    const action = chooseBotAction(state, level, { random, timeLimitMs });
    if (!action) break;
    state = applyMove(state, action.moveId);
  }
  return state;
}

// Positive when `player` is ahead at the end: a win, or more material when the game was cut short.
function lead(state: GameState, player: Player) {
  if (state.status.phase === "won") return state.status.winner === player ? 100 : -100;
  const { score } = getMaterial(state);
  return score[player] - score[player === "white" ? "black" : "white"];
}

describe("bot", () => {
  it("returns a legal move at every level", () => {
    const state = createInitialState();
    for (const level of ["easy", "medium", "hard"] as const) botMove(state, level, 150);
  });

  it("returns null when the game is over", () => {
    expect(chooseBotAction(fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), "hard")).toBeNull();
  });

  it("finds mate in one", () => {
    expect(botMove(fromFen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1"))).toBe("a1a8");
    // Black to move: fool's mate.
    expect(botMove(fromFen("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2"))).toBe("d8h4");
    // Scholar's mate.
    expect(botMove(fromFen("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"))).toBe("h5f7");
  });

  it("finds mate in two with a rook ladder", () => {
    expect(forcesMate(fromFen("7k/8/8/8/8/8/R7/1R2K3 w - - 0 1"), 2)).toBe(true);
  });

  it("finds mate in two with a quiet rook sacrifice", () => {
    // 1. Ra6! bxa6 2. b7#, or any bishop move 2. Rxa7#.
    const state = fromFen("kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 1");
    expect(botMove(state)).toBe("a1a6");
    expect(forcesMate(state, 2)).toBe(true);
  });

  it("finds mate in two as Black", () => {
    expect(forcesMate(fromFen("1r2k3/r7/8/8/8/8/8/7K b - - 0 1"), 2)).toBe(true);
  });

  it("takes a hanging queen", () => {
    const state = fromFen("4k3/p7/8/3q4/8/4N3/P7/4K3 w - - 0 1");
    expect(botMove(state, "hard", 300)).toBe("e3d5");
    expect(botMove(state, "medium", 300)).toBe("e3d5");
  });

  it("does not leave its queen to be taken", () => {
    // The queen on d4 is attacked by the knight; every level-headed bot moves or defends it.
    const state = fromFen("4k3/8/2n5/8/3Q4/8/8/4K3 w - - 0 1");
    const after = applyMove(state, botMove(state, "hard", 300));
    const queenTaken = getLegalMoves(after).some((move) => {
      const target = move.captures[0];
      return target && after.board[target.row][target.col]?.kind === "queen";
    });
    expect(queenTaken).toBe(false);
  });

  it("prefers a win to a draw by repetition", () => {
    // White is a queen up. After this shuffle, Qd2 would repeat a position for the third time.
    let state = fromFen("6k1/8/8/8/8/8/5PPP/4Q1K1 w - - 0 1");
    for (const moveId of ["e1d2", "g8h8", "d2d1", "h8g8", "d1d2", "g8h8", "d2d1", "h8g8"]) {
      state = applyMove(state, moveId);
    }
    expect(applyMove(state, "d1d2").status).toMatchObject({ phase: "draw", reason: "threefold-repetition" });
    const moveId = botMove(state, "hard", 300);
    expect(moveId).not.toBe("d1d2");
    expect(applyMove(state, moveId).status.phase).toBe("playing");
  });

  it("values material and development sensibly", () => {
    expect(evaluate(createInitialState(), "white")).toBe(0);
    const queenUp = fromFen("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(evaluate(queenUp, "white")).toBeGreaterThan(800);
    expect(evaluate(queenUp, "black")).toBe(-evaluate(queenUp, "white"));
  });

  it("hard beats easy", () => {
    expect(lead(playGame("hard", "easy", 3, 120, 40), "white")).toBeGreaterThan(5);
    expect(lead(playGame("easy", "hard", 4, 120, 40), "black")).toBeGreaterThan(5);
  }, 60_000);

  it("medium beats easy more often than not", () => {
    let total = 0;
    for (let seed = 1; seed <= 3; seed += 1) {
      total += Math.sign(lead(playGame("medium", "easy", seed, 100, 40), "white"));
      total += Math.sign(lead(playGame("easy", "medium", seed + 50, 100, 40), "black"));
    }
    expect(total).toBeGreaterThanOrEqual(2);
  }, 90_000);

  it("hard answers within its time budget", () => {
    for (const fen of [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
    ]) {
      const started = performance.now();
      chooseBotAction(fromFen(fen), "hard");
      expect(performance.now() - started).toBeLessThan(1300);
    }
  });
});
