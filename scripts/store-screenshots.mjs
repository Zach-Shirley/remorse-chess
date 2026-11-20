// Captures App Store screenshots (iPhone 6.9", 1320x2868) from the real app in app-shell mode.
// Needs the web app and the game server running: npm run dev:multiplayer
// Usage: node scripts/store-screenshots.mjs [baseUrl]   → store/screenshots/raw/*.png
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { openRoom, playLine, playOnlineLine, square, waitForTurn } from "./lib/board-dom.mjs";

const APP = process.argv[2] ?? "http://localhost:4274";
const outDir = "store/screenshots/raw";
mkdirSync(outDir, { recursive: true });

// An open middlegame reached by legal moves (a Giuoco Piano), ending with White to move.
const OPENING = [
  "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6",
  "e1g1", "e8g8", "b1d2", "a7a6", "c4b3", "c5a7", "f1e1", "c8e6"
];

const browser = await chromium.launch();
const device = { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function appPage() {
  const context = await browser.newContext(device);
  // Pretend to be the Android shell so the app-store build's UI is shown.
  await context.addInitScript(() => {
    window.androidBridge = { postMessage() {} };
  });
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`${outDir}/${name}.png`);
}

// 1. Home
const home = await appPage();
await shot(home, "1-home");

// 2. Local game in progress, with a knight's moves showing
await home.getByText("Pass & Play").click();
await playLine(home, OPENING);
await square(home, "d2").click();
await shot(home, "2-local-game");

// 3. A game against the bot, a few moves in
await home.goto(`${APP}/`);
await home.getByText("Play a Bot").click();
await home.getByRole("button", { name: "Start game" }).click();
for (const [from, to] of [["e2", "e4"], ["g1", "f3"], ["d2", "d4"]]) {
  // The bot's replies vary, so skip a scripted move that is no longer legal.
  await square(home, from).click();
  const legal = await square(home, to).evaluate((element) => element.classList.contains("legal-square"));
  await square(home, legal ? to : from).click();
  await waitForTurn(home, "white");
}
await shot(home, "3-bot-game");

// 4. Online: the app player hosts a private room, a web player joins
const host = await appPage();
await host.goto(`${APP}/multiplayer`);
await host.waitForSelector(".server-state.online");
await host.getByRole("radio", { name: "White" }).click();
await host.getByRole("button", { name: "Create private room" }).click();
await host.waitForSelector("text=Waiting for an opponent");
await shot(host, "4-online-room");
await host.getByRole("button", { name: "Leave" }).click();

const guest = await (await browser.newContext(device)).newPage();
await openRoom(host, guest, APP, "White");
await playOnlineLine(host, guest, OPENING.slice(0, 10));
await guest.getByRole("button", { name: "Good luck!" }).click();
await host.getByRole("button", { name: "Thanks!" }).click();
await host.waitForTimeout(400);
await square(host, "c4").click();
await shot(host, "5-online-game");

await browser.close();
