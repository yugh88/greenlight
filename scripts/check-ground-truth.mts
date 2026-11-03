import { readFileSync } from "node:fs";
const { fetchPage, quoteMatch } = await import("../lib/agent/fetch.ts");
const gt = JSON.parse(readFileSync("eval/ground-truth.json", "utf8"));
let ok = 0, n = 0;
for (const a of gt.apps) for (const f of a.facts) {
  n++;
  const p = await fetchPage(f.sourceUrl);
  const m = p ? quoteMatch(f.quote, p.text) : { ok: false, score: 0 };
  if (m.ok) ok++; else console.log("✗", f.id, m.score, f.sourceUrl);
}
console.log(`${ok}/${n} ground-truth quotes found on their pages`);
