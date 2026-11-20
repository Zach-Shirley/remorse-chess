// Review sheet: every sprite on board-coloured tiles at large and phone size.
// Usage: node art/contact-sheet.mjs [darkHex] [lightHex]   → art/out/contact-sheet.png
import sharp from "sharp";

const [dark = "#3d5466", light = "#e4d9c6"] = process.argv.slice(2);
const names = ["checker-red", "king-red", "knight-red", "knight-red-rest", "checker-black", "king-black", "knight-black", "knight-black-rest"];
const big = 240, small = 52;
const width = big * 4, height = big * 2 + small * 2 + 30;
const tiles = [];
const layers = [];
for (const [i, name] of names.entries()) {
  const col = i % 4, row = Math.floor(i / 4);
  // Checkers only ever stand on dark squares; knights visit both.
  const onDark = !name.startsWith("knight") || (col + row) % 2 === 0;
  tiles.push(`<rect x="${col * big}" y="${row * big}" width="${big}" height="${big}" fill="${onDark ? dark : light}"/>`);
  layers.push({ input: await sharp(`src/assets/pieces/${name}.webp`).resize(big, big).toBuffer(), left: col * big, top: row * big });
  for (const [j, fill] of [dark, light].entries()) {
    const x = (i * 2 + j) * small + 20, y = big * 2 + 15 + (i >= 4 ? 0 : 0);
    if (x + small > width) continue;
    tiles.push(`<rect x="${x}" y="${y}" width="${small}" height="${small}" fill="${fill}"/>`);
    layers.push({ input: await sharp(`src/assets/pieces/${name}.webp`).resize(small, small).toBuffer(), left: x, top: y });
  }
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#120c0e"/>${tiles.join("")}</svg>`))
  .composite(layers)
  .png()
  .toFile("art/out/contact-sheet.png");
console.log("art/out/contact-sheet.png");
