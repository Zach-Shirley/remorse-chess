// Renders every sprite with the three.js studio and writes the app's assets.
// Usage: node art/render.mjs [name ...]     (no names = everything)
//   art/out/<name>.png            raw renders
//   src/assets/pieces/<name>.webp sprites with a baked contact shadow
//   src/assets/hero.webp          home-screen backdrop
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { createServer } from "vite";

const PIECES = [
  "checker-red", "checker-black", "king-red", "king-black",
  "knight-red", "knight-black", "knight-red-rest", "knight-black-rest"
];
const EXTRAS = ["crown", "hero", "hero-tall", "knight-icon"];
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : [...PIECES, ...EXTRAS];

mkdirSync("art/out", { recursive: true });
mkdirSync("src/assets/pieces", { recursive: true });

const server = await createServer({ server: { port: 4190, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error("studio:", m.text()));
page.on("pageerror", (e) => console.error("studio:", e.message));
await page.goto("http://localhost:4190/art/studio.html");
await page.waitForFunction(() => window.studio);

const render = async (name, pixels, options) => {
  const dataUrl = await page.evaluate(([n, p, o]) => window.studio.render(n, p, o), [name, pixels, options ?? {}]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
};

// Soft shadow under the piece, baked in so the page needs no CSS filters.
async function withShadow(png, { blur, dy, opacity }) {
  const { width, height } = await sharp(png).metadata();
  const shadow = await sharp(png)
    .ensureAlpha()
    .linear([0, 0, 0, opacity], [0, 0, 0, 0])
    .blur(blur)
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, top: dy, left: 0 }, { input: png }])
    .png()
    .toBuffer();
}

for (const name of names) {
  if (name === "hero" || name === "hero-tall") {
    const tall = name === "hero-tall";
    const png = await render("hero", tall ? 1200 : 2200, tall ? { aspect: 3 / 4, eye: [4.2, 8.5, 19], target: [1.2, 0, 6.2], fov: 34 } : {});
    writeFileSync(`art/out/${name}.png`, png);
    await sharp(png).webp({ quality: 82 }).toFile(`src/assets/${name}.webp`);
  } else if (name === "knight-icon") {
    writeFileSync("art/knight-icon.png", await render("knight-red", 1024, { frame: 1.02 }));
  } else if (name === "crown") {
    const png = await render("crown", 256);
    writeFileSync("art/out/crown.png", png);
    await sharp(png).resize(96, 96).webp({ quality: 92 }).toFile("src/assets/pieces/crown.webp");
  } else {
    const png = await render(name, 768);
    writeFileSync(`art/out/${name}.png`, png);
    const knight = name.startsWith("knight");
    const shadowed = await withShadow(png, knight ? { blur: 14, dy: 12, opacity: 0.5 } : { blur: 16, dy: 22, opacity: 0.55 });
    await sharp(shadowed).resize(288, 288).webp({ quality: 92, alphaQuality: 100 }).toFile(`src/assets/pieces/${name}.webp`);
  }
  console.log("rendered", name);
}

await browser.close();
await server.close();
