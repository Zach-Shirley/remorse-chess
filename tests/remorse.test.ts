import { describe, expect, it } from "vitest";
import {
  PASS_MOVE_ID,
  applyMove,
  canPass,
  createInitialState,
  evaluateStatus,
  fromFen,
  getLegalMoves,
  getMaterial,
  getPieceAt,
  normalizeRules,
  parseSquare,
  positionKey,
  type GameEvent,
  type GameRules,
  type GameState
} from "../src/game";
import { devastationCountdown, scriptedDice, withMind, type Mind, type Rng } from "../src/variant/remorse";

const CLASSIC: GameRules = { ruleSet: "classic" };
const REACTIONS: GameRules = { ruleSet: "reactions" };
const WITNESSES: GameRules = { ruleSet: "witnesses" };

// Dice that must never be rolled.
const noDice = () => scriptedDice();

function play(state: GameState, rng: Rng, ...moveIds: string[]): GameState {
  return moveIds.reduce((current, moveId) => applyMove(current, moveId, rng), state);
}

function mindAt(state: GameState, square: string): Mind | undefined {
  const piece = getPieceAt(state, parseSquare(square));
  return piece ? state.minds[piece.id] : undefined;
}

function setMind(state: GameState, square: string, mind: Mind): GameState {
  const next = withMind(state, parseSquare(square), mind);
  return { ...next, status: evaluateStatus(next) };
}

function ids(state: GameState): string[] {
  return getLegalMoves(state).map((move) => move.id);
}

function lastEvents(state: GameState): GameEvent[] {
  return state.moveLog[state.moveLog.length - 1].events;
}

// White rook on d2 can take the pawn on d5, then the one on d6. White bishop on g1 can reach d4.
const ROOK_TAKES = "4k3/8/3p4/3p4/8/8/3R4/4K1B1 w - - 0 1";

describe("rule sets", () => {
  it("defaults to Reactions and sanitises anything else", () => {
    expect(createInitialState().rules).toEqual({ ruleSet: "reactions" });
    expect(normalizeRules(undefined)).toEqual({ ruleSet: "reactions" });
    expect(normalizeRules({ ruleSet: "witnesses" })).toEqual({ ruleSet: "witnesses" });
    expect(normalizeRules({ ruleSet: "classic", extra: 1 })).toEqual({ ruleSet: "classic" });
    // Plain chess is for tests only: a client cannot ask for it.
    expect(normalizeRules({ ruleSet: "plain" })).toEqual({ ruleSet: "reactions" });
    expect(normalizeRules({ ruleSet: 7 })).toEqual({ ruleSet: "reactions" });
  });

  it("Classic: every capture makes the capturer guilt-ridden, with no dice", () => {
    const state = play(fromFen(ROOK_TAKES, CLASSIC), noDice(), "d2d5");
    expect(mindAt(state, "d5")).toMatchObject({ affliction: "guilty" });
    expect(mindAt(state, "d5")?.reaction).toBeUndefined();
    expect(lastEvents(state)).toEqual([
      { type: "relapse", piece: expect.objectContaining({ kind: "rook", player: "white" }), affliction: "guilty" }
    ]);
  });

  it("Reactions rolls once for the capturer and never for witnesses", () => {
    const fen = "4k3/8/2npb3/3p4/8/8/3R4/4K3 w - - 0 1";
    const state = play(fromFen(fen, REACTIONS), scriptedDice(2), "d2d5");
    expect(lastEvents(state)).toHaveLength(1);
    expect(mindAt(state, "c6")).toBeUndefined();
    expect(mindAt(state, "e6")).toBeUndefined();
  });

  it("Classic never rolls for witnesses either; Witnesses does", () => {
    const fen = "4k3/8/2npb3/3p4/8/8/3R4/4K3 w - - 0 1";
    expect(mindAt(play(fromFen(fen, CLASSIC), noDice(), "d2d5"), "c6")).toBeUndefined();
    const witnessed = play(fromFen(fen, WITNESSES), scriptedDice(4, 1, 1, 1), "d2d5");
    expect(lastEvents(witnessed)).toHaveLength(4);
  });
});

describe("capture reactions (video 2)", () => {
  it("1: devastated, immobilised", () => {
    const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(1), "d2d5");
    expect(mindAt(state, "d5")).toMatchObject({ reaction: "devastated", affliction: "devastated" });
    expect(lastEvents(state)[0]).toMatchObject({ type: "roll", cause: "capture", value: 1, outcome: "devastated" });
    const afterBlack = play(state, noDice(), "e8e7");
    expect(ids(afterBlack).some((id) => id.startsWith("d5"))).toBe(false);
    expect(ids(afterBlack).length).toBeGreaterThan(0);
  });

  it("2 and 3: guilt-ridden", () => {
    for (const face of [2, 3]) {
      const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(face), "d2d5");
      expect(mindAt(state, "d5")).toMatchObject({ reaction: "guilty", affliction: "guilty" });
      expect(lastEvents(state)[0]).toMatchObject({ type: "roll", value: face, outcome: "guilty" });
    }
  });

  it("4 and 5: unaffected", () => {
    for (const face of [4, 5]) {
      const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(face), "d2d5", "e8e7");
      expect(mindAt(state, "d5")).toMatchObject({ reaction: "unaffected" });
      expect(mindAt(state, "d5")?.affliction).toBeUndefined();
      expect(ids(state)).toContain("d5d6");
    }
  });

  it("6: Sadist, with an extra move", () => {
    const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(6), "d2d5");
    expect(mindAt(state, "d5")).toMatchObject({ reaction: "sadist", captures: 1 });
    expect(state.currentPlayer).toBe("white");
    expect(state.extraMove).not.toBeNull();
    expect(lastEvents(state).map((event) => event.type)).toEqual(["roll", "extra-move"]);
  });

  it("records who rolled, the value and the outcome in the move log", () => {
    const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(5), "d2d5");
    expect(state.moveLog[0].events).toEqual([
      {
        type: "roll",
        cause: "capture",
        piece: { pieceId: "white-rook-d2", kind: "rook", player: "white", square: parseSquare("d5") },
        value: 5,
        outcome: "unaffected"
      }
    ]);
    expect(state.lastEvents).toEqual(state.moveLog[0].events);
    expect(state.actionCount).toBe(1);
  });

  it("is permanent: the piece rolls once, and an unaffected piece never suffers", () => {
    const state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(4), "d2d5", "e8e7", "d5d6");
    expect(mindAt(state, "d6")).toMatchObject({ reaction: "unaffected", captures: 2 });
    expect(mindAt(state, "d6")?.affliction).toBeUndefined();
    expect(lastEvents(state)).toEqual([]);
  });

  it("is permanent: a guilt-ridden reaction returns after every capture, without a new roll", () => {
    let state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(2), "d2d5", "e8f8", "g1d4");
    expect(mindAt(state, "d5")?.affliction).toBeUndefined();
    state = play(state, noDice(), "f8g8", "d5d6");
    expect(mindAt(state, "d6")).toMatchObject({ reaction: "guilty", affliction: "guilty" });
    expect(lastEvents(state)[0]).toMatchObject({ type: "relapse", affliction: "guilty" });
  });

  it("is permanent: a devastated reaction returns after every capture", () => {
    let state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(1), "d2d5", "e8f8", "g1d4");
    expect(mindAt(state, "d5")).toEqual({ reaction: "devastated", captures: 1 });
    state = play(state, noDice(), "f8g8", "d5d6");
    expect(mindAt(state, "d6")).toMatchObject({ affliction: "devastated", turnsLeft: 3 });
  });

  it("uses the documented model (every die shows 3) when no dice are passed", () => {
    const state = applyMove(fromFen(ROOK_TAKES, REACTIONS), "d2d5");
    expect(lastEvents(state)[0]).toMatchObject({ type: "roll", value: 3, outcome: "guilty" });
  });

  it("counts en passant as a capture by the pawn", () => {
    const state = play(fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", REACTIONS), scriptedDice(2), "e5d6");
    expect(mindAt(state, "d6")).toMatchObject({ reaction: "guilty", affliction: "guilty" });
  });
});

describe("guilt (video 1)", () => {
  it("a guilt-ridden piece cannot capture but moves normally", () => {
    const state = play(fromFen(ROOK_TAKES, CLASSIC), noDice(), "d2d5", "e8e7");
    const rookMoves = ids(state).filter((id) => id.startsWith("d5"));
    expect(rookMoves).not.toContain("d5d6");
    expect(rookMoves).toContain("d5d4");
    expect(rookMoves).toContain("d5a5");
  });

  it("a guilt-ridden piece gives no check and controls no squares", () => {
    const fen = "4k3/8/8/8/8/8/4R3/4K3 b - - 0 1";
    expect(fromFen(fen, REACTIONS).status).toMatchObject({ phase: "playing", check: true });
    const state = setMind(fromFen(fen, REACTIONS), "e2", { affliction: "guilty" });
    expect(state.status).toMatchObject({ phase: "playing", check: false });
    // The king may stay on the rook's file.
    expect(ids(state)).toContain("e8e7");
  });

  it("with king capture there are no check rules: a king may castle through attack or walk into it", () => {
    const fen = "r3k3/8/8/8/8/8/8/3RK3 b q - 0 1";
    expect(ids(fromFen(fen, REACTIONS))).toContain("e8c8");
    expect(ids(fromFen(fen, REACTIONS))).toContain("e8d8");
  });

  it("a devastated piece gives no check either", () => {
    const state = setMind(fromFen("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1", REACTIONS), "e2", {
      affliction: "devastated",
      turnsLeft: 3
    });
    expect(state.status).toMatchObject({ phase: "playing", check: false });
  });

  it("capturing the king wins at once, with no roll", () => {
    const start = fromFen("4k3/8/8/8/8/8/8/4RK2 w - - 0 1", WITNESSES);
    expect(start.status).toMatchObject({ phase: "playing" });
    const state = play(start, noDice(), "e1e8");
    expect(state.status).toMatchObject({ phase: "won", winner: "white", reason: "king-captured" });
    expect(state.moveLog[0].notation).toBe("Rxe8#");
    expect(lastEvents(state)).toEqual([]);
    expect(getLegalMoves(state)).toEqual([]);
  });

  it("a guilt-ridden piece cannot take the king", () => {
    const start = setMind(fromFen("4k3/8/8/8/8/8/8/4RK2 w - - 0 1", REACTIONS), "e1", { affliction: "guilty" });
    expect(ids(start)).not.toContain("e1e8");
  });

  it("an attacked king is a warning, not a restriction", () => {
    const state = fromFen("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1", REACTIONS);
    expect(state.status).toMatchObject({ phase: "playing", check: true, message: "Black's king is under attack" });
    // Black may ignore it.
    expect(ids(state)).toContain("e8e7");
  });
});

describe("absolution (video 1)", () => {
  const guilty: Mind = { affliction: "guilty" };

  it("a friendly bishop arriving next to a guilt-ridden piece absolves it at once", () => {
    const start = setMind(fromFen("4k3/8/8/8/2R5/8/8/4K1B1 w - - 0 1", CLASSIC), "c4", guilty);
    const state = play(start, noDice(), "g1d4");
    expect(mindAt(state, "c4")).toEqual({});
    expect(lastEvents(state)).toEqual([
      {
        type: "absolved",
        by: expect.objectContaining({ kind: "bishop", square: parseSquare("d4") }),
        pieces: [expect.objectContaining({ kind: "rook", square: parseSquare("c4") })]
      }
    ]);
  });

  it("diagonal neighbours count, and every afflicted neighbour is cleared, devastated ones too", () => {
    let start = fromFen("4k3/8/8/2R1P3/8/8/8/4K1B1 w - - 0 1", CLASSIC);
    start = setMind(start, "c5", guilty);
    start = setMind(start, "e5", { affliction: "devastated", turnsLeft: 1, temporary: true });
    const state = play(start, noDice(), "g1d4");
    expect(mindAt(state, "c5")).toEqual({});
    expect(mindAt(state, "e5")).toEqual({});
  });

  it("a piece that walks up to a standing bishop is absolved at the end of the turn", () => {
    const start = setMind(fromFen("4k3/8/8/7R/8/8/8/4K1B1 w - - 0 1", CLASSIC), "h5", guilty);
    const state = play(start, noDice(), "h5h2");
    expect(mindAt(state, "h2")).toEqual({});
    expect(lastEvents(state)).toEqual([
      {
        type: "absolved",
        by: expect.objectContaining({ kind: "bishop", square: parseSquare("g1") }),
        pieces: [expect.objectContaining({ kind: "rook", square: parseSquare("h2") })]
      }
    ]);
  });

  it("witnesses beside a standing bishop are absolved at the end of their owner's next turn", () => {
    // White pawns on d4 and e4 with a bishop behind them on e3. Black's rook takes the knight on
    // d5, next to both pawns; both roll 1 and turn guilt-ridden.
    const start = fromFen("4k3/3r4/8/3N4/3PP3/4B3/8/4K3 b - - 0 1", WITNESSES);
    const witnessed = play(start, scriptedDice(4, 1, 1), "d7d5");
    expect(mindAt(witnessed, "d4")).toMatchObject({ affliction: "guilty", temporary: true });
    expect(mindAt(witnessed, "e4")).toMatchObject({ affliction: "guilty", temporary: true });
    // White makes any move: the bishop that stood there all along absolves them both.
    const state = play(witnessed, noDice(), "e1f1");
    expect(mindAt(state, "d4")).toEqual({});
    expect(mindAt(state, "e4")).toEqual({});
    expect(lastEvents(state).map((event) => event.type)).toEqual(["absolved", "absolved"]);
  });

  it("a piece's own capture beside a standing bishop still costs it one turn of guilt", () => {
    // The rook on d2 takes on d3, beside the bishop on e2, and rolls guilt.
    const start = fromFen("4k3/8/8/8/8/3p4/3RB3/4K3 w - - 0 1", REACTIONS);
    const captured = play(start, scriptedDice(2), "d2d3");
    expect(mindAt(captured, "d3")).toMatchObject({ affliction: "guilty" });
    const later = play(captured, noDice(), "e8d8");
    expect(mindAt(later, "d3")).toMatchObject({ affliction: "guilty" });
    // At the end of White's next turn it is absolved.
    const state = play(later, noDice(), "e1f1");
    expect(mindAt(state, "d3")).toMatchObject({ reaction: "guilty", captures: 1 });
    expect(mindAt(state, "d3")?.affliction).toBeUndefined();
  });

  it("a guilt-ridden bishop absolves nobody", () => {
    let start = fromFen("4k3/8/8/8/2R5/8/8/4K1B1 w - - 0 1", CLASSIC);
    start = setMind(start, "c4", guilty);
    start = setMind(start, "g1", { affliction: "guilty", penance: 5 });
    const state = play(start, noDice(), "g1d4");
    expect(mindAt(state, "c4")).toMatchObject({ affliction: "guilty" });
  });

  it("only friendly pieces are absolved", () => {
    const start = setMind(fromFen("4k3/8/8/3r4/8/8/8/4K1B1 w - - 0 1", CLASSIC), "d5", guilty);
    const state = play(start, noDice(), "g1d4");
    expect(mindAt(state, "d5")).toMatchObject({ affliction: "guilty" });
  });

  it("a bishop that captures and stays healthy absolves on landing", () => {
    // Bishop takes d4 (rolls 4: unaffected) next to the guilt-ridden rook on c4.
    const start = setMind(fromFen("4k3/8/8/8/2Rp4/8/8/4K1B1 w - - 0 1", REACTIONS), "c4", guilty);
    const state = play(start, scriptedDice(4), "g1d4");
    expect(mindAt(state, "c4")).toEqual({});
  });

  it("with no bishops a side cannot absolve; promoting to a bishop restores it", () => {
    const start = setMind(fromFen("R3k3/1P6/8/8/8/8/8/4K3 w - - 0 1", CLASSIC), "a8", guilty);

    // Shuffling kings changes nothing: the rook stays guilt-ridden.
    const waiting = play(start, noDice(), "e1e2", "e8e7", "e2e1", "e7e6");
    expect(mindAt(waiting, "a8")).toMatchObject({ affliction: "guilty" });

    // A new queen next to it does not help.
    expect(mindAt(play(start, noDice(), "b7b8q"), "a8")).toMatchObject({ affliction: "guilty" });

    // A new bishop does.
    const promoted = play(start, noDice(), "b7b8b");
    expect(mindAt(promoted, "a8")).toEqual({});
    expect(lastEvents(promoted)[0]).toMatchObject({ type: "absolved" });
  });
});

describe("the bishop's own conscience (video 1)", () => {
  const fen = "4k3/8/8/4p3/3p4/8/8/4K1B1 w - - 0 1";

  it("a bishop that captures is guilt-ridden, then absolves itself after the owner's next turn", () => {
    let state = play(fromFen(fen, CLASSIC), noDice(), "g1d4");
    expect(mindAt(state, "d4")).toMatchObject({ affliction: "guilty" });

    // White's next turn: still a pacifist.
    state = play(state, noDice(), "e8e7");
    expect(ids(state)).not.toContain("d4e5");
    expect(ids(state)).toContain("d4c3");

    // When that turn is finished the bishop is clean.
    state = play(state, noDice(), "e1e2");
    expect(mindAt(state, "d4")?.affliction).toBeUndefined();
    expect(lastEvents(state)).toEqual([
      { type: "self-absolved", piece: expect.objectContaining({ kind: "bishop", square: parseSquare("d4") }) }
    ]);

    state = play(state, noDice(), "e7e6");
    expect(ids(state)).toContain("d4e5");
  });

  it("works the same for a bishop that rolls guilt-ridden", () => {
    const state = play(fromFen(fen, REACTIONS), scriptedDice(3), "g1d4", "e8e7", "e1e2");
    expect(mindAt(state, "d4")).toEqual({ reaction: "guilty", captures: 1 });
  });

  it("a devastated bishop does not heal itself", () => {
    const state = play(fromFen(fen, REACTIONS), scriptedDice(1), "g1d4", "e8e7", "e1e2", "e7e6", "e2e1");
    expect(mindAt(state, "d4")).toMatchObject({ affliction: "devastated", turnsLeft: 1 });
  });

  it("a bishop shaken as a witness on the opponent's turn sits out one turn of its own", () => {
    // White takes d5; the black bishop on e6 witnesses it and rolls 1.
    const start = fromFen("4k3/8/4b3/3p4/8/8/3R4/4K3 w - - 0 1", WITNESSES);
    let state = play(start, scriptedDice(4, 1), "d2d5");
    expect(mindAt(state, "e6")).toMatchObject({ affliction: "guilty", temporary: true });
    expect(ids(state)).not.toContain("e6d5");
    state = play(state, noDice(), "e8e7");
    expect(mindAt(state, "e6")).toEqual({});
  });
});

describe("devastation (video 2)", () => {
  const shuffle = ["e8e7", "e1e2", "e7e8", "e2e1", "e8e7", "e1e2"];

  it("counts down three of the owner's turns, then the piece removes itself", () => {
    let state = play(fromFen("4k3/8/8/3p4/8/8/3R4/4K3 w - - 0 1", REACTIONS), scriptedDice(1), "d2d5");
    const countdown: number[] = [];
    for (const moveId of shuffle) {
      // Read the countdown at the start of each of White's three turns.
      if (state.currentPlayer === "white") countdown.push(devastationCountdown(mindAt(state, "d5") as Mind));
      state = play(state, noDice(), moveId);
    }
    expect(countdown).toEqual([3, 2, 1]);
    expect(getPieceAt(state, parseSquare("d5"))?.kind).toBe("rook");

    // Black's move ends; before White's fourth turn starts the rook is gone.
    state = play(state, noDice(), "e7e8");
    expect(getPieceAt(state, parseSquare("d5"))).toBeNull();
    expect(lastEvents(state)).toEqual([
      { type: "removed", piece: expect.objectContaining({ kind: "rook", player: "white", square: parseSquare("d5") }) }
    ]);
    expect(state.currentPlayer).toBe("white");
    expect(state.status.phase).toBe("draw"); // two bare kings
  });

  it("a bishop that arrives in time saves it", () => {
    let state = play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(1), "d2d5", "e8e7", "e1e2", "e7e8", "e2e1", "e8e7");
    expect(devastationCountdown(mindAt(state, "d5") as Mind)).toBe(1);
    state = play(state, noDice(), "g1d4", "e7e8", "e1e2", "e8e7");
    expect(getPieceAt(state, parseSquare("d5"))?.kind).toBe("rook");
    expect(mindAt(state, "d5")?.affliction).toBeUndefined();
    expect(ids(state)).toContain("d5d6");
  });

  it("a devastated king that is not absolved removes itself and its side loses", () => {
    let state = play(fromFen("4k3/8/8/8/8/8/3p4/4K2R w - - 0 1", REACTIONS), scriptedDice(1), "e1d2");
    expect(mindAt(state, "d2")).toMatchObject({ affliction: "devastated" });
    state = play(state, noDice(), "e8e7", "h1h2", "e7e8", "h2h1", "e8e7", "h1h2");
    expect(state.status.phase).toBe("playing");
    state = play(state, noDice(), "e7e8");
    expect(state.status).toMatchObject({ phase: "won", winner: "black", reason: "despair" });
    expect(getPieceAt(state, parseSquare("d2"))).toBeNull();
    expect(getLegalMoves(state)).toEqual([]);
  });

  it("a piece devastated on the opponent's turn also gets three turns of its own", () => {
    // The black knight on c6 is already guilt-ridden; witnessing the capture doubles it.
    let state = setMind(fromFen("4k3/8/2n5/3p4/8/8/3R4/4K3 w - - 0 1", WITNESSES), "c6", { affliction: "guilty" });
    state = play(state, scriptedDice(4, 2), "d2d5");
    expect(mindAt(state, "c6")).toMatchObject({ affliction: "devastated", temporary: true, turnsLeft: 3 });
    // Black's turns 1-3, each answered by White.
    state = play(state, noDice(), "e8e7", "e1e2", "e7e8", "e2e1", "e8e7");
    expect(getPieceAt(state, parseSquare("c6"))?.kind).toBe("knight");
    state = play(state, noDice(), "e1e2");
    expect(getPieceAt(state, parseSquare("c6"))).toBeNull();
  });
});

describe("the Sadist (videos 2 and 3)", () => {
  const start = () => play(fromFen(ROOK_TAKES, REACTIONS), scriptedDice(6), "d2d5");

  it("the extra move must be made with the same piece", () => {
    const state = start();
    const moves = getLegalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.pieceId === "white-rook-d2")).toBe(true);
    expect(state.status).toMatchObject({ phase: "playing" });
  });

  it("the extra move is optional", () => {
    const state = start();
    expect(canPass(state)).toBe(true);
    const passed = applyMove(state, PASS_MOVE_ID, noDice());
    expect(passed.currentPlayer).toBe("black");
    expect(passed.extraMove).toBeNull();
    expect(passed.moveLog).toHaveLength(1);
    expect(passed.fullmoveNumber).toBe(1);
    expect(passed.actionCount).toBe(2);
  });

  it("passing is only possible while an extra move is pending", () => {
    const state = fromFen(ROOK_TAKES, REACTIONS);
    expect(canPass(state)).toBe(false);
    expect(() => applyMove(state, PASS_MOVE_ID)).toThrow("Illegal move");
  });

  it("does not stack: an extra move that captures earns no further move", () => {
    const state = play(start(), noDice(), "d5d6");
    expect(state.currentPlayer).toBe("black");
    expect(state.extraMove).toBeNull();
    expect(mindAt(state, "d6")).toMatchObject({ reaction: "sadist", captures: 2 });
    expect(state.moveLog[1]).toMatchObject({ extra: true, player: "white" });
    expect(state.moveLog[0].extra).toBeUndefined();
  });

  it("a quiet extra move ends the turn; the next capture earns another without a roll", () => {
    let state = play(start(), noDice(), "d5d4", "e8e7", "d4d6");
    // d4xd6: a capture on a later turn, so the extra move is back.
    expect(state.currentPlayer).toBe("white");
    expect(state.extraMove).toEqual({ pieceId: "white-rook-d2" });
    state = play(state, noDice(), PASS_MOVE_ID);
    expect(state.currentPlayer).toBe("black");
  });

  it("keeps the move numbers right when Black's Sadist moves twice", () => {
    const fen = "4k3/3r4/8/8/3P4/3P4/8/4K3 b - - 0 1";
    const pending = play(fromFen(fen, REACTIONS), scriptedDice(6), "d7d4");
    expect(pending.currentPlayer).toBe("black");
    expect(pending.fullmoveNumber).toBe(1);
    expect(play(pending, noDice(), PASS_MOVE_ID).fullmoveNumber).toBe(2);
    const twice = play(pending, noDice(), "d4d3");
    expect(twice.fullmoveNumber).toBe(2);
    expect(twice.currentPlayer).toBe("white");
    expect(twice.moveLog.map((entry) => entry.turn)).toEqual([1, 1]);
  });

  it("the extra move may take the king and win", () => {
    const fen = "4k3/8/8/4p3/8/8/4R3/4K3 w - - 0 1";
    const start = setMind(fromFen(fen, REACTIONS), "e2", { reaction: "sadist", captures: 1 });
    const state = play(start, noDice(), "e2e5");
    expect(state.extraMove).not.toBeNull();
    expect(ids(state)).toContain("e5e8");
    const won = play(state, noDice(), "e5e8");
    expect(won.status).toMatchObject({ phase: "won", winner: "white", reason: "king-captured" });
  });
});

describe("bloodlust (video 2)", () => {
  it("sets in at the third capture", () => {
    const start = setMind(fromFen("4k3/8/8/3p4/8/8/3R4/4K3 w - - 0 1", REACTIONS), "d2", {
      reaction: "sadist",
      captures: 2
    });
    const state = play(start, noDice(), "d2d5");
    expect(mindAt(state, "d5")).toMatchObject({ reaction: "sadist", captures: 3, bloodlust: true });
    // With bloodlust the extra move must be a capture, and there is none: the turn simply ends.
    expect(lastEvents(state).map((event) => event.type)).toEqual(["bloodlust"]);
    expect(state.currentPlayer).toBe("black");
  });

  const bloodlust: Mind = { reaction: "sadist", captures: 3, bloodlust: true };
  // Rook d2 with bloodlust: its own pawn on e2, its own king on d1, an enemy pawn on d4.
  const fen = "4k3/8/8/8/3p4/8/3RP3/3K4 w - - 0 1";

  it("only moves to capture, takes friendly pieces, and never its own king", () => {
    const state = setMind(fromFen(fen, REACTIONS), "d2", bloodlust);
    const rookMoves = ids(state).filter((id) => id.startsWith("d2"));
    expect(rookMoves.sort()).toEqual(["d2d4", "d2e2"]);
    // Other pieces move as usual.
    expect(ids(state)).toContain("e2e3");
    expect(ids(state)).toContain("d1c1");
  });

  it("a friendly capture is logged as friendly fire and is nobody's trophy", () => {
    const state = play(setMind(fromFen(fen, REACTIONS), "d2", bloodlust), noDice(), "d2e2");
    expect(state.moveLog[0]).toMatchObject({ friendlyFire: true, captured: ["pawn"], notation: "Rxe2" });
    // The bloodlust extra move can take the king that is now on its file.
    expect(state.extraMove).not.toBeNull();
    expect(ids(state)).toContain("e2e8");
    expect(getMaterial(state).captured).toEqual({ white: [], black: [] });
    expect(mindAt(state, "e2")).toMatchObject({ captures: 4 });
  });

  it("a piece with bloodlust and nothing to take cannot move", () => {
    const state = setMind(fromFen("4k3/8/8/8/8/8/3R4/3K4 w - - 0 1", REACTIONS), "d2", bloodlust);
    expect(ids(state).some((id) => id.startsWith("d2"))).toBe(false);
    expect(ids(state)).toContain("d1c1");
  });

  it("pieces without bloodlust never take their own side", () => {
    const state = setMind(fromFen(fen, REACTIONS), "d2", { reaction: "sadist", captures: 1 });
    expect(ids(state)).not.toContain("d2e2");
    expect(ids(state)).toContain("d2d3");
  });
});

describe("witnesses (videos 4 and 5)", () => {
  // White's rook takes d5. Black's knight c6, pawn d6 and bishop e6 stand next to d5.
  const fen = "4k3/8/2npb3/3p4/2P5/8/3R4/4K3 w - - 0 1";

  it("each comrade next to the capture rolls, in board order, after the capturer", () => {
    const state = play(fromFen(fen, WITNESSES), scriptedDice(4, 1, 3, 5), "d2d5");
    expect(lastEvents(state)).toEqual([
      expect.objectContaining({ type: "roll", cause: "capture", value: 4, outcome: "unaffected" }),
      { type: "roll", cause: "witness", piece: expect.objectContaining({ kind: "knight", square: parseSquare("c6") }), value: 1, outcome: "guilty" },
      { type: "roll", cause: "witness", piece: expect.objectContaining({ kind: "pawn", square: parseSquare("d6") }), value: 3, outcome: "nothing" },
      { type: "roll", cause: "witness", piece: expect.objectContaining({ kind: "bishop", square: parseSquare("e6") }), value: 5, outcome: "vendetta", target: "rook" }
    ]);
    expect(mindAt(state, "c6")).toEqual({ affliction: "guilty", temporary: true });
    expect(mindAt(state, "d6")).toBeUndefined();
    expect(mindAt(state, "e6")).toEqual({ vendetta: "rook" });
    // White's own pawn on c4 stood next to the capture too and did not roll (the dice would have run out).
    expect(mindAt(state, "c4")).toBeUndefined();
  });

  it("covers every face of the witness die", () => {
    const outcomes = [1, 2, 3, 4, 5, 6].map((face) => {
      const state = play(fromFen("4k3/8/2n5/3p4/8/8/3R4/4K3 w - - 0 1", WITNESSES), scriptedDice(4, face), "d2d5");
      const event = lastEvents(state)[1];
      return event.type === "roll" ? event.outcome : null;
    });
    expect(outcomes).toEqual(["guilty", "guilty", "nothing", "nothing", "vendetta", "vendetta"]);
  });

  it("witness guilt is temporary and is not the piece's capture reaction", () => {
    // The knight on c6 is shaken; Black's bishop absolves it from b6; then the knight captures and must roll.
    const start = fromFen("4k3/8/2n5/3p4/8/8/3R4/2b1K3 w - - 0 1", WITNESSES);
    let state = play(start, scriptedDice(4, 1), "d2d5");
    expect(mindAt(state, "c6")).toEqual({ affliction: "guilty", temporary: true });
    state = play(state, noDice(), "c1g5", "e1f1", "g5d8");
    // d8 is not next to c6; the knight is still shaken.
    expect(mindAt(state, "c6")?.affliction).toBe("guilty");
    state = play(state, noDice(), "f1e1", "d8b6");
    expect(mindAt(state, "c6")).toEqual({});
    state = play(state, scriptedDice(2), "e1f1", "c6e7", "f1e1", "e7d5");
    expect(mindAt(state, "d5")).toMatchObject({ reaction: "guilty", affliction: "guilty" });
    expect(lastEvents(state)[0]).toMatchObject({ type: "roll", cause: "capture", value: 2 });
  });

  it("a guilt-ridden witness that rolls 1 or 2 is doubled to devastated", () => {
    const start = setMind(fromFen(fen, WITNESSES), "c6", { reaction: "guilty", affliction: "guilty" });
    const state = play(start, scriptedDice(4, 2, 3, 3), "d2d5");
    expect(mindAt(state, "c6")).toEqual({ reaction: "guilty", affliction: "devastated", temporary: true, turnsLeft: 3 });
    expect(lastEvents(state)[1]).toMatchObject({ cause: "witness", outcome: "devastated" });
    expect(ids(state).some((id) => id.startsWith("c6"))).toBe(false);
  });

  it("a Sadist is never affected by a witness roll", () => {
    const start = setMind(fromFen(fen, WITNESSES), "c6", { reaction: "sadist", captures: 1 });
    // Three dice only: the capturer, d6 and e6. A roll for c6 would exhaust them.
    const state = play(start, scriptedDice(4, 1, 1), "d2d5");
    expect(mindAt(state, "c6")).toEqual({ reaction: "sadist", captures: 1 });
    expect(lastEvents(state)).toHaveLength(3);
  });

  it("a vendetta is one guilt-free capture with no roll", () => {
    let state = play(fromFen(fen, WITNESSES), scriptedDice(4, 3, 3, 6), "d2d5");
    expect(mindAt(state, "e6")).toEqual({ vendetta: "rook" });
    // Bishop takes the rook: no die for the bishop. White's pawn on c4 witnesses it and rolls.
    state = play(state, scriptedDice(3), "e6d5");
    expect(mindAt(state, "d5")).toEqual({ captures: 1 });
    expect(lastEvents(state)[0]).toMatchObject({ type: "vendetta-used", target: "rook" });
    // The only roll was the white pawn on c4 witnessing its rook fall.
    expect(lastEvents(state).filter((event) => event.type === "roll")).toEqual([
      expect.objectContaining({ cause: "witness", piece: expect.objectContaining({ kind: "pawn", player: "white" }) })
    ]);
  });

  it("a vendetta only works against the piece type that made the capture", () => {
    // Black knight d4: guilt-ridden, with a vendetta against rooks. It attacks the rook b3 and the pawn f3.
    const start = setMind(fromFen("4k3/8/8/8/3n4/1R3P2/8/4K3 b - - 0 1", WITNESSES), "d4", {
      affliction: "guilty",
      vendetta: "rook"
    });
    const captures = getLegalMoves(start).filter((move) => move.captures.length > 0).map((move) => move.id);
    expect(captures).toEqual(["d4b3"]);
    const state = play(start, noDice(), "d4b3");
    // Used up, guilt-free, and it does not cure the guilt the knight already had.
    expect(mindAt(state, "b3")).toEqual({ affliction: "guilty", captures: 1 });
  });

  it("a guilt-ridden piece with a vendetta against the king threatens it and may take it", () => {
    const start = setMind(fromFen("4k3/8/8/8/8/8/4r3/K7 b - - 0 1", WITNESSES), "e2", {
      affliction: "guilty",
      vendetta: "king"
    });
    expect(ids(start)).toContain("e2e1");
    const onFile = setMind(fromFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1", WITNESSES), "e2", {
      affliction: "guilty",
      vendetta: "king"
    });
    expect(onFile.status).toMatchObject({ phase: "playing", check: true });
  });

  it("a healthy piece with a vendetta rolls as usual for other targets and keeps the vendetta", () => {
    const start = setMind(fromFen("4k3/8/8/8/3n4/1R3P2/8/4K3 b - - 0 1", WITNESSES), "d4", { vendetta: "rook" });
    const state = play(start, scriptedDice(5), "d4f3");
    expect(mindAt(state, "f3")).toEqual({ vendetta: "rook", reaction: "unaffected", captures: 1 });
  });

  it("en passant: the witnesses are the neighbours of the captured pawn", () => {
    // The black pawn on c4 stands next to d5 (the captured pawn), not next to d6 (the landing square).
    const start = fromFen("4k3/8/8/3pP3/2p5/8/8/4K3 w - d6 0 1", WITNESSES);
    const state = play(start, scriptedDice(4, 6), "e5d6");
    expect(mindAt(state, "c4")).toEqual({ vendetta: "pawn" });
  });

  it("kings witness like any other piece", () => {
    const start = fromFen("8/8/8/8/8/8/3pk3/3R2K1 w - - 0 1", WITNESSES);
    const state = play(start, scriptedDice(4, 1), "d1d2");
    expect(mindAt(state, "e2")).toEqual({ affliction: "guilty", temporary: true });
  });
});

describe("king capture, stalemate and repetition under these rules", () => {
  it("there is no checkmate: the king must actually be taken", () => {
    const mated = play(fromFen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", REACTIONS), noDice(), "a1a8");
    expect(mated.status).toMatchObject({ phase: "playing", check: true });
    expect(mated.moveLog[0].notation).toBe("Ra8+");
    const state = play(mated, noDice(), "h7h6", "a8g8");
    expect(state.status).toMatchObject({ phase: "won", winner: "white", reason: "king-captured" });
    expect(state.moveLog[2].notation).toBe("Rxg8#");
  });

  it("a guilt-ridden piece gives no check and cannot take the king", () => {
    const start = setMind(fromFen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", REACTIONS), "a1", { affliction: "guilty" });
    const state = play(start, noDice(), "a1a8");
    expect(state.status).toMatchObject({ phase: "playing", check: false });
    expect(state.moveLog[0].notation).toBe("Ra8");
    expect(ids(play(state, noDice(), "h7h6"))).not.toContain("a8g8");
  });

  it("a guilt-ridden defender cannot take the attacker", () => {
    const fen = "6k1/5ppp/8/8/8/8/8/R3K2b w - - 0 1";
    const healthy = play(fromFen(fen, REACTIONS), noDice(), "a1a8");
    expect(ids(healthy)).toContain("h1a8");
    const guilty = play(setMind(fromFen(fen, REACTIONS), "h1", { affliction: "guilty" }), noDice(), "a1a8");
    expect(ids(guilty)).not.toContain("h1a8");
  });

  it("a side with no move at all is stalemated, even with its king attacked", () => {
    // Black's king is boxed in by its own rooks; all three are devastated and cannot move.
    const fen = "6rk/6rr/8/8/8/8/8/K7 b - - 0 1";
    expect(fromFen(fen, REACTIONS).status.phase).toBe("playing");
    let state = fromFen(fen, REACTIONS);
    for (const square of ["g8", "g7", "h7"]) state = setMind(state, square, { affliction: "devastated", turnsLeft: 3 });
    expect(state.status).toMatchObject({ phase: "draw", reason: "stalemate" });
  });

  it("the same placement with different consciences is a different position", () => {
    const state = fromFen("4k3/8/8/8/8/8/3R4/4K3 w - - 0 1", REACTIONS);
    const guilty = withMind(state, parseSquare("d2"), { affliction: "guilty" });
    expect(positionKey(guilty)).not.toBe(positionKey(state));
  });

  it("the state stays plain JSON", () => {
    const state = play(fromFen("4k3/8/2npb3/3p4/2P5/8/3R4/4K3 w - - 0 1", WITNESSES), scriptedDice(6, 1, 3, 5), "d2d5");
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    expect(getLegalMoves(copy).map((move) => move.id)).toEqual(getLegalMoves(state).map((move) => move.id));
  });
});
