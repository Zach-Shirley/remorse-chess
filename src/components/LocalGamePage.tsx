import { useEffect, useMemo, useState } from "react";
import { BookOpen, Home, RotateCcw, Settings, SlidersHorizontal, Undo2 } from "lucide-react";
import {
  type GameRules,
  type GameState,
  type Move,
  type Player,
  type Square,
  applyMove,
  createInitialState,
  endOptionalJump,
  getLegalMoves,
  getPieceAt,
  opponentOf,
  playerName,
  updateGameRules
} from "../game";
import { BOT_LEVELS, type BotLevel } from "../bot";
import { requestBotAction } from "../botClient";
import { getPlayerIdentity } from "../playerIdentity";
import { playSound, soundForMove } from "../sound";
import { Board, groupMovesByPiece, moveAnimation } from "../ui/Board";
import { MoveList, PlayerBar, RulesDialog, SoundToggle, TurnStatus } from "../ui/GameChrome";
import { GameOverDialog } from "../ui/GameOverDialog";
import { Modal } from "../ui/Modal";
import type { PieceAnimation } from "../ui/PieceToken";

type GameDialog = "new-game" | "settings" | "rules" | null;

// Pause before the bot moves so its reply reads as a move, not a flicker.
const BOT_MIN_THINK_MS = 650;

export type BotOpponent = { player: Player; level: BotLevel };

type LocalGamePageProps = {
  initialRules: GameRules;
  onExit: () => void;
  // Without a bot this is pass-and-play.
  bot?: BotOpponent;
  // Replaces the panel's "Pass & play" / "Vs bot" label, e.g. while a quick match is searching.
  kicker?: string;
};

export function LocalGamePage({ initialRules, onExit, bot, kicker }: LocalGamePageProps) {
  const [history, setHistory] = useState(() => [createInitialState(initialRules)]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [pieceAnimation, setPieceAnimation] = useState<PieceAnimation | null>(null);
  const [dialog, setDialog] = useState<GameDialog>(null);
  const [ruleDraft, setRuleDraft] = useState(initialRules.forceCheckerCaptures);
  const state = history[history.length - 1];
  const legalMoves = useMemo(() => getLegalMoves(state), [state]);
  const movesByPiece = useMemo(() => groupMovesByPiece(legalMoves), [legalMoves]);
  const selectedMoves = selectedPieceId ? movesByPiece.get(selectedPieceId) ?? [] : [];
  const hasForcedCheckerCapture =
    state.rules.forceCheckerCaptures &&
    legalMoves.some((move) => move.pieceKind !== "knight" && move.captures.length > 0);
  const botPlayer = bot?.player ?? null;
  const botLevel = bot?.level ?? null;
  const humanPlayer = botPlayer ? opponentOf(botPlayer) : null;
  // The human's pieces sit at the bottom; pass-and-play keeps Red at the bottom.
  const perspective: Player = humanPlayer ?? "red";
  const topPlayer = opponentOf(perspective);
  const isBotTurn = Boolean(botPlayer && state.status.phase === "playing" && state.currentPlayer === botPlayer);
  const winner = state.status.phase === "won" ? state.status.winner : null;

  useEffect(() => {
    if (state.forcedPieceId) {
      setSelectedPieceId(state.forcedPieceId);
      return;
    }

    if (selectedPieceId && !movesByPiece.has(selectedPieceId)) {
      setSelectedPieceId(null);
    }
  }, [movesByPiece, selectedPieceId, state.forcedPieceId]);

  useEffect(() => {
    if (!botLevel || !isBotTurn) return;
    let cancelled = false;
    const started = performance.now();
    requestBotAction(state, botLevel).then((action) => {
      const wait = Math.max(0, BOT_MIN_THINK_MS - (performance.now() - started));
      window.setTimeout(() => {
        if (cancelled || !action) return;
        if (action.type === "end-jump") {
          endJumpTurn();
          return;
        }
        const move = legalMoves.find((candidate) => candidate.id === action.moveId);
        if (move) playMove(move);
      }, wait);
    });
    return () => {
      cancelled = true;
    };
    // playMove/endJumpTurn only read `state`, which is a dependency.
  }, [botLevel, isBotTurn, state, legalMoves]);

  useEffect(() => {
    if (!winner) return;
    playSound(humanPlayer && winner !== humanPlayer ? "lose" : "win");
  }, [winner, humanPlayer]);

  function playMove(move: Move) {
    const nextState = applyMove(state, move.id);
    setPieceAnimation(
      moveAnimation(
        { from: move.from, to: move.to, pieceKind: move.pieceKind, capture: move.captures.length > 0 },
        { id: state.moveLog.length + 1, pieceId: move.pieceId, perspective, direction: "from" }
      )
    );
    playSound(soundForMove(nextState.moveLog[nextState.moveLog.length - 1]));
    setHistory((currentHistory) => [...currentHistory, nextState]);
    setSelectedPieceId(nextState.forcedPieceId);
  }

  function handleSquareClick(square: Square) {
    if (state.status.phase === "won" || isBotTurn) return;

    const destinationMove = selectedMoves.find(
      (move) => move.to.row === square.row && move.to.col === square.col
    );

    if (destinationMove) {
      playMove(destinationMove);
      return;
    }

    const piece = getPieceAt(state, square);
    if (piece?.player === state.currentPlayer && movesByPiece.has(piece.id)) {
      setSelectedPieceId(piece.id);
      return;
    }

    if (!state.forcedPieceId) setSelectedPieceId(null);
  }

  function undoMove() {
    setHistory((currentHistory) => {
      if (currentHistory.length <= 1) return currentHistory;

      const currentRules = currentHistory[currentHistory.length - 1].rules;
      let target = currentHistory.length - 2;
      // Against a bot, step back past its reply to the start of the human's last turn.
      if (humanPlayer) {
        while (target > 0 && (currentHistory[target].currentPlayer !== humanPlayer || currentHistory[target].forcedPieceId)) {
          target--;
        }
      }
      const previousState = updateGameRules(currentHistory[target], currentRules);
      return [...currentHistory.slice(0, target), previousState];
    });
    setSelectedPieceId(null);
    setPieceAnimation(null);
  }

  function resetBoard(rules: GameRules) {
    setHistory([createInitialState(rules)]);
    setSelectedPieceId(null);
    setPieceAnimation(null);
    setDialog(null);
  }

  function saveSettings() {
    setHistory((currentHistory) => {
      const currentState = currentHistory[currentHistory.length - 1];
      const nextState = updateGameRules(currentState, { forceCheckerCaptures: ruleDraft });
      return [...currentHistory.slice(0, -1), nextState];
    });
    setSelectedPieceId(null);
    setPieceAnimation(null);
    setDialog(null);
  }

  function openDialog(nextDialog: GameDialog) {
    setRuleDraft(state.rules.forceCheckerCaptures);
    setDialog(nextDialog);
  }

  function endJumpTurn() {
    const nextState = endOptionalJump(state);
    setHistory((currentHistory) => [...currentHistory, nextState]);
    setSelectedPieceId(null);
    setPieceAnimation(null);
  }

  const botName = botLevel ? `${BOT_LEVELS[botLevel].label} bot` : null;
  const ownName = bot ? getPlayerIdentity().name : "Player 1";
  const turnTitle =
    state.status.phase === "won" ? "Game over" : `${playerName(state.currentPlayer)} to move`;
  const turnMessage = isBotTurn ? "The bot is thinking..." : getStateMessage(state, hasForcedCheckerCapture);

  return (
    <main className="game-page">
      <section className="game-workspace" aria-label="Local Knight Checkers game">
        <div className="board-column">
          <PlayerBar
            player={topPlayer}
            name={botName ?? "Player 2"}
            tag={bot ? `Bot · ${playerName(topPlayer)}` : playerName(topPlayer)}
            state={state}
            active={state.status.phase === "playing" && state.currentPlayer === topPlayer}
            isBot={Boolean(bot)}
          />

          <Board
            state={state}
            perspective={perspective}
            label="Knight Checkers board"
            selectedPieceId={selectedPieceId}
            targets={selectedMoves}
            movablePieceIds={isBotTurn ? undefined : movesByPiece}
            animation={pieceAnimation}
            onAnimationEnd={(animationId) =>
              setPieceAnimation((current) => (current?.id === animationId ? null : current))
            }
            onSquareClick={handleSquareClick}
          />

          <PlayerBar
            player={perspective}
            name={ownName}
            tag={bot ? `You · ${playerName(perspective)}` : playerName(perspective)}
            state={state}
            active={state.status.phase === "playing" && state.currentPlayer === perspective}
          />
        </div>

        <aside className="game-panel" aria-label="Game controls and move history">
          <header className="game-panel-header">
            <button className="icon-button" type="button" onClick={onExit} aria-label="Return home" title="Home">
              <Home aria-hidden="true" size={19} />
            </button>
            <div>
              <p className="section-kicker">{kicker ?? (bot ? "Vs bot" : "Pass & play")}</p>
              <strong>{botName ?? "Local game"}</strong>
            </div>
            <SoundToggle />
            <button
              className="icon-button"
              type="button"
              onClick={() => openDialog("settings")}
              aria-label="Game settings"
              title="Settings"
            >
              <Settings aria-hidden="true" size={19} />
            </button>
          </header>

          <TurnStatus
            state={state}
            title={turnTitle}
            message={turnMessage}
            action={
              state.canEndJump && !isBotTurn ? (
                <button className="text-button" type="button" onClick={endJumpTurn}>End turn</button>
              ) : null
            }
          />

          <MoveList state={state} />

          <footer className="game-actions">
            <button type="button" onClick={undoMove} disabled={history.length <= 1} title="Undo last move">
              <Undo2 aria-hidden="true" size={19} />
              <span>Undo</span>
            </button>
            <button type="button" onClick={() => openDialog("new-game")} title="Start a new game">
              <RotateCcw aria-hidden="true" size={19} />
              <span>New game</span>
            </button>
            <button type="button" onClick={() => setDialog("rules")} title="View rules">
              <BookOpen aria-hidden="true" size={19} />
              <span>Rules</span>
            </button>
          </footer>
        </aside>
      </section>

      {dialog === "new-game" ? (
        <RuleDialog
          title="Start a new game?"
          description="The current game and move history will be cleared."
          checked={ruleDraft}
          onCheckedChange={setRuleDraft}
          onClose={() => setDialog(null)}
          confirmLabel="Start new game"
          onConfirm={() => resetBoard({ forceCheckerCaptures: ruleDraft })}
        />
      ) : null}

      {dialog === "settings" ? (
        <RuleDialog
          title="Game settings"
          description="This setting applies immediately to the current match."
          checked={ruleDraft}
          onCheckedChange={setRuleDraft}
          onClose={() => setDialog(null)}
          confirmLabel="Save settings"
          onConfirm={saveSettings}
          disabled={Boolean(state.forcedPieceId)}
        />
      ) : null}

      {dialog === null ? (
        <GameOverDialog
          state={state}
          you={humanPlayer}
          actions={[
            { label: "Play again", onClick: () => resetBoard(state.rules) },
            { label: "Change rules", onClick: () => openDialog("new-game") },
            { label: "Main menu", onClick: onExit }
          ]}
        />
      ) : null}

      {dialog === "rules" ? <RulesDialog onClose={() => setDialog(null)} /> : null}
    </main>
  );
}

function RuleDialog({
  title,
  description,
  checked,
  onCheckedChange,
  onClose,
  confirmLabel,
  onConfirm,
  disabled = false
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onClose: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <label className={`setting-toggle ${disabled ? "disabled" : ""}`}>
        <span>
          <strong>Force checker captures</strong>
          <small>When a checker can jump, it must. Knights stay optional.</small>
        </span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
      </label>
      {disabled ? <p className="setting-note">Finish the current jump before changing this setting.</p> : null}
      <div className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="button primary" type="button" data-autofocus onClick={onConfirm}>
          <SlidersHorizontal aria-hidden="true" size={17} />
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function getStateMessage(state: GameState, hasForcedCheckerCapture: boolean) {
  if (state.status.phase === "won") return state.status.message;
  if (state.forcedPieceId && state.canEndJump) return "Continue jumping or end the turn.";
  if (state.forcedPieceId) return "A checker must finish its jump.";
  if (hasForcedCheckerCapture) return "A checker capture is available.";
  return "Select a piece to make a move.";
}
