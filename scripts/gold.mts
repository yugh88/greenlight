// Gold path draft: curated sources from data/gold-sources.json → data/guides/<slug>.json (then human review).
// Usage: GREENLIGHT_RENDER=1 pnpm tsx scripts/gold.mts github
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const { runPipeline } = await import("../lib/agent/pipeline.ts");
const src = JSON.parse(readFileSync("data/gold-sources.json", "utf8"));
for (const slug of process.argv.slice(2)) {
  const s = src[slug];
  const out = `data/guides/${slug}.json`;
  if (existsSync(out) && !process.env.FORCE) { console.log("skip (exists)", out); continue; }
  let r;
  try {
  r = await runPipeline(s.name, (stage, msg) => console.log(`[${slug}:${stage}] ${msg}`), {
    seedUrls: s.urls, name: s.name, website: s.website, composioSlug: s.composio, slug, excerptBudget: 9000,
  });
  } catch (e) { console.log(`FAILED ${slug}: ${(e as Error).message.slice(0, 160)}`); continue; }
  const g = { ...r.guide, generatedBy: "gold", reviewStatus: "unreviewed" };
  mkdirSync("data/guides", { recursive: true });
  writeFileSync(out, JSON.stringify(g, null, 1));
  const mix = g.claims.reduce((a: any, c: any) => ((a[c.evidence] = (a[c.evidence] ?? 0) + 1), a), {});
  console.log(`DONE ${slug} d=${g.verdict.difficulty} ${JSON.stringify(mix)} ${Math.round(r.report.ms / 1000)}s model=${r.report.draftModel}`);
}
