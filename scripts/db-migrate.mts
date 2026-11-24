// Migrate a database (create tables, idempotent) and optionally copy data into it.
//
//   pnpm db:migrate                         migrate whatever the app would use (DATABASE_URL → DATABASE_URL_FALLBACK → embedded)
//   pnpm db:migrate --to <url|embedded>     migrate a specific database
//   pnpm db:migrate --from <url> --to <url> also copy every guide + job from --from into --to (upsert, safe to re-run)
//   pnpm db:migrate --seed                  also upsert the agent guides in data/generated/*.json
//   pnpm db:migrate --status                show which backend is serving and the health of each
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
const { values: args } = parseArgs({
  options: { from: { type: "string" }, to: { type: "string" }, seed: { type: "boolean" }, status: { type: "boolean" } },
});
const { openDatabase, withDb, dbStatus, schema } = await import("../lib/db/index.ts");
type Db = Awaited<ReturnType<typeof openDatabase>>["db"];

if (args.status) {
  console.log(JSON.stringify(await dbStatus(), null, 2));
  process.exit(0);
}

const run = async (fn: (db: Db) => Promise<void>) => {
  if (args.to) {
    const t = await openDatabase(args.to);
    console.log(`migrated ${t.describe}`);
    return fn(t.db);
  }
  await withDb(fn); // connecting runs the migrations
  const s = await dbStatus();
  console.log(`migrated ${s.backends.find((b) => b.name === s.active)?.target} (${s.active})`);
};

await run(async (target) => {
  if (args.from) {
    const src = await openDatabase(args.from);
    const guides = await src.db.select().from(schema.guides);
    const jobs = await src.db.select().from(schema.jobs);
    for (const g of guides)
      await target.insert(schema.guides).values(g).onConflictDoUpdate({ target: schema.guides.slug, set: g });
    for (const j of jobs) await target.insert(schema.jobs).values(j).onConflictDoUpdate({ target: schema.jobs.id, set: j });
    console.log(`copied ${guides.length} guides, ${jobs.length} jobs from ${src.describe}`);
  }
  if (args.seed) {
    const { Guide } = await import("../lib/schema.ts");
    for (const f of readdirSync("data/generated")) {
      const g = Guide.parse(JSON.parse(readFileSync(`data/generated/${f}`, "utf8")));
      const row = { slug: g.slug, name: g.app.name, difficulty: g.verdict.difficulty, composioManaged: g.app.composioManaged, generatedBy: g.generatedBy, body: g, lastVerified: g.lastVerified };
      await target.insert(schema.guides).values(row).onConflictDoUpdate({ target: schema.guides.slug, set: { ...row, updatedAt: new Date() } });
      console.log(`seeded ${g.slug}`);
    }
  }
  const [{ n }] = await target.select({ n: sql`count(*)::int` }).from(schema.guides);
  console.log(`guides table now has ${n} rows`);
});
process.exit(0);
