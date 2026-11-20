// Everything the room server needs from the game. The rooms, matchmaking, reconnects and chat
// in game-server.ts are game-agnostic; a different game provides this file's exports.
//
// The server also reads two fields off the state: `status.phase` ("playing" means the game is
// still going; anything else, a win or a draw, means it is finished) and `currentPlayer`.
// The state itself is sent to both clients as-is, so it must stay plain JSON.
//
// The engine has no randomness of its own: applyMove takes the dice as an argument. For online
// games the server is the only one that rolls (serverDice below), so neither player can choose
// or predict a result, and both clients receive the rolls inside the game state's move log.
import { randomInt } from "node:crypto";

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

// Numbers in [0, 1) from the operating system's secure generator, shaped like Math.random.
export function serverDice(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

// Quick match only pairs players who asked for the same rules (the same rule set).
export function sameRules(a: GameRules, b: GameRules): boolean {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}
