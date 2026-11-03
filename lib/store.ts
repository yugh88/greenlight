import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { goldGuides } from "@/data/guides";
import { db, schema } from "@/lib/db";
import type { JobStep } from "@/lib/db/schema";
import { Guide } from "@/lib/schema";

export type GuideSummary = {
  slug: string;
  name: string;
  website: string;
  difficulty: number;
  label: string;
  summary: string;
  composioManaged: boolean | null;
  composioSlug: string | null;
  generatedBy: "gold" | "agent";
  reviewStatus: "reviewed" | "unreviewed";
  firstTokenMinutes: { min: number; max: number };
  productionDays: { min: number; max: number };
  cost: string;
  requirementKinds: string[];
  lastVerified: string;
  endToEnd: boolean;
};

const hasDb = () => Boolean(process.env.DATABASE_URL);

export function summarize(g: Guide): GuideSummary {
  return {
    slug: g.slug,
    name: g.app.name,
    website: g.app.website,
    difficulty: g.verdict.difficulty,
    label: g.verdict.label,
    summary: g.verdict.summary,
    composioManaged: g.app.composioManaged,
    composioSlug: g.app.composioSlug,
    generatedBy: g.generatedBy,
    reviewStatus: g.reviewStatus,
    firstTokenMinutes: g.verdict.firstTokenMinutes,
    productionDays: g.verdict.productionDays,
    cost: g.verdict.cost,
    requirementKinds: g.requirements.filter((r) => r.required !== "no").map((r) => r.kind),
    lastVerified: g.lastVerified,
    endToEnd: Boolean(g.endToEnd),
  };
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const gold = goldGuides.find((g) => g.slug === slug);
  if (gold) return gold;
  if (!hasDb()) return null;
  const rows = await db().select().from(schema.guides).where(eq(schema.guides.slug, slug)).limit(1);
  return rows[0]?.body ?? null;
}

export async function listGuides(): Promise<GuideSummary[]> {
  const out = new Map<string, GuideSummary>();
  if (hasDb()) {
    try {
      const rows = await db().select().from(schema.guides).orderBy(desc(schema.guides.updatedAt)).limit(500);
      for (const r of rows) out.set(r.slug, summarize(r.body));
    } catch (e) {
      console.warn("listGuides db error", (e as Error).message);
    }
  }
  for (const g of goldGuides) out.set(g.slug, summarize(g)); // gold wins
  return [...out.values()].sort(
    (a, b) =>
      (a.generatedBy === "gold" ? 0 : 1) - (b.generatedBy === "gold" ? 0 : 1) ||
      a.difficulty - b.difficulty ||
      a.name.localeCompare(b.name),
  );
}

export async function saveGuide(g: Guide) {
  const parsed = Guide.parse(g);
  await db()
    .insert(schema.guides)
    .values({
      slug: parsed.slug,
      name: parsed.app.name,
      difficulty: parsed.verdict.difficulty,
      composioManaged: parsed.app.composioManaged,
      generatedBy: parsed.generatedBy,
      body: parsed,
      lastVerified: parsed.lastVerified,
    })
    .onConflictDoUpdate({
      target: schema.guides.slug,
      set: {
        name: parsed.app.name,
        difficulty: parsed.verdict.difficulty,
        composioManaged: parsed.app.composioManaged,
        generatedBy: parsed.generatedBy,
        body: parsed,
        lastVerified: parsed.lastVerified,
        updatedAt: new Date(),
      },
    });
}

// ---------- jobs ----------

export async function createJob(id: string, input: string) {
  await db().insert(schema.jobs).values({ id, input, status: "queued", steps: [] });
}

export async function appendStep(id: string, step: JobStep) {
  await db()
    .update(schema.jobs)
    .set({
      steps: sql`${schema.jobs.steps} || ${JSON.stringify([step])}::jsonb`,
      status: "running",
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));
}

export async function finishJob(id: string, patch: { status: "done" | "error"; slug?: string; error?: string }) {
  await db()
    .update(schema.jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
}

export async function getJob(id: string) {
  const rows = await db().select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** A job for this input that is still running (dedupe concurrent requests). */
export async function findRunningJob(input: string) {
  const rows = await db()
    .select()
    .from(schema.jobs)
    .where(sql`lower(${schema.jobs.input}) = lower(${input}) and ${schema.jobs.status} in ('queued','running') and ${schema.jobs.updatedAt} > now() - interval '6 minutes'`)
    .limit(1);
  return rows[0] ?? null;
}

/** Global throttle for the public live agent (free-tier model quota). */
export async function recentJobCount(minutes = 60) {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(sql`${schema.jobs.createdAt} > now() - make_interval(mins => ${minutes})`);
  return rows[0]?.n ?? 0;
}
