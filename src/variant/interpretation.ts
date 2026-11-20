// THIS APP'S INTERPRETATION of Remorse Chess.
//
// The creator's Shorts (see rules.ts for what they do say) leave the questions below open.
// Every answer this app gives is a named constant or a small function in this one file, so
// changing a ruling is a one-line edit here; the engine (remorse.ts, game.ts) only reads them.
// The README and the in-game rules dialog list the same rulings under "this app's interpretation".

import type { PieceKind, Square } from "../game";

const SIZE = 8;

// --- Adjacency ---------------------------------------------------------------------------------

// What "adjacent" means, for a bishop absolving and for witnesses of a capture:
// 8 = orthogonal and diagonal neighbours, 4 = orthogonal neighbours only.
export const ADJACENCY: 4 | 8 = 8;

const ORTHOGONAL: readonly (readonly [number, number])[] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const SURROUNDING: readonly (readonly [number, number])[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
];

// The squares adjacent to `square`, in board order (a8, b8 ... h1). That order is also the
// order witness rolls are resolved in, after the capturing piece's own roll.
export function adjacentSquares(square: Square): Square[] {
  const offsets = ADJACENCY === 8 ? SURROUNDING : ORTHOGONAL;
  const squares: Square[] = [];
  for (const [dr, dc] of offsets) {
    const row = square.row + dr;
    const col = square.col + dc;
    if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) squares.push({ row, col });
  }
  return squares;
}

// --- Absolution --------------------------------------------------------------------------------

// The absolving bishop must itself be healthy (not guilt-ridden, not devastated).
export const ABSOLVER_MUST_BE_HEALTHY = true;

// Absolution happens the moment the bishop's move lands, and it clears every afflicted friendly
// piece next to the landing square. True: devastated pieces are cleared as well as guilt-ridden ones.
export const ABSOLUTION_CLEARS_DEVASTATION = true;

// A pawn that promotes to a bishop has "moved a bishop" onto the promotion square, so it
// absolves the pieces next to that square (if it is healthy).
export const PROMOTION_TO_BISHOP_ABSOLVES = true;

// A guilt-ridden bishop absolves itself when its owner has finished this many further turns
// of their own (1 = it sits out the owner's next turn as a pacifist, then it is clean).
export const BISHOP_SELF_ABSOLVE_TURNS = 1;

// A devastated bishop does not heal itself: it needs another bishop.
export const DEVASTATED_BISHOP_SELF_ABSOLVES = false;

// --- Reactions ---------------------------------------------------------------------------------

// A reaction is a permanent disposition: a piece that rolled "guilt-ridden" becomes guilt-ridden
// again after every later capture, and a piece that rolled "devastated" becomes devastated again.
// False would make the reaction a one-off.
export const REACTION_RECURS = true;

// Kings roll like any other piece (and can witness). False: kings never react.
export const KINGS_ROLL = true;

// --- Check -------------------------------------------------------------------------------------

// Guilt-ridden and devastated pieces refuse to capture, so they give no check and control no
// squares: a king may stand next to them and castle past them.
export const AFFLICTED_PIECES_GIVE_CHECK = false;

// No move may ever capture a king. So a vendetta whose target type is the king (a king made the
// capture) can never be collected, and it gives no check either.
export const VENDETTA_AGAINST_KING_GIVES_CHECK = false;

// --- Devastation -------------------------------------------------------------------------------

// The owner gets this many of their own turns to absolve a devastated piece. If it is still
// devastated when their next turn after those would start, it removes itself before they move.
export const DEVASTATION_TURNS = 3;

// A devastated king that is not absolved in time removes itself, and its side loses.
export const DEVASTATED_KING_LOSES = true;

// --- The Sadist --------------------------------------------------------------------------------

// The extra move after a capture is optional (the player may end the turn instead).
export const EXTRA_MOVE_IS_OPTIONAL = true;

// The extra move must be made with the Sadist itself. False: any piece may make it.
export const EXTRA_MOVE_SAME_PIECE = true;

// The capture that rolls the 6 already earns the extra move.
export const EXTRA_MOVE_ON_THE_ROLL = true;

// Captures in total (enemy or friendly, including the first) before bloodlust sets in.
// The number is the creator's; that friendly captures count is this app's reading.
export const BLOODLUST_AFTER_CAPTURES = 3;

// A piece with bloodlust may capture any friendly piece except its own king.
export function bloodlustMayCaptureFriend(target: PieceKind): boolean {
  return target !== "king";
}

// --- Vendetta ----------------------------------------------------------------------------------

// A vendetta capture can be made even while the piece is guilt-ridden.
export const VENDETTA_IGNORES_GUILT = true;

// A vendetta capture triggers no capture-reaction roll and causes no guilt. (Witness rolls for
// the victim's neighbours still happen.)
export const VENDETTA_CAPTURE_ROLLS = false;

// --- Witnesses ---------------------------------------------------------------------------------

// A witness that is already devastated still rolls: a 1 or 2 changes nothing more, a 5 or 6
// still earns a vendetta it can use once it is absolved.
export const DEVASTATED_WITNESSES_ROLL = true;

// The piece type a vendetta is sworn against is the type that moved to make the capture
// (a pawn that captures and promotes is hunted as a pawn).
export function vendettaTarget(capturerKindBeforeMove: PieceKind): PieceKind {
  return capturerKindBeforeMove;
}

// --- Standard chess that stays standard --------------------------------------------------------
// En passant is a capture by the pawn (it rolls, and the witnesses are the neighbours of the
// captured pawn's square). Castling, promotion and the draws follow standard chess. Every roll
// and the Sadist's extra move happen before check, checkmate and stalemate are evaluated for the
// next player. A side that has only immobilised or pacifist pieces and no legal move is
// stalemated: a draw.
