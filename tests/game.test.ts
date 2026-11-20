import { describe, expect, it } from "vitest";
import {
  START_FEN,
  applyMove,
  createInitialState,
  findMoveBySan,
  fromFen,
  getCheckedKingSquare,
  getLegalMoves,
  getMaterial,
  getPieceAt,
  getPseudoLegalMoves,
  isDarkSquare,
  isSquareAttacked,
  normalizeRules,
  parseSquare,
  resignGame,
  squareName,
  toFen,
  type GameState
} from "./plain";

function play(state: GameState, ...moveIds: string[]) {
  return moveIds.reduce((current, moveId) => applyMove(current, moveId), state);
}

function playSan(state: GameState, ...sans: string[]) {
  return sans.reduce((current, san) => {
    const move = findMoveBySan(current, san);
    if (!move) throw new Error(`No legal move ${san} in ${toFen(current)}`);
    return applyMove(current, move.id);
  }, state);
}

function ids(state: GameState) {
  return getLegalMoves(state).map((move) => move.id);
}

function lastSan(state: GameState) {
  return state.moveLog[state.moveLog.length - 1].notation;
}

describe("setup", () => {
  it("starts with White to move, 32 pieces and 20 legal moves", () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe("white");
    expect(state.board.flat().filter(Boolean)).toHaveLength(32);
    expect(getLegalMoves(state)).toHaveLength(20);
    expect(state.status).toEqual({ phase: "playing", check: false, message: "White to move" });
    expect(getPieceAt(state, parseSquare("e1"))).toMatchObject({ player: "white", kind: "king" });
    expect(getPieceAt(state, parseSquare("d8"))).toMatchObject({ player: "black", kind: "queen" });
  });

  it("gives every piece a unique id that survives moves", () => {
    const state = createInitialState();
    const pieceIds = state.board.flat().filter(Boolean).map((piece) => piece!.id);
    expect(new Set(pieceIds).size).toBe(32);
    const knight = getPieceAt(state, parseSquare("g1"))!;
    const moved = play(state, "g1f3");
    expect(getPieceAt(moved, parseSquare("f3"))!.id).toBe(knight.id);
  });

  it("names squares and colours them like a real board", () => {
    expect(squareName({ row: 7, col: 0 })).toBe("a1");
    expect(squareName({ row: 0, col: 7 })).toBe("h8");
    expect(isDarkSquare(parseSquare("a1"))).toBe(true);
    expect(isDarkSquare(parseSquare("h1"))).toBe(false);
  });

  it("does not change the state it is given", () => {
    const state = createInitialState();
    const before = JSON.stringify(state);
    applyMove(state, "e2e4");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects illegal moves", () => {
    const state = createInitialState();
    expect(() => applyMove(state, "e2e5")).toThrow("Illegal move");
    expect(() => applyMove(state, "e7e5")).toThrow("Illegal move");
  });

  it("keeps the state plain JSON so it can cross the network", () => {
    const state = play(createInitialState(), "e2e4", "e7e5", "g1f3");
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    expect(ids(copy)).toEqual(ids(state));
  });

  it("normalises rules to a rule set", () => {
    expect(normalizeRules({ anything: true })).toEqual({ ruleSet: "reactions" });
    expect(normalizeRules(undefined)).toEqual({ ruleSet: "reactions" });
  });
});

describe("check and checkmate", () => {
  it("only allows moves that answer a check", () => {
    const state = fromFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
    expect(state.status).toMatchObject({ phase: "playing", check: true });
    expect(ids(state).sort()).toEqual(["e1d1", "e1e2", "e1f1"]);
    expect(getCheckedKingSquare(state)).toEqual(parseSquare("e1"));
  });

  it("does not let a pinned piece leave the pin line", () => {
    const state = fromFen("4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1");
    expect(ids(state).filter((id) => id.startsWith("e2"))).toEqual([]);
  });

  it("lets a pinned piece move along the pin line", () => {
    const state = fromFen("4k3/8/8/8/4r3/8/4R3/4K3 w - - 0 1");
    expect(ids(state).filter((id) => id.startsWith("e2")).sort()).toEqual(["e2e3", "e2e4"]);
  });

  it("finds fool's mate", () => {
    const state = playSan(createInitialState(), "f3", "e5", "g4", "Qh4");
    expect(state.status).toEqual({
      phase: "won",
      winner: "black",
      reason: "checkmate",
      message: "Checkmate. Black wins"
    });
    expect(lastSan(state)).toBe("Qh4#");
    expect(getLegalMoves(state)).toEqual([]);
    expect(getCheckedKingSquare(state)).toEqual(parseSquare("e1"));
  });

  it("finds a back-rank mate", () => {
    const state = play(fromFen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1"), "a1a8");
    expect(state.status).toMatchObject({ phase: "won", winner: "white", reason: "checkmate" });
    expect(lastSan(state)).toBe("Ra8#");
  });

  it("is not mate when the checking piece can be captured", () => {
    const state = play(fromFen("6k1/5ppp/8/8/8/8/8/R3K2b w - - 0 1"), "a1a8");
    expect(state.status).toMatchObject({ phase: "playing", check: true });
    expect(ids(state)).toEqual(["h1a8"]);
  });

  it("plays scholar's mate", () => {
    const state = playSan(createInitialState(), "e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7");
    expect(state.status).toMatchObject({ phase: "won", winner: "white", reason: "checkmate" });
    expect(lastSan(state)).toBe("Qxf7#");
  });
});

describe("stalemate", () => {
  it("is a draw when the side to move has no legal move and is not in check", () => {
    const state = fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(state.status).toMatchObject({ phase: "draw", reason: "stalemate" });
    expect(getLegalMoves(state)).toEqual([]);
  });

  it("is reached by a move", () => {
    const state = play(fromFen("k7/8/1K6/8/8/8/8/2Q5 w - - 0 1"), "c1c7");
    expect(state.status).toMatchObject({ phase: "draw", reason: "stalemate" });
    expect(lastSan(state)).toBe("Qc7");
  });
});

describe("castling", () => {
  const open = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

  it("is allowed on both sides and moves the rook", () => {
    const state = fromFen(open);
    expect(ids(state)).toEqual(expect.arrayContaining(["e1g1", "e1c1"]));

    const short = play(state, "e1g1");
    expect(getPieceAt(short, parseSquare("g1"))).toMatchObject({ kind: "king" });
    expect(getPieceAt(short, parseSquare("f1"))).toMatchObject({ kind: "rook" });
    expect(getPieceAt(short, parseSquare("h1"))).toBeNull();
    expect(lastSan(short)).toBe("O-O");
    expect(short.moveLog[0].rook).toMatchObject({ from: parseSquare("h1"), to: parseSquare("f1") });

    const long = play(short, "e8c8");
    expect(getPieceAt(long, parseSquare("c8"))).toMatchObject({ kind: "king" });
    expect(getPieceAt(long, parseSquare("d8"))).toMatchObject({ kind: "rook" });
    expect(getPieceAt(long, parseSquare("a8"))).toBeNull();
    expect(lastSan(long)).toBe("O-O-O");
  });

  it("is not allowed with pieces in the way", () => {
    expect(ids(createInitialState())).not.toContain("e1g1");
    const state = fromFen("r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1");
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).not.toContain("e1c1");
  });

  it("is lost for good once the king has moved", () => {
    const state = play(fromFen(open), "e1e2", "e8e7", "e2e1", "e7e8");
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).not.toContain("e1c1");
    expect(toFen(state).split(" ")[2]).toBe("-");
  });

  it("is lost on the side whose rook has moved", () => {
    const state = play(fromFen(open), "h1h2", "a8a7", "h2h1", "a7a8");
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).toContain("e1c1");
    expect(toFen(state).split(" ")[2]).toBe("Qk");
  });

  it("is lost on the side whose rook was captured", () => {
    const state = play(fromFen("r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1"), "g2h1");
    expect(toFen(state).split(" ")[2]).toBe("Qkq");
    expect(ids(state)).not.toContain("e1g1");
  });

  it("is not allowed out of check", () => {
    const state = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1".replace("8/R3K2R", "4r3/R3K2R"));
    expect(state.status).toMatchObject({ check: true });
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).not.toContain("e1c1");
  });

  it("is not allowed through an attacked square", () => {
    const state = fromFen("4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).toContain("e1c1");
  });

  it("is not allowed into check", () => {
    const state = fromFen("4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(ids(state)).not.toContain("e1g1");
    expect(ids(state)).toContain("e1c1");
  });

  it("is allowed when only the rook's path (b1) is attacked", () => {
    const state = fromFen("1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(ids(state)).toContain("e1c1");
  });

  it("needs the right from the FEN", () => {
    const state = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1");
    expect(ids(state)).toContain("e1g1");
    expect(ids(state)).not.toContain("e1c1");
  });
});

describe("en passant", () => {
  it("captures the pawn that just advanced two squares", () => {
    const state = play(fromFen("4k3/8/8/8/4p3/8/3P4/4K3 w - - 0 1"), "d2d4");
    expect(toFen(state)).toBe("4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1");
    expect(ids(state)).toContain("e4d3");
    const move = getLegalMoves(state).find((candidate) => candidate.id === "e4d3")!;
    expect(move.enPassant).toBe(true);
    expect(move.captures).toEqual([{ ...parseSquare("d4"), pieceId: "white-pawn-d2" }]);

    const after = applyMove(state, "e4d3");
    expect(getPieceAt(after, parseSquare("d4"))).toBeNull();
    expect(getPieceAt(after, parseSquare("d3"))).toMatchObject({ player: "black", kind: "pawn" });
    expect(lastSan(after)).toBe("exd3");
    expect(after.moveLog[1].captured).toEqual(["pawn"]);
  });

  it("is only available on the very next move", () => {
    const state = play(fromFen("4k3/8/8/8/4p3/8/3P4/4K3 w - - 0 1"), "d2d4", "e8e7", "e1e2");
    expect(ids(state)).not.toContain("e4d3");
  });

  it("is not offered after a single-square advance", () => {
    const state = play(fromFen("4k3/8/8/8/4p3/3P4/8/4K3 w - - 0 1"), "d3d4");
    expect(state.enPassant).toBeNull();
    expect(ids(state)).not.toContain("e4d3");
  });

  it("is illegal when it would uncover a check along the rank", () => {
    // Taking en passant removes both pawns from the fourth rank and exposes the king to the queen.
    const state = fromFen("8/8/8/8/k2Pp2Q/8/8/3K4 b - d3 0 1");
    expect(getPseudoLegalMoves(state).map((move) => move.id)).toContain("e4d3");
    expect(ids(state)).not.toContain("e4d3");
  });
});

describe("promotion", () => {
  it("offers a move for each promotion piece", () => {
    const state = fromFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    expect(ids(state).filter((id) => id.startsWith("a7")).sort()).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  it("promotes to a queen and keeps the piece id", () => {
    const state = play(fromFen("8/P7/8/8/8/8/8/k6K w - - 0 1"), "a7a8q");
    expect(getPieceAt(state, parseSquare("a8"))).toEqual({ id: "white-pawn-a7", player: "white", kind: "queen" });
    expect(lastSan(state)).toBe("a8=Q+");
    expect(state.moveLog[0]).toMatchObject({ pieceKind: "pawn", promotion: "queen" });
  });

  it("underpromotes to a knight, rook or bishop", () => {
    const start = fromFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    expect(getPieceAt(play(start, "a7a8n"), parseSquare("a8"))).toMatchObject({ kind: "knight" });
    expect(lastSan(play(start, "a7a8n"))).toBe("a8=N");
    expect(getPieceAt(play(start, "a7a8r"), parseSquare("a8"))).toMatchObject({ kind: "rook" });
    expect(lastSan(play(start, "a7a8r"))).toBe("a8=R+");
    expect(getPieceAt(play(start, "a7a8b"), parseSquare("a8"))).toMatchObject({ kind: "bishop" });
  });

  it("promotes with a capture", () => {
    const state = play(fromFen("1r5k/P7/8/8/8/8/8/K7 w - - 0 1"), "a7b8q");
    expect(lastSan(state)).toBe("axb8=Q+");
    expect(state.moveLog[0].captured).toEqual(["rook"]);
  });

  it("promotes black pawns on the first rank", () => {
    const state = play(fromFen("7k/8/8/8/8/8/p7/7K b - - 0 1"), "a2a1q");
    expect(getPieceAt(state, parseSquare("a1"))).toMatchObject({ player: "black", kind: "queen" });
  });
});

describe("draws", () => {
  it("declares threefold repetition", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    const twice = play(createInitialState(), ...shuffle);
    expect(twice.status.phase).toBe("playing");
    const almost = play(twice, ...shuffle.slice(0, 3));
    expect(almost.status.phase).toBe("playing");
    const thrice = play(almost, shuffle[3]);
    expect(thrice.status).toMatchObject({ phase: "draw", reason: "threefold-repetition" });
    expect(getLegalMoves(thrice)).toEqual([]);
  });

  it("does not count positions with different castling rights as the same", () => {
    const start = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    // The rook shuffle changes the castling rights after its first move, so the first position never recurs.
    const state = play(start, "h1h2", "h8h7", "h2h1", "h7h8", "h1h2", "h8h7", "h2h1", "h7h8");
    expect(state.status.phase).toBe("playing");
  });

  it("declares the fifty-move rule after 100 half-moves without a capture or pawn move", () => {
    const before = fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 98 80");
    const almost = play(before, "a1a2");
    expect(almost.status.phase).toBe("playing");
    const drawn = play(almost, "e8d8");
    expect(drawn.status).toMatchObject({ phase: "draw", reason: "fifty-move" });
  });

  it("resets the fifty-move clock on pawn moves and captures", () => {
    const pawn = play(fromFen("4k3/8/8/8/8/8/P7/R3K3 w - - 98 80"), "a2a3");
    expect(pawn.halfmoveClock).toBe(0);
    const capture = play(fromFen("4k3/8/8/8/8/8/r7/R3K3 w - - 98 80"), "a1a2");
    expect(capture.halfmoveClock).toBe(0);
  });

  it("prefers checkmate over the fifty-move rule", () => {
    const state = play(fromFen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 99 80"), "a1a8");
    expect(state.status).toMatchObject({ phase: "won", reason: "checkmate" });
  });

  it.each([
    ["king against king", "4k3/8/8/8/8/8/8/4K3 w - - 0 1"],
    ["king and bishop against king", "4k3/8/8/8/8/8/8/4KB2 w - - 0 1"],
    ["king and knight against king", "4k3/8/8/8/8/8/8/4KN2 b - - 0 1"],
    ["bishops on the same colour", "4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1"]
  ])("declares insufficient material: %s", (_name, fen) => {
    expect(fromFen(fen).status).toMatchObject({ phase: "draw", reason: "insufficient-material" });
  });

  it.each([
    ["a pawn", "4k3/8/8/8/8/8/P7/4K3 w - - 0 1"],
    ["a rook", "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"],
    ["two knights", "4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1"],
    ["bishops on opposite colours", "4kb2/8/8/8/8/8/8/4KB2 w - - 0 1"],
    ["bishop against knight", "4kn2/8/8/8/8/8/8/4KB2 w - - 0 1"]
  ])("keeps playing with %s", (_name, fen) => {
    expect(fromFen(fen).status.phase).toBe("playing");
  });

  it("becomes a draw when a capture leaves bare kings", () => {
    const state = play(fromFen("4k3/8/8/8/8/8/8/4Kr2 w - - 0 1"), "e1f1");
    expect(state.status).toMatchObject({ phase: "draw", reason: "insufficient-material" });
  });
});

describe("resignation", () => {
  it("gives the win to the other side", () => {
    const state = resignGame(createInitialState(), "white");
    expect(state.status).toEqual({
      phase: "won",
      winner: "black",
      reason: "resignation",
      message: "Black wins by resignation"
    });
    expect(getLegalMoves(state)).toEqual([]);
  });

  it("does nothing once the game is over", () => {
    const drawn = fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(resignGame(drawn, "white")).toBe(drawn);
  });
});

describe("standard algebraic notation", () => {
  it("writes pawn moves, piece moves and captures", () => {
    const state = playSan(createInitialState(), "e4", "d5", "exd5", "Nf6", "Bb5+", "c6", "dxc6", "Qb6");
    expect(state.moveLog.map((entry) => entry.notation)).toEqual([
      "e4", "d5", "exd5", "Nf6", "Bb5+", "c6", "dxc6", "Qb6"
    ]);
    expect(state.moveLog.map((entry) => entry.turn)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(state.moveLog[4].check).toBe(true);
  });

  it("disambiguates by file", () => {
    const state = fromFen("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
    expect(lastSan(play(state, "b1d2"))).toBe("Nbd2");
    expect(lastSan(play(state, "f1d2"))).toBe("Nfd2");
  });

  it("disambiguates by rank when the file is shared", () => {
    const state = fromFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
    expect(lastSan(play(state, "a1a3"))).toBe("R1a3");
    expect(lastSan(play(state, "a5a3"))).toBe("R5a3");
  });

  it("disambiguates by square when neither is enough", () => {
    const state = fromFen("8/k7/8/8/4Q2Q/8/8/K6Q w - - 0 1");
    expect(lastSan(play(state, "h4e1"))).toBe("Qh4e1");
    expect(lastSan(play(state, "e4e1"))).toBe("Qee1");
    expect(lastSan(play(state, "h1e1"))).toBe("Q1e1");
  });

  it("does not disambiguate when the other piece is pinned", () => {
    // The knight on e2 is pinned by the rook, so only the b1 knight can go to c3.
    const state = fromFen("4r1k1/8/8/8/8/8/4N3/1N2K3 w - - 0 1");
    expect(lastSan(play(state, "b1c3"))).toBe("Nc3");
  });

  it("writes captures by pieces with x", () => {
    const state = fromFen("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1");
    expect(lastSan(play(state, "e3d5"))).toBe("Nxd5");
  });

  it("finds moves from their notation", () => {
    const state = createInitialState();
    expect(findMoveBySan(state, "Nf3")?.id).toBe("g1f3");
    expect(findMoveBySan(state, "e4")?.id).toBe("e2e4");
    expect(findMoveBySan(state, "Ke2")).toBeNull();
  });
});

describe("FEN", () => {
  it("exports the start position", () => {
    expect(toFen(createInitialState())).toBe(START_FEN);
  });

  it.each([
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
    "4k3/8/8/8/8/8/8/R3K3 b Q - 42 71"
  ])("round-trips %s", (fen) => {
    expect(toFen(fromFen(fen))).toBe(fen);
  });

  it("tracks the en passant square, clocks and move number as the game goes on", () => {
    const state = play(createInitialState(), "e2e4");
    expect(toFen(state)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
    const next = play(state, "g8f6", "g1f3");
    expect(toFen(next)).toBe("rnbqkb1r/pppppppp/5n2/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2");
  });

  it("rejects malformed FEN", () => {
    expect(() => fromFen("not a fen")).toThrow("Invalid FEN");
    expect(() => fromFen("8/8/8/8/8/8/8 w - - 0 1")).toThrow("Invalid FEN");
    expect(() => fromFen("9/8/8/8/8/8/8/8 w - - 0 1")).toThrow("Invalid FEN");
  });
});

describe("material", () => {
  it("counts P1 N3 B3 R5 Q9 and lists captured pieces", () => {
    const start = getMaterial(createInitialState());
    expect(start.score).toEqual({ white: 39, black: 39 });
    expect(start.captured).toEqual({ white: [], black: [] });

    const state = playSan(createInitialState(), "e4", "d5", "exd5", "Qxd5");
    const material = getMaterial(state);
    expect(material.score).toEqual({ white: 38, black: 38 });
    expect(material.captured).toEqual({ white: ["pawn"], black: ["pawn"] });
  });
});

describe("variant hooks", () => {
  it("generates pseudo-legal moves with no check rules", () => {
    // The king is in check from the rook; pseudo-legal generation does not care.
    const state = fromFen("4k3/8/8/8/8/8/4r3/4K2N w - - 0 1");
    const pseudo = getPseudoLegalMoves(state).map((move) => move.id);
    expect(pseudo).toContain("h1g3");
    expect(pseudo).toContain("e1d2");
    expect(ids(state)).not.toContain("h1g3");
  });

  it("can restrict which pieces may be captured", () => {
    const state = fromFen("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1");
    const all = getPseudoLegalMoves(state).map((move) => move.id);
    const noPawns = getPseudoLegalMoves(state, "white", { canCapture: (_attacker, target) => target.kind !== "pawn" });
    expect(all).toContain("e3d5");
    expect(noPawns.map((move) => move.id)).not.toContain("e3d5");
  });

  it("can restrict which pieces may move, and list only tactical moves", () => {
    const state = fromFen("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1");
    const kingOnly = getPseudoLegalMoves(state, "white", { canMove: (piece) => piece.kind === "king" });
    expect(kingOnly.every((move) => move.pieceKind === "king")).toBe(true);
    const tactical = getPseudoLegalMoves(state, "white", { tacticalOnly: true });
    expect(tactical.map((move) => move.id)).toEqual(["e3d5"]);
  });

  it("answers attack questions with optional attacker and blocker filters", () => {
    const state = fromFen("4k3/8/8/8/8/8/r2P4/4K3 w - - 0 1");
    const e2 = parseSquare("e2");
    const d2 = parseSquare("d2");
    expect(isSquareAttacked(state, d2, "black")).toBe(true);
    // The pawn on d2 blocks the rook's line to e2.
    expect(isSquareAttacked(state, e2, "black")).toBe(false);
    // Attacks that pass through pawns.
    expect(isSquareAttacked(state, e2, "black", { isTransparent: (piece) => piece.kind === "pawn" })).toBe(true);
    // Attacks that ignore rooks as attackers.
    expect(isSquareAttacked(state, d2, "black", { canAttack: (piece) => piece.kind !== "rook" })).toBe(false);
  });

  it("knows pawn attack directions", () => {
    const state = fromFen("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1");
    expect(isSquareAttacked(state, parseSquare("d3"), "white")).toBe(true);
    expect(isSquareAttacked(state, parseSquare("e3"), "white")).toBe(false);
    expect(isSquareAttacked(state, parseSquare("e3"), "black")).toBe(true);
    expect(isSquareAttacked(state, parseSquare("d5"), "black")).toBe(false);
  });
});
