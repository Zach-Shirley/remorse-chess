// The parts around the board that every game mode shares: player bars, turn status,
// the move list, the rules dialog and the sound toggle.
import { useEffect, useRef, type ReactNode } from "react";
import { Bot, Volume2, VolumeX } from "lucide-react";
import { type GameState, type MoveLogEntry, type PieceKind, type Player } from "../game";
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
  // Short role line under the name, e.g. "You · White".
  tag: string;
  state: GameState;
  active: boolean;
  isBot?: boolean;
  offline?: boolean;
}) {
  return (
    <div className={`player-bar ${player} ${active ? "active" : ""} ${offline ? "disconnected" : ""}`}>
      <span className="player-avatar" aria-hidden="true">
        <img src={pieceSprite(player, "king")} alt="" draggable="false" />
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
  const { status } = state;
  const over = status.phase !== "playing";
  const check = status.phase === "playing" && status.check;
  const color = status.phase === "won" ? status.winner : status.phase === "draw" ? "draw" : state.currentPlayer;
  return (
    <section className={`turn-status ${over ? "game-over" : ""} ${check ? "in-check" : ""}`} aria-live="polite">
      <span className={`status-color ${color}`} />
      <div>
        <p>{title}</p>
        <span>{message}</span>
      </div>
      {action}
    </section>
  );
}

// The move log as numbered pairs: "1. e4 e5". A game that starts with Black to move (from a
// FEN) gets "..." in White's place.
function movePairs(moveLog: MoveLogEntry[]) {
  const pairs: { turn: number; white?: MoveLogEntry; black?: MoveLogEntry }[] = [];
  for (const entry of moveLog) {
    let pair = pairs[pairs.length - 1];
    if (!pair || pair.turn !== entry.turn) {
      pair = { turn: entry.turn };
      pairs.push(pair);
    }
    pair[entry.player] = entry;
  }
  return pairs;
}

export function MoveList({ state }: { state: GameState }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const latest = state.moveLog[state.moveLog.length - 1];

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
          movePairs(state.moveLog).map((pair) => (
            <li key={pair.turn}>
              <span className="move-number">{pair.turn}.</span>
              <span className={`move-san white ${pair.white === latest ? "latest" : ""}`}>{pair.white?.notation ?? "..."}</span>
              {pair.black ? (
                <span className={`move-san black ${pair.black === latest ? "latest" : ""}`}>{pair.black.notation}</span>
              ) : null}
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

// The rules dialog's copy. A variant edits these two lists.
const PIECE_RULES: { kind: PieceKind; title: string; text: string }[] = [
  { kind: "king", title: "King", text: "One square in any direction. It may never move into check." },
  { kind: "queen", title: "Queen", text: "Any distance in a straight line: along ranks, files or diagonals." },
  { kind: "rook", title: "Rook", text: "Any distance along ranks and files." },
  { kind: "bishop", title: "Bishop", text: "Any distance along diagonals." },
  { kind: "knight", title: "Knight", text: "An L: two squares one way, one to the side. It jumps over pieces." },
  { kind: "pawn", title: "Pawn", text: "One square forward (two from its start). Captures one square diagonally." }
];

const RULE_NOTES: { title: string; text: string }[] = [
  {
    title: "Check and checkmate",
    text: "A king under attack is in check and must escape at once. If it cannot, that is checkmate and the game is over."
  },
  {
    title: "Castling",
    text: "Once per game the king moves two squares toward a rook and the rook jumps over it. Neither may have moved, the squares between must be empty, and the king may not castle out of, through or into check."
  },
  {
    title: "En passant",
    text: "A pawn that advances two squares and lands beside an enemy pawn can be captured by it as if it had moved one, but only on the very next move."
  },
  {
    title: "Promotion",
    text: "A pawn that reaches the far rank becomes a queen, rook, bishop or knight of your choice."
  },
  {
    title: "Draws",
    text: "Stalemate (no legal move while not in check), the same position three times, fifty moves by each side with no capture or pawn move, or too little material left to checkmate."
  }
];

export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" description="Checkmate the enemy king. White moves first." onClose={onClose} wide>
      <ul className="rules-list piece-rules">
        {PIECE_RULES.map((rule) => (
          <li key={rule.kind}>
            <img src={pieceSprite("white", rule.kind)} alt="" draggable="false" />
            <div>
              <strong>{rule.title}</strong>
              <p>{rule.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <dl className="rules-notes">
        {RULE_NOTES.map((note) => (
          <div key={note.title}>
            <dt>{note.title}</dt>
            <dd>{note.text}</dd>
          </div>
        ))}
      </dl>
      <div className="modal-actions single-action">
        <button className="button primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
