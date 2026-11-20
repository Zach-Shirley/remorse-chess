// Remorse Chess bot: iterative-deepening alpha-beta search with quiescence over the shared rules
// engine. It only touches the engine through generateLegalMoves, makeMove, passExtraMove,
// isInCheck and applyMove, so it follows whatever the rule set allows.
//
// DICE. The search does not branch on dice (no expectimax: a capture with four witnesses would
// have 6^5 outcomes). It runs on the engine's documented outcome model instead, MODEL_DICE:
// every die shows 3. So inside the search
//   - a piece making its first capture is assumed to come out guilt-ridden (as it always does
//     in Classic, where the bot is therefore exact);
//   - witnesses are assumed not to react;
//   - a piece whose reaction is already known behaves exactly: a Sadist gets its extra move,
//     a devastated piece freezes, countdowns run and expired pieces disappear.
// The real dice are rolled only when the chosen move is actually played.
import {
  BOARD_SIZE,
  PASS_MOVE_ID,
  applyMove,
  canPass,
  generateLegalMoves,
  getLegalMoves,
  isInCheck,
  makeMove,
  passExtraMove,
  variantOptions,
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

// `moveId` is a legal move id, or PASS_MOVE_ID to decline a Sadist's extra move.
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
  const me = state.currentPlayer;
  const moves = getLegalMoves(state);
  const options: string[] = orderMoves(state, moves).map((move) => move.id);
  if (canPass(state)) options.push(PASS_MOVE_ID);
  if (options.length === 0) return null;
  if (options.length === 1) return { type: "move", moveId: options[0] };

  const settings = LEVEL_SETTINGS[level];
  if (random() < settings.blunderChance) {
    return { type: "move", moveId: options[Math.floor(random() * options.length)] };
  }

  const deadline = now() + (botOptions.timeLimitMs ?? settings.timeLimitMs);

  // The modelled result of each root option, so the search knows about draws by repetition and
  // the fifty-move rule, which the fast search states do not track.
  type RootMove = { moveId: string; next: GameState; fixed: number | null; score: number };
  let root: RootMove[] = options.map((moveId) => {
    const played = applyMove(state, moveId);
    const fixed =
      played.status.phase === "won"
        ? played.status.winner === me
          ? WIN_SCORE - 1
          : -(WIN_SCORE - 1)
        : played.status.phase === "draw"
          ? 0
          : null;
    return { moveId, next: played, fixed, score: 0 };
  });

  // Iterative deepening: keep the deepest fully searched result when time runs out.
  for (let depth = 1; depth <= settings.maxDepth; depth += 1) {
    const search = new Search(deadline, now, depth + MAX_EXTENSION_PLIES);
    const scored: RootMove[] = [];
    let alpha = -Infinity;
    for (const entry of root) {
      // Weaker levels add noise to every score, so each move needs a true score, not a bound.
      const window = settings.noise > 0 ? -Infinity : alpha;
      // After a Sadist's capture the same side is still to move: no sign flip.
      const score =
        entry.fixed ??
        (entry.next.currentPlayer === me
          ? search.negamax(entry.next, depth - 1, window, Infinity, 1)
          : -search.negamax(entry.next, depth - 1, -Infinity, -window, 1));
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
  return { type: "move", moveId: root[0].moveId };
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

    const player = state.currentPlayer;
    // A king lost to despair.
    if (state.status.phase === "won") return state.status.winner === player ? WIN_SCORE - ply : -WIN_SCORE + ply;
    if (state.halfmoveClock >= 100) return 0;

    const inCheck = isInCheck(state, player);
    // Never stop searching while in check: the position is not quiet and may be mate.
    if (inCheck && depth <= 0 && ply < this.maxPly) depth = 1;
    if (depth <= 0) return this.quiesce(state, alpha, beta, 0);

    const moves = generateLegalMoves(state);
    const pending = state.extraMove !== null;
    if (moves.length === 0 && !pending) {
      // Checkmate, scored so faster mates are preferred; otherwise stalemate. Without check rules
      // (the king is captured, not mated) having no move is always stalemate.
      return inCheck && variantOptions(state).checkRules !== false ? -WIN_SCORE + ply : 0;
    }

    const children = orderChildren(state, moves, depth >= 2);
    // Declining a Sadist's extra move is always an option.
    if (pending) children.push({ move: null, next: passExtraMove(state), score: 0 });

    let best = -Infinity;
    for (const child of children) {
      const next = child.next ?? makeMove(state, child.move as Move);
      // A Sadist's capture leaves the same side to move: same point of view, same window.
      const score =
        next.currentPlayer === player
          ? this.negamax(next, depth - 1, alpha, beta, ply + 1)
          : -this.negamax(next, depth - 1, -beta, -alpha, ply + 1);
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

    const player = state.currentPlayer;
    if (state.status.phase === "won") return state.status.winner === player ? WIN_SCORE - 50 : -WIN_SCORE + 50;

    // The side to move can always decline the exchange ("stand pat").
    const standPat = evaluate(state, player);
    if (standPat >= beta || qply >= MAX_QUIESCENCE_PLIES) return standPat;
    if (standPat > alpha) alpha = standPat;

    let best = standPat;
    const tactical = generateLegalMoves(state, player, { tacticalOnly: true });
    for (const move of orderMoves(state, tactical)) {
      const next = makeMove(state, move);
      const score =
        next.currentPlayer === player
          ? this.quiesce(next, alpha, beta, qply + 1)
          : -this.quiesce(next, -beta, -alpha, qply + 1);
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
    // Bloodlust: taking one's own piece is tried last.
    if (victim && victim.player === move.player) score -= 5_000 + PIECE_VALUE[victim.kind];
    // Taking the king ends the game (Remorse Chess wins by king capture): always try it first.
    else if (victim?.kind === "king") score += 1_000_000;
    else score += 10_000 + (victim ? PIECE_VALUE[victim.kind] : 0) * 10 - PIECE_VALUE[move.pieceKind];
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
type Child = { move: Move | null; next: GameState | null; score: number };
function orderChildren(state: GameState, moves: Move[], withChecks: boolean): Child[] {
  return moves
    .map((move): Child => {
      let score = orderingScore(state, move);
      let next: GameState | null = null;
      if (withChecks) {
        next = makeMove(state, move);
        if (next.currentPlayer !== state.currentPlayer && isInCheck(next, next.currentPlayer)) score += 9_000;
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

// What a conscience does to a piece's worth. A guilt-ridden piece still blocks and can be
// absolved, so it keeps most of its value; a devastated one is worth less the closer it is to
// removing itself; a Sadist's extra move is a small plus and bloodlust a liability.
const GUILTY_FACTOR = 0.7;
const PENITENT_BISHOP_FACTOR = 0.9;
const DEVASTATED_FACTOR = [0.2, 0.3, 0.42, 0.55, 0.55];
const SADIST_BONUS = 45;
const BLOODLUST_PENALTY = 70;
const VENDETTA_BONUS = 12;
// A king has no material value, so its despair is priced directly, by turns left.
const DEVASTATED_KING_PENALTY = [5000, 1800, 700, 300, 300];
const GUILTY_KING_PENALTY = 25;

function mindValue(state: GameState, id: string, kind: PieceKind, value: number): number {
  const mind = state.minds[id];
  if (!mind) return value;
  if (kind === "king") {
    if (mind.affliction === "devastated") return value - DEVASTATED_KING_PENALTY[Math.max(0, Math.min(4, mind.turnsLeft ?? 0))];
    if (mind.affliction === "guilty") return value - GUILTY_KING_PENALTY;
    return value;
  }
  let result = value;
  if (mind.affliction === "guilty") result *= mind.penance !== undefined ? PENITENT_BISHOP_FACTOR : GUILTY_FACTOR;
  else if (mind.affliction === "devastated") result *= DEVASTATED_FACTOR[Math.max(0, Math.min(4, mind.turnsLeft ?? 0))];
  if (mind.bloodlust) result -= BLOODLUST_PENALTY;
  else if (mind.reaction === "sadist") result += SADIST_BONUS;
  if (mind.vendetta) result += VENDETTA_BONUS;
  return result;
}

// Static evaluation from `me`'s point of view, in centipawns: material, piece-square tables,
// the bishop pair, a pawn shield in front of the king, pushed pawns in the endgame, and the
// state of each piece's conscience.
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
  const hasMinds = state.rules.ruleSet !== "plain";

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
        if (hasMinds) {
          const kingValue = mindValue(state, piece.id, "king", 0);
          score += white ? kingValue : -kingValue;
        }
        continue;
      }
      const tableRow = white ? row : BOARD_SIZE - 1 - row;
      const base = PIECE_VALUE[piece.kind] + TABLES[piece.kind][tableRow][col];
      const value = hasMinds ? mindValue(state, piece.id, piece.kind, base) : base;
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
