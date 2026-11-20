// The parts around the board that every game mode shares: player bars, turn status,
// the move list, the rules dialog and the sound toggle.
import { useEffect, useRef, type ReactNode } from "react";
import { Bot, Crown, Volume2, VolumeX } from "lucide-react";
import { squareName, type GameState, type MoveLogEntry, type Player } from "../game";
import { setMuted, useMuted } from "../sound";
import { MaterialStrip } from "./MaterialStrip";
import { Modal } from "./Modal";
import { pieceSprite } from "./PieceToken";

export function PlayerBar({
  player,
  name,
  tag,
  state,
  active,
  isBot = false,
  offline = false
}: {
  player: Player;
  name: string;
  // Short role line under the name, e.g. "You · Red".
  tag: string;
  state: GameState;
  active: boolean;
  isBot?: boolean;
  offline?: boolean;
}) {
  return (
    <div className={`player-bar ${player} ${active ? "active" : ""} ${offline ? "disconnected" : ""}`}>
      <span className="player-avatar" aria-hidden="true">
        <img src={pieceSprite(player, "man")} alt="" draggable="false" />
        {isBot ? (
          <span className="avatar-badge">
            <Bot size={12} strokeWidth={2.4} />
          </span>
        ) : null}
      </span>
      <div className="player-identity">
        <strong>{name}</strong>
        <span>{tag}</span>
      </div>
      <MaterialStrip state={state} player={player} />
      <div className="player-turn-state">
        <span className="turn-pip" aria-hidden="true" />
        {offline ? "Offline" : active ? "To move" : "Waiting"}
      </div>
    </div>
  );
}

export function TurnStatus({
  state,
  title,
  message,
  action
}: {
  state: GameState;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const over = state.status.phase === "won";
  return (
    <section className={`turn-status ${over ? "game-over" : ""}`} aria-live="polite">
      <span className={`status-color ${state.status.phase === "won" ? state.status.winner : state.currentPlayer}`} />
      <div>
        <p>{title}</p>
        <span>{message}</span>
      </div>
      {action}
    </section>
  );
}

function shortNotation(entry: MoveLogEntry) {
  return `${squareName(entry.from)}${entry.captured.length > 0 ? "×" : "–"}${squareName(entry.to)}`;
}

export function MoveList({ state }: { state: GameState }) {
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Tall panels scroll down, the one-line phone strip scrolls sideways.
    list.scrollTop = list.scrollHeight;
    list.scrollLeft = list.scrollWidth;
  }, [state.moveLog.length]);

  return (
    <section className="moves-section" aria-labelledby="moves-title">
      <div className="moves-heading">
        <h2 id="moves-title">Moves</h2>
        <span>{state.moveLog.length}</span>
      </div>
      <ol className="move-list" ref={listRef}>
        {state.moveLog.length === 0 ? (
          <li className="empty-moves">No moves yet.</li>
        ) : (
          state.moveLog.map((entry, index) => (
            <li className={entry.player} key={index} title={entry.notation}>
              <span className="move-number">{index + 1}</span>
              <img src={pieceSprite(entry.player, entry.pieceKind)} alt="" draggable="false" />
              <span className="move-notation">{shortNotation(entry)}</span>
              {entry.notation.includes("crown") ? <Crown className="move-crown" aria-label="crowned" size={12} /> : null}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

export function SoundToggle() {
  const muted = useMuted();
  return (
    <button
      className="icon-button"
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? <VolumeX aria-hidden="true" size={19} /> : <Volume2 aria-hidden="true" size={19} />}
    </button>
  );
}

const RULES: { sprite: string; title: string; text: string }[] = [
  {
    sprite: pieceSprite("red", "man"),
    title: "Checkers",
    text: "Move diagonally forward, jump enemy pieces to capture them, and chain jumps when you can."
  },
  {
    sprite: pieceSprite("red", "king"),
    title: "Kings",
    text: "A checker that reaches the far row is crowned and can move and jump backward too."
  },
  {
    sprite: pieceSprite("red", "knight"),
    title: "The knight",
    text: "Moves and captures in an L like a chess knight, on any square. It is never forced to capture."
  },
  {
    sprite: pieceSprite("red", "knight", true),
    title: "Resting",
    text: "After the knight moves it rests for your next turn, so that turn must be a checker move."
  }
];

export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" description="Classic checkers, plus one knight per side. Red moves first." onClose={onClose}>
      <ul className="rules-list">
        {RULES.map((rule) => (
          <li key={rule.title}>
            <img src={rule.sprite} alt="" draggable="false" />
            <div>
              <strong>{rule.title}</strong>
              <p>{rule.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="rules-copy">
        Win by taking every enemy checker (their knight may survive) or by leaving them with no legal move.
      </p>
      <div className="modal-actions single-action">
        <button className="button primary" type="button" data-autofocus onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
