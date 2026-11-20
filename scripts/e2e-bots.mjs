// End-to-end checks in a real browser, at desktop (1440x900) and phone (402x874) sizes:
//   - a full game against the hard bot, played by a helper that picks legal moves from the DOM
//   - pass-and-play: the rule-set picker, castling, check, mate, a draw, a promotion, and the
//     Remorse Chess rules on screen: a roll, guilt, absolution, relapse, a Sadist's extra move,
//     a witness's vendetta, and a devastated piece counting down and removing itself
//   - an online game between two browsers: the room's rule set, chat, a capture rolled by the
//     server and shown to both players, a resignation, a rematch
//   - quick match with a bot while waiting, generated names, side choice (phone size only)
// Pass-and-play games script their first dice through the page address (see src/dice.ts).
// Needs the web app and the game server running: npm run dev:multiplayer
// Run: node scripts/e2e-bots.mjs [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  SIZES,
  clickMove,
  isGameOver,
  moveCount,
  openLocal,
  openRoom,
  playAnyLegalMove,
  playLine,
  playOnlineLine,
  rollCard,
  sanList,
  seeded,
  square,
  statusOf,
  turnTitle,
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
const pieceOn = (page, name) => square(page, name).getAttribute("data-piece");
const ruleSetShown = (page) => page.locator('.game-panel [data-testid="rule-set-chip"] strong').innerText();

for (const size of Object.keys(SIZES)) {
  const tag = `[${size}]`;

  // ---- 1. A whole game against the hard bot (Reactions, real dice) ----
  const bot = await open(size, `${size}-bot`);
  await bot.goto(APP);
  await bot.getByText("Play a Bot").click();
  check((await bot.locator(".rule-sets button").count()) === 3, `${tag} bot setup offers the three rule sets`);
  check((await bot.locator('.rule-sets button[aria-checked="true"]').getAttribute("data-rule-set")) === "reactions", `${tag} Reactions is the default rule set`);
  await bot.getByRole("radio", { name: /Hard/ }).click();
  await bot.getByRole("button", { name: "Start game" }).click();
  check(bot.url().endsWith("/bot"), `${tag} bot game opens at /bot`);
  check((await bot.locator(".game-panel-header strong").innerText()) === "Hard bot", `${tag} panel names the hard bot`);
  check((await ruleSetShown(bot)) === "Reactions", `${tag} the rule set in play is shown during the game`);
  await clickMove(bot, "e2", "e4");
  await botReplied(bot, 2);
  check((await sanList(bot))[0] === "e4", `${tag} the move list shows the move in algebraic notation`);
  await waitForTurn(bot, "white");
  await bot.getByRole("button", { name: "Undo" }).click();
  check((await moveCount(bot)) === 0, `${tag} undo removes the player's move and the bot's reply`);

  const random = seeded(size === "desktop" ? 7 : 19);
  let plies = 0;
  for (; plies < 260 && !(await isGameOver(bot)); plies += 1) {
    if (!(await playAnyLegalMove(bot, "white", random))) {
      // A Sadist with no move worth the name: end the turn.
      const endTurn = bot.locator('[data-testid="end-turn"]');
      if (await endTurn.count()) await endTurn.click();
      else break;
    }
    await waitForTurn(bot, "white");
  }
  const over = await isGameOver(bot);
  check(over, `${tag} the bot game reaches an end (${await moveCount(bot)} half-moves)`);
  check((await bot.locator(".move-list .event-chip").count()) > 0, `${tag} the bot game's rolls are in the move list (${await bot.locator(".move-list .event-chip").count()} chips)`);
  if (over) {
    const title = await bot.locator(".modal-dialog h2").innerText();
    const message = await bot.locator(".modal-dialog .modal-copy p").innerText();
    check(/You lose|You win!|Stalemate|Draw/.test(title), `${tag} the game-over dialog shows the result: "${title}" (${message})`);
    await bot.screenshot({ path: `${out}/e2e-${size}-bot-game-over.png` });
    await bot.getByRole("button", { name: "Play again" }).click();
    check((await moveCount(bot)) === 0, `${tag} play again resets the board`);
  }
  await bot.context().close();

  // ---- 2. Pass-and-play: the picker, then standard chess under Classic ----
  const local = await open(size, `${size}-local`);
  await local.goto(APP);
  await local.getByText("Pass & Play").click();
  await local.locator('[data-rule-set="classic"]').click();
  await local.getByRole("button", { name: "Start game" }).click();
  await local.waitForURL(/\/local$/);
  check((await ruleSetShown(local)) === "Classic", `${tag} pass-and-play starts with the rule set that was picked`);
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
  check((await pieceOn(local, "f1")) === "white-rook", `${tag} castling moves the rook to f1`);
  check((await pieceOn(local, "g1")) === "white-king", `${tag} castling moves the king to g1`);

  // Classic: the queen that takes on f7 is guilt-ridden, so scholar's "mate" is not even check.
  await local.getByRole("button", { name: "New game" }).click();
  await local.getByRole("button", { name: "Start new game" }).click();
  await playLine(local, ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6"]);
  await square(local, "h5").click();
  check((await local.locator(".board .capture-square").count()) >= 3, `${tag} capture squares are marked for the selected queen`);
  await square(local, "h5").click();
  await playLine(local, ["h5f7"]);
  check((await sanList(local)).at(-1) === "Qxf7", `${tag} Classic: the capturing queen gives no check (Qxf7, not Qxf7#)`);
  check((await statusOf(local, "f7")) === "guilt-ridden", `${tag} Classic: the capturing queen is guilt-ridden, with no die`);
  check((await local.locator(".roll-card .die").count()) === 0, `${tag} Classic: no die is shown`);
  check(!(await isGameOver(local)), `${tag} Classic: the game goes on`);
  check((await local.locator('.board [data-square="f7"] .token.guilty').count()) === 1, `${tag} the guilt token is drawn on the piece`);
  await playLine(local, ["a7a6"]);
  check((await sanList(local)).at(-1) === "a6", `${tag} Black, not in check, is free to play elsewhere`);

  // A check that is not mate: the highlight shows and the status says so.
  await local.getByRole("button", { name: "New game" }).click();
  await local.getByRole("button", { name: "Start new game" }).click();
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

  // ---- 2b. Reactions: a roll, guilt, absolution, relapse ----
  await openLocal(local, APP, { rules: "reactions", dice: [2] });
  await playLine(local, ["e2e4", "d7d5", "e4d5"]);
  await local.waitForSelector(".roll-card");
  const guiltCard = (await rollCard(local)).join(" | ");
  check(/White pawn/.test(guiltCard) && /Guilt-ridden/.test(guiltCard), `${tag} the roll card names the piece and the outcome (${guiltCard.replace(/\n/g, " ")})`);
  check((await local.locator('.roll-card .die[aria-label="Die showing 2"]').count()) === 1, `${tag} the roll card shows the die's number`);
  check((await statusOf(local, "d5")) === "guilt-ridden", `${tag} the capturing pawn is guilt-ridden`);
  check((await local.locator(".move-list .event-chip.guilty").innerText()) === "2", `${tag} the roll is recorded in the move list`);
  await local.screenshot({ path: `${out}/e2e-${size}-roll.png` });
  await playLine(local, ["c7c6"]);
  await square(local, "d5").click();
  check((await local.locator(".board .capture-square").count()) === 0, `${tag} a guilt-ridden pawn cannot capture`);
  check((await local.locator(".conscience-note").innerText()).includes("refuses to capture"), `${tag} the selected piece's status is explained in words`);
  await square(local, "d5").click();
  await playLine(local, ["f1c4"]);
  check((await statusOf(local, "d5")) === "", `${tag} a bishop landing next to it absolves it`);
  check((await rollCard(local)).join(" ").includes("Absolved"), `${tag} the absolution is announced`);
  check((await local.locator(".move-list .event-chip.absolved").count()) === 1, `${tag} the absolution is in the move list`);
  await local.screenshot({ path: `${out}/e2e-${size}-absolution.png` });
  await playLine(local, ["a7a6", "d5c6"]);
  check((await statusOf(local, "c6")) === "guilt-ridden", `${tag} the reaction is permanent: guilt returns after the next capture`);
  check((await local.locator(".roll-card .die").count()) === 0, `${tag} and it returns without a second roll`);

  // ---- 2c. Reactions: mate with an unaffected queen, and a promotion ----
  await openLocal(local, APP, { rules: "reactions", dice: [4] });
  await playLine(local, ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]);
  check((await sanList(local)).at(-1) === "Qxf7#", `${tag} an unaffected queen (rolled 4) mates: Qxf7#`);
  check((await local.locator(".modal-dialog h2").innerText()) === "White wins!", `${tag} checkmate ends the game for White`);
  check((await local.locator(".modal-dialog .modal-copy p").innerText()).startsWith("Checkmate"), `${tag} the dialog says checkmate`);
  await local.getByRole("button", { name: "View board" }).click();
  check((await local.locator('.board .check-square[data-square="e8"]').count()) === 1, `${tag} the mated king's square is highlighted`);
  check((await local.locator('.board [data-square="f7"] .token.unaffected').count()) === 1, `${tag} an unaffected piece carries a small neutral mark`);
  await local.screenshot({ path: `${out}/e2e-${size}-checkmate.png` });

  await openLocal(local, APP, { rules: "reactions", dice: [4] });
  await playLine(local, ["e2e4", "d7d5", "e4d5", "c7c6", "d5c6", "g8f6", "c6b7", "b8d7"]);
  await square(local, "b7").click();
  await square(local, "a8").click();
  await local.waitForSelector(".promotion-options");
  check((await local.locator(".promotion-options button").count()) === 4, `${tag} the promotion picker offers four pieces`);
  await local.locator('.promotion-options [data-promotion="bishop"]').click();
  check((await sanList(local)).at(-1) === "bxa8=B", `${tag} the promotion is written bxa8=B`);
  check((await pieceOn(local, "a8")) === "white-bishop", `${tag} the pawn became a bishop`);

  // ---- 2d. Reactions: a 6 makes a Sadist with an optional extra move ----
  await openLocal(local, APP, { rules: "reactions", dice: [6] });
  await playLine(local, ["e2e4", "d7d5", "e4d5"]);
  check((await statusOf(local, "d5")) === "sadist", `${tag} a 6 makes the pawn a Sadist`);
  check((await turnTitle(local)) === "White to move", `${tag} the Sadist's side is still to move`);
  check((await local.locator(".board .movable-square").count()) === 1, `${tag} only the Sadist may make the extra move`);
  check((await local.locator(".board .extra-move-square").count()) === 1, `${tag} the Sadist is ringed`);
  await local.screenshot({ path: `${out}/e2e-${size}-sadist.png` });
  await local.locator('[data-testid="end-turn"]').click();
  check((await turnTitle(local)) === "Black to move", `${tag} End turn passes the move`);
  check((await moveCount(local)) === 3, `${tag} ending the turn adds no move`);
  // The same again, taking the extra move this time.
  await openLocal(local, APP, { rules: "reactions", dice: [6] });
  await playLine(local, ["e2e4", "d7d5", "e4d5"]);
  // The Sadist is already selected: one tap on the destination makes the extra move.
  await square(local, "d6").click();
  check((await turnTitle(local)) === "Black to move", `${tag} the extra move ends the turn`);
  check((await sanList(local)).slice(-2).join(" ") === "exd5 d6", `${tag} both of White's moves are in the move list`);
  check((await local.locator(".move-list li").last().locator(".move-san.white .move-part").count()) === 2, `${tag} the extra move shares the cell of the capture`);

  // ---- 2e. Witnesses: a vendetta, collected, and the next witness shaken ----
  await openLocal(local, APP, { rules: "witnesses", dice: [4, 5, 1] });
  await playLine(local, ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5"]);
  check((await rollCard(local)).length === 2, `${tag} Witnesses: the capturer and the witness both roll`);
  check((await statusOf(local, "e6")) === "vendetta against pawns", `${tag} a witness that rolls 5 swears a vendetta against the capturer's type`);
  check((await local.locator('.board [data-square="e6"] .token.vendetta').innerText()) === "P", `${tag} the vendetta token shows its target`);
  await playLine(local, ["e6d5"]);
  check((await statusOf(local, "d5")) === "", `${tag} the vendetta capture is guilt-free and used up`);
  check((await statusOf(local, "d4")) === "guilt-ridden", `${tag} the white pawn that witnessed it (rolled 1) is guilt-ridden`);

  // ---- 2f. Reactions: devastation counts down 3-2-1 and the piece removes itself ----
  await openLocal(local, APP, { rules: "reactions", dice: [1] });
  await playLine(local, ["e2e4", "d7d5", "e4d5", "a7a6"]);
  check((await statusOf(local, "d5")) === "devastated, 3 turns left", `${tag} a 1 devastates the pawn: 3 turns left`);
  check((await local.locator('.board [data-square="d5"] .token.devastated').innerText()) === "3", `${tag} the countdown is on the piece`);
  await square(local, "d5").click();
  check((await local.locator(".board .legal-square").count()) === 0, `${tag} a devastated piece cannot move`);
  await playLine(local, ["a2a3", "b7b6"]);
  check((await statusOf(local, "d5")) === "devastated, 2 turns left", `${tag} 2 turns left`);
  await playLine(local, ["b2b3", "g7g6"]);
  check((await statusOf(local, "d5")) === "devastated, 1 turns left", `${tag} 1 turn left`);
  await playLine(local, ["c2c3", "h7h6"]);
  check((await pieceOn(local, "d5")) === null, `${tag} unabsolved after three turns, the pawn removes itself`);
  check((await rollCard(local)).join(" ").includes("Lost to despair"), `${tag} the loss is announced`);
  await local.screenshot({ path: `${out}/e2e-${size}-despair.png` });

  // The rules dialog: rule sets, sources, interpretation, credit.
  await local.getByRole("button", { name: "Rules" }).click();
  check((await local.locator('.rules-section[data-rules="reactions"] .rules-flag').innerText()) === "In this game", `${tag} the rules dialog marks the rule set in play`);
  check((await local.locator('.rules-section[data-rules="witnesses"] .rules-flag').innerText()) === "Not in this game", `${tag} and the one that is not`);
  check((await local.locator(".rule-sources a").count()) >= 18, `${tag} every creator rule links to its video`);
  check((await local.locator('[data-rules="interpretation"] li').count()) >= 12, `${tag} the interpretations are listed under their own heading`);
  check((await local.locator('[data-rules="credit"] .video-links a').count()) === 5, `${tag} the credit links the creator's five Shorts`);
  check((await local.locator(".token-legend li").count()) === 6, `${tag} the legend explains the six tokens`);
  const dialogText = await local.locator(".modal-dialog").innerText();
  check(!/psycho/i.test(dialogText), `${tag} the rules use the creator's later name, Sadist`);
  await local.context().close();

  // ---- 3. Online: rule set, chat, a capture rolled by the server, resignation, rematch ----
  const white = await open(size, `${size}-white`);
  const black = await open(size, `${size}-black`);
  await openRoom(white, black, APP, "White", "witnesses");
  check((await white.locator(".player-bar").last().innerText()).includes("White"), `${tag} the host plays White at the bottom`);
  check((await black.locator(".board [data-square]").first().getAttribute("data-square")) === "h1", `${tag} Black sees the board from Black's side`);
  check((await ruleSetShown(black)) === "Witnesses", `${tag} the joiner is shown the room's rule set`);
  await black.getByRole("button", { name: "Good luck!" }).click();
  await white.waitForSelector(".chat-message.opponent");
  check((await white.locator(".chat-message.opponent p").innerText()) === "Good luck!", `${tag} quick chat reaches the opponent`);
  await playOnlineLine(white, black, ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5"]);
  await white.waitForSelector(".roll-card");
  await black.waitForSelector(".roll-card");
  const whiteCard = (await rollCard(white)).join(" | ").replace(/\n/g, " ");
  const blackCard = (await rollCard(black)).join(" | ").replace(/\n/g, " ");
  check(whiteCard === blackCard && whiteCard.includes("White pawn"), `${tag} both players see the same server-rolled dice (${whiteCard})`);
  check((await rollCard(white)).length === 2, `${tag} the server rolled for the capturer and for the witness on e6`);
  const whiteChips = await white.locator(".move-list .event-chip").allInnerTexts();
  const blackChips = await black.locator(".move-list .event-chip").allInnerTexts();
  check(whiteChips.length === 2 && whiteChips.join() === blackChips.join(), `${tag} the rolls are in both move lists (${whiteChips.join(", ")})`);
  check((await statusOf(white, "d5")) === (await statusOf(black, "d5")), `${tag} both boards show the same status on the capturing pawn ("${await statusOf(white, "d5")}")`);
  await white.screenshot({ path: `${out}/e2e-${size}-online-roll.png` });
  // A 6 leaves White on move: End turn must work online too.
  const endTurn = white.locator('[data-testid="end-turn"]');
  if (await endTurn.count()) {
    await endTurn.click();
    check(true, `${tag} (the server rolled a 6: End turn was offered and sent)`);
  }
  await black.waitForSelector("text=Your move", { timeout: 10000 });
  check(true, `${tag} the turn passes to Black after the capture`);
  await black.locator(".danger-action").click();
  await black.locator(".modal-dialog .button.danger").click();
  await white.waitForSelector(".result-event.won", { timeout: 10000 });
  check((await white.locator(".result-event h2").innerText()).endsWith("resigned"), `${tag} a resignation ends the online game`);
  await white.getByRole("button", { name: "Request rematch" }).click();
  await black.getByRole("button", { name: "Accept rematch" }).click();
  await white.waitForSelector("text=Your move", { timeout: 10000 });
  check((await moveCount(white)) === 0, `${tag} a rematch starts a fresh game`);
  check((await white.locator(".board [data-status]").count()) === 0, `${tag} and no piece carries a status over`);
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

// A player searching with another rule set is not paired with A.
const other = await open("phone", "other");
await other.goto(`${APP}/multiplayer`);
await other.waitForSelector(".server-state.online");
await other.locator('[data-rule-set="classic"]').click();
await other.getByRole("button", { name: "Find match" }).click();
await other.waitForSelector("text=Looking for a player");
await other.waitForTimeout(1500);
check(await other.getByText("Looking for a player").isVisible(), "quick match does not pair different rule sets");
check((await a.getByText("Still searching for a match").count()) === 1, "the first player is still searching");
await other.getByRole("button", { name: "Cancel search" }).click();
await other.context().close();

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
