/**
 * Idempotent schema for every backend (Neon, any Postgres, embedded PGlite). Mirrors lib/db/schema.ts;
 * generated with `drizzle-kit generate` and made re-runnable. Add new statements at the end, never edit old ones.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS "guides" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"difficulty" integer NOT NULL,
	"composio_managed" boolean,
	"generated_by" text NOT NULL,
	"body" jsonb NOT NULL,
	"last_verified" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"input" text NOT NULL,
	"slug" text,
	"status" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "guides_difficulty_idx" ON "guides" USING btree ("difficulty")`,
  `CREATE INDEX IF NOT EXISTS "jobs_slug_idx" ON "jobs" USING btree ("slug")`,
];
