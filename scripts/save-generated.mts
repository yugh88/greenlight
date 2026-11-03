// Upsert data/generated/<slug>.json (agent guides from the CLI) into Neon.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, readdirSync } from "node:fs";
const { db, schema } = await import("../lib/db/index.ts");
const { Guide } = await import("../lib/schema.ts");
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("data/generated").map((f) => `data/generated/${f}`);
for (const f of files) {
  const g = Guide.parse(JSON.parse(readFileSync(f, "utf8")));
  const row = { slug: g.slug, name: g.app.name, difficulty: g.verdict.difficulty, composioManaged: g.app.composioManaged, generatedBy: g.generatedBy, body: g, lastVerified: g.lastVerified };
  await db().insert(schema.guides).values(row).onConflictDoUpdate({ target: schema.guides.slug, set: { ...row, updatedAt: new Date() } });
  console.log("saved", g.slug);
}
