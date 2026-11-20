// Everything the room server needs from the game. The rooms, matchmaking, reconnects and chat
// in game-server.ts are game-agnostic; a different game provides this file's exports.
//
// The server also reads two fields off the state: `status.phase` ("playing" means the game is
// still going; anything else, a win or a draw, means it is finished) and `currentPlayer`.
// The state itself is sent to both clients as-is, so it must stay plain JSON.
//
// The engine is deterministic and has no clock. A variant that needs randomness or time should
// take them as arguments here (for example wrap applyMove to pass `Math.random` or `Date.now()`
// into the engine) so the server stays the single authority and the engine stays testable.
export {
  applyMove,
  createInitialState,
  normalizeRules,
  resignGame,
  type GameRules,
  type GameState,
  type Player
} from "../src/game";
import { normalizeRules, type GameRules } from "../src/game";

// Quick match only pairs players who asked for the same rules.
export function sameRules(a: GameRules, b: GameRules): boolean {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}
