# Piece Art

Every piece, the board and the home-screen scene are rendered from 3D models, not drawn by hand.

- `shapes.mjs`: the knight's outline and the line of its mane, as SVG-style paths.
- `studio.js`: the three.js scene. It builds the six pieces and lights them like a product photo.
  - Pawn, rook, bishop, queen and king are turned on a lathe (`turnedBody`): the same pedestal and gold collar, a stem, then the top that identifies the piece. The rook has five battlements, the bishop a mitre with a diagonal cut (made with clipping planes, showing a contrasting core), the queen a pointed coronet with a gold ball, the king a crown with a gold cross.
  - The knight is its outline extruded and rounded, with a carved mane, on the same pedestal.
  - Two sides: `white` is warm ivory lacquer, `black` is obsidian lacquer.
  - Every sprite shares one camera frame sized for the king and one floor line, so the pieces keep their relative heights on the board (king tallest, pawn shortest).
- `render.mjs`: runs the studio in headless Chromium (Playwright, port 4190) and writes the app's assets:
  - `src/assets/pieces/<kind>-<side>.webp`: twelve 288px sprites with a baked contact shadow and a thin dark halo (stronger on ivory, so it stays readable on light squares)
  - `src/assets/hero.webp`, `hero-tall.webp`: home-screen backdrops, a middlegame on a 3D board
  - `art/piece-icon.png`: source for the app icon
- `board.mjs`: renders the board surface to `src/assets/board.webp`.
- `contact-sheet.mjs`: review sheet of every sprite on both square colours, large and at 44px (`art/out/`, not committed).
- `preview-outline.mjs`: fast 2D check of the knight outline.

## Re-rendering

```bash
npm run art                                   # board + every sprite + hero shots + icon source
node art/render.mjs queen-white queen-black   # just some sprites
node art/contact-sheet.mjs                    # then look at art/out/contact-sheet.png
npm run mobile:icons                          # app icons, splash screens and favicons from art/piece-icon.png
```

## Changing the look

- Piece colours and gloss: `SIDES` in `studio.js` (`light` and `env` balance the exposure of the pale and dark sides).
- Proportions: each `build<Piece>` function's profile; `STOCKY` widens all lathed pieces; `KNIGHT_SCALE` sizes the knight; `SPRITE_HALF` is the shared frame.
- The bishop's cut: `BISHOP_CUT`.
- Board colours: `LIGHT` / `DARK` in `board.mjs`, mirrored by `--board-light` / `--board-dark` in `src/theme/tokens.css` and by the icon colours in `scripts/make-app-icon.mjs` and the `mobile:icons` script.
- Knight shape: `KNIGHT_HEAD` in `shapes.mjs`. Check it in 2D first with `node art/preview-outline.mjs`.
- How large pieces sit in their squares: `.piece-art` in `src/theme/game.css`.

## Adding a piece or a piece state

Add a builder to `BUILDERS` in `studio.js`, add its name to `KINDS` in `render.mjs`, render it, and add the sprite to the `SPRITES` table in `src/ui/PieceToken.tsx`. For a variant state of an existing piece (a dulled or marked version), add a side-like entry to `SIDES` and render it under its own name.
