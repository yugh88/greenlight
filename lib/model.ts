/**
 * One place to choose models. Swap providers with AI_PROVIDER=google|anthropic|openai.
 *
 * Google free tier (checked 2026-11-03, https://ai.google.dev/gemini-api/docs/pricing):
 * - gemini-3.8-flash: free input/output; Google Search grounding NOT available on free tier
 * - gemini-3.5-flash-lite: free; used for cheap verifier passes
 * - gemini-2.5-flash: free, and the newest model with free Search grounding (500 RPD shared)
 * Free tier: Google may use prompts/outputs to improve its products. Only send public
 * docs and public probe results to the model; never keys, tokens or client secrets.
 */
import type { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";

export type ModelRole = "agent" | "verifier" | "search";

const GOOGLE_MODELS: Record<ModelRole, string> = {
  agent: process.env.GOOGLE_AGENT_MODEL ?? "gemini-3.8-flash",
  verifier: process.env.GOOGLE_VERIFIER_MODEL ?? "gemini-3.5-flash-lite",
  search: process.env.GOOGLE_SEARCH_MODEL ?? "gemini-2.5-flash",
};

export function provider() {
  return (process.env.AI_PROVIDER ?? "google") as "google" | "anthropic" | "openai";
}

export async function getModel(role: ModelRole): Promise<LanguageModel> {
  switch (provider()) {
    case "google":
      return google(GOOGLE_MODELS[role]);
    case "anthropic": {
      // Installed only if you switch: pnpm add @ai-sdk/anthropic
      const { anthropic } = await import(/* webpackIgnore: true */ "@ai-sdk/anthropic" as string);
      return anthropic(role === "verifier" ? "claude-haiku-5-5" : "claude-sonnet-5-5");
    }
    case "openai": {
      // Set OPENAI_MODEL explicitly; we don't hardcode an unverified id.
      const { openai } = await import(/* webpackIgnore: true */ "@ai-sdk/openai" as string);
      const id = process.env.OPENAI_MODEL;
      if (!id) throw new Error("AI_PROVIDER=openai requires OPENAI_MODEL");
      return openai(id);
    }
  }
}

export function modelId(role: ModelRole) {
  return provider() === "google" ? GOOGLE_MODELS[role] : `${provider()}:${role}`;
}

/** Retry with exponential backoff + jitter on 429 / 5xx. Free-tier limits are low. */
export async function withRetry<T>(fn: () => Promise<T>, label = "model", tries = 6): Promise<T> {
  let delay = 2_000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { statusCode?: number; status?: number })?.statusCode ??
        (err as { status?: number })?.status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || i >= tries - 1) throw err;
      const wait = delay + Math.random() * 1_000;
      console.warn(`[${label}] ${status}, retry ${i + 1}/${tries - 1} in ${Math.round(wait)}ms`);
      await new Promise((r) => setTimeout(r, wait));
      delay = Math.min(delay * 2, 60_000);
    }
  }
}

/** Serialize model calls (1 at a time) to stay under free-tier RPM. */
let chain: Promise<unknown> = Promise.resolve();
export function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}
