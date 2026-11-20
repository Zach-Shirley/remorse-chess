// Helpers that drive the board through the DOM, the way a player would: they only click
// squares and read what the page shows. Shared by the end-to-end and screenshot scripts.
//
// The board marks every square with data-square ("e4") and data-piece ("white-knight"), and
// the squares a selected piece may move to with the class "legal-square".

export const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};

export const square = (page, name) => page.locator(`.board [data-square="${name}"]`);
export const moveCount = (page) => page.locator(".moves-heading span").innerText().then(Number);
export const turnTitle = (page) => page.locator(".turn-status p").innerText();
export const isGameOver = async (page) => (await turnTitle(page)) === "Game over";

// The move list as SAN strings, in order (without the dice and event chips drawn beside them).
export const sanList = (page) =>
  page.locator(".move-list .move-part").evaluateAll((parts) => parts.map((part) => part.dataset.san));

// A piece's conscience as the board announces it ("guilt-ridden", "vendetta against pawns"), or "".
export const statusOf = async (page, name) => (await square(page, name).getAttribute("data-status")) ?? "";

// The lines of the roll card currently on screen.
export const rollCard = (page) => page.locator(".roll-card .roll-line").allInnerTexts();

// Opens a pass-and-play game directly. `dice` scripts the first rolls (see src/dice.ts).
export async function openLocal(page, base, { rules = "reactions", dice = [] } = {}) {
  await page.goto(`${base}/local?rules=${rules}${dice.length ? `&dice=${dice.join(",")}` : ""}`);
  await page.waitForSelector(".board");
}

// Plays one move by clicking its squares. `promotion` picks the piece when the picker opens.
export async function clickMove(page, from, to, promotion = "queen") {
  await square(page, from).click();
  await square(page, to).click();
  const picker = page.locator(`.promotion-options [data-promotion="${promotion}"]`);
  if (await picker.count()) await picker.click();
}

// Plays a list of "e2e4"-style moves on one page (pass-and-play), waiting for each to register.
export async function playLine(page, moves) {
  for (const move of moves) {
    const before = await moveCount(page);
    await clickMove(page, move.slice(0, 2), move.slice(2, 4), { q: "queen", r: "rook", b: "bishop", n: "knight" }[move[4]] ?? "queen");
    await page.waitForFunction((n) => Number(document.querySelector(".moves-heading span")?.textContent) > n, before, { timeout: 5000 });
  }
}

// A small seeded generator so scripted games are repeatable.
export function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// Picks and plays a legal move for `side` ("white" | "black") using only the DOM: it clicks the
// side's pieces until one shows destinations, then prefers a capture. Returns false when no
// piece of that side can move.
export async function playAnyLegalMove(page, side, random = Math.random) {
  const squares = await page
    .locator(`.board [data-piece^="${side}-"]`)
    .evaluateAll((elements) => elements.map((element) => element.dataset.square));
  // Shuffle so the game does not just shuffle one piece back and forth.
  for (let i = squares.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [squares[i], squares[j]] = [squares[j], squares[i]];
  }
  let quiet = null;
  for (const from of squares) {
    // Only pieces with a legal move are clickable ("movable-square").
    const movable = await square(page, from).evaluate((element) => element.classList.contains("movable-square"));
    if (!movable) continue;
    await square(page, from).click();
    const captures = await page.locator(".board .capture-square").evaluateAll((elements) => elements.map((element) => element.dataset.square));
    if (captures.length) {
      await clickTarget(page, captures[Math.floor(random() * captures.length)]);
      return true;
    }
    const targets = await page.locator(".board .legal-square").evaluateAll((elements) => elements.map((element) => element.dataset.square));
    if (targets.length && (!quiet || random() < 0.35)) quiet = [from, targets[Math.floor(random() * targets.length)]];
    // Unselect before trying the next piece.
    await square(page, from).click();
    if (quiet && random() < 0.5) break;
  }
  if (!quiet) return false;
  await square(page, quiet[0]).click();
  await clickTarget(page, quiet[1]);
  return true;
}

async function clickTarget(page, to) {
  await square(page, to).click();
  const picker = page.locator('.promotion-options [data-promotion="queen"]');
  if (await picker.count()) await picker.click();
}

// Waits until it is `side`'s turn again (the bot has replied) or the game has ended.
export function waitForTurn(page, side, timeout = 15000) {
  const title = side === "white" ? "White" : "Black";
  return page.waitForFunction(
    (wanted) => {
      const status = document.querySelector(".turn-status p")?.textContent ?? "";
      const busy = document.querySelector(".piece[class*='animate-']");
      return status === "Game over" || (status.startsWith(wanted) && !busy);
    },
    title,
    { timeout }
  );
}

// Collects console errors and page errors for the final report.
export function watchErrors(page, label, errors) {
  page.on("console", (message) => message.type() === "error" && errors.push(`${label}: ${message.text()}`));
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
}

// Creates a private room on `host` (playing `hostSide`, with `ruleSet`) and joins it from `guest`.
export async function openRoom(host, guest, base, hostSide = "White", ruleSet = null) {
  await host.goto(`${base}/multiplayer`);
  await host.waitForSelector(".server-state.online", { timeout: 90000 });
  if (ruleSet) await host.locator(`[data-rule-set="${ruleSet}"]`).click();
  await host.getByRole("radio", { name: hostSide }).click();
  await host.getByRole("button", { name: "Create private room" }).click();
  await host.waitForSelector("text=Waiting for an opponent");
  const code = (await host.locator(".room-code-display span").innerText()).trim();
  await guest.goto(`${base}/multiplayer`);
  await guest.waitForSelector(".server-state.online", { timeout: 90000 });
  await guest.getByText("Join room", { exact: true }).first().click();
  await guest.getByPlaceholder("ABC123").fill(code);
  await guest.locator("form.lobby-form button[type=submit]").click();
  await host.waitForSelector("text=Online match", { timeout: 20000 });
  await guest.waitForSelector("text=Online match", { timeout: 20000 });
  return code;
}

// Plays "e2e4"-style moves in an online game, alternating between the two pages.
export async function playOnlineLine(white, black, moves) {
  for (const [index, move] of moves.entries()) {
    const page = index % 2 === 0 ? white : black;
    await page.waitForSelector("text=Your move", { timeout: 10000 });
    // The previous move's animation must finish before the board accepts clicks.
    await page.waitForFunction(() => document.querySelectorAll(".board .movable-square").length > 0, null, { timeout: 10000 });
    const before = await moveCount(page);
    await clickMove(page, move.slice(0, 2), move.slice(2, 4), { q: "queen", r: "rook", b: "bishop", n: "knight" }[move[4]] ?? "queen");
    await page.waitForFunction((n) => Number(document.querySelector(".moves-heading span")?.textContent) > n, before, { timeout: 8000 });
  }
}
