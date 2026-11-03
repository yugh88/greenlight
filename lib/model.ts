/**
 * One place to choose models. Swap providers with AI_PROVIDER=google|anthropic|openai.
 *
 * Google free tier, verified live with this project's key on 2026-11-03:
 * - gemini-3.8-flash: free, but frequently 503 "high demand" → fall back down the chain
 * - gemini-3.5-flash-lite: free, fast (~1s), reliable → verifier + last-resort agent
 * - gemini-2.5-flash: 404 "no longer available to new users"
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
  agent: csv(process.env.GOOGLE_AGENT_MODELS) ?? [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ],
  verifier: csv(process.env.GOOGLE_VERIFIER_MODELS) ?? ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
};

export function provider() {
  return (process.env.AI_PROVIDER ?? "google") as "google" | "anthropic" | "openai";
}

async function build(role: ModelRole, id: string): Promise<LanguageModel> {
  switch (provider()) {
    case "google":
      return google(id);
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

function chain(role: ModelRole) {
  return provider() === "google" ? GOOGLE_CHAINS[role] : [`${provider()}:${role}`];
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
  { triesPerModel = 3, label = role }: { triesPerModel?: number; label?: string } = {},
): Promise<{ result: T; modelId: string }> {
  let lastErr: unknown;
  for (const id of chain(role)) {
    const model = await build(role, id);
    let delay = 2_000;
    for (let i = 0; i < triesPerModel; i++) {
      try {
        return { result: await fn(model, id), modelId: id };
      } catch (err) {
        lastErr = err;
        const s = statusOf(err);
        const retryable = s === 429 || (s !== undefined && s >= 500);
        if (!retryable) throw err;
        if (i === triesPerModel - 1) break; // move to next model
        const wait = delay + Math.random() * 1_000;
        console.warn(`[${label}] ${id} → ${s}; retry ${i + 1} in ${Math.round(wait)}ms`);
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, 30_000);
      }
    }
    console.warn(`[${label}] ${id} unavailable, falling back`);
  }
  throw lastErr;
}

/** Serialize model calls (1 at a time) to stay under free-tier RPM. */
let queue: Promise<unknown> = Promise.resolve();
export function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}
