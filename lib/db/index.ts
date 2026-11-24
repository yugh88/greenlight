import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { MIGRATIONS } from "./migrations";
import * as schema from "./schema";
import linear from "@/data/generated/linear.json";
import strava from "@/data/generated/strava.json";
import type { Guide } from "@/lib/schema";

/**
 * Database with automatic failover.
 *
 *   1. primary   DATABASE_URL           (Neon in production)
 *   2. fallback  DATABASE_URL_FALLBACK  (any Postgres: a second Neon project, Supabase, local Postgres…)
 *   3. embedded  PGlite                 (Postgres compiled to WASM, in-process; zero config)
 *
 * Every backend is migrated on first use (idempotent CREATE … IF NOT EXISTS), so pointing either URL at
 * an empty database just works. When a backend fails with a connectivity / quota / auth error (e.g. Neon's
 * HTTP 402 "exceeded the quota"), it is skipped for COOLDOWN_MS and the next one serves the request.
 * Query bugs (constraint violations, bad SQL) are rethrown, never masked by failover.
 *
 * Set DB_EMBEDDED_FALLBACK=0 to disable the embedded tier.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type BackendName = "primary" | "fallback" | "embedded";

type Backend = {
  name: BackendName;
  describe: string;
  connect: () => Promise<Db>;
  db?: Promise<Db>;
  downUntil: number;
  lastError?: string;
};

const COOLDOWN_MS = 5 * 60_000;

function urlBackend(name: BackendName, url: string): Backend {
  const host = safeHost(url);
  const isNeon = /neon\.tech$/i.test(host);
  return {
    name,
    describe: `${isNeon ? "neon" : "postgres"}://${host}`,
    downUntil: 0,
    connect: async () => {
      const db = (
        isNeon
          ? drizzleNeon(neon(url), { schema })
          : drizzlePostgres(postgres(url, { max: 3, prepare: false, connect_timeout: 8, idle_timeout: 20 }), { schema })
      ) as unknown as Db;
      await migrate(db);
      return db;
    },
  };
}

function embeddedBackend(): Backend {
  // Locally the data survives restarts; on serverless only /tmp is writable (per instance, ephemeral).
  const dataDir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/greenlight-pglite" : ".data/pglite");
  return {
    name: "embedded",
    describe: `pglite://${dataDir}`,
    downUntil: 0,
    connect: async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle } = await import("drizzle-orm/pglite");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dataDir, { recursive: true });
      const client = await PGlite.create(dataDir);
      const db = drizzle(client, { schema }) as unknown as Db;
      await migrate(db);
      await seedEmbedded(db);
      return db;
    },
  };
}

let _backends: Backend[] | null = null;
function backends(): Backend[] {
  if (_backends) return _backends;
  const list: Backend[] = [];
  if (process.env.DATABASE_URL) list.push(urlBackend("primary", process.env.DATABASE_URL));
  const fallbackUrl = process.env.DATABASE_URL_FALLBACK ?? process.env.FALLBACK_DATABASE_URL; // the latter is what `vercel integration add neon --prefix FALLBACK_` creates
  if (fallbackUrl) list.push(urlBackend("fallback", fallbackUrl));
  if (process.env.DB_EMBEDDED_FALLBACK !== "0") list.push(embeddedBackend());
  return (_backends = list);
}

/**
 * Run a query against the first healthy backend, failing over on connectivity errors.
 * A failed backend stays skipped for COOLDOWN_MS, so a live job's writes and the polls that read it
 * keep hitting the same database instead of flapping.
 */
export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const all = backends();
  if (!all.length) throw new Error("DATABASE_URL is not set");
  const now = Date.now();

  let lastErr: unknown;
  for (const [i, b] of all.entries()) {
    const isLast = i === all.length - 1;
    if (b.downUntil > now && !isLast) continue;
    try {
      b.db ??= b.connect();
      return await fn(await b.db);
    } catch (e) {
      if (!isFailoverError(e)) throw e;
      lastErr = e;
      b.db = undefined; // reconnect (and re-migrate) next time
      b.downUntil = Date.now() + COOLDOWN_MS;
      b.lastError = errorText(e).slice(0, 300);
      console.warn(`[db] ${b.name} (${b.describe}) unavailable, failing over: ${b.lastError}`);
    }
  }
  throw lastErr;
}

/** @deprecated kept for scripts: returns the first healthy backend's handle (connected + migrated). */
export async function db(): Promise<Db> {
  return withDb(async (d) => d);
}

/** Which backend is serving and the health of each (for /api/health and the CLI). */
export async function dbStatus() {
  let active: BackendName | null = null;
  let error: string | null = null;
  try {
    await withDb(async (d) => {
      await d.execute(sql`select 1`);
    });
    const now = Date.now();
    const all = backends();
    active = (all.find((b) => b.downUntil <= now) ?? all[all.length - 1])?.name ?? null;
  } catch (e) {
    error = errorText(e).slice(0, 300);
  }
  return {
    active,
    error,
    backends: backends().map((b) => ({
      name: b.name,
      target: b.describe,
      healthy: b.downUntil <= Date.now(),
      lastError: b.lastError ?? null,
    })),
  };
}

// ---------- migrations / seed ----------

export async function migrate(d: Db) {
  for (const stmt of MIGRATIONS) await d.execute(sql.raw(stmt));
}

/** The embedded DB starts empty; give it the agent guides shipped in data/generated so the library isn't bare. */
async function seedEmbedded(d: Db) {
  const [{ n }] = (await d.select({ n: sql<number>`count(*)::int` }).from(schema.guides)) as { n: number }[];
  if (n > 0) return;
  for (const g of [linear, strava] as unknown as Guide[]) {
    await d
      .insert(schema.guides)
      .values({
        slug: g.slug,
        name: g.app.name,
        difficulty: g.verdict.difficulty,
        composioManaged: g.app.composioManaged,
        generatedBy: g.generatedBy,
        body: g,
        lastVerified: g.lastVerified,
      })
      .onConflictDoNothing();
  }
}

// ---------- error classification ----------

/** Root-cause first, without drizzle's "Failed query: <sql>" wrapper (keeps logs short and free of data). */
function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 4; i++) {
    const msg = (cur as Error).message ?? String(cur);
    if (!msg.startsWith("Failed query:")) parts.push(msg);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.reverse().join(" | ").replace(/\s+/g, " ").trim() || "unknown database error";
}

function sqlState(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; cur && i < 4; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Fail over on anything that means "this database can't serve us right now".
 * Rethrow errors that mean "this query is wrong": integrity (23), data (22), and syntax/access (42),
 * except 42P01 (missing table, i.e. an un-migrated database) and 28xxx (auth).
 */
export function isFailoverError(e: unknown): boolean {
  const code = sqlState(e);
  if (code) {
    if (code === "42P01") return true;
    if (/^(22|23|42)/.test(code)) return false;
    return true; // 08 connection, 28 auth, 53 resources, 57 operator intervention, XX internal…
  }
  return true; // network / HTTP-level failures (fetch failed, 402 quota, ECONNREFUSED, timeouts)
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

export { schema };

/** Open (and migrate) one specific database, bypassing failover: a postgres URL, or "embedded". Used by the CLI. */
export async function openDatabase(target: string): Promise<{ db: Db; describe: string }> {
  const b = target === "embedded" ? embeddedBackend() : urlBackend("primary", target);
  return { db: await b.connect(), describe: b.describe };
}
