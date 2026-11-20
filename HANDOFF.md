# Handoff (written 2026-11-19, session cut short by a usage limit)

## Done

- Rules engine for the three rule sets (Classic, Reactions, Witnesses): `src/game.ts`, `src/variant/remorse.ts`. Every open ruling is in `src/variant/interpretation.ts`. Dice are injected into `applyMove`; the server rolls online (`server/rules.ts`, `server/game-server.ts`).
- Bot handles the rules with a documented outcome model (every die shows 3) and the Sadist's extra move / pass.
- UI: status tokens, roll card, dice sound, move-list chips, End turn, selected-piece note, rule-set picker (home bot and local dialogs, lobby), rule set shown in game and waiting room, rules dialog with sources, legend, interpretation list and credit.
- Identity strings, violet theme, icon (ivory bishop), hero, splash screens.
- README, `docs/ARCHITECTURE.md`, `art/README.md`, store drafts.
- Tests: `tests/remorse.test.ts`, `tests/remorse-bot.test.ts`, additions to `tests/multiplayer.test.ts`; base tests run under plain chess via `tests/plain.ts`.
- Browser scripts rewritten: `scripts/e2e-bots.mjs` (last run: 189 PASS, 0 FAIL, no console errors) and `scripts/tour-screenshots.mjs` (last run: no console errors; screenshots looked at, desktop and phone).

## Last verified state

- `npx tsc --noEmit` and `npm run build`: passed after the last source change.
- `npm test`: the last full run was before the final small edits (server log line, video labels, added multiplayer tests). It showed 196 of 197 passing; the one failure was a clock-dependent bot test ("hard beats easy in Witnesses") that has since been loosened. The multiplayer file passed alone afterwards (16 tests). **The full suite was not re-run after that. Run `npm test` first.**

## Remains

1. Run `npm test`, then put the real test count in `README.md` in place of the literal text `TEST_COUNT`.
2. `README.md` still has `LIVE_URL_PLACEHOLDER` and references to `docs/screenshots/*.png`, which do not exist yet: run `node scripts/tour-screenshots.mjs http://localhost:4274 docs/screenshots` with `npm run dev:multiplayer` running.
3. `render.yaml`'s first client origin (`https://remorse-chess.vercel.app`) and `PRODUCTION_GAME_SERVER_URL` are guesses until deployment.
4. Not pushed, not deployed, no repo created (by instruction).
5. Never tested: real phones, native builds, sounds by ear, balance with real players.

## Known rough edges

- Undo in local and bot games re-rolls the dice.
- The `tests/remorse-bot.test.ts` strength tests use a wall-clock search limit and can be flaky on a loaded machine.
