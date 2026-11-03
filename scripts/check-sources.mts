import { readFileSync } from "node:fs";
const { fetchPage } = await import("../lib/agent/fetch.ts");
const src = JSON.parse(readFileSync("data/gold-sources.json", "utf8"));
const only = process.argv[2];
for (const [slug, v] of Object.entries<any>(src)) {
  if (only && slug !== only) continue;
  const rs = await Promise.all(v.urls.map(async (u: string) => { const p = await fetchPage(u); return `${p?.status ?? "ERR"} ${String(p?.text.length ?? 0).padStart(6)} ${p && p.finalUrl !== u ? "→ " + p.finalUrl : ""} ${u}`; }));
  console.log(`== ${slug}\n` + rs.join("\n"));
}
