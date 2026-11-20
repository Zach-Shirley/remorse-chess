// Remorse Chess: what happens to the pieces' consciences when a move lands.
//
// The variant is by Bardelo Bardalini. The rules marked VERIFIED below are what he says in his
// YouTube Shorts; everything he leaves open is decided in interpretation.ts and only read here.
//
//   Video 1  "Remorse Chess"                           youtube.com/shorts/H-JyKN_1jM4
//   Video 2  "Psychos & Devastation"                   youtube.com/shorts/_ySYb2fEvRQ
//   Video 3  "Announcement & Reclassification"         youtube.com/shorts/mm3rmrhY_KM
//   Video 4  "Reactions to Attacks Pt. 1"              youtube.com/shorts/DJ3hAbNY6vc
//   Video 5  "Reactions to Attack Pt. 2"               youtube.com/shorts/UYv9RKw2zWI
//
// This file has no runtime import from game.ts (types only), so the engine can import it freely.

import type { GameState, GameStatus, LegalityOptions, Move, Piece, PieceKind, Player, Square } from "../game";
import {
  ABSOLUTION_CLEARS_DEVASTATION,
  ABSOLVER_MUST_BE_HEALTHY,
  AFFLICTED_PIECES_GIVE_CHECK,
  BISHOP_SELF_ABSOLVE_TURNS,
  BLOODLUST_AFTER_CAPTURES,
  DEVASTATED_BISHOP_SELF_ABSOLVES,
  DEVASTATED_KING_LOSES,
  DEVASTATED_WITNESSES_ROLL,
  DEVASTATION_TURNS,
  EXTRA_MOVE_ON_THE_ROLL,
  EXTRA_MOVE_SAME_PIECE,
  KINGS_ROLL,
  PROMOTION_TO_BISHOP_ABSOLVES,
  REACTION_RECURS,
  STANDING_BISHOP_ABSOLVES,
  VENDETTA_AGAINST_KING_GIVES_CHECK,
  VENDETTA_CAPTURE_ROLLS,
  VENDETTA_IGNORES_GUILT,
  WIN_BY_KING_CAPTURE,
  adjacentSquares,
  bloodlustMayCaptureFriend,
  vendettaTarget
} from "./interpretation";

// ---------------------------------------------------------------------------------------------
// Rule sets
// ---------------------------------------------------------------------------------------------

// classic    video 1: every capture makes the capturing piece guilt-ridden. No dice.
// reactions  videos 1-3: the first capture rolls a D6 for that piece's lifelong reaction.
// witnesses  videos 1-5: reactions, plus the captured piece's neighbours roll too.
export const RULE_SETS = ["classic", "reactions", "witnesses"] as const;
// "plain" is standard chess with none of this. It is not offered in the app; the engine's
// perft and standard-chess tests run under it.
export type RuleSet = (typeof RULE_SETS)[number] | "plain";
export const DEFAULT_RULE_SET: RuleSet = "reactions";

export const RULE_SET_INFO: Record<(typeof RULE_SETS)[number], { label: string; description: string }> = {
  classic: { label: "Classic", description: "Every capture leaves the capturer guilt-ridden. No dice." },
  reactions: { label: "Reactions", description: "A die decides how each piece takes its first capture." },
  witnesses: { label: "Witnesses", description: "Reactions, and the victim's neighbours roll too." }
};

// ---------------------------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------------------------

// A source of randomness shaped like Math.random: numbers in [0, 1). The engine never makes its
// own; the caller passes one in (the server for online games, the page for local and bot games).
export type Rng = () => number;

export function rollDie(rng: Rng): number {
  return Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
}

// The outcome model used when no dice are passed, which is what the bot's search runs on:
// every die shows 3. A first capture leaves the capturer guilt-ridden (as in Classic) and
// witnesses do not react. Pieces whose reaction is already known behave exactly.
export const MODEL_ROLL = 3;
export const MODEL_DICE: Rng = () => (MODEL_ROLL - 0.5) / 6;

// Dice that show the given faces in order, for tests and replays. Throws when they run out.
export function scriptedDice(...faces: number[]): Rng {
  let index = 0;
  return () => {
    if (index >= faces.length) throw new Error("The scripted dice ran out");
    const face = faces[index];
    index += 1;
    return (face - 0.5) / 6;
  };
}

// VERIFIED (video 2, renamed in video 3): the capture reaction table.
export type Reaction = "devastated" | "guilty" | "unaffected" | "sadist";
export function captureReaction(roll: number): Reaction {
  if (roll === 1) return "devastated";
  if (roll <= 3) return "guilty";
  if (roll <= 5) return "unaffected";
  return "sadist";
}

// VERIFIED (videos 4 and 5): the witness table. A 1-2 on an already guilt-ridden piece doubles
// to "devastated".
export type WitnessOutcome = "guilty" | "devastated" | "nothing" | "vendetta";
export function witnessReaction(roll: number): "shaken" | "nothing" | "vendetta" {
  if (roll <= 2) return "shaken";
  if (roll <= 4) return "nothing";
  return "vendetta";
}

// ---------------------------------------------------------------------------------------------
// A piece's conscience
// ---------------------------------------------------------------------------------------------

export type Affliction = "guilty" | "devastated";

// Only pieces with something on their mind have an entry in GameState.minds.
export type Mind = {
  // The lifelong reaction rolled at this piece's first capture (Reactions and Witnesses).
  reaction?: Reaction;
  // guilty: refuses to capture. devastated: cannot move at all, and is on a countdown.
  affliction?: Affliction;
  // The affliction came from witnessing a capture, not from this piece's own reaction.
  temporary?: boolean;
  // Devastated: turns of its owner left before it removes itself.
  turnsLeft?: number;
  // A guilt-ridden bishop: ends of its owner's turns left until it absolves itself.
  penance?: number;
  // Afflicted during its owner's current turn, so a bishop standing beside it cannot absolve it
  // until the end of the owner's next turn.
  fresh?: boolean;
  // Captures this piece has made (a Sadist gains bloodlust at three).
  captures?: number;
  bloodlust?: boolean;
  // One guilt-free capture against this piece type.
  vendetta?: PieceKind;
};

export type Minds = Record<string, Mind>;

export type PieceRef = { pieceId: string; kind: PieceKind; player: Player; square: Square };

export type GameEvent =
  // A die was rolled for a piece: for its own capture, or as a witness.
  | {
      type: "roll";
      cause: "capture";
      piece: PieceRef;
      value: number;
      outcome: Reaction;
    }
  | {
      type: "roll";
      cause: "witness";
      piece: PieceRef;
      value: number;
      outcome: WitnessOutcome;
      // The piece type a vendetta is sworn against.
      target?: PieceKind;
    }
  // No die: Classic guilt, or a known reaction striking again after a later capture.
  | { type: "relapse"; piece: PieceRef; affliction: Affliction }
  | { type: "absolved"; by: PieceRef; pieces: PieceRef[] }
  | { type: "self-absolved"; piece: PieceRef }
  | { type: "removed"; piece: PieceRef }
  | { type: "bloodlust"; piece: PieceRef }
  | { type: "vendetta-used"; piece: PieceRef; target: PieceKind }
  | { type: "extra-move"; piece: PieceRef };

export function isAfflicted(mind: Mind | undefined): boolean {
  return Boolean(mind && mind.affliction);
}

// The countdown shown on a devastated piece: 3, 2, 1.
export function devastationCountdown(mind: Mind): number {
  return Math.max(1, Math.min(DEVASTATION_TURNS, mind.turnsLeft ?? DEVASTATION_TURNS));
}

// Test and tooling helper: a copy of `state` with the mind of the piece on `square` replaced.
export function withMind(state: GameState, square: Square, mind: Mind): GameState {
  const piece = state.board[square.row][square.col];
  if (!piece) throw new Error("No piece on that square");
  return { ...state, minds: { ...state.minds, [piece.id]: mind } };
}

// ---------------------------------------------------------------------------------------------
// What the consciences change about legal moves
// ---------------------------------------------------------------------------------------------

// The engine's two move-generation layers, recombined. Every callback reads the state it is
// handed (never a captured one), so this object is built once.
export const REMORSE_OPTIONS: LegalityOptions = {
  // Zach's change: the king is captured, not checkmated, so there are no check rules.
  checkRules: WIN_BY_KING_CAPTURE ? false : undefined,
  moves: {
    // VERIFIED (video 2): a devastated piece is immobilised. During a Sadist's extra move only
    // the Sadist may move.
    canMove: (piece, _from, state) => {
      const pending = state.extraMove;
      if (pending && pending.pieceId !== null && pending.pieceId !== piece.id) return false;
      return state.minds[piece.id]?.affliction !== "devastated";
    },
    // VERIFIED (video 1): a guilt-ridden piece refuses to capture. (video 5): a vendetta is one
    // guilt-free capture against one piece type.
    canCapture: (attacker, target, _at, state) => {
      if (target.kind === "king" && !WIN_BY_KING_CAPTURE) return false;
      const mind = state.minds[attacker.id];
      if (!mind || !mind.affliction) return true;
      return VENDETTA_IGNORES_GUILT && mind.affliction === "guilty" && mind.vendetta === target.kind;
    },
    // VERIFIED (video 2): a piece with bloodlust is willing to take friendly pieces.
    canCaptureFriendly: (attacker, target, _at, state) => {
      const mind = state.minds[attacker.id];
      return Boolean(mind && mind.bloodlust && !mind.affliction) && bloodlustMayCaptureFriend(target.kind);
    },
    // VERIFIED (video 2): a piece with bloodlust only moves if it can take a piece.
    capturesOnly: (piece, _from, state) => Boolean(state.minds[piece.id]?.bloodlust)
  },
  attacks: {
    canAttack: (piece, _from, state) => {
      const mind = state.minds[piece.id];
      if (!mind || !mind.affliction || AFFLICTED_PIECES_GIVE_CHECK) return true;
      return VENDETTA_AGAINST_KING_GIVES_CHECK && mind.affliction === "guilty" && mind.vendetta === "king";
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Resolving a move
// ---------------------------------------------------------------------------------------------

function refOf(piece: Piece, square: Square): PieceRef {
  return { pieceId: piece.id, kind: piece.kind, player: piece.player, square: { row: square.row, col: square.col } };
}

function clearAffliction(mind: Mind) {
  delete mind.affliction;
  delete mind.fresh;
  delete mind.temporary;
  delete mind.turnsLeft;
  delete mind.penance;
}

// `mover` is the player whose turn it is: their own pieces get one extra tick, because the
// end of this very turn counts one down again.
function afflict(mind: Mind, piece: Piece, affliction: Affliction, temporary: boolean, mover: Player) {
  const ownTurn = piece.player === mover ? 1 : 0;
  mind.affliction = affliction;
  if (ownTurn) mind.fresh = true;
  if (temporary) mind.temporary = true;
  else delete mind.temporary;
  delete mind.turnsLeft;
  delete mind.penance;
  if (affliction === "devastated") mind.turnsLeft = DEVASTATION_TURNS + ownTurn;
  // VERIFIED (video 1): a guilt-ridden bishop takes one turn to clean its own conscience.
  if (piece.kind === "bishop" && (affliction === "guilty" || DEVASTATED_BISHOP_SELF_ABSOLVES)) {
    mind.penance = BISHOP_SELF_ABSOLVE_TURNS + ownTurn;
  }
}

// Everything Remorse Chess adds to a move. `before` is the position the move was played in and
// `moved` the board after it (as plain chess would leave it, with the turn already passed).
// Returns the position ready for whoever moves next: the same player again when a Sadist has
// earned an extra move, otherwise the opponent, with timers run and expired pieces removed.
// `events` collects what happened for the move log; pass null to skip that (the bot's search).
export function resolveMove(
  before: GameState,
  moved: GameState,
  move: Move,
  rng: Rng,
  events: GameEvent[] | null,
  hasMoveFor: (pending: GameState) => boolean
): GameState {
  const mover = move.player;
  const ruleSet = before.rules.ruleSet;
  const piece = moved.board[move.to.row][move.to.col];
  if (!piece) throw new Error("The moved piece is missing");
  const capture = move.captures[0];
  const victim = capture ? before.board[capture.row][capture.col] : null;

  let minds = before.minds;
  const edit = (id: string): Mind => {
    if (minds === before.minds) minds = { ...minds };
    const mind = { ...(minds[id] ?? {}) };
    minds[id] = mind;
    return mind;
  };

  // Zach's change: capturing the enemy king wins on the spot. Nobody rolls for it.
  if (victim && victim.kind === "king" && victim.player !== mover) {
    if (minds[victim.id]) {
      edit(victim.id);
      delete minds[victim.id];
    }
    const winner = mover === "white" ? "White" : "Black";
    const loser = mover === "white" ? "Black" : "White";
    return {
      ...moved,
      minds,
      extraMove: null,
      status: { phase: "won", winner: mover, reason: "king-captured", message: `${winner} captured ${loser}'s king` }
    };
  }

  let earnedExtraMove = false;

  if (capture && victim) {
    if (minds[victim.id]) {
      edit(victim.id);
      delete minds[victim.id];
    }
    const mind = edit(piece.id);
    mind.captures = (mind.captures ?? 0) + 1;

    // VERIFIED (video 5): a vendetta is spent on a capture of its target type.
    const usesVendetta = mind.vendetta !== undefined && mind.vendetta === victim.kind && victim.player !== mover;
    let rolledNow = false;
    if (usesVendetta) {
      delete mind.vendetta;
      events?.push({ type: "vendetta-used", piece: refOf(piece, move.to), target: victim.kind });
    }
    if (!usesVendetta || VENDETTA_CAPTURE_ROLLS) {
      if (ruleSet === "classic") {
        // VERIFIED (video 1): every capture makes the capturing piece guilt-ridden.
        afflict(mind, piece, "guilty", false, mover);
        events?.push({ type: "relapse", piece: refOf(piece, move.to), affliction: "guilty" });
      } else {
        if (!mind.reaction) {
          if (piece.kind === "king" && !KINGS_ROLL) {
            mind.reaction = "unaffected";
          } else {
            // VERIFIED (video 2): one D6 at the first capture, and that reaction is kept.
            const value = rollDie(rng);
            mind.reaction = captureReaction(value);
            rolledNow = true;
            events?.push({ type: "roll", cause: "capture", piece: refOf(piece, move.to), value, outcome: mind.reaction });
          }
        }
        if ((rolledNow || REACTION_RECURS) && (mind.reaction === "guilty" || mind.reaction === "devastated")) {
          afflict(mind, piece, mind.reaction, false, mover);
          if (!rolledNow) events?.push({ type: "relapse", piece: refOf(piece, move.to), affliction: mind.reaction });
        }
      }
    }

    if (mind.reaction === "sadist") {
      // VERIFIED (video 2): an extra move after a capture; bloodlust after three captures.
      earnedExtraMove = rolledNow ? EXTRA_MOVE_ON_THE_ROLL : true;
      if (!mind.bloodlust && mind.captures >= BLOODLUST_AFTER_CAPTURES) {
        mind.bloodlust = true;
        events?.push({ type: "bloodlust", piece: refOf(piece, move.to) });
      }
    }

    // VERIFIED (videos 4 and 5): the victim's comrades next to the capture each roll.
    if (ruleSet === "witnesses") {
      for (const square of adjacentSquares(capture)) {
        const witness = moved.board[square.row][square.col];
        if (!witness || witness.player !== victim.player || witness.id === piece.id) continue;
        const current = minds[witness.id];
        if (current?.reaction === "sadist") continue;
        if (witness.kind === "king" && !KINGS_ROLL) continue;
        if (current?.affliction === "devastated" && !DEVASTATED_WITNESSES_ROLL) continue;

        const value = rollDie(rng);
        const result = witnessReaction(value);
        let outcome: WitnessOutcome = "nothing";
        let target: PieceKind | undefined;
        if (result === "shaken") {
          if (!current?.affliction) {
            afflict(edit(witness.id), witness, "guilty", true, mover);
            outcome = "guilty";
          } else if (current.affliction === "guilty") {
            afflict(edit(witness.id), witness, "devastated", true, mover);
            outcome = "devastated";
          }
        } else if (result === "vendetta") {
          target = vendettaTarget(move.pieceKind);
          edit(witness.id).vendetta = target;
          outcome = "vendetta";
        }
        if (events) {
          const event: GameEvent = { type: "roll", cause: "witness", piece: refOf(witness, square), value, outcome };
          if (target) event.target = target;
          events.push(event);
        }
      }
    }
  }

  // A pawn that was guilt-ridden and has just become a bishop starts a bishop's penance.
  if (move.promotion === "bishop") {
    const mind = minds[piece.id];
    if (mind?.affliction === "guilty" && mind.penance === undefined) {
      edit(piece.id).penance = BISHOP_SELF_ABSOLVE_TURNS + 1;
    }
  }

  // VERIFIED (video 1): a bishop moved to a square adjacent to a guilt-ridden piece absolves it.
  if (piece.kind === "bishop" && (!move.promotion || PROMOTION_TO_BISHOP_ABSOLVES)) {
    const healthy = !minds[piece.id]?.affliction;
    if (healthy || !ABSOLVER_MUST_BE_HEALTHY) {
      const absolved: PieceRef[] = [];
      for (const square of adjacentSquares(move.to)) {
        const other = moved.board[square.row][square.col];
        if (!other || other.player !== mover || other.id === piece.id) continue;
        const affliction = minds[other.id]?.affliction;
        if (!affliction || (affliction === "devastated" && !ABSOLUTION_CLEARS_DEVASTATION)) continue;
        clearAffliction(edit(other.id));
        absolved.push(refOf(other, square));
      }
      if (absolved.length > 0) events?.push({ type: "absolved", by: refOf(piece, move.to), pieces: absolved });
    }
  }

  // VERIFIED (video 2): the extra move does not stack, so only the turn's first move earns one.
  if (earnedExtraMove && !before.extraMove) {
    const pending: GameState = {
      ...moved,
      minds,
      currentPlayer: mover,
      fullmoveNumber: before.fullmoveNumber,
      enPassant: null,
      extraMove: { pieceId: EXTRA_MOVE_SAME_PIECE ? piece.id : null }
    };
    if (hasMoveFor(pending)) {
      events?.push({ type: "extra-move", piece: refOf(piece, move.to) });
      return pending;
    }
  }

  return finishTurn({ ...moved, minds, extraMove: null }, mover, events);
}

// Ends a pending Sadist extra move without making it.
export function declineExtraMove(state: GameState, events: GameEvent[] | null): GameState {
  const mover = state.currentPlayer;
  return finishTurn(
    {
      ...state,
      currentPlayer: mover === "white" ? "black" : "white",
      fullmoveNumber: state.fullmoveNumber + (mover === "black" ? 1 : 0),
      enPassant: null,
      extraMove: null
    },
    mover,
    events
  );
}

// The end of `mover`'s turn. `state.currentPlayer` is already the opponent.
//  - the mover's afflicted pieces with a healthy friendly bishop beside them are absolved;
//  - the mover's guilt-ridden bishops do their penance and their devastated pieces tick down;
//  - the opponent's devastated pieces whose time is up remove themselves before the opponent moves.
function finishTurn(state: GameState, mover: Player, events: GameEvent[] | null): GameState {
  let timers = false;
  for (const id in state.minds) {
    const mind = state.minds[id];
    if (mind.turnsLeft !== undefined || mind.penance !== undefined || mind.affliction || mind.fresh) {
      timers = true;
      break;
    }
  }
  if (!timers) return state;

  let minds = state.minds;
  let board = state.board;
  let status: GameStatus = state.status;
  let removedAny = false;
  const edit = (id: string): Mind => {
    if (minds === state.minds) minds = { ...minds };
    const mind = { ...minds[id] };
    minds[id] = mind;
    return mind;
  };

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece) continue;
      const mind = minds[piece.id];
      if (!mind) continue;

      if (piece.player === mover) {
        // A bishop standing beside an afflicted piece absolves it (see interpretation.ts).
        if (STANDING_BISHOP_ABSOLVES && mind.affliction && !mind.fresh) {
          const bishop = standingAbsolver(state, minds, piece, { row, col });
          if (bishop && (mind.affliction !== "devastated" || ABSOLUTION_CLEARS_DEVASTATION)) {
            clearAffliction(edit(piece.id));
            events?.push({ type: "absolved", by: bishop, pieces: [refOf(piece, { row, col })] });
            continue;
          }
        }
        if (mind.fresh) delete edit(piece.id).fresh;
        if (mind.penance !== undefined) {
          const next = edit(piece.id);
          next.penance = mind.penance - 1;
          if (next.penance <= 0) {
            clearAffliction(next);
            events?.push({ type: "self-absolved", piece: refOf(piece, { row, col }) });
          }
        }
        if (mind.turnsLeft !== undefined) edit(piece.id).turnsLeft = mind.turnsLeft - 1;
        continue;
      }

      if (mind.affliction === "devastated" && (mind.turnsLeft ?? 0) <= 0) {
        if (piece.kind === "king" && !DEVASTATED_KING_LOSES) continue;
        if (board === state.board) board = board.slice();
        if (board[row] === state.board[row]) board[row] = board[row].slice();
        board[row][col] = null;
        edit(piece.id);
        delete minds[piece.id];
        removedAny = true;
        events?.push({ type: "removed", piece: refOf(piece, { row, col }) });
        if (piece.kind === "king") {
          const winner = mover === "white" ? "White" : "Black";
          const loser = mover === "white" ? "Black" : "White";
          status = {
            phase: "won",
            winner: mover,
            reason: "despair",
            message: `${loser}'s king was lost to despair. ${winner} wins`
          };
        }
      }
    }
  }

  if (minds === state.minds && board === state.board) return state;
  return { ...state, minds, board, status, halfmoveClock: removedAny ? 0 : state.halfmoveClock };
}

// A healthy friendly bishop next to `piece` (not the piece itself), or null.
function standingAbsolver(state: GameState, minds: Minds, piece: Piece, at: Square): PieceRef | null {
  for (const square of adjacentSquares(at)) {
    const other = state.board[square.row][square.col];
    if (!other || other.kind !== "bishop" || other.player !== piece.player || other.id === piece.id) continue;
    if (ABSOLVER_MUST_BE_HEALTHY && minds[other.id]?.affliction) continue;
    return refOf(other, square);
  }
  return null;
}

// A compact signature of a mind, for telling repeated positions apart.
export function mindSignature(mind: Mind): string {
  return (
    "~" +
    (mind.reaction ? mind.reaction[0] : "") +
    (mind.affliction ? (mind.affliction === "guilty" ? "G" : "D") + (mind.turnsLeft ?? "") + (mind.penance ?? "") : "") +
    (mind.bloodlust ? "B" : "") +
    (mind.vendetta ? "V" + mind.vendetta[0] + mind.vendetta[1] : "")
  );
}
