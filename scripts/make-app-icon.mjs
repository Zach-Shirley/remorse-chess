// Renders the source images @capacitor/assets turns into every iOS/Android icon and splash size.
// The piece comes from art/piece-icon.png, a 1024px render from art/studio.js.
// Run: npm run mobile:icons
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const dark = "#476078";
const light = "#d4c4a4";
const night = "#0a0607";

// A 2x2 board corner. Apple masks the corners itself, so no rounding here.
const board = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="512" height="512" fill="${light}"/>
  <rect x="512" width="512" height="512" fill="${dark}"/>
  <rect y="512" width="512" height="512" fill="${dark}"/>
  <rect x="512" y="512" width="512" height="512" fill="${light}"/>
</svg>`);

async function knightLayer(source, size) {
  const knight = await sharp(source).trim({ threshold: 1 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  // Soft contact shadow under the piece so it sits on the board.
  const shadow = await sharp(knight).ensureAlpha().linear([0, 0, 0, 0.55], [0, 0, 0, 0]).blur(18).toBuffer();
  return { knight, shadow };
}

async function icon(source, output) {
  const size = 760;
  const { knight, shadow } = await knightLayer(source, size);
  const left = Math.round((1024 - size) / 2);
  const top = Math.round((1024 - size) / 2) + 6;
  await sharp(board)
    .composite([
      { input: shadow, left: left + 10, top: top + 22 },
      { input: knight, left, top }
    ])
    .flatten({ background: light })
    .png()
    .toFile(output);
}

{
  await icon("art/piece-icon.png", "assets/icon-only.png");
  const { knight } = await knightLayer("art/piece-icon.png", 600);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: knight, left: 212, top: 200 }])
    .png()
    .toFile("assets/icon-foreground.png");
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: dark } }).png().toFile("assets/icon-background.png");
  const splashKnight = (await knightLayer("art/piece-icon.png", 640)).knight;
  for (const file of ["assets/splash.png", "assets/splash-dark.png"]) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: night } })
      .composite([{ input: splashKnight, left: 1046, top: 1046 }])
      .png()
      .toFile(file);
  }
  // Browser tab and home-screen icons.
  mkdirSync("public", { recursive: true });
  await sharp("assets/icon-only.png").resize(64, 64).png().toFile("public/favicon.png");
  await sharp("assets/icon-only.png").resize(180, 180).png().toFile("public/apple-touch-icon.png");
  await sharp("assets/icon-only.png").resize(512, 512).png().toFile("public/icon-512.png");
  console.log("Wrote assets/*.png and public/*.png");
}
