import type { ReactNode } from "react";
import {
  BOARD_SIZE,
  getCheckedKingSquare,
  getPieceAt,
  isDarkSquare,
  pieceName,
  playerName,
  squareName,
  type GameState,
  type Move,
  type MoveLogEntry,
  type Piece,
  type Player,
  type Square
} from "../game";
import { PieceToken, type PieceAnimation } from "./PieceToken";

const indexes = Array.from({ length: BOARD_SIZE }, (_, index) => index);

type BoardProps = {
  state: GameState;
  // Whose pieces sit at the bottom of the screen.
  perspective: Player;
  label: string;
  selectedPieceId: string | null;
  // Legal moves of the selected piece; their destinations are marked.
  targets: Move[];
  // Pieces the local player can move right now (they get a pointer and a hover lift).
  movablePieceIds?: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  animation: PieceAnimation | null;
  onAnimationEnd: (animationId: number) => void;
  onSquareClick: (square: Square) => void;
  // Variant hooks: a status badge drawn over a piece, and extra class names for a square.
  pieceBadge?: (piece: Piece, square: Square) => ReactNode;
  squareClassName?: (square: Square, piece: Piece | null) => string;
  // A piece's status in words ("guilt-ridden"): read out with the square, and set as data-status.
  pieceStatus?: (piece: Piece) => string;
};

// The one board renderer, shared by local, bot and online games.
export function Board({
  state,
  perspective,
  label,
  selectedPieceId,
  targets,
  movablePieceIds,
  animation,
  onAnimationEnd,
  onSquareClick,
  pieceBadge,
  squareClassName,
  pieceStatus
}: BoardProps) {
  const rows = perspective === "black" ? [...indexes].reverse() : indexes;
  const cols = perspective === "black" ? [...indexes].reverse() : indexes;
  const lastMove = state.moveLog[state.moveLog.length - 1];
  const isLastMoveSquare = (row: number, col: number) =>
    Boolean(lastMove) &&
    ((lastMove.from.row === row && lastMove.from.col === col) || (lastMove.to.row === row && lastMove.to.col === col));
  const checked = getCheckedKingSquare(state);

  const animationFor = (piece: Piece): PieceAnimation | null => {
    if (!animation) return null;
    if (animation.pieceId === piece.id) return animation;
    if (animation.companion?.pieceId === piece.id) return { ...animation, ...animation.companion, mode: "slide" };
    return null;
  };

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label={label}>
        {rows.flatMap((row, visualRow) =>
          cols.map((col, visualCol) => {
            const square = { row, col };
            const piece = getPieceAt(state, square);
            const target = targets.find((move) => move.to.row === row && move.to.col === col);
            const inCheck = Boolean(checked && checked.row === row && checked.col === col);
            const status = piece && pieceStatus ? pieceStatus(piece) : "";
            const classes = [
              "square",
              isDarkSquare(square) ? "dark-square" : "light-square",
              target ? "legal-square" : "",
              target?.captures.length ? "capture-square" : "",
              piece && movablePieceIds?.has(piece.id) ? "movable-square" : "",
              piece && selectedPieceId === piece.id ? "selected-square" : "",
              isLastMoveSquare(row, col) ? "last-move-square" : "",
              inCheck ? "check-square" : "",
              squareClassName?.(square, piece) ?? ""
            ];

            return (
              <button
                className={classes.filter(Boolean).join(" ")}
                key={`${row}-${col}`}
                type="button"
                role="gridcell"
                data-square={squareName(square)}
                data-piece={piece ? `${piece.player}-${piece.kind}` : undefined}
                data-status={status || undefined}
                aria-label={squareAriaLabel(square, piece, target, inCheck, status)}
                onClick={() => onSquareClick(square)}
              >
                {visualCol === 0 ? <span className="rank-label" aria-hidden="true">{BOARD_SIZE - row}</span> : null}
                {visualRow === BOARD_SIZE - 1 ? <span className="file-label" aria-hidden="true">{String.fromCharCode(97 + col)}</span> : null}
                {target ? <span className="move-target" aria-hidden="true" /> : null}
                {piece ? (
                  <PieceToken
                    piece={piece}
                    animation={animationFor(piece)}
                    onAnimationEnd={onAnimationEnd}
                    badge={pieceBadge?.(piece, square)}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function squareAriaLabel(square: Square, piece: Piece | null, move: Move | undefined, inCheck: boolean, status: string) {
  const contents = piece ? `${playerName(piece.player)} ${pieceName(piece.kind)}${status ? ` (${status})` : ""}` : "empty";
  const checkText = inCheck ? ", under attack" : "";
  const moveText = move ? (move.captures.length > 0 ? ", capture destination" : ", legal destination") : "";
  return `${squareName(square)}, ${contents}${checkText}${moveText}`;
}

// Builds the animation for a move seen from `perspective` (a flipped board mirrors both axes).
// Knights hop; everything else slides. Castling slides the rook along with the king.
export function moveAnimation(
  move: Pick<MoveLogEntry, "from" | "to" | "pieceKind" | "rook">,
  options: { id: number; pieceId: string; perspective: Player; direction: PieceAnimation["direction"] }
): PieceAnimation {
  const flip = options.perspective === "black" ? -1 : 1;
  const sign = options.direction === "from" ? -1 : 1;
  const offset = (from: Square, to: Square) => ({
    dx: (to.col - from.col) * flip * sign,
    dy: (to.row - from.row) * flip * sign
  });
  return {
    id: options.id,
    pieceId: options.pieceId,
    mode: move.pieceKind === "knight" ? "hop" : "slide",
    direction: options.direction,
    ...offset(move.from, move.to),
    companion: move.rook ? { pieceId: move.rook.pieceId, ...offset(move.rook.from, move.rook.to) } : undefined
  };
}

export function groupMovesByPiece(moves: Move[]) {
  const grouped = new Map<string, Move[]>();
  for (const move of moves) grouped.set(move.pieceId, [...(grouped.get(move.pieceId) ?? []), move]);
  return grouped;
}

// The moves of the selected piece that land on `square`: one normally, four for a promotion.
export function movesTo(moves: Move[], square: Square) {
  return moves.filter((move) => move.to.row === square.row && move.to.col === square.col);
}
