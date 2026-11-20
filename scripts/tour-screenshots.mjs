// Walks the main screens at desktop and phone sizes and saves screenshots.
// Usage: node scripts/tour-screenshots.mjs <baseUrl> <outDir>
// Online screens need the game server that <baseUrl> is configured for to be reachable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const [base = "http://localhost:4174", outDir = "docs/screenshots/after"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const sizes = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 }
};
const errors = [];
const square = (page, name) => page.locator(`button[aria-label^="${name},"]`);

async function open(size, label) {
  const page = await (await browser.newContext(sizes[size])).newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`${outDir}/${name}.png`);
};
const moveCount = (page) => page.locator(".moves-heading span").innerText().then(Number);

async function playAnyMove(page, side = "Red") {
  const pieces = await page
    .locator(`button[aria-label*="${side} "]:not([aria-label*="resting"])`)
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label").split(",")[0]));
  let fallback = null;
  for (const from of pieces) {
    await square(page, from).click();
    await page.waitForTimeout(50);
    const capture = page.locator('button[aria-label*="capture destination"]');
    if (await capture.count()) return capture.first().click();
    const dest = page.locator('button[aria-label*="legal destination"]');
    if (!fallback && (await dest.count())) fallback = [from, (await dest.first().getAttribute("aria-label")).split(",")[0]];
  }
  if (fallback) {
    await square(page, fallback[0]).click();
    await square(page, fallback[1]).click();
  }
}

for (const size of Object.keys(sizes)) {
  // Home and bot setup
  const page = await open(size, size);
  await page.goto(base);
  await shot(page, `${size}-1-home`);
  await page.getByText("Play a Bot").click();
  await shot(page, `${size}-2-bot-setup`);
  await page.getByRole("button", { name: "Start game" }).click();
  for (let turn = 0; turn < 7; turn++) {
    const before = await moveCount(page);
    await playAnyMove(page);
    for (let i = 0; i < 4; i++) {
      const more = page.locator('button[aria-label*="destination"]');
      if (!(await more.count()) || !(await page.locator(".turn-status p").innerText()).startsWith("Red")) break;
      await more.first().click();
    }
    await page
      .waitForFunction(
        (n) => {
          const count = Number(document.querySelector(".moves-heading span")?.textContent);
          const status = document.querySelector(".turn-status p")?.textContent ?? "";
          return (count > n + 1 && status.startsWith("Red")) || status === "Game over";
        },
        before,
        { timeout: 12000 }
      )
      .catch(() => {});
  }
  // Select a piece so legal-move markers show.
  const reds = await page.locator('button[aria-label*="Red "]:not([aria-label*="resting"])').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label").split(",")[0]));
  for (const from of reds) {
    await square(page, from).click();
    await page.waitForTimeout(50);
    if (await page.locator('button[aria-label*="destination"]').count()) break;
  }
  await shot(page, `${size}-3-bot-game`);

  // Pass & play to the end for the game-over popup
  await page.goto(base);
  await page.getByText("Pass & Play").click();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let ply = 0; ply < 400; ply++) {
    if (await page.locator("text=Play again").count()) break;
    const status = await page.locator(".turn-status p").innerText();
    await playAnyMove(page, status.startsWith("Red") ? "Red" : "Black");
    const endTurn = page.getByRole("button", { name: "End turn" });
    if (await endTurn.count()) await endTurn.click();
    await page.waitForTimeout(25);
  }
  await shot(page, `${size}-4-game-over`);

  // Online: lobby, waiting room, and a game between two browsers
  await page.goto(`${base}/multiplayer`);
  await page.waitForSelector("text=Playing as", { timeout: 90000 });
  await page.waitForSelector(".server-state.online", { timeout: 90000 });
  await shot(page, `${size}-5-lobby`);
  await page.getByRole("button", { name: "Find match" }).click();
  await page.waitForSelector("text=Looking for a player");
  await shot(page, `${size}-5b-quick-match`);
  await page.getByRole("button", { name: "Cancel search" }).click();
  await page.waitForSelector("text=Playing as");
  await page.getByRole("radio", { name: "Red" }).click();
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
  for (const [p, from, to] of [[page, "c3", "d4"], [guest, "b6", "a5"], [page, "e2", "f4"], [guest, "d6", "c5"]]) {
    await square(p, from).click();
    await square(p, to).click();
    await p.waitForTimeout(700);
  }
  await guest.getByRole("button", { name: "Good luck!" }).click();
  await page.getByRole("button", { name: "Thanks!" }).click();
  await page.waitForTimeout(500);
  await square(page, "d4").click();
  await shot(page, `${size}-7-online-game`);
  if (size === "phone") {
    await page.locator(".chat-section").scrollIntoViewIfNeeded();
    await shot(page, `${size}-8-online-chat`);
  }
  await guest.locator(".danger-action").click();
  await guest.locator(".modal-dialog .button.danger").click();
  await page.waitForSelector(".result-event", { timeout: 10000 });
  await shot(page, `${size}-9-online-result`);
  await page.context().close();
  await guest.context().close();
}
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
