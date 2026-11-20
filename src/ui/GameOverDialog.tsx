import { useEffect, useState, type ReactNode } from "react";
import { getMaterial, playerName, type DrawReason, type GameState, type Player } from "../game";
import { Modal } from "./Modal";
import { pieceSprite } from "./PieceToken";

export type GameOverAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

const DRAW_TITLES: Record<DrawReason, string> = {
  stalemate: "Stalemate",
  "threefold-repetition": "Draw by repetition",
  "fifty-move": "Draw by the fifty-move rule",
  "insufficient-material": "Draw"
};

// The headline for a finished game. `you` is the local player's side, or null when both sides
// share the screen.
export function resultTitle(state: GameState, you: Player | null): string {
  const { status } = state;
  if (status.phase === "draw") return DRAW_TITLES[status.reason];
  if (status.phase !== "won") return "";
  if (you === null) return `${playerName(status.winner)} wins!`;
  return status.winner === you ? "You win!" : "You lose";
}

// Shows once each time a game ends. "View board" closes it so the final position can be studied.
export function GameOverDialog({
  state,
  you,
  actions,
  note
}: {
  state: GameState;
  // The local player's side, or null in pass-and-play where both sides share the screen.
  you: Player | null;
  // The first action is the primary button.
  actions: GameOverAction[];
  note?: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const isOver = state.status.phase !== "playing";

  // A new game (rematch, play again) re-arms the dialog.
  useEffect(() => {
    if (!isOver) setDismissed(false);
  }, [isOver]);

  if (state.status.phase === "playing" || dismissed) return null;

  const winner = state.status.phase === "won" ? state.status.winner : null;
  const lost = you !== null && winner !== null && winner !== you;
  const tone = winner === null ? "default" : lost ? "defeat" : "victory";
  const { score } = getMaterial(state);

  return (
    <Modal title={resultTitle(state, you)} description={state.status.message} onClose={() => setDismissed(true)} tone={tone}>
      <div className="result-score" aria-label={`Final material: White ${score.white}, Black ${score.black}`}>
        {(["white", "black"] as const).map((side) => (
          <div className={`result-side ${side} ${winner === side ? "winner" : ""} ${winner === null ? "drawn" : ""}`} key={side}>
            <img src={pieceSprite(side, "king")} alt="" draggable="false" />
            <strong>{score[side]}</strong>
            <span>{playerName(side)}</span>
          </div>
        ))}
      </div>
      {note ? <p className="game-over-note">{note}</p> : null}
      <div className="game-over-actions">
        {actions.map((action, index) => (
          <button
            key={action.label}
            className={`button ${index === 0 ? "primary" : "secondary"}`}
            type="button"
            data-autofocus={index === 0 ? true : undefined}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        <button className="button ghost" type="button" onClick={() => setDismissed(true)}>
          View board
        </button>
      </div>
    </Modal>
  );
}
