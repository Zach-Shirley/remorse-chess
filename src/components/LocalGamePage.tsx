import { useEffect, useMemo, useState } from "react";
import { BookOpen, Home, RotateCcw, SkipForward, Undo2 } from "lucide-react";
import {
  type GameRules,
  type GameState,
  type Move,
  type Player,
  type Square,
  PASS_MOVE_ID,
  applyMove,
  canPass,
  createInitialState,
  getLegalMoves,
  getPieceAt,
  opponentOf,
  playerName
} from "../game";
import { BOT_LEVELS, type BotLevel } from "../bot";
import { requestBotAction } from "../botClient";
import { createLocalDice } from "../dice";
import { getPlayerIdentity } from "../playerIdentity";
import { playSound, soundForMove } from "../sound";
import { Board, groupMovesByPiece, moveAnimation, movesTo } from "../ui/Board";
import {
  ConscienceNote,
  EventFeed,
  RuleSetChip,
  conscienceAria,
  conscienceBadge,
  conscienceSquareClass
} from "../ui/Conscience";
import { MoveList, PlayerBar, RulesDialog, SoundToggle, TurnStatus } from "../ui/GameChrome";
import { GameOverDialog } from "../ui/GameOverDialog";
import { Modal } from "../ui/Modal";
import type { PieceAnimation } from "../ui/PieceToken";
import { PromotionPicker } from "../ui/PromotionPicker";

type GameDialog = "new-game" | "rules" | null;

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
  // A piece the player tapped only to read its status (an enemy piece, or one that cannot move).
  const [inspectedPieceId, setInspectedPieceId] = useState<string | null>(null);
  // Local and bot games roll on this device.
  const dice = useMemo(createLocalDice, []);
  const [pieceAnimation, setPieceAnimation] = useState<PieceAnimation | null>(null);
  const [dialog, setDialog] = useState<GameDialog>(null);
  // The promotion moves waiting for the player to pick a piece.
  const [promotion, setPromotion] = useState<Move[] | null>(null);
  const state = history[history.length - 1];
  const legalMoves = useMemo(() => getLegalMoves(state), [state]);
  const movesByPiece = useMemo(() => groupMovesByPiece(legalMoves), [legalMoves]);
  const selectedMoves = selectedPieceId ? movesByPiece.get(selectedPieceId) ?? [] : [];
  const botPlayer = bot?.player ?? null;
  const botLevel = bot?.level ?? null;
  const humanPlayer = botPlayer ? opponentOf(botPlayer) : null;
  // The human's pieces sit at the bottom; pass-and-play keeps White at the bottom.
  const perspective: Player = humanPlayer ?? "white";
  const topPlayer = opponentOf(perspective);
  const playing = state.status.phase === "playing";
  const isBotTurn = Boolean(botPlayer && playing && state.currentPlayer === botPlayer);
  const phase = state.status.phase;
  const winner = state.status.phase === "won" ? state.status.winner : null;

  useEffect(() => {
    if (selectedPieceId && !movesByPiece.has(selectedPieceId)) setSelectedPieceId(null);
  }, [movesByPiece, selectedPieceId]);

  useEffect(() => {
    if (!botLevel || !isBotTurn) return;
    let cancelled = false;
    const started = performance.now();
    requestBotAction(state, botLevel).then((action) => {
      const wait = Math.max(0, BOT_MIN_THINK_MS - (performance.now() - started));
      window.setTimeout(() => {
        if (cancelled || !action) return;
        if (action.moveId === PASS_MOVE_ID) {
          endTurn();
          return;
        }
        const move = legalMoves.find((candidate) => candidate.id === action.moveId);
        if (move) playMove(move);
      }, wait);
    });
    return () => {
      cancelled = true;
    };
    // playMove only reads `state`, which is a dependency.
  }, [botLevel, isBotTurn, state, legalMoves]);

  useEffect(() => {
    if (phase === "draw") playSound("draw");
    if (phase === "won") playSound(humanPlayer && winner !== humanPlayer ? "lose" : "win");
  }, [phase, winner, humanPlayer]);

  function playMove(move: Move) {
    const nextState = applyMove(state, move.id, dice);
    setPieceAnimation(
      moveAnimation(move, { id: state.moveLog.length + 1, pieceId: move.pieceId, perspective, direction: "from" })
    );
    playSound(soundForMove(nextState.moveLog[nextState.moveLog.length - 1]));
    setHistory((currentHistory) => [...currentHistory, nextState]);
    // A Sadist that may move again stays selected.
    setSelectedPieceId(nextState.extraMove && !isBotTurn ? nextState.extraMove.pieceId : null);
    setInspectedPieceId(null);
    setPromotion(null);
  }

  // Declines a Sadist's extra move.
  function endTurn() {
    if (!canPass(state)) return;
    const nextState = applyMove(state, PASS_MOVE_ID, dice);
    setHistory((currentHistory) => [...currentHistory, nextState]);
    setSelectedPieceId(null);
    setInspectedPieceId(null);
    setPromotion(null);
  }

  function handleSquareClick(square: Square) {
    if (!playing || isBotTurn) return;

    const destinationMoves = movesTo(selectedMoves, square);
    if (destinationMoves.length > 1) {
      setPromotion(destinationMoves);
      return;
    }
    if (destinationMoves.length === 1) {
      playMove(destinationMoves[0]);
      return;
    }

    const piece = getPieceAt(state, square);
    if (piece?.player === state.currentPlayer && movesByPiece.has(piece.id)) {
      setSelectedPieceId(piece.id === selectedPieceId ? null : piece.id);
      setInspectedPieceId(null);
      return;
    }

    setSelectedPieceId(null);
    setInspectedPieceId(piece && piece.id !== inspectedPieceId ? piece.id : null);
  }

  function undoMove() {
    setHistory((currentHistory) => {
      if (currentHistory.length <= 1) return currentHistory;
      let target = currentHistory.length - 2;
      // Against a bot, step back past its reply to the human's last turn.
      if (humanPlayer) {
        while (target > 0 && currentHistory[target].currentPlayer !== humanPlayer) target -= 1;
      }
      return currentHistory.slice(0, target + 1);
    });
    setSelectedPieceId(null);
    setInspectedPieceId(null);
    setPieceAnimation(null);
    setPromotion(null);
  }

  function resetBoard() {
    setHistory([createInitialState(state.rules)]);
    setSelectedPieceId(null);
    setPieceAnimation(null);
    setPromotion(null);
    setDialog(null);
  }

  const botName = botLevel ? `${BOT_LEVELS[botLevel].label} bot` : null;
  const ownName = bot ? getPlayerIdentity().name : "Player 1";
  const turnTitle = playing ? `${playerName(state.currentPlayer)} to move` : "Game over";
  const turnMessage = isBotTurn ? "The bot is thinking..." : getStateMessage(state, humanPlayer);
  const mayEndTurn = !isBotTurn && canPass(state);
  // Against a bot, undo is only useful once the human has made a move.
  const canUndo = humanPlayer
    ? history.some((entry, index) => index < history.length - 1 && entry.currentPlayer === humanPlayer)
    : history.length > 1;

  return (
    <main className="game-page">
      <section className="game-workspace" aria-label="Local chess game">
        <div className="board-column">
          <PlayerBar
            player={topPlayer}
            name={botName ?? "Player 2"}
            tag={bot ? `Bot · ${playerName(topPlayer)}` : playerName(topPlayer)}
            state={state}
            active={playing && state.currentPlayer === topPlayer}
            isBot={Boolean(bot)}
          />

          <Board
            state={state}
            perspective={perspective}
            label="Chess board"
            selectedPieceId={selectedPieceId}
            targets={selectedMoves}
            movablePieceIds={isBotTurn ? undefined : movesByPiece}
            animation={pieceAnimation}
            onAnimationEnd={(animationId) =>
              setPieceAnimation((current) => (current?.id === animationId ? null : current))
            }
            onSquareClick={handleSquareClick}
            pieceBadge={(piece) => conscienceBadge(state.minds[piece.id])}
            squareClassName={(_square, piece) => conscienceSquareClass(state, piece)}
            pieceStatus={(piece) => conscienceAria(state, piece)}
          />

          <PlayerBar
            player={perspective}
            name={ownName}
            tag={bot ? `You · ${playerName(perspective)}` : playerName(perspective)}
            state={state}
            active={playing && state.currentPlayer === perspective}
          />

          <EventFeed state={state} />
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
          </header>

          <TurnStatus
            state={state}
            title={turnTitle}
            message={turnMessage}
            action={
              mayEndTurn ? (
                <button className="button secondary end-turn" type="button" onClick={endTurn} data-testid="end-turn">
                  <SkipForward aria-hidden="true" size={16} />
                  End turn
                </button>
              ) : null
            }
          />

          <ConscienceNote state={state} pieceId={selectedPieceId ?? inspectedPieceId} />

          <RuleSetChip ruleSet={state.rules.ruleSet} />

          <MoveList state={state} />

          <footer className="game-actions">
            <button type="button" onClick={undoMove} disabled={!canUndo} title="Undo last move">
              <Undo2 aria-hidden="true" size={19} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={() => (state.moveLog.length === 0 || !playing ? resetBoard() : setDialog("new-game"))}
              title="Start a new game"
            >
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

      {promotion ? <PromotionPicker moves={promotion} onPick={playMove} onCancel={() => setPromotion(null)} /> : null}

      {dialog === "new-game" ? (
        <Modal
          title="Start a new game?"
          description="The current game and its move history will be cleared."
          onClose={() => setDialog(null)}
        >
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="button primary" type="button" data-autofocus onClick={resetBoard}>
              <RotateCcw aria-hidden="true" size={17} />
              Start new game
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === null && !promotion ? (
        <GameOverDialog
          state={state}
          you={humanPlayer}
          actions={[
            { label: "Play again", onClick: resetBoard },
            { label: "Main menu", onClick: onExit }
          ]}
        />
      ) : null}

      {dialog === "rules" ? <RulesDialog ruleSet={state.rules.ruleSet} onClose={() => setDialog(null)} /> : null}
    </main>
  );
}

function getStateMessage(state: GameState, humanPlayer: Player | null) {
  const { status } = state;
  if (status.phase !== "playing") return status.message;
  if (state.extraMove) return "The Sadist may move again, or end the turn.";
  if (status.check) {
    return humanPlayer ? "You are in check. Get your king to safety." : `${playerName(state.currentPlayer)} is in check.`;
  }
  return "Select a piece to make a move.";
}
