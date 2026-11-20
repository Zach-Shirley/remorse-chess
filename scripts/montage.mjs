// Builds a contact sheet of a tour-screenshots folder. Usage: node scripts/montage.mjs <dir> <out.png>
import sharp from "sharp";
const [dir, out] = process.argv.slice(2);
const desktop = ["1-home", "3-bot-game", "5-lobby", "7-online-game", "9-online-result", "4-game-over"].map((n) => `${dir}/desktop-${n}.png`);
const phone = ["1-home", "2-bot-setup", "3-bot-game", "4-game-over", "5-lobby", "6-waiting-room", "7-online-game", "8-online-chat"].map((n) => `${dir}/phone-${n}.png`);
const dw = 640, dh = 400, pw = 236, ph = 513, gap = 12;
const width = gap + 3 * (dw + gap);
const height = gap + 2 * (dh + gap) + ph + gap;
const layers = [];
for (const [i, file] of desktop.entries()) layers.push({ input: await sharp(file).resize(dw, dh).toBuffer(), left: gap + (i % 3) * (dw + gap), top: gap + Math.floor(i / 3) * (dh + gap) });
for (const [i, file] of phone.entries()) layers.push({ input: await sharp(file).resize(pw, ph).toBuffer(), left: gap + i * (pw + gap), top: gap + 2 * (dh + gap) });
await sharp({ create: { width, height, channels: 4, background: "#2a2a2e" } }).composite(layers).png().toFile(out);
console.log(out);
