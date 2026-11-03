// Regenerates the data-driven README sections between <!-- X --> ... <!-- /X --> markers.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
let md = readFileSync("README.md", "utf8");
const put = (tag: string, body: string) => {
  const re = new RegExp(`<!-- ${tag} -->[\\s\\S]*?(<!-- /${tag} -->|$)`);
  const block = `<!-- ${tag} -->\n${body}\n<!-- /${tag} -->`;
  md = md.includes(`<!-- /${tag} -->`) ? md.replace(re, block) : md.replace(`<!-- ${tag} -->`, block);
};
const fmtD = (r: any) => (r.max < 1 ? "same day" : r.min >= 14 && r.max >= 21 ? `${Math.round(r.min / 7)}–${Math.round(r.max / 7)} weeks` : `${r.min < 1 ? "<1" : r.min}–${r.max} days`);
const guides = readdirSync("data/guides").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`data/guides/${f}`, "utf8")))
  .sort((a, b) => a.verdict.difficulty - b.verdict.difficulty);
const rows = guides.map((g) => {
  const n = (e: string) => g.claims.filter((c: any) => c.evidence === e).length;
  const tested = g.claims.filter((c: any) => c.evidence === "tested").map((c: any) => c.artifact?.startsWith("probe:") ? "probe" : c.artifact?.startsWith("lookup:") ? "lookup" : c.artifact?.includes("composio") || c.artifact?.startsWith("log_") ? "Composio call" : "screenshot");
  const kinds = [...new Set(tested)].join(", ") || "n/a";
  return `| [${g.app.name}](/guides/${g.slug}) | ${g.verdict.difficulty} ${g.verdict.label} | ${fmtD(g.verdict.productionDays)} | ${g.app.composioManaged === null ? "not on Composio" : g.app.composioManaged ? "managed" : "BYO"} | ${n("tested")} (${kinds}) | ${n("sourced")} | ${n("uncertain")} | ${g.endToEnd ? "✅ " + g.endToEnd.testedAt : "n/a"} |`;
});
put("GOLD_TABLE", `## Gold guides: what was tested vs. sourced\n\n| App | Difficulty | Time to production | Composio | Tested | Sourced | Uncertain | End-to-end |\n|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\nEvery sourced quote is re-checked against the live page (\`pnpm verify\`); curation edits live in \`data/gold-patches/\` and are applied by a script that rejects any quote it can't find.`);
if (existsSync("eval/results.json")) {
  const e = JSON.parse(readFileSync("eval/results.json", "utf8"));
  const p = (x: number) => `${Math.round(x * 100)}%`;
  put("EVAL_TABLE", `## Eval (live agent vs. hand-checked facts)\n\n| Fact recall | Fact precision | Citation validity | Difficulty exact / ±1 |\n|---|---|---|---|\n| ${p(e.factRecall)} | ${p(e.factPrecision)} | ${p(e.citationValidity)} | ${p(e.difficultyExact)} / ${p(e.difficultyWithin1)} |\n\n${e.facts} facts across ${e.apps} apps (\`eval/ground-truth.json\`, every quote verified live), run ${e.runAt}. The agent ran with **open discovery** (no curated sources), which is what a developer gets for an app outside the library. Per-app detail: [/method#eval](/method#eval) and \`eval/results.json\`.\n\n| App | Gold | Agent | Facts stated | Contradicted | Citations valid |\n|---|---|---|---|---|---|\n${e.perApp.map((a: any) => `| ${a.slug} | ${a.gold} | ${a.agent ?? "n/a"} | ${a.covered}/${a.total} | ${a.contradicted} | ${a.citations} |`).join("\n")}`);
}
writeFileSync("README.md", md);
console.log("README tables updated:", guides.length, "gold guides");
