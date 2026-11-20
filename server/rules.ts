// Everything the room server needs from the game. The rooms, matchmaking, reconnects and chat
// in game-server.ts are game-agnostic; a different game provides this file's exports.
//
// The server also reads three fields off the state: `status.phase` ("playing" | "won"),
// `currentPlayer`, and (through the snapshot) whatever the client needs to draw.
export {
  applyMove,
  createInitialState,
  // Ends a turn early when the game allows it (here: declining to continue a multi-jump).
  endOptionalJump as endTurnEarly,
  resignGame,
  type GameRules,
  type GameState,
  type Player
} from "../src/game";
import type { GameRules } from "../src/game";

// Sanitises rules received from a client.
export function normalizeRules(rules: GameRules): GameRules {
  return { forceCheckerCaptures: Boolean(rules?.forceCheckerCaptures) };
}
