// Usage: pnpm tsx scripts/shot.mts <url> <out.png> [width] [fullPage]
import { chromium } from "playwright";
const [url, out, w = "1280", full = "1"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: 900 }, deviceScaleFactor: 1 });
await p.goto(url!, { waitUntil: "load" });
await p.waitForTimeout(800);
await p.screenshot({ path: out!, fullPage: full === "1" });
await b.close();
console.log("saved", out);
