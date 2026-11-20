import { useEffect, useState, type ReactNode } from "react";
import { getMaterial, playerName, type GameState, type Player } from "../game";
import { Modal } from "./Modal";
import { pieceSprite } from "./PieceToken";

export type GameOverAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

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
  const isOver = state.status.phase === "won";

  // A new game (rematch, play again) re-arms the dialog.
  useEffect(() => {
    if (!isOver) setDismissed(false);
  }, [isOver]);

  if (state.status.phase !== "won" || dismissed) return null;

  const { winner, message } = state.status;
  const lost = you !== null && winner !== you;
  const title = you === null ? `${playerName(winner)} wins!` : lost ? "You lose" : "You win!";
  const { score } = getMaterial(state);

  return (
    <Modal title={title} description={message} onClose={() => setDismissed(true)} tone={lost ? "defeat" : "victory"}>
      <div className="result-score" aria-label={`Final material: Red ${score.red}, Black ${score.black}`}>
        {(["red", "black"] as const).map((side) => (
          <div className={`result-side ${side} ${winner === side ? "winner" : ""}`} key={side}>
            <img src={pieceSprite(side, winner === side ? "king" : "man")} alt="" draggable="false" />
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
