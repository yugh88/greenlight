/**
 * Path to the 100-guide library: run the live pipeline over Composio's bring-your-own OAuth toolkits.
 * Guides are saved as agent / unreviewed; promote one to gold after a human walkthrough
 * (data/gold-sources.json + data/gold-patches/<slug>.json).
 *
 *   pnpm tsx scripts/batch.mts              # dry run: list the next toolkits without a guide
 *   pnpm tsx scripts/batch.mts --run 10     # generate 10 sequentially, throttled
 *
 * Throttle: GENERATIONS_PER_HOUR (default 20, the same limit as the public endpoint).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, readdirSync } from "node:fs";

const n = Number(process.argv[process.argv.indexOf("--run") + 1] || 0);
const run = process.argv.includes("--run") && n > 0;
const perHour = Number(process.env.GENERATIONS_PER_HOUR ?? 20);
const gap = Math.ceil(3_600_000 / perHour);

const dir = JSON.parse(readFileSync("data/composio-directory.json", "utf8")) as {
  toolkits: { name: string; slug: string; composioManaged: boolean }[];
};
const { db, schema } = await import("../lib/db/index.ts");
const { slugify } = await import("../lib/agent/discover.ts");
const existing = new Set([
  ...readdirSync("data/guides").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")),
  ...(await db().select({ slug: schema.guides.slug }).from(schema.guides)).map((r) => r.slug),
]);
// skip MCP-only variants; one guide per provider
const queue = dir.toolkits
  .filter((t) => !t.composioManaged && !/_MCP$/.test(t.slug))
  .filter((t) => !existing.has(slugify(t.name)));

console.log(`${queue.length} bring-your-own toolkits without a guide (of ${dir.toolkits.filter((t) => !t.composioManaged).length}).`);
if (!run) {
  console.log("next up:", queue.slice(0, 15).map((t) => t.name).join(", "));
  console.log("dry run: pass --run <n> to generate.");
  process.exit(0);
}

const { runPipeline } = await import("../lib/agent/pipeline.ts");
for (const [i, t] of queue.slice(0, n).entries()) {
  const t0 = Date.now();
  try {
    const r = await runPipeline(t.name, (stage, msg) => stage === "error" && console.log(`  ${msg}`), { composioSlug: t.slug });
    const g = r.guide;
    const row = { slug: g.slug, name: g.app.name, difficulty: g.verdict.difficulty, composioManaged: g.app.composioManaged, generatedBy: g.generatedBy, body: g, lastVerified: g.lastVerified };
    await db().insert(schema.guides).values(row).onConflictDoUpdate({ target: schema.guides.slug, set: { ...row, updatedAt: new Date() } });
    console.log(`✓ ${i + 1}/${n} ${t.name}: difficulty ${g.verdict.difficulty}, ${g.claims.length} claims, ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    console.log(`✗ ${i + 1}/${n} ${t.name}: ${(e as Error).message.slice(0, 160)}`);
  }
  if (i < n - 1) await new Promise((r) => setTimeout(r, Math.max(0, gap - (Date.now() - t0))));
}
