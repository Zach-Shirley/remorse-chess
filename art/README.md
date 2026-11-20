# Piece Art

Every piece, the board and the home-screen scene are rendered from 3D models, not drawn by hand.

- `shapes.mjs`: the knight outline, the line of its mane and the crown emblem, as SVG-style paths.
- `studio.js`: the three.js scene. It builds the checker (a lathed disc with a fluted edge), the king (two stacked discs with a gold crown inlay), the knight (the outline extruded and rounded, with a carved mane, on a turned base) and a full 3D board for the hero shot, then lights them like a product photo.
- `render.mjs`: runs the studio in headless Chromium (Playwright) and writes the app's assets:
  - `src/assets/pieces/*.webp`: 288px sprites with a baked contact shadow
  - `src/assets/hero.webp`, `hero-tall.webp`: home-screen backdrops
  - `art/knight-icon.png`: source for the app icon
- `board.mjs`: renders the board surface to `src/assets/board.webp`.
- `contact-sheet.mjs`, `preview-outline.mjs`: review tools (`art/out/`, not committed).

## Re-rendering

```bash
npm run art            # board + every sprite + hero shots
node art/render.mjs knight-red knight-black   # just some sprites
npm run mobile:icons   # app icons, splash screens and favicons from art/knight-icon.png
```

## Changing the look

- Piece colours and gloss: `SIDES` in `studio.js`.
- Board colours: `LIGHT` / `DARK` in `board.mjs`, mirrored by `--board-light` / `--board-dark` in `src/theme/tokens.css`.
- Knight shape: `KNIGHT_HEAD` in `shapes.mjs`. Check it in 2D first with `node art/preview-outline.mjs`.
