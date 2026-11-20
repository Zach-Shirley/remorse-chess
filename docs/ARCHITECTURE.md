# Architecture

Remorse Chess is a standard chess engine with one variant layered on it, a bot, a room server and a shared UI kit. This page says where each rule lives and how the parts depend on each other.

## Layers

```
src/game.ts                   chess engine: moves, check, draws, notation; calls the variant
src/variant/interpretation.ts every ruling the creator's videos leave open, as named constants
src/variant/remorse.ts        consciences, dice, what a move sets off, who may capture and check
src/variant/describe.ts       words for statuses and events (toasts, move list, screen readers)
src/variant/rulesText.ts      the rules as shown in the rules dialog, with their video sources
src/bot.ts                    search + evaluation over the engine
src/dice.ts                   dice for games on this device (Math.random, scriptable by address)
server/rules.ts               what the room server uses from the game, and the server's dice
server/game-server.ts         rooms, matchmaking, reconnects, chat (game-agnostic)
src/multiplayer/              protocol types, socket client, name generator
src/ui/                       board, pieces, player bars, dialogs, pickers; Conscience.tsx
src/components/               the three screens: home, local/bot, online
src/theme/                    all CSS; tokens.css holds every design token; remorse.css the variant's
art/                          3D studio that renders the sprites, hero and icon
scripts/                      browser end-to-end checks and screenshots
```

The client, the bot and the server all run the same `src/game.ts`, so they cannot disagree about a rule.

## Where each kind of rule lives

| Kind | Where | Example |
|---|---|---|
| What the creator says | `src/variant/remorse.ts`, marked `VERIFIED (video n)` | the capture table `captureReaction`, the witness table `witnessReaction` |
| What he leaves open | `src/variant/interpretation.ts` only | `ADJACENCY = 8`, `DEVASTATION_TURNS`, `EXTRA_MOVE_IS_OPTIONAL` |
| The same, in words | `src/variant/rulesText.ts` (`RULES_BY_SET`, `INTERPRETATIONS`) and the README | the rules dialog renders these lists |

`remorse.ts` never decides an open question itself: it reads a constant from `interpretation.ts`. Changing a ruling means editing that constant, the matching sentence in `rulesText.ts` and the README table, and the test that pins it in `tests/remorse.test.ts`.

## State

`GameState` is plain JSON (it is sent to both clients as-is).

| Field | Meaning |
|---|---|
| `board` | 8×8 array of `Piece \| null`. Row 0 is rank 8, column 0 is the a-file. |
| `currentPlayer`, `castling`, `enPassant`, `halfmoveClock`, `fullmoveNumber` | as in a FEN |
| `positionCounts` | repetition counts since the last irreversible move; the key includes the consciences |
| `rules` | `{ ruleSet: "classic" \| "reactions" \| "witnesses" }` (`"plain"` exists for tests only) |
| `minds` | the consciences, by piece id; only pieces with something on their mind have an entry |
| `extraMove` | set while a Sadist's extra move is pending: the same player is still to move |
| `moveLog` | one entry per move, with its SAN `notation` and the `events` it set off |
| `lastEvents`, `actionCount` | what the latest action set off, and a counter so the UI shows each event once |
| `status` | playing / won (`checkmate`, `resignation`, `despair`) / draw |

A `Mind` holds `reaction` (the lifelong die result), `affliction` (`guilty` or `devastated`), `temporary` (it came from witnessing), `turnsLeft` (devastation countdown), `penance` (a bishop's self-absolution), `captures`, `bloodlust` and `vendetta` (a piece kind).

A `GameEvent` is one of: `roll` (cause `capture` or `witness`, with the piece, the value and the outcome), `relapse` (guilt or devastation without a die), `absolved`, `self-absolved`, `removed`, `bloodlust`, `vendetta-used`, `extra-move`.

## How a move is played

```
applyMove(state, moveId, rng)
  getLegalMoves                      layer 1 (piece movement) filtered by layer 2 (check rules),
                                     both under REMORSE_OPTIONS
  makeBoardMove                      standard chess: the pieces, castling rights, en passant, clocks
  resolveMove (remorse.ts)           1. the capturer: vendetta spent, or reaction rolled/re-applied
                                     2. witnesses roll (Witnesses only), in board order
                                     3. a healthy bishop that just landed absolves its neighbours
                                     4. a Sadist's first capture of the turn: extra move pending, stop
                                     5. otherwise finishTurn: the mover's penances and countdowns
                                        tick; the opponent's expired pieces remove themselves
  evaluateStatus                     check, checkmate, stalemate and draws for whoever moves next
```

`applyMove(state, PASS_MOVE_ID)` ends a pending extra move (step 5 only). `makeMove` is the same pipeline without the log and status, for the bot's search.

### The seam into move generation

The chess generator takes options, and Remorse Chess is one options object (`REMORSE_OPTIONS` in `remorse.ts`, returned by `variantOptions` in `game.ts`):

| Option | Layer | Remorse Chess uses it for |
|---|---|---|
| `canMove` | moves | devastated pieces cannot move; during an extra move only the Sadist may |
| `canCapture` | moves | guilt-ridden pieces capture nothing (except a vendetta's target); nothing captures a king |
| `canCaptureFriendly` | moves | bloodlust |
| `capturesOnly` | moves | bloodlust |
| `canAttack` | attacks | guilt-ridden and devastated pieces give no check and do not stop castling |

Legality (`isLegalMove`) only needs the bare board move: no die can make an enemy piece more dangerous to the mover's king, so whether a move is legal never depends on a roll.

`PLAIN_CHESS_RULES` switches all of this off. `tests/plain.ts` wraps the engine with it so the perft and standard-chess tests keep checking the generator itself.

## Dice

The engine never calls `Math.random`. `applyMove` and `makeMove` take an `Rng` (a function shaped like `Math.random`), and `rollDie` turns it into a face.

- **Online:** `server/game-server.ts` passes `serverDice` (Node's `crypto.randomInt`) into `applyMove`. A client sends a move id and nothing else. `createGameServer(…, { dice })` lets a test script the rolls.
- **Local and bot games:** `LocalGamePage` passes `createLocalDice()` from `src/dice.ts`: `Math.random`, or the faces listed in the address (`/local?dice=2,4`) followed by `Math.random`. `/local?rules=witnesses` picks the rule set the same way. The browser scripts use both.
- **No dice passed:** `MODEL_DICE`, where every die shows 3. This is the bot's search model (see below) and is also right for Classic, which has no dice.
- **Tests:** `scriptedDice(1, 5, …)` shows the given faces and throws when it runs out, so a test also proves that no unexpected roll happened.

## The bot (`src/bot.ts`)

Iterative-deepening alpha-beta (negamax) with a quiescence search, check extensions and move ordering.

- **Randomness.** The search does not branch on dice. It runs on `MODEL_DICE`: a piece making its first capture is assumed to come out guilt-ridden, witnesses are assumed not to react, and pieces whose reaction is already known behave exactly. The real dice are rolled when the chosen move is played. The bot is therefore exact in Classic and optimistic about nothing: it never counts on a 4, 5 or 6.
- **Extra moves.** After a Sadist's capture the same side is to move, so the search keeps the same point of view and window for that child instead of negating, and adds "end the turn" (`passExtraMove`) as a child. `chooseBotAction` can return `PASS_MOVE_ID`.
- **Evaluation.** Chess material and piece-square tables, with each piece's value adjusted by its conscience (`mindValue`): guilt costs part of the value, devastation more as the countdown runs out, a Sadist is a small plus, bloodlust a liability, and a devastated king is priced directly.
- **Levels.** `LEVEL_SETTINGS`: depth, time budget (Hard: 900 ms), noise and blunder chance.

It runs in a web worker (`src/botWorker.ts`, `src/botClient.ts`).

## The server

`server/game-server.ts` stores the game state opaquely. It reads only `status.phase` and `currentPlayer`, and calls only what `server/rules.ts` exports. Because a pending extra move leaves `currentPlayer` unchanged, the "is it your turn" check needs nothing special.

`normalizeRules` sanitises whatever rule set a client sends (and never accepts `"plain"`). Quick match pairs players whose normalised rules are equal (`sameRules`). The room snapshot carries `rules`, which the client shows to the player who joins.

## The UI

Shared kit (`src/ui/`): `Board`, `PieceToken`, `PromotionPicker`, `GameChrome` (`PlayerBar`, `TurnStatus`, `MoveList`, `SoundToggle`), `Modal`, `GameOverDialog`, `MaterialStrip`, `ColorPicker`, `BotLevelPicker`.

The variant's UI is in two files:

- **`src/ui/Conscience.tsx`**
  - `conscienceBadge(mind)`: the tokens under a piece, passed to `Board`'s `pieceBadge`.
  - `conscienceSquareClass`, `conscienceAria`: passed to `Board`'s `squareClassName` and `pieceStatus` (which also sets `data-status` on the square for the browser scripts).
  - `EventFeed`: the roll card. It shows `state.lastEvents` whenever `state.actionCount` rises, and plays the dice, absolution and despair sounds.
  - `ConscienceNote`: the tapped piece's status in sentences.
  - `RuleSetPicker`, `useRuleSetChoice` (remembered under `remorse-chess:rule-set`), `RuleSetChip`, `TokenLegend`, `Die`, `EventChip`.
- **`src/ui/RulesDialog.tsx`**: the rules by rule set with a source link on each rule, the legend, the interpretation list, the credit, and standard chess in brief. It marks which rule sets are in play when opened from a game.

`Board` is rendered in `LocalGamePage` and in `OnlineGame` (inside `MultiplayerPage.tsx`); both pass the same three props, render `EventFeed`, and offer End turn through `TurnStatus`'s `action` slot when `canPass(state)`.

The move list groups entries by turn and side, so a Sadist's two moves share a cell, and draws an `EventChip` for each event next to the move that caused it.

## Theme tokens

All colours, radii, fonts, shadows and timings are CSS custom properties in `src/theme/tokens.css`. The accent is a deep violet (`--accent`, `--accent-bright`, `--accent-deep`); amber is reserved for "your attention here". The status tokens have their own group (`--guilt`, `--devastated`, `--sadist`, `--bloodlust`, `--unaffected`, `--vendetta`, `--absolved`, each with an `-ink` partner), used by `remorse.css`.

Two things live outside CSS and are kept in step by hand: the board texture (`art/board.mjs` has the same square colours as `--board-light` / `--board-dark`) and the icon colours in `scripts/make-app-icon.mjs`.

## Identity

- Package `remorse-chess`; storage keys prefixed `remorse-chess:` (identity, mute, rule set, online session).
- `PRODUCTION_GAME_SERVER_URL` in `src/platform.ts` and the service name and first client origin in `render.yaml` are best guesses until the game is deployed.
- App ID `com.example.remorsechess` is a placeholder (`capacitor.config.ts`, `android/app/build.gradle`, Android `strings.xml` and package folder, the iOS project, `codemagic.yaml`). It becomes permanent at the first store upload.
- Dev ports: 4274 (web), 4275 (game server), 4190 (art studio).
