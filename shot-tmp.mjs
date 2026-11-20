import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(url); await p.waitForTimeout(3000);
await p.screenshot({ path: out });
console.log(errs.length ? errs : "no errors");
await b.close();
