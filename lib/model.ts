/**
 * One place to choose models. Swap providers with AI_PROVIDER=google|anthropic|openai.
 *
 * Google free tier, verified live with this project's key on 2026-11-03:
 * - gemini-3.8-flash: free, but frequently 503 "high demand" → fall back down the chain
 * - gemini-3.5-flash-lite: free, fast (~1s), reliable → verifier + last-resort agent
 * - gemini-2.5-flash: 404 "no longer available to new users"
 * - Free tier cap: 20 generate requests/day/project/model on Flash models
 *   (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier); daily-cap 429s skip straight
 *   to the next model. gemini-3.5-flash-lite is the workhorse fallback.
 * - Google Search grounding: 429 quota exceeded on every 3.x model (no free allowance),
 *   so Discover does NOT use grounding; see lib/agent/discover.ts (site crawl + probes).
 * Free tier: Google may use prompts/outputs to improve its products. Only send public
 * docs and public probe results to the model; never keys, tokens or client secrets.
 */
import type { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";

export type ModelRole = "agent" | "verifier";

const csv = (v: string | undefined) => v?.split(",").map((s) => s.trim()).filter(Boolean);

/** Ordered fallback chains: first healthy model wins. */
const GOOGLE_CHAINS: Record<ModelRole, string[]> = {
  // flash-lite first: it drafted 6 of 8 eval guides in v3 (58% recall, 0 contradictions), answers in seconds,
  // and fails fast (503) when overloaded. The bigger Flash models are last: under load they hang until the
  // per-call timeout, which burns the generation's time budget.
  agent: csv(process.env.GOOGLE_AGENT_MODELS) ?? [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest", // alias; sometimes up when the pinned model is busy
    "gemini-3.8-flash",
    "gemini-3.6-flash",
  ],
  verifier: csv(process.env.GOOGLE_VERIFIER_MODELS) ?? ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"],
};

export function provider() {
  return (process.env.AI_PROVIDER ?? "google") as "google" | "anthropic" | "openai";
}

async function build(role: ModelRole, id: string): Promise<LanguageModel> {
  switch (provider()) {
    case "google":
      // "gateway:<provider/model>": a plain model string, which the AI SDK routes through Vercel AI Gateway.
      return id.startsWith("gateway:") ? id.slice("gateway:".length) : google(id);
    case "anthropic": {
      // Installed only if you switch: pnpm add @ai-sdk/anthropic
      const { anthropic } = await import(/* webpackIgnore: true */ "@ai-sdk/anthropic" as string);
      return anthropic(role === "verifier" ? "claude-haiku-5-5" : "claude-sonnet-5-5");
    }
    case "openai": {
      // Set OPENAI_MODEL explicitly; we don't hardcode an unverified id.
      const { openai } = await import(/* webpackIgnore: true */ "@ai-sdk/openai" as string);
      const model = process.env.OPENAI_MODEL;
      if (!model) throw new Error("AI_PROVIDER=openai requires OPENAI_MODEL");
      return openai(model);
    }
  }
}

/**
 * Optional second route to the same models through Vercel AI Gateway (AI_GATEWAY_FALLBACK=1). On Vercel it
 * authenticates with the project's OIDC token, so no extra key; it needs AI Gateway enabled on the team
 * (credit card on file; free monthly credits cover a demo). Used only after the direct Google chain fails.
 */
const GATEWAY_CHAINS: Record<ModelRole, string[]> = {
  agent: ["gateway:google/gemini-3.5-flash-lite", "gateway:google/gemini-3.6-flash"],
  verifier: ["gateway:google/gemini-3.5-flash-lite"],
};

function chain(role: ModelRole) {
  if (provider() !== "google") return [`${provider()}:${role}`];
  return [...GOOGLE_CHAINS[role], ...(process.env.AI_GATEWAY_FALLBACK === "1" ? GATEWAY_CHAINS[role] : [])];
}

/** Models that answer fast or fail fast; the only ones tried when the time budget is low. */
const isFast = (id: string) => /lite/.test(id);

/** Free tier: 20 requests/day/model on Flash models. Retrying a daily cap is pointless. */
function isDailyQuota(err: unknown): boolean {
  const e = err as { responseBody?: string; lastError?: unknown; message?: string };
  const body = e?.responseBody ?? "";
  return /PerDay|per day/i.test(body) || (e?.lastError ? isDailyQuota(e.lastError) : false);
}

function isTimeout(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: unknown };
  return e?.name === "TimeoutError" || /aborted due to timeout/i.test(e?.message ?? "") || (e?.cause ? isTimeout(e.cause) : false);
}

function statusOf(err: unknown): number | undefined {
  const e = err as { statusCode?: number; status?: number; lastError?: unknown };
  return e?.statusCode ?? e?.status ?? (e?.lastError ? statusOf(e.lastError) : undefined);
}

/**
 * Run `fn` with the role's model, retrying with backoff on 429/5xx and falling back
 * to the next model in the chain when one stays unavailable. Returns which model answered
 * (recorded on the guide for transparency).
 */
export async function withModel<T>(
  role: ModelRole,
  fn: (model: LanguageModel, modelId: string) => Promise<T>,
  {
    triesPerModel = Number(process.env.GREENLIGHT_TRIES ?? 2),
    label = role,
    deadline,
  }: { triesPerModel?: number; label?: string; deadline?: number } = {},
): Promise<{ result: T; modelId: string }> {
  let lastErr: unknown;
  // Free-tier 503 "high demand" is bursty and per model: one model is often back seconds later.
  // So cycle through the whole chain again (short waits) while the time budget allows, instead of
  // failing the generation after a single pass. Daily-quota 429s are skipped, never waited on.
  const rounds = Number(process.env.GREENLIGHT_CHAIN_ROUNDS ?? 4);
  for (let round = 0; round < rounds; round++) {
  if (round > 0) {
    const wait = Math.min(5_000 * round, 15_000);
    if (deadline && deadline - Date.now() < wait + 45_000) break;
    if (lastErr && isDailyQuota(lastErr) && round > 1) break;
    console.warn(`[${label}] all models busy; waiting ${wait / 1000}s before round ${round + 1}/${rounds}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  const ids = chain(role);
  for (const [idx, id] of ids.entries()) {
    const isLast = idx === ids.length - 1;
    // Time budget: when < 100s remain, only try fast-failing (lite) models; the big ones may hang.
    if (deadline && !isFast(id) && ids.some(isFast) && deadline - Date.now() < 100_000) {
      console.warn(`[${label}] time budget low; skipping ${id}`);
      continue;
    }
    const model = await build(role, id);
    let delay = 2_000;
    for (let i = 0; i < triesPerModel; i++) {
      const started = Date.now();
      try {
        return { result: await fn(model, id), modelId: id };
      } catch (err) {
        lastErr = err;
        const s = statusOf(err);
        console.warn(`[${label}] ${id} failed after ${Math.round((Date.now() - started) / 1000)}s: ${s ?? (err as Error)?.name} ${((err as Error)?.message ?? "").slice(0, 90)}`);
        // A hung call that hit its timeout: don't wait on this model again, try the next one.
        if (isTimeout(err)) break;
        const retryable = s === 429 || (s !== undefined && s >= 500);
        if (!retryable) throw err;
        if (i === triesPerModel - 1 || isDailyQuota(err)) break; // move to next model
        if (deadline && !isLast && !isFast(id) && deadline - Date.now() < 100_000) break;
        const wait = delay + Math.random() * 1_000;
        console.warn(`[${label}] ${id} → ${s}; retry ${i + 1} in ${Math.round(wait)}ms`);
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, 30_000);
      }
    }
    console.warn(`[${label}] ${id} unavailable, falling back`);
  }
  }
  throw lastErr ?? new Error(`[${label}] no model could be tried within the time budget`);
}

/** Serialize model calls (1 at a time) to stay under free-tier RPM. */
let queue: Promise<unknown> = Promise.resolve();
export function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

import { generateText, Output } from "ai";
import { toJSONSchema as zToJsonSchema, type z } from "zod";

/** Structured output (AI SDK v7: generateText + Output.object), with role fallback + serial queue. */
export async function structured<S extends z.ZodType>(
  role: ModelRole,
  schema: S,
  prompt: string,
  timeoutMs = 180_000,
  deadline?: number,
): Promise<{ object: z.infer<S>; modelId: string }> {
  // Alternate request shapes on retries: native structured output, then plain text asking for JSON
  // (validated with the same zod schema). During free-tier overload bursts one shape often gets through
  // when the other returns 503.
  let attempt = 0;
  const { result, modelId } = await queued(() =>
    withModel(role, async (model) => {
      const left = deadline ? deadline - Date.now() : timeoutMs;
      const perCall = Math.max(30_000, Math.min(timeoutMs, left - 15_000));
      if (attempt++ % 2 === 1) {
        const r = await generateText({
          model,
          prompt: `${prompt}\n\nRespond with ONLY a JSON object (no prose, no code fence) that validates against this JSON Schema:\n${JSON.stringify(zodJsonSchema(schema))}`,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(perCall),
        });
        return parseJsonOutput(schema, r.text);
      }
      const r = await generateText({
        model,
        output: Output.object({ schema }),
        prompt,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(perCall),
      });
      return r.output as z.infer<S>;
    }, { deadline }),
  );
  return { object: result, modelId };
}

function zodJsonSchema(schema: z.ZodType) {
  return zToJsonSchema(schema);
}

/** Parse a JSON reply from the text path; a bad reply is treated as retryable (statusCode 502). */
function parseJsonOutput<S extends z.ZodType>(schema: S, text: string): z.infer<S> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const parsed = start >= 0 && end > start ? schema.safeParse(safeJson(text.slice(start, end + 1))) : null;
  if (parsed?.success) return parsed.data;
  throw Object.assign(new Error(`model returned invalid JSON for the schema: ${parsed ? parsed.error.message.slice(0, 200) : "no JSON object"}`), { statusCode: 502 });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
