# Chess (variant base)

A complete game of standard chess for the browser and for iOS/Android shells: play a bot, pass one device back and forth, or play online. It is the shared base that chess-variant games are forked from, so this README is short and neutral; each fork rewrites it.

Nothing here is deployed. The game-server URL, the Render service name and the web origin are placeholders marked `CHANGE-ME`.

## What is in it

- **Rules engine** (`src/game.ts`): full legal move generation (pins, check, checkmate, stalemate, castling, en passant, promotion and underpromotion), draws by threefold repetition, the fifty-move rule and insufficient material, FEN import and export, and standard algebraic notation. Original code, no chess library.
- **Bot** (`src/bot.ts`): alpha-beta search with iterative deepening and quiescence, at Easy, Medium and Hard, running in a web worker.
- **Online play** (`server/game-server.ts`): an authoritative Node + Socket.IO server with private rooms, quick match, reconnects, resign, rematch and quick-message chat. Players get generated names; nobody can type text another player sees.
- **Look**: one dark theme driven by design tokens (`src/theme/tokens.css`). The board, all twelve piece sprites and the home-screen scene are rendered from 3D models by a scripted three.js studio (`art/`).
- **Mobile shell**: Capacitor projects in `ios/` and `android/`, with a placeholder bundle ID.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces fit and exactly what a variant changes.

## Run locally

```bash
npm ci
npm run dev:multiplayer   # web app on http://127.0.0.1:4274 and game server on :4275
npm test                  # unit, perft, bot and server tests
npm run build             # type-check and production build
```

`npm run dev:local` runs only the web app (Pass & Play and the bot do not need the server). The server's health check is `GET /health`.

## Verification

**Automated (`npm test`):**
- `tests/perft.test.ts` counts move-generator leaf nodes against published values for five standard positions (the start position to depth 4, "Kiwipete" to depth 3, and positions 3, 4 and 5 from the Chess Programming Wiki).
- `tests/game.test.ts` covers checkmate, stalemate, every castling restriction, en passant (including the pinned capture), promotion, the three automatic draws, notation, FEN round-trips and the variant hooks.
- `tests/bot.test.ts` covers legal moves at every level, mate in one and two, not hanging or missing a queen, avoiding a draw by repetition when ahead, and the time budget.
- `tests/multiplayer.test.ts` runs a real Socket.IO server with real clients: rooms, joins, rejected out-of-turn moves, reconnects, disconnect grace, resignation, rematch, quick match, side choice and chat rules.
- `tests/names.test.ts` and `tests/nativeSafety.test.ts` cover generated names and the client-side free-text filter.

**Scripted browser checks (Playwright, need `npm run dev:multiplayer` running):**
- `node scripts/e2e-bots.mjs` plays, at desktop (1440×900) and phone (402×874) sizes, a whole game against the hard bot, a pass-and-play session with castling, check, scholar's mate and a draw by repetition, and a two-browser online game with chat, a promotion, a resignation and a rematch; then quick match with a bot while waiting.
- `node scripts/tour-screenshots.mjs http://localhost:4274 <dir>` walks every screen at both sizes, saves screenshots and fails on any console error.

**Not tested:** real phones, compiled native builds, the sound effects by ear, and bot strength against people.

## Art

```bash
npm run art            # board texture, every sprite, the home scene and the icon source
npm run mobile:icons   # app icons, splash screens and favicons
```

See [`art/README.md`](art/README.md).
