// Fast 2D check of the knight outline before spending a 3D render on it.
// Usage: node art/preview-outline.mjs   → art/out/outline.png
import sharp from "sharp";
import { KNIGHT_HEAD, KNIGHT_EYE, KNIGHT_NOSTRIL, KNIGHT_BACK } from "./shapes.mjs";

const e = KNIGHT_EYE;
const back = KNIGHT_BACK.map(([a, b, c, d]) => `M ${a} C ${b}, ${c}, ${d}`).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="-10 -5 150 110">
<rect x="-10" y="-5" width="150" height="110" fill="#ddd"/>
<path d="M 20 96 h 70 v 6 h -70 z" fill="#888"/>
<path d="${KNIGHT_HEAD}" fill="#b52f34" stroke="#3a0b0d" stroke-width="0.8" stroke-linejoin="round"/>
<path d="${back}" fill="none" stroke="#ffd34d" stroke-width="0.8"/>
<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.rotate} ${e.cx} ${e.cy})" fill="#2a0607"/>
<circle cx="${KNIGHT_NOSTRIL.cx}" cy="${KNIGHT_NOSTRIL.cy}" r="${KNIGHT_NOSTRIL.r}" fill="#2a0607"/>
<g transform="translate(108 62) scale(0.3)"><path d="${KNIGHT_HEAD}" fill="#111"/></g>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile("art/out/outline.png");
