// Renders the board surface (slate and bone squares with a light stone grain) to one image.
// Usage: node art/board.mjs   → src/assets/board.webp
// The colours here must match --board-light / --board-dark in src/theme/tokens.css.
import sharp from "sharp";

const LIGHT = "#d4c4a4";
const DARK = "#476078";
const size = 1200;
const cell = size / 8;

let squares = "";
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const dark = (row + col) % 2 === 1;
    const x = col * cell, y = row * cell;
    squares += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${dark ? DARK : LIGHT}"/>`;
    // Soft shading toward each square's edges, so tiles read as inlaid rather than printed.
    squares += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="url(#${dark ? "shadeDark" : "shadeLight"})"/>`;
    squares += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="none" stroke="rgba(0,0,0,${dark ? 0.28 : 0.16})" stroke-width="1"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="shadeLight" cx="50%" cy="45%" r="75%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#3a2a1a" stop-opacity="0.16"/>
    </radialGradient>
    <radialGradient id="shadeDark" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="#9fc0d8" stop-opacity="0.10"/>
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.26"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="7"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.5 0.5 0 0 -0.42"/>
    </filter>
    <filter id="veins" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="4" seed="21"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.38"/>
    </filter>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.10"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
    </linearGradient>
  </defs>
  ${squares}
  <rect width="${size}" height="${size}" filter="url(#veins)" opacity="0.5"/>
  <rect width="${size}" height="${size}" filter="url(#grain)" opacity="0.4"/>
  <rect width="${size}" height="${size}" fill="url(#sheen)"/>
</svg>`;

await sharp(Buffer.from(svg)).webp({ quality: 72 }).toFile("src/assets/board.webp");
await sharp(Buffer.from(svg)).resize(800).png().toFile("art/out/board.png");
console.log("src/assets/board.webp");
