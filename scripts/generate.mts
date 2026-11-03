// Usage: pnpm tsx scripts/generate.mts "Strava" [--save]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, writeFileSync } from "node:fs";
const { runPipeline } = await import("../lib/agent/pipeline.ts");
const input = process.argv[2]!;
const r = await runPipeline(input, (stage, msg) => console.log(`[${stage}] ${msg}`));
const dir = `data/generated`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${r.guide.slug}.json`, JSON.stringify(r.guide, null, 1));
mkdirSync(`evidence/${r.guide.slug}`, { recursive: true });
writeFileSync(`evidence/${r.guide.slug}/probes.json`, JSON.stringify(r.probes, null, 1));
const mix = r.guide.claims.reduce((a: any, c) => ((a[c.evidence] = (a[c.evidence] ?? 0) + 1), a), {});
console.log("\nDONE", r.guide.slug, "difficulty", r.guide.verdict.difficulty, r.guide.verdict.label, "| claims", mix, "| report", JSON.stringify(r.report));
