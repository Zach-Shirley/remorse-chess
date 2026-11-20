// End-to-end checks in a real browser, at desktop (1440x900) and phone (402x874) sizes:
//   - a full game against the hard bot, played by a helper that picks legal moves from the DOM
//   - pass-and-play: castling, check, scholar's mate
//   - an online game between two browsers: chat, a promotion, a resignation, a rematch
//   - quick match with a bot while waiting, generated names, side choice (phone size only)
// Needs the web app and the game server running: npm run dev:multiplayer
// Run: node scripts/e2e-bots.mjs [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  SIZES,
  clickMove,
  isGameOver,
  moveCount,
  openRoom,
  playAnyLegalMove,
  playLine,
  playOnlineLine,
  sanList,
  seeded,
  square,
  waitForTurn,
  watchErrors
} from "./lib/board-dom.mjs";

const APP = process.argv[2] ?? "http://localhost:4274";
const out = "art/out";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
  if (!ok) process.exitCode = 1;
};
async function open(size, label) {
  const page = await (await browser.newContext(SIZES[size])).newPage();
  watchErrors(page, label, errors);
  return page;
}
const botReplied = (page, count) =>
  page.waitForFunction((n) => Number(document.querySelector(".moves-heading span")?.textContent) >= n, count, { timeout: 10000 });

for (const size of Object.keys(SIZES)) {
  const tag = `[${size}]`;

  // ---- 1. A whole game against the hard bot ----
  const bot = await open(size, `${size}-bot`);
  await bot.goto(APP);
  await bot.getByText("Play a Bot").click();
  await bot.getByRole("radio", { name: /Hard/ }).click();
  await bot.getByRole("button", { name: "Start game" }).click();
  check(bot.url().endsWith("/bot"), `${tag} bot game opens at /bot`);
  check((await bot.locator(".game-panel-header strong").innerText()) === "Hard bot", `${tag} panel names the hard bot`);
  await clickMove(bot, "e2", "e4");
  await botReplied(bot, 2);
  check((await sanList(bot))[0] === "e4", `${tag} the move list shows the move in algebraic notation`);
  await waitForTurn(bot, "white");
  await bot.getByRole("button", { name: "Undo" }).click();
  check((await moveCount(bot)) === 0, `${tag} undo removes the player's move and the bot's reply`);

  const random = seeded(size === "desktop" ? 7 : 19);
  let plies = 0;
  for (; plies < 200 && !(await isGameOver(bot)); plies += 1) {
    if (!(await playAnyLegalMove(bot, "white", random))) break;
    await waitForTurn(bot, "white");
  }
  const over = await isGameOver(bot);
  check(over, `${tag} the bot game reaches an end (${await moveCount(bot)} half-moves)`);
  if (over) {
    const title = await bot.locator(".modal-dialog h2").innerText();
    const message = await bot.locator(".modal-dialog .modal-copy p").innerText();
    check(/You lose|You win!|Stalemate|Draw/.test(title), `${tag} the game-over dialog shows the result: "${title}" (${message})`);
    await bot.screenshot({ path: `${out}/e2e-${size}-bot-game-over.png` });
    await bot.getByRole("button", { name: "Play again" }).click();
    check((await moveCount(bot)) === 0, `${tag} play again resets the board`);
  }
  await bot.context().close();

  // ---- 2. Pass-and-play: castling, check and checkmate ----
  const local = await open(size, `${size}-local`);
  await local.goto(APP);
  await local.getByText("Pass & Play").click();
  await local.waitForURL(/\/local$/);
  await playLine(local, ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"]);
  await clickMove(local, "e1", "g1");
  // Sampled while the move is still animating: the king and the rook both slide.
  const sliding = await local.locator(".board .piece[class*='animate-slide']").evaluateAll((pieces) => pieces.map((piece) => piece.className.split(" ")[1]).sort());
  check(sliding.join(",") === "king,rook", `${tag} castling animates the king and the rook together`);
  await clickMove(local, "g8", "f6");
  const hopping = await local.locator(".board .piece.knight[class*='animate-hop']").count();
  check(hopping === 1, `${tag} the knight hops`);
  await local.getByRole("button", { name: "Undo" }).click();
  check((await sanList(local)).at(-1) === "O-O", `${tag} castling is written O-O`);
  check((await square(local, "f1").getAttribute("data-piece")) === "white-rook", `${tag} castling moves the rook to f1`);
  check((await square(local, "g1").getAttribute("data-piece")) === "white-king", `${tag} castling moves the king to g1`);
  await local.getByRole("button", { name: "New game" }).click();
  await local.getByRole("button", { name: "Start new game" }).click();
  await playLine(local, ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6"]);
  await square(local, "h5").click();
  check((await local.locator(".board .capture-square").count()) >= 3, `${tag} capture squares are marked for the selected queen`);
  await square(local, "h5").click();
  await playLine(local, ["h5f7"]);
  check((await sanList(local)).at(-1) === "Qxf7#", `${tag} scholar's mate is written Qxf7#`);
  check((await local.locator(".modal-dialog h2").innerText()) === "White wins!", `${tag} checkmate ends the game for White`);
  check((await local.locator(".modal-dialog .modal-copy p").innerText()).startsWith("Checkmate"), `${tag} the dialog says checkmate`);
  await local.getByRole("button", { name: "View board" }).click();
  check((await local.locator('.board .check-square[data-square="e8"]').count()) === 1, `${tag} the mated king's square is highlighted`);
  await local.screenshot({ path: `${out}/e2e-${size}-checkmate.png` });
  // A check that is not mate: the highlight shows and the status says so.
  await local.getByRole("button", { name: "New game" }).click();
  await playLine(local, ["e2e4", "f7f6", "d1h5"]);
  check((await local.locator('.board .check-square[data-square="e8"]').count()) === 1, `${tag} a king in check is highlighted`);
  check((await sanList(local)).at(-1) === "Qh5+", `${tag} check is written with +`);
  check((await local.locator(".board .movable-square").count()) === 1, `${tag} only the piece that can answer the check is movable`);
  // A draw: both sides shuffle their knights until the position has occurred three times.
  await local.getByRole("button", { name: "New game" }).click();
  await local.getByRole("button", { name: "Start new game" }).click();
  const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
  await playLine(local, [...shuffle, ...shuffle]);
  check((await local.locator(".modal-dialog h2").innerText()) === "Draw by repetition", `${tag} threefold repetition ends the game as a draw`);
  await local.screenshot({ path: `${out}/e2e-${size}-draw.png` });
  await local.context().close();

  // ---- 3. Online: chat, promotion, resignation, rematch ----
  const white = await open(size, `${size}-white`);
  const black = await open(size, `${size}-black`);
  await openRoom(white, black, APP, "White");
  check((await white.locator(".player-bar").last().innerText()).includes("White"), `${tag} the host plays White at the bottom`);
  check((await black.locator(".board [data-square]").first().getAttribute("data-square")) === "h1", `${tag} Black sees the board from Black's side`);
  await black.getByRole("button", { name: "Good luck!" }).click();
  await white.waitForSelector(".chat-message.opponent");
  check((await white.locator(".chat-message.opponent p").innerText()) === "Good luck!", `${tag} quick chat reaches the opponent`);
  await playOnlineLine(white, black, ["e2e4", "d7d5", "e4d5", "c7c6", "d5c6", "g8f6", "c6b7", "b8d7"]);
  // White promotes by capturing on a8: the picker opens and the choice is sent.
  await white.waitForSelector("text=Your move");
  await white.waitForFunction(() => document.querySelectorAll(".board .movable-square").length > 0);
  await square(white, "b7").click();
  await square(white, "a8").click();
  await white.waitForSelector(".promotion-options");
  check((await white.locator(".promotion-options button").count()) === 4, `${tag} the promotion picker offers four pieces`);
  await white.screenshot({ path: `${out}/e2e-${size}-promotion.png` });
  await white.locator('.promotion-options [data-promotion="queen"]').click();
  await black.waitForFunction(() => document.querySelector('.board [data-square="a8"]')?.dataset.piece === "white-queen", null, { timeout: 8000 });
  check((await sanList(black)).at(-1) === "bxa8=Q", `${tag} the promotion is synchronised and written bxa8=Q`);
  await black.locator(".danger-action").click();
  await black.locator(".modal-dialog .button.danger").click();
  await white.waitForSelector(".result-event.won", { timeout: 10000 });
  check((await white.locator(".result-event h2").innerText()).endsWith("resigned"), `${tag} a resignation ends the online game`);
  await white.getByRole("button", { name: "Request rematch" }).click();
  await black.getByRole("button", { name: "Accept rematch" }).click();
  await white.waitForSelector("text=Your move", { timeout: 10000 });
  check((await moveCount(white)) === 0, `${tag} a rematch starts a fresh game`);
  await white.context().close();
  await black.context().close();
}

// ---- 4. Quick match, names and side choice (phone size) ----
const a = await open("phone", "A");
await a.goto(`${APP}/multiplayer`);
await a.waitForSelector("text=Playing as");
const nameA = await a.locator(".playing-as strong").innerText();
check(/^[A-Z][a-z]+[A-Z][a-z]+\d\d$/.test(nameA), `player gets a generated name (${nameA})`);
await a.reload();
await a.waitForSelector("text=Playing as");
check((await a.locator(".playing-as strong").innerText()) === nameA, "generated name survives a reload");
await a.waitForSelector(".server-state.online");
await a.getByRole("button", { name: "Find match" }).click();
await a.waitForSelector("text=Looking for a player");
await a.getByRole("button", { name: "Play while I wait" }).click();
await a.waitForSelector("text=Still searching for a match");
await clickMove(a, "e2", "e4");
await botReplied(a, 2);
check(true, "bot game runs while quick match searches");

const b = await open("phone", "B");
await b.goto(`${APP}/multiplayer`);
await b.waitForSelector(".server-state.online");
const nameB = await b.locator(".playing-as strong").innerText();
await b.getByRole("button", { name: "Find match" }).click();
await a.waitForSelector("text=Match found! Your bot game was closed.", { timeout: 8000 });
await a.waitForSelector("text=Online match");
check(true, "a found match replaces the waiting bot game, with a notice");
check(await a.getByText(nameB).first().isVisible(), `opponent shows by generated name (${nameB})`);

const c = await open("phone", "C");
await c.goto(`${APP}/multiplayer`);
await c.waitForSelector(".server-state.online");
await c.getByRole("button", { name: "Find match" }).click();
await c.waitForSelector("text=Looking for a player");
await c.getByRole("button", { name: "Play a bot instead" }).click();
await c.waitForURL(/\/bot$/);
check((await c.locator(".game-panel-header strong").innerText()) === "Medium bot", "play a bot instead leaves the queue and opens a bot game");

// Playing the bot as Black flips the board and the bot (White) opens.
const d = await open("phone", "D");
await d.goto(APP);
await d.getByText("Play a Bot").click();
await d.getByRole("radio", { name: "Black" }).click();
await d.getByRole("button", { name: "Start game" }).click();
await botReplied(d, 1);
check((await d.locator(".board [data-square]").first().getAttribute("data-square")) === "h1", "board is flipped when playing Black");
check((await d.locator(".player-bar").last().innerText()).includes("You"), "your bar is at the bottom");
check((await d.locator(".move-list .move-san.white").count()) === 1, "the bot, playing White, moves first");
await d.screenshot({ path: `${out}/e2e-bot-black.png` });

// Private room: the creator picks Black, the joiner gets White and moves first.
const host = await open("phone", "host");
const guest = await open("phone", "guest");
await openRoom(host, guest, APP, "Black");
await guest.waitForSelector("text=Your move");
check(true, "joiner of a Black-hosted room plays White and moves first");
check((await host.locator(".player-bar").last().innerText()).includes("Black"), "host sees themselves as Black at the bottom");

check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
