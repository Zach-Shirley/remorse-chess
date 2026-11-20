import { pieceName, playerName, type Move } from "../game";
import { Modal } from "./Modal";
import { pieceSprite } from "./PieceToken";

// Shown when a pawn reaches the last rank: `moves` are the same pawn move, one per promotion piece.
export function PromotionPicker({
  moves,
  onPick,
  onCancel
}: {
  moves: Move[];
  onPick: (move: Move) => void;
  onCancel: () => void;
}) {
  const player = moves[0].player;
  return (
    <Modal title="Promote your pawn" description={`Choose the piece ${playerName(player)}'s pawn becomes.`} onClose={onCancel}>
      <div className="promotion-options" role="group" aria-label="Promotion piece">
        {moves.map((move, index) =>
          move.promotion ? (
            <button
              key={move.id}
              type="button"
              data-promotion={move.promotion}
              data-autofocus={index === 0 ? true : undefined}
              onClick={() => onPick(move)}
            >
              <img src={pieceSprite(player, move.promotion)} alt="" draggable="false" />
              <span>{pieceName(move.promotion)}</span>
            </button>
          ) : null
        )}
      </div>
    </Modal>
  );
}
