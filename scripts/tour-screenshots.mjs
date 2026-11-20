// Walks every screen at desktop and phone sizes, playing real games on the way, and saves
// screenshots. Exits non-zero if the browser logged any console error.
// Usage: node scripts/tour-screenshots.mjs <baseUrl> <outDir>
// Online screens need the game server that <baseUrl> is configured for to be reachable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  SIZES,
  clickMove,
  isGameOver,
  playAnyLegalMove,
  playLine,
  playOnlineLine,
  seeded,
  square,
  waitForTurn,
  watchErrors
} from "./lib/board-dom.mjs";

const [base = "http://localhost:4274", outDir = "docs/screenshots"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];

async function open(size, label) {
  const page = await (await browser.newContext(SIZES[size])).newPage();
  watchErrors(page, label, errors);
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`${outDir}/${name}.png`);
};

for (const size of Object.keys(SIZES)) {
  // Home, rules and bot setup
  const page = await open(size, size);
  await page.goto(base);
  await shot(page, `${size}-1-home`);
  await page.getByText("How to play").click();
  await shot(page, `${size}-1b-rules`);
  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByText("Play a Bot").click();
  await shot(page, `${size}-2-bot-setup`);
  await page.getByRole("button", { name: "Start game" }).click();

  // A few turns against the bot, then select a piece so the legal-move markers show.
  const random = seeded(31);
  await clickMove(page, "e2", "e4");
  await waitForTurn(page, "white");
  await clickMove(page, "g1", "f3");
  await waitForTurn(page, "white");
  for (let turn = 0; turn < 6 && !(await isGameOver(page)); turn += 1) {
    await playAnyLegalMove(page, "white", random);
    await waitForTurn(page, "white");
  }
  if (!(await isGameOver(page))) {
    const movable = await page.locator(".board .movable-square").evaluateAll((elements) => elements.map((element) => element.dataset.square));
    for (const from of movable) {
      await square(page, from).click();
      if ((await page.locator(".board .legal-square").count()) >= 3) break;
      await square(page, from).click();
    }
  }
  await shot(page, `${size}-3-bot-game`);

  // Pass & play: a check, then scholar's mate for the game-over popup
  await page.goto(base);
  await page.getByText("Pass & Play").click();
  await playLine(page, ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]);
  await shot(page, `${size}-4-game-over`);
  await page.getByRole("button", { name: "View board" }).click();
  await shot(page, `${size}-4b-checkmate-board`);

  // Online: lobby, quick match, waiting room, and a game between two browsers
  await page.goto(`${base}/multiplayer`);
  await page.waitForSelector("text=Playing as", { timeout: 90000 });
  await page.waitForSelector(".server-state.online", { timeout: 90000 });
  await shot(page, `${size}-5-lobby`);
  await page.getByRole("button", { name: "Find match" }).click();
  await page.waitForSelector("text=Looking for a player");
  await shot(page, `${size}-5b-quick-match`);
  await page.getByRole("button", { name: "Cancel search" }).click();
  await page.waitForSelector("text=Playing as");
  await page.getByRole("radio", { name: "White" }).click();
  await page.getByRole("button", { name: "Create private room" }).click();
  await page.waitForSelector("text=Waiting for an opponent");
  await shot(page, `${size}-6-waiting-room`);
  const code = (await page.locator(".room-code-display span").innerText()).trim();
  const guest = await open(size, `${size}-guest`);
  await guest.goto(`${base}/multiplayer`);
  await guest.waitForSelector(".server-state.online", { timeout: 90000 });
  await guest.getByText("Join room", { exact: true }).first().click();
  await guest.getByPlaceholder("ABC123").fill(code);
  await guest.locator("form.lobby-form button[type=submit]").click();
  await page.waitForSelector("text=Your move", { timeout: 20000 });
  await guest.getByRole("button", { name: "Good luck!" }).click();
  await page.getByRole("button", { name: "Thanks!" }).click();
  await playOnlineLine(page, guest, ["e2e4", "d7d5", "e4d5", "c7c6", "d5c6", "g8f6", "c6b7", "b8d7"]);
  await page.waitForSelector("text=Your move");
  await page.waitForFunction(() => document.querySelectorAll(".board .movable-square").length > 0);
  await square(page, "b7").click();
  await shot(page, `${size}-7-online-game`);
  if (size === "phone") {
    await page.locator(".chat-section").scrollIntoViewIfNeeded();
    await shot(page, `${size}-8-online-chat`);
  }
  await square(page, "a8").click();
  await page.waitForSelector(".promotion-options");
  await shot(page, `${size}-8b-promotion`);
  await page.locator('.promotion-options [data-promotion="queen"]').click();
  await guest.waitForSelector("text=Your move");
  await guest.locator(".danger-action").click();
  await guest.locator(".modal-dialog .button.danger").click();
  await page.waitForSelector(".result-event", { timeout: 10000 });
  await shot(page, `${size}-9-online-result`);
  await page.context().close();
  await guest.context().close();
}
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join("\n")}` : "no console errors");
if (errors.length) process.exitCode = 1;
await browser.close();
