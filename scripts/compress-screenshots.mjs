// Converts the tour PNGs in docs/screenshots to WebP so the repo stays small.
// Usage: node scripts/compress-screenshots.mjs   (run after tour-screenshots.mjs and montage.mjs)
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk("docs/screenshots").filter((f) => f.endsWith(".png"))) {
  await sharp(file).webp({ quality: 82 }).toFile(file.replace(/\.png$/, ".webp"));
  rmSync(file);
}
console.log("docs/screenshots compressed");
