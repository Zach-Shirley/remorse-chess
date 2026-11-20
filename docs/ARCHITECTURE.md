# Architecture and fork notes

This repository is a complete game of standard chess, built to be forked into chess variants. This page says where the rules live, what a variant changes, and what it should leave alone.

## Layers

```
src/game.ts              rules engine (pure TypeScript, no UI)          the variant's main file
src/bot.ts               search + evaluation over the rules engine      search is generic, evaluate() is chess
server/rules.ts          the rules surface the room server uses         thin adapter
server/game-server.ts    rooms, matchmaking, reconnects, chat           shared, game-agnostic
src/multiplayer/         protocol types, socket client, name generator  shared
src/ui/                  board, pieces, player bars, dialogs, pickers   shared kit
src/components/          the three screens: home, local/bot, online     shared
src/theme/               all CSS; tokens.css holds every design token   restyle here
art/                     3D studio that renders the sprites             models + pipeline
scripts/                 browser end-to-end checks and screenshots      shared
```

The engine is deterministic and has no clock: the same state and move always give the same next state. The client, the bot and the server all run the same `src/game.ts`, so they cannot disagree about a rule.

## The rules engine (`src/game.ts`)

### State

`GameState` is plain JSON (it is sent to both clients as-is):

| Field | Meaning |
|---|---|
| `board` | 8×8 array of `Piece \| null`. Row 0 is rank 8, column 0 is the a-file. |
| `currentPlayer` | `"white"` or `"black"`. White moves first. |
| `castling`, `enPassant`, `halfmoveClock`, `fullmoveNumber` | the rest of a FEN |
| `positionCounts` | repetition counts since the last capture or pawn move |
| `rules` | the `GameRules` the game was created with |
| `moveLog` | one `MoveLogEntry` per half-move, with its SAN text in `notation` |
| `status` | `{ phase: "playing", check }`, `{ phase: "won", winner, reason }` or `{ phase: "draw", reason }`, each with a `message` |

A `Piece` is `{ id, player, kind }`. Ids are stable for the whole game, including through promotion; the UI keys its animations on them.

A `Move` has an `id` in long algebraic form (`"e2e4"`, `"e7e8q"`), the moving piece, `from`, `to`, `captures` (zero or one square, which differs from `to` only for en passant) and the optional `promotion`, `castle`, `rook` and `enPassant` fields.

### Two layers of move generation

```
getPseudoLegalMoves(state, player?, MoveGenOptions?)   how pieces move, no check rules at all
isSquareAttacked(state, square, byPlayer, AttackOptions?)
isLegalMove(state, move, AttackOptions?)               the check rules, built on isSquareAttacked
generateLegalMoves(state, player?, overrides?)         layer 1 filtered by layer 2
```

- **Layer 1** knows piece movement, captures, double pushes, en passant, promotion, and castling by rights and empty squares only.
- **Layer 2** knows that a king may not be left attacked, and that a king may not castle out of or through an attacked square.

Both layers take options, so a variant can recombine them without rewriting them:

| Option | Where | Effect |
|---|---|---|
| `canCapture(attacker, target, at, state)` | `MoveGenOptions` | which enemy pieces a piece may capture |
| `canMove(piece, from, state)` | `MoveGenOptions` | which pieces may move at all |
| `tacticalOnly` | `MoveGenOptions` | only captures and promotions (the bot's quiescence search) |
| `canAttack(piece, from, state)` | `AttackOptions` | which pieces count as attackers (others still block) |
| `isTransparent(piece, at, state)` | `AttackOptions` | pieces that sliding attacks pass through |
| `checkRules: false` | `LegalityOptions` | no check rules: every pseudo-legal move is legal |

### The variant seam

Everything that asks "what is legal here?" goes through one function:

```ts
export function variantOptions(state: GameState): LegalityOptions {
  return {};            // plain chess
}
```

`getLegalMoves`, `applyMove`, the status after each move (`evaluateStatus`) and the bot all read it. Two examples:

```ts
// Attacks that ignore certain pieces (they cannot give check, and cannot capture):
return {
  attacks: { canAttack: (piece) => !isStunned(state, piece) },
  moves: { canCapture: (attacker) => !isStunned(state, attacker) }
};

// No check rules at all (the king can be left en prise; decide the win in evaluateStatus):
return { checkRules: false };
```

With `checkRules: false` nothing ends the game by checkmate, so the variant also edits `evaluateStatus` (for example: a side with no king has lost).

### What else a rules change touches

- **New state** (a counter, a per-piece flag): add the field to `GameState`, initialise it in `fromFen`, and update it in `makeMove`. `makeMove` is the single place a move changes the position; `applyMove` wraps it with the legality check, the move log, the repetition count and the status.
- **New ways to end the game:** `evaluateStatus`. Add the reason to `GameStatus` and a title in `src/ui/GameOverDialog.tsx` (`DRAW_TITLES`, `resultTitle`).
- **A rules option:**
  1. add the field to `GameRules`, its default to `DEFAULT_GAME_RULES`, and its sanitising to `normalizeRules` (the server calls this on anything a client sends);
  2. read it in the engine as `state.rules.yourOption`;
  3. give the player a control. `HomePage` and `MultiplayerLobby` each hold a `rules` constant that is passed to every "start" callback: turn it into state and render a `setting-toggle` (the styles are in `base.css`). Quick match only pairs players whose rules are equal (`sameRules` in `server/rules.ts`), and `room:update-rules` lets a host change them before the second player joins.
- **Notation:** `sanWithoutSuffix` in the engine. The move list prints `MoveLogEntry.notation` verbatim.
- **Tests:** `tests/perft.test.ts` pins the standard move generator to published node counts. A variant that changes movement should keep a copy of those tests running against the unmodified options, and add its own.

## Randomness and clocks

The engine takes neither, on purpose: it must give the same answer on the client and on the server.

- **A variant that needs randomness** (a die, a shuffled start): the server is the authority. Generate the value in `server/rules.ts` (wrap `createInitialState` or `applyMove` there and pass the value, or a seed stored in `GameState`, into the engine as an argument). Local and bot games do the same in `LocalGamePage` with `Math.random`. Never call `Math.random` inside `src/game.ts`: the bot's search replays moves and would see different results each time.
- **A variant that needs a clock:** keep timestamps on the server's `GameRoom` (see `disconnectDeadlines` in `server/game-server.ts` for the pattern: a deadline in the snapshot, a `setTimeout` on the server, a countdown hook on the client) and have the server end the game by calling an engine function, the way `resignGame` is called when the disconnect grace runs out.

## The bot (`src/bot.ts`)

Iterative-deepening alpha-beta (negamax) with a quiescence search, check extensions and move ordering (captures by most valuable victim, promotions, checks). It reaches the engine only through `getLegalMoves`, `generateLegalMoves`, `makeMove`, `isInCheck` and `applyMove`, so it follows a variant's rules automatically.

Chess-specific and worth revisiting in a variant:
- `evaluate()`: material, piece-square tables, bishop pair, pawn shield, endgame pawn pushes;
- the terminal test in `Search.negamax` (no legal moves: checkmate if in check, otherwise a draw);
- `LEVEL_SETTINGS`: depth, time budget, noise and blunder chance per level.

It runs in a web worker (`src/botWorker.ts`, `src/botClient.ts`) so animations stay smooth.

## The server

`server/game-server.ts` stores the game state opaquely. It reads only `status.phase` (`"playing"` or not) and `currentPlayer`, and calls only what `server/rules.ts` exports: `applyMove`, `createInitialState`, `resignGame`, `normalizeRules`, `sameRules`. A draw finishes a room exactly like a win, and a rematch works after either.

It provides private rooms with six-character codes, quick match, a side choice for the room creator, per-tab reconnect tokens, a 30-second disconnect grace, rematch votes, quick-message-only chat, generated-name enforcement and private player IDs.

## The UI kit (`src/ui/`)

- **`Board`** draws `state.board`, flips for Black, and marks selection, legal targets, capture rings, the last move and the checked king. Every square carries `data-square` and `data-piece`, which the browser scripts use.
- **`PieceToken`** draws one piece and runs its slide or hop. Animation offsets are in cells. Knights hop, everything else slides, and castling slides the rook as the animation's `companion`.
- **`PromotionPicker`** opens when the clicked destination has more than one move (`movesTo` in `Board.tsx`).
- **`GameChrome`** has `PlayerBar`, `TurnStatus`, `MoveList` (numbered SAN pairs), `RulesDialog` and `SoundToggle`. The rules text is the `PIECE_RULES` and `RULE_NOTES` lists.
- `Modal`, `GameOverDialog`, `MaterialStrip`, `ColorPicker`, `BotLevelPicker`.

### Piece badges and square overlays

`Board` takes two optional props for per-piece status a variant wants to show:

```tsx
<Board
  ...
  pieceBadge={(piece, square) => (isStunned(state, piece) ? <Hourglass size={11} /> : null)}
  squareClassName={(square, piece) => (isTrap(state, square) ? "trap-square" : "")}
/>
```

- `pieceBadge` returns a small node drawn in the square's corner (`.piece-badge` in `game.css`); it travels with the piece during animations.
- `squareClassName` adds classes to the square button. Style them next to `.check-square` in `game.css`, using a `::before` layer like the last-move tint.

`Board` is rendered in two places, `LocalGamePage` and `OnlineGame` (in `MultiplayerPage.tsx`); pass the props in both. To swap a piece's artwork by state, extend `pieceSprite` in `PieceToken.tsx`.

## Theme tokens

All colours, radii, fonts, shadows and animation timings are CSS custom properties in **`src/theme/tokens.css`**. The other theme files only reference tokens:

- `base.css`: page, typography, buttons, toggles, segmented pickers, modals, toasts
- `game.css`: board, pieces and their animations, player bars, side panel, on-board overlays
- `screens.css`: home, lobby, waiting room, quick-match search

Two things live outside CSS and must be kept in step by hand:
- the board texture (`art/board.mjs` has the same two square colours as `--board-light` / `--board-dark`)
- piece materials (`SIDES` in `art/studio.js`)

Fonts are bundled with `@fontsource-variable/unbounded` (display) and `@fontsource-variable/inter` (body), imported in `src/main.tsx`.

## Identity checklist for a fork

Everything here is neutral or a marked placeholder. Search for `CHANGE-ME` and `chess-base`.

- `package.json` name; `index.html` title and description; `public/manifest.webmanifest`
- storage keys prefixed `chess-base:` (`src/playerIdentity.ts`, `src/sound.ts`, `src/components/MultiplayerPage.tsx`)
- `PRODUCTION_GAME_SERVER_URL` in `src/platform.ts`; the service name and client origin in `render.yaml`
- `capacitor.config.ts` (`appId`, `appName`), `android/app/build.gradle`, `android/app/src/main/res/values/strings.xml`, the Java package folder, the bundle ID in `ios/App/App.xcodeproj/project.pbxproj`, the display name in `ios/App/App/Info.plist`, `codemagic.yaml`
- the home screen copy in `src/components/HomePage.tsx`, and the `service` name in the server's `/health` response
- `store/` templates, `README.md`
- dev ports 4274 (web) and 4275 (game server): `package.json`, `server/game-server.ts`, `src/multiplayer/socket.ts`, the scripts' defaults. Change them if two forks run side by side.
- the icon: `art/piece-icon.png` (rendered by `art/render.mjs`), then `npm run mobile:icons`
