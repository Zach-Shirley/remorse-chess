# Architecture and reuse notes

Knight Checkers is built so the same shell can host another two-player board game. This page says what is game-specific, what is shared, and where the seams are.

## Layers

```
src/game.ts              rules engine (pure TypeScript, no UI)          GAME-SPECIFIC
src/bot.ts               search + evaluation over the rules engine      mostly generic, evaluate() is game-specific
server/rules.ts          the rules surface the room server uses         GAME-SPECIFIC (thin adapter)
server/game-server.ts    rooms, matchmaking, reconnects, chat           shared
src/multiplayer/         protocol types, socket client, name generator  shared
src/ui/                  board, pieces, player bars, dialogs, pickers   shared (PieceToken's sprite table is game-specific)
src/components/          the three screens: home, local/bot, online     shared
src/theme/               all CSS; tokens.css holds every design token   shared, restyle here
art/                     3D studio that renders the sprites             game-specific models, shared pipeline
```

## What a new game replaces

1. **`src/game.ts`.** Keep the exported shape and most of the shell works unchanged:
   - types `GameState`, `Move`, `MoveLogEntry`, `Piece`, `Player`, `Square`, `GameRules`
   - `createInitialState(rules)`, `getLegalMoves(state)`, `applyMove(state, moveId)`, `resignGame(state, player)`
   - helpers the UI calls: `getPieceAt`, `isDarkSquare`, `squareName`, `pieceName`, `playerName`, `opponentOf`, `getMaterial`
   - `GameState` fields the shell reads: `board`, `currentPlayer`, `status` (`phase`, `winner`, `message`), `moveLog`, `rules`
   - Checkers-only fields the shell also reads: `forcedPieceId` and `canEndJump` (multi-jumps) and `knightCooldown` (resting knights). A game without them can leave them `null` / `false` / zero.
2. **`server/rules.ts`.** Re-export the new game's `applyMove`, `createInitialState`, `resignGame`, an `endTurnEarly` (or a function that throws) and `normalizeRules`. Nothing else on the server knows the rules.
3. **`src/ui/PieceToken.tsx`.** The `SPRITES` table maps `player` × `kind` to an image. Add the new piece kinds here.
4. **`art/`.** `art/studio.js` builds the 3D models and `art/render.mjs` writes `src/assets/pieces/*.webp`, the home backdrop and the icon source. Replace the models; keep the pipeline (`npm run art`).
5. **`evaluate()` in `src/bot.ts`.** The alpha-beta search, iterative deepening, quiescence and difficulty levels work for any game with the rules shape above. The evaluation function and piece values are checkers-specific.
6. **Copy.** The rules text in `src/ui/GameChrome.tsx` (`RULES`), the home screen strings, `QUICK_CHAT_MESSAGES` if wanted, and the "Force checker captures" toggle (the only game rule option; it appears in `HomePage`, `LocalGamePage` and `MultiplayerPage`).
7. **Identity strings.** Storage keys prefixed `knight-checkers:` (`src/playerIdentity.ts`, `src/sound.ts`, `MultiplayerPage`), `capacitor.config.ts`, `render.yaml`, `PRODUCTION_GAME_SERVER_URL` in `src/platform.ts`, `public/manifest.webmanifest`, `index.html`.

## What a new game keeps

- **Server room code** (`server/game-server.ts`): private rooms with six-character codes, quick match, colour choice, per-tab reconnect tokens, the 30-second disconnect grace, rematch votes, quick-message-only chat, generated-name enforcement, private player IDs. It stores the game state opaquely and only calls the functions in `server/rules.ts`.
- **Multiplayer client** (`src/multiplayer/`, `MultiplayerPage`): lobby, waiting room, queue with "play a bot while waiting", the online game screen and its pause/result overlays.
- **UI kit** (`src/ui/`):
  - `Board` draws any 8×8 `state.board`, handles perspective flipping, selection, legal-move markers, last-move tint and the move animations. Board size comes from `BOARD_SIZE`.
  - `PieceToken` draws one piece and runs its slide/hop animation. Animation offsets are in cells, so they work at any board size.
  - `GameChrome` has `PlayerBar`, `TurnStatus`, `MoveList`, `RulesDialog`, `SoundToggle`.
  - `Modal`, `GameOverDialog`, `MaterialStrip`, `ColorPicker`, `BotLevelPicker`.
- **Sounds** (`src/sound.ts`): synthesized, no audio files.
- **Mobile shell**: Capacitor projects in `ios/` and `android/`, `codemagic.yaml`, icon and splash generation (`npm run mobile:icons`).
- **Scripts**: `scripts/e2e-bots.mjs` (browser end-to-end checks), `scripts/tour-screenshots.mjs` (every screen at desktop and phone size), `scripts/store-screenshots.mjs`.

## Theme tokens

All colours, radii, fonts, shadows and animation timings are CSS custom properties in **`src/theme/tokens.css`**. The other theme files only reference tokens:

- `base.css`: page, typography, buttons, toggles, segmented pickers, modals, toasts
- `game.css`: board, pieces and their animations, player bars, side panel, on-board overlays
- `screens.css`: home, lobby, waiting room, quick-match search

Two things live outside CSS and must be kept in step by hand:
- the board texture (`art/board.mjs` has the same two square colours as `--board-light` / `--board-dark`)
- piece materials (`SIDES` in `art/studio.js`)

Fonts are bundled with `@fontsource-variable/unbounded` (display) and `@fontsource-variable/inter` (body), imported in `src/main.tsx`.

## Known couplings worth fixing if a second game lands here

- `GameRules` has one field (`forceCheckerCaptures`) and three screens render its toggle directly. A second game should turn that into a small rules-options component.
- `Board` reads `state.knightCooldown` to show the resting badge. A generic "piece status" hook on the game module would remove that.
- The move list builds its short notation from `from`/`to`/`captured`; games with drops or castling need their own formatter.
