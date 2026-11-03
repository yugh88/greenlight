// Re-verify every sourced quote in the gold guides against the live page (drift check).
// Usage: pnpm tsx scripts/verify-gold.mts [slug...]   (--write to downgrade misses to uncertain)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const { verifyQuotes } = await import("../lib/agent/verify.ts");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");
const files = readdirSync("data/guides").filter((f) => f.endsWith(".json") && (!args.length || args.includes(f.replace(".json", ""))));
let total = 0, miss = 0;
for (const f of files) {
  const g = JSON.parse(readFileSync(`data/guides/${f}`, "utf8"));
  const r = await verifyQuotes(g.claims, true);
  const n = g.claims.filter((c: any) => c.evidence === "sourced").length;
  total += n; miss += r.misses.length;
  console.log(`${f.padEnd(26)} sourced ${String(n).padStart(3)}  misses ${r.misses.length}${r.misses.length ? "  → " + r.misses.join(", ") : ""}`);
  if (write && r.misses.length) { g.claims = r.claims; writeFileSync(`data/guides/${f}`, JSON.stringify(g, null, 1)); }
}
console.log(`\nTOTAL ${total - miss}/${total} quotes still present (${total ? Math.round(((total - miss) / total) * 100) : 0}%)`);
