// The parts around the board that every game mode shares: player bars, turn status,
// the move list, the rules dialog and the sound toggle.
import { useEffect, useRef, type ReactNode } from "react";
import { Bot, Volume2, VolumeX } from "lucide-react";
import { type GameState, type MoveLogEntry, type Player } from "../game";
import { describeEvent } from "../variant/describe";
import { EventChip } from "./Conscience";
import { setMuted, useMuted } from "../sound";
import { MaterialStrip } from "./MaterialStrip";
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
// FEN) gets "..." in White's place. A Sadist's extra move shares the cell of the move before it.
type MovePair = { turn: number; white: MoveLogEntry[]; black: MoveLogEntry[] };

function movePairs(moveLog: MoveLogEntry[]) {
  const pairs: MovePair[] = [];
  for (const entry of moveLog) {
    let pair = pairs[pairs.length - 1];
    if (!pair || pair.turn !== entry.turn) {
      pair = { turn: entry.turn, white: [], black: [] };
      pairs.push(pair);
    }
    pair[entry.player].push(entry);
  }
  return pairs;
}

function MoveCell({ entries, side, latest }: { entries: MoveLogEntry[]; side: Player; latest: MoveLogEntry | undefined }) {
  if (entries.length === 0) return side === "white" ? <span className="move-san white">...</span> : null;
  return (
    <span className={`move-san ${side} ${latest && entries.includes(latest) ? "latest" : ""}`}>
      {entries.map((entry, index) => (
        <span className="move-part" key={index}>
          {entry.notation}
          {entry.events.map((event, eventIndex) =>
            event.type === "extra-move" ? null : <EventChip key={eventIndex} line={describeEvent(event)} />
          )}
        </span>
      ))}
    </span>
  );
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
              <MoveCell entries={pair.white} side="white" latest={latest} />
              <MoveCell entries={pair.black} side="black" latest={latest} />
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

export { RulesDialog } from "./RulesDialog";
