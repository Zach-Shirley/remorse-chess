// Chess bot: iterative-deepening alpha-beta search with quiescence over the shared rules engine.
// It only touches the engine through generateLegalMoves, makeMove, isInCheck and applyMove, so a
// variant that changes the rules gets a bot that follows them; `evaluate` is the chess-specific part.
import {
  BOARD_SIZE,
  applyMove,
  generateLegalMoves,
  getLegalMoves,
  isInCheck,
  makeMove,
  type GameState,
  type Move,
  type PieceKind,
  type Player
} from "./game";

export type BotLevel = "easy" | "medium" | "hard";

export const BOT_LEVELS: Record<BotLevel, { label: string; description: string }> = {
  easy: { label: "Easy", description: "Learning the ropes. Misses things." },
  medium: { label: "Medium", description: "Looks a few moves ahead." },
  hard: { label: "Hard", description: "Thinks deep. Punishes mistakes." }
};

export type BotAction = { type: "move"; moveId: string };

type LevelSettings = {
  maxDepth: number;
  timeLimitMs: number;
  // Random score noise, in centipawns, so weaker bots pick imperfect moves.
  noise: number;
  // Chance of playing a random legal move outright.
  blunderChance: number;
};

const LEVEL_SETTINGS: Record<BotLevel, LevelSettings> = {
  easy: { maxDepth: 1, timeLimitMs: 200, noise: 140, blunderChance: 0.25 },
  medium: { maxDepth: 3, timeLimitMs: 500, noise: 30, blunderChance: 0.03 },
  hard: { maxDepth: 12, timeLimitMs: 900, noise: 0, blunderChance: 0 }
};

const WIN_SCORE = 100_000;
const MAX_QUIESCENCE_PLIES = 6;
// Check extensions stop this many plies past the nominal depth, so perpetual checks end.
const MAX_EXTENSION_PLIES = 6;

export const PIECE_VALUE: Record<PieceKind, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0
};

export type BotOptions = {
  random?: () => number;
  now?: () => number;
  timeLimitMs?: number;
};

export function chooseBotAction(state: GameState, level: BotLevel, botOptions: BotOptions = {}): BotAction | null {
  const { random = Math.random, now = () => performance.now() } = botOptions;
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return { type: "move", moveId: moves[0].id };

  const settings = LEVEL_SETTINGS[level];
  if (random() < settings.blunderChance) {
    return { type: "move", moveId: moves[Math.floor(random() * moves.length)].id };
  }

  const deadline = now() + (botOptions.timeLimitMs ?? settings.timeLimitMs);

  // The real result of each root move, so the search knows about draws by repetition and the
  // fifty-move rule, which the fast search states do not track.
  type RootMove = { move: Move; next: GameState; fixed: number | null; score: number };
  let root: RootMove[] = orderMoves(state, moves).map((move) => {
    const played = applyMove(state, move.id);
    const fixed = played.status.phase === "won" ? WIN_SCORE - 1 : played.status.phase === "draw" ? 0 : null;
    return { move, next: played, fixed, score: 0 };
  });

  // Iterative deepening: keep the deepest fully searched result when time runs out.
  for (let depth = 1; depth <= settings.maxDepth; depth += 1) {
    const search = new Search(deadline, now, depth + MAX_EXTENSION_PLIES);
    const scored: RootMove[] = [];
    let alpha = -Infinity;
    for (const entry of root) {
      // Weaker levels add noise to every score, so each move needs a true score, not a bound.
      const window = settings.noise > 0 ? -Infinity : alpha;
      const score = entry.fixed ?? -search.negamax(entry.next, depth - 1, -Infinity, -window, 1);
      if (search.timedOut) break;
      scored.push({ ...entry, score });
      alpha = Math.max(alpha, score);
    }
    // A pass cut off by the clock has unreliable scores; keep the previous depth.
    if (search.timedOut) break;
    // Best first, so the next iteration searches the strongest line first (better pruning).
    // The sort is stable, so moves that only matched the bound keep their earlier order.
    root = scored.sort((a, b) => b.score - a.score);
    if (Math.abs(root[0].score) >= WIN_SCORE - 100) break;
  }

  if (settings.noise > 0) {
    root = root
      .map((entry) => ({ ...entry, score: entry.score + (random() * 2 - 1) * settings.noise }))
      .sort((a, b) => b.score - a.score);
  }
  return { type: "move", moveId: root[0].move.id };
}

class Search {
  timedOut = false;
  private nodes = 0;

  constructor(
    private readonly deadline: number,
    private readonly now: () => number,
    private readonly maxPly: number
  ) {}

  // Score of `state` for the side to move.
  negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (++this.nodes % 128 === 0 && this.now() > this.deadline) this.timedOut = true;
    if (this.timedOut) return 0;
    if (state.halfmoveClock >= 100) return 0;

    const player = state.currentPlayer;
    const inCheck = isInCheck(state, player);
    // Never stop searching while in check: the position is not quiet and may be mate.
    if (inCheck && depth <= 0 && ply < this.maxPly) depth = 1;
    if (depth <= 0) return this.quiesce(state, alpha, beta, 0);

    const moves = generateLegalMoves(state);
    if (moves.length === 0) {
      // Checkmate, scored so faster mates are preferred; otherwise stalemate.
      return inCheck ? -WIN_SCORE + ply : 0;
    }

    let best = -Infinity;
    for (const child of orderChildren(state, moves, depth >= 2)) {
      const next = child.next ?? makeMove(state, child.move);
      const score = -this.negamax(next, depth - 1, -beta, -alpha, ply + 1);
      if (this.timedOut) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Quiescence: keep resolving captures and promotions so the bot does not stop searching in
  // the middle of an exchange.
  private quiesce(state: GameState, alpha: number, beta: number, qply: number): number {
    if (++this.nodes % 128 === 0 && this.now() > this.deadline) this.timedOut = true;
    if (this.timedOut) return 0;

    // The side to move can always decline the exchange ("stand pat").
    const standPat = evaluate(state, state.currentPlayer);
    if (standPat >= beta || qply >= MAX_QUIESCENCE_PLIES) return standPat;
    if (standPat > alpha) alpha = standPat;

    let best = standPat;
    const tactical = generateLegalMoves(state, state.currentPlayer, { tacticalOnly: true });
    for (const move of orderMoves(state, tactical)) {
      const score = -this.quiesce(makeMove(state, move), -beta, -alpha, qply + 1);
      if (this.timedOut) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }
}

// Move ordering score: captures by most valuable victim / least valuable attacker, then promotions.
function orderingScore(state: GameState, move: Move): number {
  let score = 0;
  const capture = move.captures[0];
  if (capture) {
    const victim = state.board[capture.row][capture.col];
    score += 10_000 + (victim ? PIECE_VALUE[victim.kind] : 0) * 10 - PIECE_VALUE[move.pieceKind];
  }
  if (move.promotion) score += 8_000 + PIECE_VALUE[move.promotion];
  if (move.castle) score += 50;
  return score;
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return moves
    .map((move) => ({ move, score: orderingScore(state, move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

// Like orderMoves, and with `withChecks` it also plays each move to rank checking moves early.
// The played states are returned so the search does not make them twice.
function orderChildren(state: GameState, moves: Move[], withChecks: boolean): { move: Move; next: GameState | null }[] {
  return moves
    .map((move) => {
      let score = orderingScore(state, move);
      let next: GameState | null = null;
      if (withChecks) {
        next = makeMove(state, move);
        if (isInCheck(next, next.currentPlayer)) score += 9_000;
      }
      return { move, next, score };
    })
    .sort((a, b) => b.score - a.score);
}

// Piece-square tables from White's side, row 0 = rank 8 (the "simplified evaluation function"
// tables by Tomasz Michniewski). Black reads them mirrored.
const PAWN_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0]
];
const KNIGHT_TABLE = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50]
];
const BISHOP_TABLE = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20]
];
const ROOK_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0]
];
const QUEEN_TABLE = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20]
];
const KING_MIDDLE_TABLE = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20]
];
const KING_END_TABLE = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50]
];
const TABLES: Record<Exclude<PieceKind, "king">, number[][]> = {
  pawn: PAWN_TABLE,
  knight: KNIGHT_TABLE,
  bishop: BISHOP_TABLE,
  rook: ROOK_TABLE,
  queen: QUEEN_TABLE
};
// Non-pawn material of both sides at the start; the game "phase" runs from 1 (opening) to 0.
const FULL_PHASE_MATERIAL = 2 * (2 * 320 + 2 * 330 + 2 * 500 + 900);

// Static evaluation from `me`'s point of view, in centipawns: material, piece-square tables,
// the bishop pair, a pawn shield in front of the king, and pushed pawns in the endgame.
export function evaluate(state: GameState, me: Player): number {
  const board = state.board;
  let score = 0; // White minus Black
  let nonPawnMaterial = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteKingRow = -1;
  let whiteKingCol = -1;
  let blackKingRow = -1;
  let blackKingCol = -1;
  let whitePawnAdvance = 0;
  let blackPawnAdvance = 0;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const white = piece.player === "white";
      if (piece.kind === "king") {
        if (white) {
          whiteKingRow = row;
          whiteKingCol = col;
        } else {
          blackKingRow = row;
          blackKingCol = col;
        }
        continue;
      }
      const tableRow = white ? row : BOARD_SIZE - 1 - row;
      const value = PIECE_VALUE[piece.kind] + TABLES[piece.kind][tableRow][col];
      score += white ? value : -value;
      if (piece.kind === "pawn") {
        const advance = BOARD_SIZE - 2 - tableRow; // 0 on the start rank, 5 one step from promoting
        if (white) whitePawnAdvance += advance * advance;
        else blackPawnAdvance += advance * advance;
      } else {
        nonPawnMaterial += PIECE_VALUE[piece.kind];
        if (piece.kind === "bishop") {
          if (white) whiteBishops += 1;
          else blackBishops += 1;
        }
      }
    }
  }

  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;

  const phase = Math.min(1, nonPawnMaterial / FULL_PHASE_MATERIAL);
  score += (whitePawnAdvance - blackPawnAdvance) * 3 * (1 - phase);

  if (whiteKingRow >= 0) {
    score +=
      KING_MIDDLE_TABLE[whiteKingRow][whiteKingCol] * phase +
      KING_END_TABLE[whiteKingRow][whiteKingCol] * (1 - phase) +
      pawnShield(state, "white", whiteKingRow, whiteKingCol) * 12 * phase;
  }
  if (blackKingRow >= 0) {
    const mirrored = BOARD_SIZE - 1 - blackKingRow;
    score -=
      KING_MIDDLE_TABLE[mirrored][blackKingCol] * phase +
      KING_END_TABLE[mirrored][blackKingCol] * (1 - phase) +
      pawnShield(state, "black", blackKingRow, blackKingCol) * 12 * phase;
  }

  return me === "white" ? score : -score;
}

// Friendly pawns on the three squares directly in front of the king.
function pawnShield(state: GameState, player: Player, row: number, col: number): number {
  const front = row + (player === "white" ? -1 : 1);
  if (front < 0 || front >= BOARD_SIZE) return 0;
  let count = 0;
  for (let c = col - 1; c <= col + 1; c += 1) {
    const piece = state.board[front][c];
    if (piece && piece.kind === "pawn" && piece.player === player) count += 1;
  }
  return count;
}
