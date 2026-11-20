// Review sheet: every sprite on both board colours, large and at phone size (44px squares).
// Usage: node art/contact-sheet.mjs [darkHex] [lightHex]   → art/out/contact-sheet.png
import sharp from "sharp";

const [dark = "#476078", light = "#d4c4a4"] = process.argv.slice(2);
const kinds = ["pawn", "rook", "knight", "bishop", "queen", "king"];
const sides = ["white", "black"];
const big = 200, small = 44;
const width = big * kinds.length;
const smallTop = big * 4 + 20;
const height = smallTop + small * 4 + 20;
const tiles = [];
const layers = [];
const sprite = (name, size) => sharp(`src/assets/pieces/${name}.webp`).resize(size, size).toBuffer();

for (const [k, kind] of kinds.entries()) {
  for (const [s, side] of sides.entries()) {
    const name = `${kind}-${side}`;
    for (const [f, fill] of [light, dark].entries()) {
      // Large: four rows (white on light, white on dark, black on light, black on dark).
      const row = s * 2 + f;
      tiles.push(`<rect x="${k * big}" y="${row * big}" width="${big}" height="${big}" fill="${fill}"/>`);
      layers.push({ input: await sprite(name, big), left: k * big, top: row * big });
      // Phone size: the same grid at 44px, laid out as a little checkerboard strip.
      const x = 20 + k * small * 2 + f * small, y = smallTop + (s * 2) * small;
      tiles.push(`<rect x="${x}" y="${y}" width="${small}" height="${small}" fill="${fill}"/>`);
      layers.push({ input: await sprite(name, small), left: x, top: y });
      const x2 = 20 + k * small * 2 + (1 - f) * small;
      tiles.push(`<rect x="${x2}" y="${y + small}" width="${small}" height="${small}" fill="${fill}"/>`);
      layers.push({ input: await sprite(`${kinds[(k + 3) % kinds.length]}-${side}`, small), left: x2, top: y + small });
    }
  }
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#120c0e"/>${tiles.join("")}</svg>`))
  .composite(layers)
  .png()
  .toFile("art/out/contact-sheet.png");
console.log("art/out/contact-sheet.png");
