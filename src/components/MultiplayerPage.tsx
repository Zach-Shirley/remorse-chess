import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  ChevronLeft,
  Clipboard,
  ClipboardCheck,
  DoorOpen,
  Globe,
  Handshake,
  Home,
  LoaderCircle,
  LogIn,
  MessageSquare,
  Radio,
  RotateCcw,
  SkipForward,
  Swords,
  Trophy,
  WifiOff,
  Zap
} from "lucide-react";
import {
  DEFAULT_GAME_RULES,
  PASS_MOVE_ID,
  canPass,
  getLegalMoves,
  getPieceAt,
  opponentOf,
  playerName,
  type GameRules,
  type GameState,
  type Move,
  type Player,
  type Square
} from "../game";
import {
  QUICK_CHAT_MESSAGES,
  type ColorChoice,
  type PlayerSession,
  type QueueResult,
  type RoomConnection,
  type RoomSnapshot,
  type ServerResponse
} from "../multiplayer/protocol";
import { withoutFreeText } from "../multiplayer/nativeSafety";
import { getMultiplayerSocket } from "../multiplayer/socket";
import { type BotLevel } from "../bot";
import { getPlayerIdentity } from "../playerIdentity";
import { playSound, soundForMove } from "../sound";
import { Board, groupMovesByPiece, moveAnimation, movesTo } from "../ui/Board";
import { BotLevelPicker } from "../ui/BotLevelPicker";
import { ColorPicker, resolveColorChoice } from "../ui/ColorPicker";
import {
  ConscienceNote,
  EventFeed,
  RuleSetChip,
  RuleSetPicker,
  conscienceAria,
  conscienceBadge,
  conscienceSquareClass,
  ruleSetLabel,
  useRuleSetChoice
} from "../ui/Conscience";
import { MoveList, PlayerBar, RulesDialog, SoundToggle, TurnStatus } from "../ui/GameChrome";
import { resultTitle } from "../ui/GameOverDialog";
import { Modal } from "../ui/Modal";
import { pieceSprite, type PieceAnimation } from "../ui/PieceToken";
import { PromotionPicker } from "../ui/PromotionPicker";
import { LocalGamePage } from "./LocalGamePage";

const SESSION_KEY = "remorse-chess:online-session:v1";

type LobbyMode = "create" | "join";
type GameDialog = "rules" | "resign" | "leave" | null;

export function MultiplayerPage({
  onExit,
  onPlayBot
}: {
  onExit: () => void;
  onPlayBot: (level: BotLevel, rules: GameRules, color: ColorChoice) => void;
}) {
  const identity = useMemo(getPlayerIdentity, []);
  // While quick match searches, the player can play a bot; a found match replaces that game.
  const [waitingBot, setWaitingBot] = useState<{ level: BotLevel; rules: GameRules; botPlayer: Player; session: number } | null>(null);
  const [queueRules, setQueueRules] = useState<GameRules>(DEFAULT_GAME_RULES);
  const [matchNotice, setMatchNotice] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [session, setSession] = useState<PlayerSession | null>(() => readSession());
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const socket = useMemo(getMultiplayerSocket, []);

  const showSnapshot = useCallback((next: RoomSnapshot) => {
    setSnapshot(withoutFreeText(next));
  }, []);

  const acceptConnection = useCallback((connection: RoomConnection) => {
    setWaitingBot((current) => {
      if (current) setMatchNotice(true);
      return null;
    });
    writeSession(connection.session);
    setSession(connection.session);
    showSnapshot(connection.snapshot);
    setQueued(false);
    setError(null);
    setConnecting(false);
  }, [showSnapshot]);

  useEffect(() => {
    function resumeSavedSession() {
      setConnected(true);
      setError(null);
      const savedSession = readSession();
      if (!savedSession) {
        setConnecting(false);
        return;
      }

      setConnecting(true);
      socket.emit("room:resume", savedSession, (response) => {
        if (response.ok) {
          acceptConnection(response.data);
          return;
        }

        clearSession();
        setSession(null);
        setSnapshot(null);
        setConnecting(false);
        setError(response.message);
      });
    }

    function handleDisconnect() {
      setConnected(false);
      setConnecting(false);
    }

    function handleConnectError() {
      setConnected(false);
      setConnecting(false);
      setError("Waking the game server. It sleeps when idle, so this can take up to a minute.");
    }

    function handleRoomClosed(message: string) {
      clearSession();
      setSession(null);
      setSnapshot(null);
      setQueued(false);
      setError(message);
    }

    socket.on("connect", resumeSavedSession);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("room:state", showSnapshot);
    socket.on("room:closed", handleRoomClosed);
    socket.on("matchmaking:matched", acceptConnection);
    socket.connect();

    return () => {
      socket.off("connect", resumeSavedSession);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("room:state", showSnapshot);
      socket.off("room:closed", handleRoomClosed);
      socket.off("matchmaking:matched", acceptConnection);
      socket.disconnect();
    };
  }, [acceptConnection, showSnapshot, socket]);

  function runRoomRequest<T>(
    emit: (ack: (response: ServerResponse<T>) => void) => void,
    onSuccess: (data: T) => void
  ) {
    if (!connected) {
      setError("The game server is disconnected.");
      return;
    }

    setBusy(true);
    setError(null);
    emit((response) => {
      setBusy(false);
      if (response.ok) {
        onSuccess(response.data);
      } else {
        setError(response.message);
      }
    });
  }

  function createRoom(rules: GameRules, color: ColorChoice) {
    runRoomRequest<RoomConnection>(
      (ack) => socket.emit("room:create", { name: identity.name, playerId: identity.id, rules, color }, ack),
      acceptConnection
    );
  }

  function joinRoom(code: string) {
    runRoomRequest<RoomConnection>(
      (ack) => socket.emit("room:join", { name: identity.name, playerId: identity.id, code }, ack),
      acceptConnection
    );
  }

  function joinQueue(rules: GameRules) {
    setQueueRules(rules);
    runRoomRequest<QueueResult>(
      (ack) => socket.emit("matchmaking:join", { name: identity.name, playerId: identity.id, rules }, ack),
      (result) => setQueued(result.queued)
    );
  }

  function cancelQueue(onCancelled?: () => void) {
    runRoomRequest(
      (ack) => socket.emit("matchmaking:leave", ack),
      () => {
        setQueued(false);
        setWaitingBot(null);
        onCancelled?.();
      }
    );
  }

  function leaveRoom(exitAfter = false) {
    if (!connected) {
      clearSession();
      setSession(null);
      setSnapshot(null);
      setQueued(false);
      if (exitAfter) onExit();
      return;
    }

    runRoomRequest(
      (ack) => socket.emit("room:leave", ack),
      () => {
        clearSession();
        setSession(null);
        setSnapshot(null);
        if (exitAfter) onExit();
      }
    );
  }

  if (connecting && session && !snapshot) {
    return <ConnectionScreen label="Rejoining game" />;
  }

  if (snapshot && session) {
    if (snapshot.stage === "waiting") {
      return (
        <WaitingRoom
          snapshot={snapshot}
          session={session}
          connected={connected}
          busy={busy}
          error={error}
          onLeave={() => leaveRoom(true)}
        />
      );
    }

    return (
      <>
        {matchNotice ? <MatchFoundNotice onDone={() => setMatchNotice(false)} /> : null}
        <OnlineGame
          snapshot={snapshot}
          session={session}
          connected={connected}
          error={error}
          onError={setError}
          onLeave={() => leaveRoom(true)}
        />
      </>
    );
  }

  if (queued && waitingBot) {
    return (
      <LocalGamePage
        key={`waiting-bot-${waitingBot.session}`}
        initialRules={waitingBot.rules}
        bot={{ player: waitingBot.botPlayer, level: waitingBot.level }}
        kicker="Still searching for a match"
        onExit={() => setWaitingBot(null)}
      />
    );
  }

  return (
    <MultiplayerLobby
      playerName={identity.name}
      connected={connected}
      busy={busy}
      queued={queued}
      error={error}
      onExit={onExit}
      onCreate={createRoom}
      onJoin={joinRoom}
      onQueue={joinQueue}
      onCancelQueue={() => cancelQueue()}
      onBotWhileWaiting={(level, color) =>
        setWaitingBot({ level, rules: queueRules, botPlayer: opponentOf(resolveColorChoice(color)), session: Date.now() })
      }
      onBotInstead={(level, color) => cancelQueue(() => onPlayBot(level, queueRules, color))}
    />
  );
}

function MatchFoundNotice({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4500);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <p className="match-toast" role="status">
      Match found! Your bot game was closed.
    </p>
  );
}

function MultiplayerLobby({
  playerName: ownName,
  connected,
  busy,
  queued,
  error,
  onExit,
  onCreate,
  onJoin,
  onQueue,
  onCancelQueue,
  onBotWhileWaiting,
  onBotInstead
}: {
  playerName: string;
  connected: boolean;
  busy: boolean;
  queued: boolean;
  error: string | null;
  onExit: () => void;
  onCreate: (rules: GameRules, color: ColorChoice) => void;
  onJoin: (code: string) => void;
  onQueue: (rules: GameRules) => void;
  onCancelQueue: () => void;
  onBotWhileWaiting: (level: BotLevel, color: ColorChoice) => void;
  onBotInstead: (level: BotLevel, color: ColorChoice) => void;
}) {
  const [mode, setMode] = useState<LobbyMode>("create");
  const [code, setCode] = useState("");
  // One picker for both cards: a new room is created with it, and quick match only pairs
  // players who picked the same rule set.
  const [ruleSet, setRuleSet] = useRuleSetChoice();
  const rules: GameRules = { ruleSet };
  const [botLevel, setBotLevel] = useState<BotLevel>("medium");
  const [roomColor, setRoomColor] = useState<ColorChoice>("random");
  const [botColor, setBotColor] = useState<ColorChoice>("white");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "create") {
      onCreate(rules, roomColor);
    } else {
      onJoin(code);
    }
  }

  if (queued) {
    return (
      <main className="multiplayer-page">
        <section className="queue-screen" aria-live="polite">
          <div className="radar" aria-hidden="true">
            <img src={pieceSprite("white", "knight")} alt="" draggable="false" />
          </div>
          <p className="section-kicker">Quick match</p>
          <h1>Looking for a player</h1>
          <p>You will be matched with the next player who searches for {ruleSetLabel(ruleSet)} rules.</p>
          <div className="queue-bot">
            <strong>Play a bot meanwhile?</strong>
            <BotLevelPicker value={botLevel} onChange={setBotLevel} />
            <ColorPicker value={botColor} onChange={setBotColor} />
            <div className="queue-bot-actions">
              <button className="button primary" type="button" onClick={() => onBotWhileWaiting(botLevel, botColor)}>
                Play while I wait
              </button>
              <button className="button secondary" type="button" onClick={() => onBotInstead(botLevel, botColor)} disabled={busy}>
                Play a bot instead
              </button>
            </div>
            <small>While you wait, a found match takes over right away.</small>
          </div>
          <button className="button ghost" type="button" onClick={onCancelQueue} disabled={busy}>
            Cancel search
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="multiplayer-page">
      <button className="back-button" type="button" onClick={onExit}>
        <ChevronLeft aria-hidden="true" size={20} />
        Back
      </button>

      <section className="multiplayer-lobby" aria-labelledby="multiplayer-title">
        <header className="multiplayer-heading">
          <div className="multiplayer-icon" aria-hidden="true"><Globe size={26} /></div>
          <div>
            <p className="section-kicker">Online play</p>
            <h1 id="multiplayer-title">Play online</h1>
          </div>
          <span className={`server-state ${connected ? "online" : "offline"}`}>
            <Radio aria-hidden="true" size={14} />
            {connected ? "Server online" : "Connecting..."}
          </span>
        </header>

        <p className="playing-as">
          Playing as <strong>{ownName}</strong>
        </p>

        {error ? <p className="lobby-error" role="alert">{error}</p> : null}

        <div className="lobby-rules">
          <span className="field-caption">Rule set · for a new room and for quick match</span>
          <RuleSetPicker value={ruleSet} onChange={setRuleSet} />
        </div>

        <div className="lobby-cards">
          <div className="lobby-card">
            <div className="lobby-card-heading">
              <Swords aria-hidden="true" size={18} />
              <h2>Private room</h2>
            </div>
            <div className="segmented lobby-tabs" role="tablist" aria-label="Room action">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "create"}
                className={mode === "create" ? "active" : ""}
                onClick={() => setMode("create")}
              >
                Create room
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "join"}
                className={mode === "join" ? "active" : ""}
                onClick={() => setMode("join")}
              >
                Join room
              </button>
            </div>

            <form className="lobby-form" onSubmit={submit}>
              {mode === "create" ? (
                <ColorPicker value={roomColor} onChange={setRoomColor} />
              ) : (
                <label className="field-label">
                  <span className="field-caption">Room code</span>
                  <input
                    className="room-code-input"
                    type="text"
                    value={code}
                    maxLength={6}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="ABC123"
                    onChange={(event) => setCode(normalizeRoomCode(event.currentTarget.value))}
                  />
                </label>
              )}

              <button className="button primary lobby-submit" type="submit" disabled={busy || !connected || (mode === "join" && code.length !== 6)}>
                {busy ? <LoaderCircle className="button-spinner" aria-hidden="true" size={18} /> : mode === "create" ? <Swords aria-hidden="true" size={18} /> : <LogIn aria-hidden="true" size={18} />}
                {mode === "create" ? "Create private room" : "Join room"}
              </button>
            </form>
          </div>

          <div className="lobby-card quick-card">
            <div className="lobby-card-heading">
              <Zap aria-hidden="true" size={18} />
              <h2>Quick match</h2>
            </div>
            <p>Pair with the next player who searches with the same rule set. Sides are random, and you can play a bot while you wait.</p>
            <button
              className="button secondary"
              type="button"
              disabled={busy || !connected}
              onClick={() => onQueue(rules)}
            >
              Find match
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function WaitingRoom({
  snapshot,
  session,
  connected,
  busy,
  error,
  onLeave
}: {
  snapshot: RoomSnapshot;
  session: PlayerSession;
  connected: boolean;
  busy: boolean;
  error: string | null;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const ownSide = playerName(session.player);

  async function copyCode() {
    // The clipboard API only exists on secure (https) pages.
    try {
      await navigator.clipboard.writeText(snapshot.code);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <main className="multiplayer-page">
      <button className="back-button" type="button" onClick={onLeave} disabled={busy}>
        <ChevronLeft aria-hidden="true" size={20} />
        Leave
      </button>

      <section className="waiting-room" aria-labelledby="waiting-title">
        <p className="section-kicker">Private room</p>
        <h1 id="waiting-title">Waiting for an opponent</h1>
        <p className="waiting-copy">Share this code with your opponent. They choose Join room and enter it. You play {ownSide}.</p>
        <RuleSetChip ruleSet={snapshot.rules.ruleSet} />

        <button className="room-code-display" type="button" onClick={copyCode} title="Copy room code">
          <span>{snapshot.code}</span>
          <small>
            {copied ? <ClipboardCheck aria-hidden="true" size={14} /> : <Clipboard aria-hidden="true" size={14} />}
            {copied ? "Copied" : "Copy code"}
          </small>
        </button>

        <div className="waiting-seats">
          <WaitingSeat player="white" name={snapshot.players.white?.name} connected={Boolean(snapshot.players.white?.connected)} />
          <span aria-hidden="true">vs</span>
          <WaitingSeat player="black" name={snapshot.players.black?.name} connected={Boolean(snapshot.players.black?.connected)} />
        </div>

        {!connected ? <p className="lobby-error" role="alert">Reconnecting to multiplayer server...</p> : null}
        {error ? <p className="lobby-error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}

function WaitingSeat({ player, name, connected }: { player: Player; name: string | undefined; connected: boolean }) {
  return (
    <div className={`waiting-seat ${connected ? "occupied" : ""}`}>
      <img src={pieceSprite(player, "king")} alt="" draggable="false" />
      <small>{playerName(player)}</small>
      <strong>{name ?? "Open seat"}</strong>
    </div>
  );
}

function OnlineGame({
  snapshot,
  session,
  connected,
  error,
  onError,
  onLeave
}: {
  snapshot: RoomSnapshot;
  session: PlayerSession;
  connected: boolean;
  error: string | null;
  onError: (message: string | null) => void;
  onLeave: () => void;
}) {
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  // A piece the player tapped only to read its status.
  const [inspectedPieceId, setInspectedPieceId] = useState<string | null>(null);
  const [pieceAnimation, setPieceAnimation] = useState<PieceAnimation | null>(null);
  const [displayState, setDisplayState] = useState(snapshot.game);
  const [dialog, setDialog] = useState<GameDialog>(null);
  // The promotion moves waiting for the player to pick a piece.
  const [promotion, setPromotion] = useState<Move[] | null>(null);
  const latestStateRef = useRef(snapshot.game);
  const animationIdRef = useRef<number | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socket = useMemo(getMultiplayerSocket, []);
  const state = snapshot.game;
  const legalMoves = useMemo(
    () => !pieceAnimation && state.status.phase === "playing" && state.currentPlayer === session.player ? getLegalMoves(state) : [],
    [pieceAnimation, session.player, state]
  );
  const movesByPiece = useMemo(() => groupMovesByPiece(legalMoves), [legalMoves]);
  const selectedMoves = selectedPieceId ? movesByPiece.get(selectedPieceId) ?? [] : [];
  const opponent = opponentOf(session.player);
  const opponentConnected = snapshot.players[opponent]?.connected ?? false;
  const playing = state.status.phase === "playing";
  const phase = state.status.phase;
  const winner = state.status.phase === "won" ? state.status.winner : null;

  useEffect(() => {
    if (selectedPieceId && !movesByPiece.has(selectedPieceId)) setSelectedPieceId(null);
  }, [movesByPiece, selectedPieceId]);

  // A promotion choice is void once it is no longer this player's move.
  useEffect(() => {
    if (legalMoves.length === 0) setPromotion(null);
  }, [legalMoves]);

  const finishPieceAnimation = useCallback((animationId: number) => {
    if (animationIdRef.current !== animationId) return;
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = null;
    animationIdRef.current = null;
    setPieceAnimation(null);
    setDisplayState(latestStateRef.current);
  }, []);

  // The server's state arrives one move ahead of what is drawn; animate the piece there first.
  useEffect(() => {
    latestStateRef.current = state;
    if (animationIdRef.current !== null) return;

    const displayedMoves = displayState.moveLog.length;
    if (state.moveLog.length === displayedMoves + 1) {
      const entry = state.moveLog[state.moveLog.length - 1];
      const movingPiece = getPieceAt(displayState, entry.from);
      if (movingPiece) {
        const animation = moveAnimation(entry, {
          id: snapshot.revision,
          pieceId: movingPiece.id,
          perspective: session.player,
          direction: "to"
        });
        animationIdRef.current = animation.id;
        setPieceAnimation(animation);
        playSound(soundForMove(entry));
        animationTimerRef.current = setTimeout(
          () => finishPieceAnimation(animation.id),
          600
        );
        return;
      }
    }

    if (displayState !== state) setDisplayState(state);
  }, [displayState, finishPieceAnimation, session.player, snapshot.revision, state]);

  useEffect(() => () => {
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
  }, []);

  useEffect(() => {
    if (phase === "draw") playSound("draw");
    if (phase === "won") playSound(winner === session.player ? "win" : "lose");
  }, [phase, winner, session.player]);

  function request(
    action: (ack: (response: ServerResponse<null>) => void) => void,
    onSuccess?: () => void
  ) {
    if (!connected) {
      onError("The game server is disconnected.");
      return;
    }

    onError(null);
    action((response) => {
      if (response.ok) {
        onSuccess?.();
      } else {
        onError(response.message);
      }
    });
  }

  function playMove(move: Move) {
    setPromotion(null);
    setSelectedPieceId(null);
    setInspectedPieceId(null);
    request((ack) => socket.emit("room:move", move.id, ack));
  }

  // Declines a Sadist's extra move. The server checks it like any other move.
  function endTurn() {
    setSelectedPieceId(null);
    request((ack) => socket.emit("room:move", PASS_MOVE_ID, ack));
  }

  function handleSquareClick(square: Square) {
    if (pieceAnimation || !connected || !opponentConnected || !playing || state.currentPlayer !== session.player) {
      // Not this player's move: a tap still reads a piece's status.
      const tapped = getPieceAt(displayState, square);
      setInspectedPieceId(tapped && tapped.id !== inspectedPieceId ? tapped.id : null);
      return;
    }

    const destinationMoves = movesTo(selectedMoves, square);
    if (destinationMoves.length > 1) {
      setPromotion(destinationMoves);
      return;
    }
    if (destinationMoves.length === 1) {
      playMove(destinationMoves[0]);
      return;
    }

    const piece = getPieceAt(displayState, square);
    if (piece?.player === session.player && movesByPiece.has(piece.id)) {
      setSelectedPieceId(piece.id === selectedPieceId ? null : piece.id);
      setInspectedPieceId(null);
      return;
    }

    setSelectedPieceId(null);
    setInspectedPieceId(piece && piece.id !== inspectedPieceId ? piece.id : null);
  }

  const statusMessage = getOnlineStatusMessage(state, session.player, connected, opponentConnected);
  const mayEndTurn =
    !pieceAnimation && connected && opponentConnected && state.currentPlayer === session.player && canPass(state);
  const ownRematchVote = snapshot.rematchVotes.includes(session.player);
  const opponentRematchVote = snapshot.rematchVotes.includes(opponent);
  const opponentName = snapshot.players[opponent]?.name ?? playerName(opponent);

  function requestRematch() {
    request((ack) => socket.emit("room:rematch", ack));
  }

  return (
    <main className="game-page online-game-page">
      <section className="game-workspace" aria-label="Online chess game">
        <div className="board-column">
          <PlayerBar
            player={opponent}
            name={snapshot.players[opponent]?.name ?? "Open seat"}
            tag={playerName(opponent)}
            state={state}
            active={playing && state.currentPlayer === opponent}
            offline={!opponentConnected}
          />

          <Board
            state={displayState}
            perspective={session.player}
            label={`Chess board, ${playerName(session.player)} side`}
            selectedPieceId={selectedPieceId}
            targets={selectedMoves}
            movablePieceIds={movesByPiece}
            animation={pieceAnimation}
            onAnimationEnd={finishPieceAnimation}
            onSquareClick={handleSquareClick}
            pieceBadge={(piece) => conscienceBadge(displayState.minds[piece.id])}
            squareClassName={(_square, piece) => conscienceSquareClass(displayState, piece)}
            pieceStatus={(piece) => conscienceAria(displayState, piece)}
          />

          <PlayerBar
            player={session.player}
            name={snapshot.players[session.player]?.name ?? "You"}
            tag={`You · ${playerName(session.player)}`}
            state={state}
            active={playing && state.currentPlayer === session.player}
            offline={!connected}
          />

          <EventFeed state={state} />

          <GameEventOverlay
            snapshot={snapshot}
            session={session}
            connected={connected}
            onLeave={onLeave}
            onRematch={requestRematch}
          />
        </div>

        <aside className="game-panel" aria-label="Online game controls and move history">
          <header className="game-panel-header">
            <button className="icon-button" type="button" onClick={() => setDialog("leave")} aria-label="Leave game" title="Leave game">
              <Home aria-hidden="true" size={19} />
            </button>
            <div>
              <p className="section-kicker">Room {snapshot.code}</p>
              <strong>Online match</strong>
            </div>
            <SoundToggle />
            <span className={`connection-indicator ${connected ? "online" : "offline"}`} title={connected ? "Connected" : "Disconnected"}>
              <Radio aria-hidden="true" size={16} />
            </span>
          </header>

          <TurnStatus
            state={state}
            title={!playing ? "Game over" : state.currentPlayer === session.player ? "Your move" : `${opponentName} to move`}
            message={statusMessage}
            action={
              mayEndTurn ? (
                <button className="button secondary end-turn" type="button" onClick={endTurn} data-testid="end-turn">
                  <SkipForward aria-hidden="true" size={16} />
                  End turn
                </button>
              ) : null
            }
          />

          <ConscienceNote state={displayState} pieceId={selectedPieceId ?? inspectedPieceId} />

          <RuleSetChip ruleSet={state.rules.ruleSet} />

          <MoveList state={state} />

          <ChatPanel
            snapshot={snapshot}
            session={session}
            connected={connected}
            onSend={(message, onSent) =>
              request((ack) => socket.emit("room:chat", message, ack), onSent)
            }
          />

          <footer className="game-actions online-actions">
            <button
              className="danger-action"
              type="button"
              onClick={() => setDialog("resign")}
              disabled={!playing || !connected}
              title="Resign game"
            >
              <DoorOpen aria-hidden="true" size={19} />
              <span>Resign</span>
            </button>
            <button
              className={opponentRematchVote ? "rematch-action requested" : "rematch-action"}
              type="button"
              onClick={requestRematch}
              disabled={playing || ownRematchVote || !connected || !opponentConnected}
              title="Request a rematch"
            >
              <RotateCcw aria-hidden="true" size={19} />
              <span>{ownRematchVote ? "Waiting" : opponentRematchVote ? "Accept" : "Rematch"}</span>
            </button>
            <button type="button" onClick={() => setDialog("rules")} title="View rules">
              <BookOpen aria-hidden="true" size={19} />
              <span>Rules</span>
            </button>
          </footer>
        </aside>
      </section>

      {error ? <div className="game-toast" role="alert">{error}</div> : null}

      {dialog === "rules" ? <RulesDialog ruleSet={state.rules.ruleSet} onClose={() => setDialog(null)} /> : null}

      {promotion && dialog === null ? (
        <PromotionPicker moves={promotion} onPick={playMove} onCancel={() => setPromotion(null)} />
      ) : null}

      {dialog === "resign" ? (
        <Modal title="Resign this game?" description="Your opponent will win the current match." tone="danger" onClose={() => setDialog(null)}>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
            <button className="button danger" type="button" data-autofocus onClick={() => { setDialog(null); request((ack) => socket.emit("room:resign", ack)); }}>Resign</button>
          </div>
        </Modal>
      ) : null}

      {dialog === "leave" ? (
        <Modal title="Leave this room?" description={playing ? "Leaving an active match counts as a resignation." : "You will return to the home screen."} tone="danger" onClose={() => setDialog(null)}>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>Stay</button>
            <button className="button danger" type="button" data-autofocus onClick={onLeave}>Leave room</button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function GameEventOverlay({
  snapshot,
  session,
  connected,
  onLeave,
  onRematch
}: {
  snapshot: RoomSnapshot;
  session: PlayerSession;
  connected: boolean;
  onLeave: () => void;
  onRematch: () => void;
}) {
  const state = snapshot.game;
  const opponent = opponentOf(session.player);
  const opponentName = snapshot.players[opponent]?.name ?? playerName(opponent);
  const opponentConnected = snapshot.players[opponent]?.connected ?? false;
  const ownRematchVote = snapshot.rematchVotes.includes(session.player);
  const opponentRematchVote = snapshot.rematchVotes.includes(opponent);
  const disconnectSeconds = useCountdownSeconds(snapshot.disconnectDeadlines[opponent]);
  // "View board" hides the result card; a rematch (a new game) brings it back next time.
  const [resultHidden, setResultHidden] = useState(false);
  const isOver = state.status.phase !== "playing";
  useEffect(() => {
    if (!isOver) setResultHidden(false);
  }, [isOver]);

  if (connected && opponentConnected && state.status.phase === "playing") {
    return null;
  }

  if (!connected || (state.status.phase === "playing" && !opponentConnected)) {
    const serverOffline = !connected;
    return (
      <div className="game-event-layer" role="status" aria-live="assertive">
        <section className="game-event-card disconnected-event">
          <span className="game-event-icon" aria-hidden="true"><WifiOff size={28} /></span>
          <p className="section-kicker">Match paused</p>
          <h2>{serverOffline ? "Connection lost" : `${opponentName} disconnected`}</h2>
          {serverOffline || disconnectSeconds === null ? null : (
            <strong className="disconnect-countdown" aria-label={`${disconnectSeconds} seconds remaining`}>{disconnectSeconds}</strong>
          )}
          <p>{serverOffline ? "Reconnecting to the game server..." : `Their seat is being held for ${disconnectSeconds ?? 30} seconds. If they do not reconnect, the match ends by resignation.`}</p>
          <button className="button secondary" type="button" onClick={onLeave}>Leave room</button>
        </section>
      </div>
    );
  }

  if (state.status.phase === "playing" || resultHidden) {
    return null;
  }

  const drawn = state.status.phase === "draw";
  const didWin = state.status.phase === "won" && state.status.winner === session.player;
  const resigned = state.status.phase === "won" && state.status.reason === "resignation";
  const opponentLeft = didWin && resigned && !opponentConnected;
  const resultLabel = drawn ? "Draw" : didWin ? "Victory" : "Defeat";
  const outcomeTitle = drawn
    ? resultTitle(state, session.player)
    : opponentLeft
      ? `${opponentName} left the match`
      : resigned
        ? didWin
          ? `${opponentName} resigned`
          : "You resigned"
        : didWin
          ? "You won"
          : `${opponentName} won`;
  const title = ownRematchVote
    ? "Rematch requested"
    : opponentRematchVote
      ? `${opponentName} wants a rematch`
      : outcomeTitle;
  const description = ownRematchVote
    ? `Waiting for ${opponentName} to accept.`
    : opponentRematchVote
      ? "Accept to reset the board and play again with the same rules."
      : state.status.message;

  return (
    <div className="game-event-layer" role="status" aria-live="assertive">
      <section className={`game-event-card result-event ${drawn ? "drawn" : didWin ? "won" : "lost"}`}>
        <span className="game-event-icon" aria-hidden="true">{drawn ? <Handshake size={28} /> : <Trophy size={28} />}</span>
        <p className="section-kicker">{resultLabel}</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="game-event-actions">
          <button
            className="button primary"
            type="button"
            onClick={onRematch}
            disabled={ownRematchVote || !connected || !opponentConnected}
          >
            <RotateCcw aria-hidden="true" size={17} />
            {!opponentConnected ? "Opponent left" : ownRematchVote ? "Waiting for opponent" : opponentRematchVote ? "Accept rematch" : "Request rematch"}
          </button>
          <button className="button secondary" type="button" onClick={onLeave}>Leave room</button>
          <button className="button ghost" type="button" onClick={() => setResultHidden(true)}>View board</button>
        </div>
      </section>
    </div>
  );
}

function useCountdownSeconds(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline]);

  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function ChatPanel({
  snapshot,
  session,
  connected,
  onSend
}: {
  snapshot: RoomSnapshot;
  session: PlayerSession;
  connected: boolean;
  onSend: (message: string, onSent: () => void) => void;
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [snapshot.chat.length]);

  return (
    <section className="chat-section" aria-labelledby="chat-title">
      <div className="chat-heading">
        <MessageSquare aria-hidden="true" size={15} />
        <h2 id="chat-title">Room chat</h2>
      </div>
      <div className="chat-messages" ref={messageListRef} aria-live="polite">
        {snapshot.chat.length === 0 ? (
          <p className="empty-chat">Say hello with a quick message.</p>
        ) : (
          snapshot.chat.map((chatMessage) => {
            const isYou = chatMessage.player === session.player;
            const sender = isYou ? "You" : snapshot.players[chatMessage.player]?.name ?? playerName(chatMessage.player);
            return (
              <div className={`chat-message ${isYou ? "own" : "opponent"}`} key={chatMessage.id}>
                <strong>{sender}</strong>
                <p>{chatMessage.text}</p>
              </div>
            );
          })
        )}
      </div>
      <div className="quick-chat" aria-label="Quick messages">
        {QUICK_CHAT_MESSAGES.map((quickMessage) => (
          <button
            key={quickMessage}
            type="button"
            disabled={!connected}
            onClick={() => onSend(quickMessage, () => undefined)}
          >
            {quickMessage}
          </button>
        ))}
      </div>
    </section>
  );
}

function ConnectionScreen({ label }: { label: string }) {
  return (
    <main className="multiplayer-page">
      <section className="queue-screen" aria-live="polite">
        <LoaderCircle className="queue-spinner" aria-hidden="true" size={34} />
        <h1>{label}</h1>
      </section>
    </main>
  );
}

function getOnlineStatusMessage(state: GameState, player: Player, connected: boolean, opponentConnected: boolean) {
  if (!connected) return "Reconnecting to the game server...";
  if (!opponentConnected) return "Waiting for your opponent to reconnect.";
  if (state.status.phase !== "playing") return state.status.message;
  if (state.currentPlayer !== player) {
    if (state.extraMove) return "Your opponent's Sadist may move again.";
    return state.status.check ? "Check! Waiting for your opponent." : "Waiting for your opponent.";
  }
  if (state.extraMove) return "Your Sadist may move again, or end the turn.";
  if (state.status.check) return "You are in check. Get your king to safety.";
  return "Select a piece to make a move.";
}

function normalizeRoomCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function writeSession(session: PlayerSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readSession(): PlayerSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as PlayerSession : null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
