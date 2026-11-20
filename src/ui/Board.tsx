import {
  BOARD_SIZE,
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
};

// The one board renderer, shared by local, bot and online games.
export function Board({ state, perspective, label, selectedPieceId, targets, movablePieceIds, animation, onAnimationEnd, onSquareClick }: BoardProps) {
  const rows = perspective === "black" ? [...indexes].reverse() : indexes;
  const cols = perspective === "black" ? [...indexes].reverse() : indexes;
  const lastMove = state.moveLog[state.moveLog.length - 1];
  const isLastMoveSquare = (row: number, col: number) =>
    Boolean(lastMove) &&
    ((lastMove.from.row === row && lastMove.from.col === col) || (lastMove.to.row === row && lastMove.to.col === col));

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label={label}>
        {rows.flatMap((row, visualRow) =>
          cols.map((col, visualCol) => {
            const square = { row, col };
            const piece = getPieceAt(state, square);
            const target = targets.find((move) => move.to.row === row && move.to.col === col);
            const resting = Boolean(piece?.kind === "knight" && state.knightCooldown[piece.player] > 0);
            const classes = [
              "square",
              isDarkSquare(square) ? "dark-square" : "light-square",
              target ? "legal-square" : "",
              target?.captures.length ? "capture-square" : "",
              piece && movablePieceIds?.has(piece.id) ? "movable-square" : "",
              piece && selectedPieceId === piece.id ? "selected-square" : "",
              piece && state.forcedPieceId === piece.id ? "forced-piece-square" : "",
              isLastMoveSquare(row, col) ? "last-move-square" : ""
            ];

            return (
              <button
                className={classes.filter(Boolean).join(" ")}
                key={`${row}-${col}`}
                type="button"
                role="gridcell"
                aria-label={squareAriaLabel(square, piece, target, resting)}
                onClick={() => onSquareClick(square)}
              >
                {visualCol === 0 ? <span className="rank-label" aria-hidden="true">{BOARD_SIZE - row}</span> : null}
                {visualRow === BOARD_SIZE - 1 ? <span className="file-label" aria-hidden="true">{String.fromCharCode(97 + col)}</span> : null}
                {target ? <span className="move-target" aria-hidden="true" /> : null}
                {piece ? (
                  <PieceToken
                    piece={piece}
                    resting={resting}
                    animation={animation?.pieceId === piece.id ? animation : null}
                    onAnimationEnd={onAnimationEnd}
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

function squareAriaLabel(square: Square, piece: Piece | null, move: Move | undefined, resting: boolean) {
  const contents = piece ? `${playerName(piece.player)} ${pieceName(piece.kind)}` : "empty";
  const restText = resting ? ", resting" : "";
  const moveText = move ? (move.captures.length > 0 ? ", capture destination" : ", legal destination") : "";
  return `${squareName(square)}, ${contents}${restText}${moveText}`;
}

// Builds the animation for a move seen from `perspective` (a flipped board mirrors both axes).
export function moveAnimation(
  move: Pick<MoveLogEntry, "from" | "to" | "pieceKind"> & { capture: boolean },
  options: { id: number; pieceId: string; perspective: Player; direction: PieceAnimation["direction"] }
): PieceAnimation {
  const flip = options.perspective === "black" ? -1 : 1;
  const sign = options.direction === "from" ? -1 : 1;
  return {
    id: options.id,
    pieceId: options.pieceId,
    mode: move.pieceKind === "knight" || move.capture ? "hop" : "slide",
    direction: options.direction,
    dx: (move.to.col - move.from.col) * flip * sign,
    dy: (move.to.row - move.from.row) * flip * sign
  };
}

export function groupMovesByPiece(moves: Move[]) {
  const grouped = new Map<string, Move[]>();
  for (const move of moves) grouped.set(move.pieceId, [...(grouped.get(move.pieceId) ?? []), move]);
  return grouped;
}
