// The engine with standard chess as the default rules, for the standard-chess, perft and
// bot-tactics tests inherited from the chess base. Remorse Chess has its own tests.
import * as game from "../src/game";

export * from "../src/game";

export function createInitialState(rules: game.GameRules = game.PLAIN_CHESS_RULES): game.GameState {
  return game.createInitialState(rules);
}

export function fromFen(fen: string, rules: game.GameRules = game.PLAIN_CHESS_RULES): game.GameState {
  return game.fromFen(fen, rules);
}
