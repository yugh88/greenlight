import { pgTable, text, jsonb, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import type { Guide } from "@/lib/schema";

/** One row per published guide (gold or agent). Body is the validated Guide JSON. */
export const guides = pgTable(
  "guides",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    difficulty: integer("difficulty").notNull(),
    composioManaged: boolean("composio_managed"),
    generatedBy: text("generated_by").$type<"gold" | "agent">().notNull(),
    body: jsonb("body").$type<Guide>().notNull(),
    lastVerified: text("last_verified").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("guides_difficulty_idx").on(t.difficulty)],
);

export type JobStep = {
  at: string;
  stage: "discover" | "investigate" | "draft" | "verify" | "publish" | "error";
  message: string;
  detail?: unknown;
};

/** Live-generation jobs. Steps are appended as the agent runs; UI polls / streams them. */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    input: text("input").notNull(),
    slug: text("slug"),
    status: text("status").$type<"queued" | "running" | "done" | "error">().notNull(),
    steps: jsonb("steps").$type<JobStep[]>().default([]).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("jobs_slug_idx").on(t.slug)],
);
