// Chess rules engine. Pure TypeScript: no UI, no DOM, no randomness, no clock.
//
// Move generation is two layers so a variant can recombine them:
//   1. getPseudoLegalMoves  - how each piece moves, ignoring check entirely
//   2. isLegalMove          - the check rules, built on isSquareAttacked
// generateLegalMoves = layer 1 filtered by layer 2. A variant changes `variantOptions` below
// (or the two layers themselves) and the shell, the bot and the server follow.

export const BOARD_SIZE = 8;

export const PLAYERS = ["white", "black"] as const;
export type Player = (typeof PLAYERS)[number];
export const PIECE_KINDS = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export const PROMOTION_KINDS = ["queen", "rook", "bishop", "knight"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

// row 0 is rank 8 (Black's back rank), row 7 is rank 1. col 0 is the a-file.
export type Square = {
  row: number;
  col: number;
};

export type Piece = {
  // Stable for the whole game, including through promotion.
  id: string;
  player: Player;
  kind: PieceKind;
};

export type Capture = Square & {
  pieceId: string;
};

export type CastleSide = "king" | "queen";

export type Move = {
  // Long algebraic: "e2e4", "e7e8q". Unique among the legal moves of a position.
  id: string;
  pieceId: string;
  pieceKind: PieceKind;
  player: Player;
  from: Square;
  to: Square;
  // Zero or one entry. The captured square differs from `to` only for en passant.
  captures: Capture[];
  promotion?: PromotionKind;
  castle?: CastleSide;
  // The rook's half of a castling move.
  rook?: { pieceId: string; from: Square; to: Square };
  enPassant?: boolean;
};

export type MoveLogEntry = {
  // Full-move number (1 for White's and Black's first moves).
  turn: number;
  player: Player;
  pieceId: string;
  pieceKind: PieceKind;
  from: Square;
  to: Square;
  captured: PieceKind[];
  // Standard algebraic notation, e.g. "Nbd7", "exd8=Q+", "O-O".
  notation: string;
  promotion?: PromotionKind;
  rook?: { pieceId: string; from: Square; to: Square };
  check: boolean;
};

export type DrawReason = "stalemate" | "threefold-repetition" | "fifty-move" | "insufficient-material";

export type GameStatus =
  | {
      phase: "playing";
      // True when the side to move is in check.
      check: boolean;
      message: string;
    }
  | {
      phase: "won";
      winner: Player;
      reason: "checkmate" | "resignation";
      message: string;
    }
  | {
      phase: "draw";
      reason: DrawReason;
      message: string;
    };

// Options a game is created with. Plain chess has none; a variant adds its switches here,
// gives them defaults in DEFAULT_GAME_RULES and sanitises them in normalizeRules.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GameRules = {};

export const DEFAULT_GAME_RULES: GameRules = {};

// Sanitises rules that came from storage or from another player's client.
export function normalizeRules(rules: unknown): GameRules {
  void rules;
  return {};
}

export type CastlingRights = Record<Player, { kingSide: boolean; queenSide: boolean }>;

export type GameState = {
  board: (Piece | null)[][];
  currentPlayer: Player;
  castling: CastlingRights;
  // The square a pawn skipped on the previous move, if it just advanced two squares.
  enPassant: Square | null;
  // Half-moves since the last capture or pawn move (fifty-move rule).
  halfmoveClock: number;
  fullmoveNumber: number;
  // How often each position has occurred since the last irreversible move (threefold repetition).
  positionCounts: Record<string, number>;
  rules: GameRules;
  moveLog: MoveLogEntry[];
  status: GameStatus;
};

export type LocatedPiece = {
  piece: Piece;
  square: Square;
};

// ---------------------------------------------------------------------------------------------
// Variant hooks
// ---------------------------------------------------------------------------------------------

export type AttackOptions = {
  // Which pieces count as attackers. Default: every piece. A piece that cannot attack still blocks.
  canAttack?: (piece: Piece, from: Square, state: GameState) => boolean;
  // Pieces that sliding attacks pass straight through. Default: none.
  isTransparent?: (piece: Piece, at: Square, state: GameState) => boolean;
};

export type MoveGenOptions = {
  // Which enemy pieces `attacker` may capture. Default: any enemy piece.
  canCapture?: (attacker: Piece, target: Piece, at: Square, state: GameState) => boolean;
  // Which pieces may move at all. Default: every piece.
  canMove?: (piece: Piece, from: Square, state: GameState) => boolean;
  // Only captures and promotions (used by the bot's quiescence search).
  tacticalOnly?: boolean;
};

export type LegalityOptions = {
  moves?: MoveGenOptions;
  attacks?: AttackOptions;
  // False turns the check rules off entirely: every pseudo-legal move is legal.
  checkRules?: boolean;
};

// THE VARIANT SEAM. Everything that asks "what is legal here?" (getLegalMoves, applyMove, the
// status after each move, the bot) goes through these options. Plain chess uses the defaults.
export function variantOptions(state: GameState): LegalityOptions {
  void state;
  return {};
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FEN_KINDS: Record<string, PieceKind> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const KIND_LETTERS: Record<PieceKind, string> = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };

const KNIGHT_OFFSETS: readonly (readonly [number, number])[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]
];
const DIAGONALS: readonly (readonly [number, number])[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONALS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ALL_DIRECTIONS = [...DIAGONALS, ...ORTHOGONALS];

const SQUARE_NAMES: string[][] = Array.from({ length: BOARD_SIZE }, (_, row) =>
  Array.from({ length: BOARD_SIZE }, (_, col) => `${String.fromCharCode(97 + col)}${BOARD_SIZE - row}`)
);

export function createInitialState(rules: GameRules = DEFAULT_GAME_RULES): GameState {
  return fromFen(START_FEN, rules);
}

// Builds a game from a FEN string. Piece ids are derived from the squares in the FEN.
export function fromFen(fen: string, rules: GameRules = DEFAULT_GAME_RULES): GameState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) throw new Error(`Invalid FEN: ${fen}`);
  const [placement, side, castlingField, enPassantField, halfmove = "0", fullmove = "1"] = fields;
  const rows = placement.split("/");
  if (rows.length !== BOARD_SIZE) throw new Error(`Invalid FEN board: ${fen}`);

  const board = createEmptyBoard();
  rows.forEach((text, row) => {
    let col = 0;
    for (const char of text) {
      if (/\d/.test(char)) {
        col += Number(char);
        continue;
      }
      const kind = FEN_KINDS[char.toLowerCase()];
      if (!kind || col >= BOARD_SIZE) throw new Error(`Invalid FEN board: ${fen}`);
      const player: Player = char === char.toLowerCase() ? "black" : "white";
      board[row][col] = { id: `${player}-${kind}-${SQUARE_NAMES[row][col]}`, player, kind };
      col += 1;
    }
    if (col !== BOARD_SIZE) throw new Error(`Invalid FEN board: ${fen}`);
  });

  if (side !== "w" && side !== "b") throw new Error(`Invalid FEN side to move: ${fen}`);

  const state: GameState = {
    board,
    currentPlayer: side === "w" ? "white" : "black",
    castling: {
      white: { kingSide: castlingField.includes("K"), queenSide: castlingField.includes("Q") },
      black: { kingSide: castlingField.includes("k"), queenSide: castlingField.includes("q") }
    },
    enPassant: enPassantField === "-" ? null : parseSquare(enPassantField),
    halfmoveClock: Number(halfmove) || 0,
    fullmoveNumber: Number(fullmove) || 1,
    positionCounts: {},
    rules,
    moveLog: [],
    status: PLAYING
  };
  state.positionCounts = { [positionKey(state)]: 1 };
  return { ...state, status: evaluateStatus(state) };
}

export function toFen(state: GameState): string {
  const placement = state.board
    .map((row) => {
      let text = "";
      let empty = 0;
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) text += empty;
        empty = 0;
        const letter = KIND_LETTERS[piece.kind];
        text += piece.player === "white" ? letter.toUpperCase() : letter;
      }
      return empty ? text + empty : text;
    })
    .join("/");
  const enPassant = state.enPassant ? SQUARE_NAMES[state.enPassant.row][state.enPassant.col] : "-";
  return [
    placement,
    state.currentPlayer === "white" ? "w" : "b",
    castlingText(state.castling),
    enPassant,
    state.halfmoveClock,
    state.fullmoveNumber
  ].join(" ");
}

// ---------------------------------------------------------------------------------------------
// Layer 1: pseudo-legal moves (piece movement only, no check rules)
// ---------------------------------------------------------------------------------------------

export function getPseudoLegalMoves(
  state: GameState,
  player: Player = state.currentPlayer,
  options: MoveGenOptions = {}
): Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (piece && piece.player === player) addPieceMoves(state, piece, row, col, options, moves);
    }
  }
  return moves;
}

export function getPseudoLegalMovesForPiece(state: GameState, from: Square, options: MoveGenOptions = {}): Move[] {
  const piece = getPieceAt(state, from);
  const moves: Move[] = [];
  if (piece) addPieceMoves(state, piece, from.row, from.col, options, moves);
  return moves;
}

function addPieceMoves(state: GameState, piece: Piece, row: number, col: number, options: MoveGenOptions, out: Move[]) {
  if (options.canMove && !options.canMove(piece, { row, col }, state)) return;
  switch (piece.kind) {
    case "pawn":
      addPawnMoves(state, piece, row, col, options, out);
      break;
    case "knight":
      addStepMoves(state, piece, row, col, KNIGHT_OFFSETS, options, out);
      break;
    case "bishop":
      addSlideMoves(state, piece, row, col, DIAGONALS, options, out);
      break;
    case "rook":
      addSlideMoves(state, piece, row, col, ORTHOGONALS, options, out);
      break;
    case "queen":
      addSlideMoves(state, piece, row, col, ALL_DIRECTIONS, options, out);
      break;
    case "king":
      addStepMoves(state, piece, row, col, ALL_DIRECTIONS, options, out);
      if (!options.tacticalOnly) addCastlingMoves(state, piece, row, col, out);
      break;
  }
}

function makeMoveRecord(
  piece: Piece,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  captured: Piece | null,
  promotion?: PromotionKind
): Move {
  const move: Move = {
    id: SQUARE_NAMES[fromRow][fromCol] + SQUARE_NAMES[toRow][toCol] + (promotion ? KIND_LETTERS[promotion] : ""),
    pieceId: piece.id,
    pieceKind: piece.kind,
    player: piece.player,
    from: { row: fromRow, col: fromCol },
    to: { row: toRow, col: toCol },
    captures: captured ? [{ row: toRow, col: toCol, pieceId: captured.id }] : []
  };
  if (promotion) move.promotion = promotion;
  return move;
}

function mayCapture(state: GameState, piece: Piece, target: Piece, row: number, col: number, options: MoveGenOptions) {
  if (target.player === piece.player) return false;
  return options.canCapture ? options.canCapture(piece, target, { row, col }, state) : true;
}

function addStepMoves(
  state: GameState,
  piece: Piece,
  row: number,
  col: number,
  offsets: readonly (readonly [number, number])[],
  options: MoveGenOptions,
  out: Move[]
) {
  for (const [dr, dc] of offsets) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    const target = state.board[r][c];
    if (!target) {
      if (!options.tacticalOnly) out.push(makeMoveRecord(piece, row, col, r, c, null));
    } else if (mayCapture(state, piece, target, r, c, options)) {
      out.push(makeMoveRecord(piece, row, col, r, c, target));
    }
  }
}

function addSlideMoves(
  state: GameState,
  piece: Piece,
  row: number,
  col: number,
  directions: readonly (readonly [number, number])[],
  options: MoveGenOptions,
  out: Move[]
) {
  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      const target = state.board[r][c];
      if (target) {
        if (mayCapture(state, piece, target, r, c, options)) out.push(makeMoveRecord(piece, row, col, r, c, target));
        break;
      }
      if (!options.tacticalOnly) out.push(makeMoveRecord(piece, row, col, r, c, null));
      r += dr;
      c += dc;
    }
  }
}

function addPawnMoves(state: GameState, piece: Piece, row: number, col: number, options: MoveGenOptions, out: Move[]) {
  const forward = pawnDirection(piece.player);
  const startRow = piece.player === "white" ? BOARD_SIZE - 2 : 1;
  const promotionRow = piece.player === "white" ? 0 : BOARD_SIZE - 1;
  const r = row + forward;
  if (r < 0 || r >= BOARD_SIZE) return;

  const push = (toRow: number, toCol: number, captured: Piece | null) => {
    if (toRow === promotionRow) {
      for (const kind of PROMOTION_KINDS) out.push(makeMoveRecord(piece, row, col, toRow, toCol, captured, kind));
    } else {
      out.push(makeMoveRecord(piece, row, col, toRow, toCol, captured));
    }
  };

  if (!state.board[r][col] && (!options.tacticalOnly || r === promotionRow)) {
    push(r, col, null);
    if (row === startRow && !state.board[r + forward][col] && !options.tacticalOnly) {
      out.push(makeMoveRecord(piece, row, col, r + forward, col, null));
    }
  }

  for (const dc of [-1, 1]) {
    const c = col + dc;
    if (c < 0 || c >= BOARD_SIZE) continue;
    const target = state.board[r][c];
    if (target) {
      if (mayCapture(state, piece, target, r, c, options)) push(r, c, target);
      continue;
    }
    const enPassant = state.enPassant;
    if (enPassant && enPassant.row === r && enPassant.col === c) {
      const victim = state.board[row][c];
      if (victim && victim.kind === "pawn" && mayCapture(state, piece, victim, row, c, options)) {
        const move = makeMoveRecord(piece, row, col, r, c, null);
        move.captures = [{ row, col: c, pieceId: victim.id }];
        move.enPassant = true;
        out.push(move);
      }
    }
  }
}

// Castling by rights and empty squares only. "Not out of, through or into check" is a check
// rule, so it lives in isLegalMove.
function addCastlingMoves(state: GameState, king: Piece, row: number, col: number, out: Move[]) {
  const homeRow = king.player === "white" ? BOARD_SIZE - 1 : 0;
  if (row !== homeRow || col !== 4) return;
  const rights = state.castling[king.player];
  const boardRow = state.board[row];

  const add = (side: CastleSide, rookCol: number, kingTo: number, rookTo: number, empty: number[]) => {
    const rook = boardRow[rookCol];
    if (!rook || rook.kind !== "rook" || rook.player !== king.player) return;
    if (empty.some((c) => boardRow[c])) return;
    const move = makeMoveRecord(king, row, col, row, kingTo, null);
    move.castle = side;
    move.rook = { pieceId: rook.id, from: { row, col: rookCol }, to: { row, col: rookTo } };
    out.push(move);
  };

  if (rights.kingSide) add("king", 7, 6, 5, [5, 6]);
  if (rights.queenSide) add("queen", 0, 2, 3, [1, 2, 3]);
}

// ---------------------------------------------------------------------------------------------
// Layer 2: attacks and the check rules
// ---------------------------------------------------------------------------------------------

// True when a piece of `byPlayer` attacks `square` (could capture a piece standing there).
export function isSquareAttacked(
  state: GameState,
  square: Square,
  byPlayer: Player,
  options: AttackOptions = {}
): boolean {
  const { row, col } = square;
  const board = state.board;
  const counts = (piece: Piece, r: number, c: number) =>
    !options.canAttack || options.canAttack(piece, { row: r, col: c }, state);

  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    const piece = board[r][c];
    if (piece && piece.player === byPlayer && piece.kind === "knight" && counts(piece, r, c)) return true;
  }

  // A pawn attacks one row ahead of itself, so the attacker sits one row behind the square.
  const pawnRow = row - pawnDirection(byPlayer);
  if (pawnRow >= 0 && pawnRow < BOARD_SIZE) {
    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (c < 0 || c >= BOARD_SIZE) continue;
      const piece = board[pawnRow][c];
      if (piece && piece.player === byPlayer && piece.kind === "pawn" && counts(piece, pawnRow, c)) return true;
    }
  }

  for (let index = 0; index < ALL_DIRECTIONS.length; index += 1) {
    const [dr, dc] = ALL_DIRECTIONS[index];
    const diagonal = index < DIAGONALS.length;
    let r = row + dr;
    let c = col + dc;
    let distance = 1;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      const piece = board[r][c];
      if (piece && !(options.isTransparent && options.isTransparent(piece, { row: r, col: c }, state))) {
        if (piece.player === byPlayer) {
          const slides =
            piece.kind === "queen" || (diagonal ? piece.kind === "bishop" : piece.kind === "rook");
          if ((slides || (distance === 1 && piece.kind === "king")) && counts(piece, r, c)) return true;
        }
        break;
      }
      r += dr;
      c += dc;
      distance += 1;
    }
  }

  return false;
}

export function findKing(state: GameState, player: Player): Square | null {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (piece && piece.kind === "king" && piece.player === player) return { row, col };
    }
  }
  return null;
}

export function isInCheck(state: GameState, player: Player, options: AttackOptions = variantOptions(state).attacks ?? {}): boolean {
  const king = findKing(state, player);
  return king ? isSquareAttacked(state, king, opponentOf(player), options) : false;
}

// The check rules for one pseudo-legal move: the mover's king may not be attacked afterwards,
// and a king may not castle out of or through an attacked square.
export function isLegalMove(state: GameState, move: Move, options: AttackOptions = {}): boolean {
  const enemy = opponentOf(move.player);
  if (move.castle) {
    if (isSquareAttacked(state, move.from, enemy, options)) return false;
    const transit = { row: move.from.row, col: (move.from.col + move.to.col) / 2 };
    if (isSquareAttacked(state, transit, enemy, options)) return false;
  }
  const next = makeMove(state, move);
  const king = move.pieceKind === "king" ? move.to : findKing(next, move.player);
  return king ? !isSquareAttacked(next, king, enemy, options) : true;
}

// Legal moves for `player`, whatever the game status says. `overrides` is merged over the
// variant's own options (the bot passes `tacticalOnly`).
export function generateLegalMoves(
  state: GameState,
  player: Player = state.currentPlayer,
  overrides: MoveGenOptions = {}
): Move[] {
  const options = variantOptions(state);
  const pseudo = getPseudoLegalMoves(state, player, { ...options.moves, ...overrides });
  if (options.checkRules === false) return pseudo;
  const attacks = options.attacks ?? {};
  return pseudo.filter((move) => isLegalMove(state, move, attacks));
}

// The moves the side to move may play. Empty once the game is over.
export function getLegalMoves(state: GameState, player: Player = state.currentPlayer): Move[] {
  if (state.status.phase !== "playing") return [];
  return generateLegalMoves(state, player);
}

// ---------------------------------------------------------------------------------------------
// Making moves
// ---------------------------------------------------------------------------------------------

const PLAYING: GameStatus = { phase: "playing", check: false, message: "" };

// Plays a pseudo-legal move with no legality check, no move log, no repetition count and no
// status. This is the fast path for search (the bot) and for the legality filter itself.
export function makeMove(state: GameState, move: Move): GameState {
  const board = state.board.slice();
  const touch = (row: number) => {
    if (board[row] === state.board[row]) board[row] = board[row].slice();
  };
  const { from, to } = move;
  const piece = state.board[from.row][from.col];
  if (!piece) throw new Error(`No piece on ${squareName(from)}`);

  touch(from.row);
  board[from.row][from.col] = null;
  for (const capture of move.captures) {
    touch(capture.row);
    board[capture.row][capture.col] = null;
  }
  touch(to.row);
  board[to.row][to.col] = move.promotion ? { ...piece, kind: move.promotion } : piece;

  if (move.rook) {
    const rook = board[move.rook.from.row][move.rook.from.col];
    board[move.rook.from.row][move.rook.from.col] = null;
    board[move.rook.to.row][move.rook.to.col] = rook;
  }

  let castling = state.castling;
  const loseRight = (player: Player, side: "kingSide" | "queenSide") => {
    if (!castling[player][side]) return;
    castling = { ...castling, [player]: { ...castling[player], [side]: false } };
  };
  if (piece.kind === "king") {
    loseRight(piece.player, "kingSide");
    loseRight(piece.player, "queenSide");
  }
  // A rook leaving its corner, or anything landing on a corner, ends castling on that side.
  for (const square of [from, to]) {
    if (square.col !== 0 && square.col !== BOARD_SIZE - 1) continue;
    const owner: Player | null = square.row === BOARD_SIZE - 1 ? "white" : square.row === 0 ? "black" : null;
    if (owner) loseRight(owner, square.col === 0 ? "queenSide" : "kingSide");
  }

  const doublePush = piece.kind === "pawn" && Math.abs(to.row - from.row) === 2;
  const irreversible = piece.kind === "pawn" || move.captures.length > 0;

  return {
    ...state,
    board,
    castling,
    currentPlayer: opponentOf(move.player),
    enPassant: doublePush ? { row: (from.row + to.row) / 2, col: from.col } : null,
    halfmoveClock: irreversible ? 0 : state.halfmoveClock + 1,
    fullmoveNumber: state.fullmoveNumber + (move.player === "black" ? 1 : 0),
    status: PLAYING
  };
}

// Plays one legal move for the side to move and returns the new state (the input is not changed).
export function applyMove(state: GameState, moveId: string): GameState {
  const legalMoves = getLegalMoves(state);
  const move = legalMoves.find((candidate) => candidate.id === moveId);
  if (!move) throw new Error(`Illegal move: ${moveId}`);

  const captured = move.captures
    .map((capture) => state.board[capture.row][capture.col]?.kind)
    .filter((kind): kind is PieceKind => Boolean(kind));

  const moved = makeMove(state, move);
  const irreversible = move.pieceKind === "pawn" || captured.length > 0;
  const key = positionKey(moved);
  const positionCounts = irreversible
    ? { [key]: 1 }
    : { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 };

  const next: GameState = { ...moved, positionCounts };
  const status = evaluateStatus(next);
  const check = status.phase === "playing" ? status.check : status.phase === "won";
  const suffix = status.phase === "won" ? "#" : check ? "+" : "";

  const entry: MoveLogEntry = {
    turn: state.fullmoveNumber,
    player: move.player,
    pieceId: move.pieceId,
    pieceKind: move.pieceKind,
    from: move.from,
    to: move.to,
    captured,
    notation: sanWithoutSuffix(move, legalMoves) + suffix,
    check
  };
  if (move.promotion) entry.promotion = move.promotion;
  if (move.rook) entry.rook = move.rook;

  return { ...next, moveLog: [...state.moveLog, entry], status };
}

export function resignGame(state: GameState, player: Player = state.currentPlayer): GameState {
  if (state.status.phase !== "playing") return state;
  const winner = opponentOf(player);
  return {
    ...state,
    status: {
      phase: "won",
      winner,
      reason: "resignation",
      message: `${playerName(winner)} wins by resignation`
    }
  };
}

export function isGameOver(state: GameState): boolean {
  return state.status.phase !== "playing";
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

export function evaluateStatus(state: GameState): GameStatus {
  const player = state.currentPlayer;
  const options = variantOptions(state);
  const check = options.checkRules === false ? false : isInCheck(state, player, options.attacks ?? {});
  const hasMove = generateLegalMoves(state, player).length > 0;

  if (!hasMove && check) {
    const winner = opponentOf(player);
    return { phase: "won", winner, reason: "checkmate", message: `Checkmate. ${playerName(winner)} wins` };
  }
  if (!hasMove) {
    return { phase: "draw", reason: "stalemate", message: `Draw by stalemate: ${playerName(player)} has no legal move` };
  }
  if (hasInsufficientMaterial(state)) {
    return { phase: "draw", reason: "insufficient-material", message: "Draw: neither side has enough material to checkmate" };
  }
  if ((state.positionCounts[positionKey(state)] ?? 0) >= 3) {
    return { phase: "draw", reason: "threefold-repetition", message: "Draw by threefold repetition" };
  }
  if (state.halfmoveClock >= 100) {
    return { phase: "draw", reason: "fifty-move", message: "Draw by the fifty-move rule" };
  }
  return {
    phase: "playing",
    check,
    message: check ? `${playerName(player)} is in check` : `${playerName(player)} to move`
  };
}

// King against king, king and one minor piece against king, or only bishops that all stand on
// the same colour.
export function hasInsufficientMaterial(state: GameState): boolean {
  let knights = 0;
  let lightBishops = 0;
  let darkBishops = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.kind === "king") continue;
      if (piece.kind === "knight") knights += 1;
      else if (piece.kind === "bishop") {
        if (isDarkSquare({ row, col })) darkBishops += 1;
        else lightBishops += 1;
      } else return false;
    }
  }
  if (knights === 0) return lightBishops === 0 || darkBishops === 0;
  return knights === 1 && lightBishops + darkBishops === 0;
}

// Identifies a position for repetition: placement, side to move, castling rights and the
// en passant square when a capture there is actually possible.
export function positionKey(state: GameState): string {
  let key = "";
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (!piece) key += ".";
      else key += piece.player === "white" ? KIND_LETTERS[piece.kind].toUpperCase() : KIND_LETTERS[piece.kind];
    }
  }
  key += state.currentPlayer === "white" ? " w " : " b ";
  key += castlingText(state.castling);
  if (state.enPassant) {
    const { row, col } = state.enPassant;
    const pawnRow = row - pawnDirection(state.currentPlayer);
    for (const dc of [-1, 1]) {
      const piece = state.board[pawnRow]?.[col + dc];
      if (piece && piece.kind === "pawn" && piece.player === state.currentPlayer) {
        key += ` ${SQUARE_NAMES[row][col]}`;
        break;
      }
    }
  }
  return key;
}

// ---------------------------------------------------------------------------------------------
// Notation
// ---------------------------------------------------------------------------------------------

const SAN_LETTERS: Record<PieceKind, string> = { pawn: "", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };

function sanWithoutSuffix(move: Move, legalMoves: Move[]): string {
  if (move.castle) return move.castle === "king" ? "O-O" : "O-O-O";

  const capture = move.captures.length > 0;
  const destination = SQUARE_NAMES[move.to.row][move.to.col];
  const fromName = SQUARE_NAMES[move.from.row][move.from.col];

  if (move.pieceKind === "pawn") {
    const promotion = move.promotion ? `=${SAN_LETTERS[move.promotion]}` : "";
    return `${capture ? `${fromName[0]}x` : ""}${destination}${promotion}`;
  }

  // Disambiguate when another piece of the same kind could also reach the square:
  // by file if that is enough, otherwise by rank, otherwise by both.
  const rivals = legalMoves.filter(
    (other) =>
      other.pieceId !== move.pieceId &&
      other.pieceKind === move.pieceKind &&
      other.to.row === move.to.row &&
      other.to.col === move.to.col
  );
  let origin = "";
  if (rivals.length > 0) {
    if (!rivals.some((other) => other.from.col === move.from.col)) origin = fromName[0];
    else if (!rivals.some((other) => other.from.row === move.from.row)) origin = fromName[1];
    else origin = fromName;
  }
  return `${SAN_LETTERS[move.pieceKind]}${origin}${capture ? "x" : ""}${destination}`;
}

// The SAN text a legal move would be logged with, without playing it.
export function moveToSan(state: GameState, moveId: string): string {
  const next = applyMove(state, moveId);
  return next.moveLog[next.moveLog.length - 1].notation;
}

// Finds the legal move written as `san` ("Nf3", "exd5", "O-O", "e8=Q"; check marks optional).
export function findMoveBySan(state: GameState, san: string): Move | null {
  const wanted = san.replace(/[+#!?]/g, "");
  const legalMoves = getLegalMoves(state);
  return legalMoves.find((move) => sanWithoutSuffix(move, legalMoves) === wanted) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Helpers the UI calls
// ---------------------------------------------------------------------------------------------

export function getPieceAt(state: GameState, square: Square): Piece | null {
  if (!isInside(square)) return null;
  return state.board[square.row][square.col];
}

export function findPiece(state: GameState, pieceId: string): LocatedPiece | null {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (piece?.id === pieceId) return { piece, square: { row, col } };
    }
  }
  return null;
}

// The square of a king that is in check or checkmated, for the board highlight.
export function getCheckedKingSquare(state: GameState): Square | null {
  const { status } = state;
  if (status.phase === "playing" && status.check) return findKing(state, state.currentPlayer);
  if (status.phase === "won" && status.reason === "checkmate") return findKing(state, opponentOf(status.winner));
  return null;
}

export function isDarkSquare(square: Square): boolean {
  return (square.row + square.col) % 2 === 1;
}

export function isInside(square: Square): boolean {
  return square.row >= 0 && square.row < BOARD_SIZE && square.col >= 0 && square.col < BOARD_SIZE;
}

export function squareName(square: Square): string {
  return SQUARE_NAMES[square.row][square.col];
}

export function parseSquare(name: string): Square {
  const col = name.charCodeAt(0) - 97;
  const row = BOARD_SIZE - Number(name.slice(1));
  const square = { row, col };
  if (!isInside(square)) throw new Error(`Invalid square: ${name}`);
  return square;
}

export function opponentOf(player: Player): Player {
  return player === "white" ? "black" : "white";
}

export function playerName(player: Player): string {
  return player === "white" ? "White" : "Black";
}

export function pieceName(kind: PieceKind): string {
  return kind;
}

// Rows a pawn of `player` advances per move: White moves up the board (toward row 0).
export function pawnDirection(player: Player): number {
  return player === "white" ? -1 : 1;
}

// Standard material values. The king has none.
export const PIECE_POINTS: Record<PieceKind, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

export type Material = {
  // Points still on the board for each side.
  score: Record<Player, number>;
  // Enemy pieces each side has captured, as they were when taken.
  captured: Record<Player, PieceKind[]>;
};

export function getMaterial(state: GameState): Material {
  const score: Record<Player, number> = { white: 0, black: 0 };
  for (const row of state.board) {
    for (const piece of row) {
      if (piece) score[piece.player] += PIECE_POINTS[piece.kind];
    }
  }
  const captured: Record<Player, PieceKind[]> = { white: [], black: [] };
  for (const entry of state.moveLog) captured[entry.player].push(...entry.captured);
  return { score, captured };
}

// Counts the leaf positions `depth` moves deep. The standard move-generator correctness test.
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) nodes += perft(makeMove(state, move), depth - 1);
  return nodes;
}

function castlingText(castling: CastlingRights): string {
  const text =
    (castling.white.kingSide ? "K" : "") +
    (castling.white.queenSide ? "Q" : "") +
    (castling.black.kingSide ? "k" : "") +
    (castling.black.queenSide ? "q" : "");
  return text || "-";
}

function createEmptyBoard(): (Piece | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
}
