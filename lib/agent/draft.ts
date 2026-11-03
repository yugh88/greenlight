/**
 * Draft: turn the evidence pack into a Guide via structured output.
 *
 * The model never writes URLs or artifact paths. It cites evidence by reference id
 * (S1..Sn = fetched pages, P1..Pn = probes, C1 = Composio facts) and copies a verbatim quote.
 * We map refs → sourceUrl / artifact deterministically, so a model cannot invent a citation.
 */
import { z } from "zod";
import { structured } from "@/lib/model";
import { Guide, DIFFICULTY_LABELS } from "@/lib/schema";
import type { Page } from "./fetch";
import type { ProbeResult } from "./probes";
import { describeProbe } from "./probes";
import type { ComposioFacts } from "./composio";

export const DraftClaim = z.object({
  id: z.string().describe("short kebab id, e.g. 'c-redirect-https'"),
  text: z.string().describe("one atomic factual statement"),
  ref: z.string().describe("Evidence id this claim rests on: S<n>, P<n>, C1, C2, or 'none' if unsupported"),
  quote: z
    .string()
    .optional()
    .describe("For S/C refs: VERBATIM sentence copied from that source, max 200 chars"),
  reason: z.string().optional().describe("For ref 'none': why it is uncertain / what would confirm it"),
});

export const Draft = Guide.omit({
  slug: true,
  app: true,
  claims: true,
  generatedBy: true,
  reviewStatus: true,
  lastVerified: true,
  endToEnd: true,
}).extend({ claims: z.array(DraftClaim) });
export type Draft = z.infer<typeof Draft>;

export type EvidencePack = {
  appName: string;
  website: string;
  sources: { ref: string; page: Page; excerpt: string }[];
  probes: { ref: string; probe: ProbeResult; artifact: string }[];
  composio: ComposioFacts & { ref: "C1" };
};

const KEEP = /oauth|authori[sz]|scope|consent|review|verif|redirect|callback|localhost|https|rate|limit|quota|tier|price|pricing|plan|partner|approv|privacy|terms|polic|client.?id|client.?secret|register|create|test.?user|development mode|production|publish|distribut|install|admin|tenant|pkce|refresh|expire|token|business|days|weeks|security|assessment|video|screencast|cap\b|users/i;

/** Keep the paragraphs most likely to matter, within a char budget. */
export function excerpt(text: string, budget = 7_000) {
  const paras = text.split(/\n{1,}/).map((p) => p.trim()).filter((p) => p.length > 30);
  const keep: string[] = [];
  let used = 0;
  for (let i = 0; i < paras.length && used < budget; i++) {
    if (KEEP.test(paras[i]) || i < 3) {
      const p = paras[i].slice(0, 900);
      keep.push(p);
      used += p.length;
    }
  }
  return keep.join("\n");
}

const RUBRIC = Object.entries(DIFFICULTY_LABELS)
  .map(([k, v]) => `${k} = ${v}`)
  .join("; ");

const DEPTH = `COVERAGE (address each one the evidence allows; mark gaps in uncertainties):
- which app type to register if the provider offers several (e.g. OAuth app vs. platform app; public vs. private/custom; single- vs. multi-tenant)
- where in the console you create it and which fields it asks for
- redirect URI rules (HTTPS required? localhost allowed? exact match? how many?)
- development/testing limits before review (user caps, test users, dev mode, rate limits)
- what triggers review/verification, what it requires (privacy policy, video, business docs, security assessment), and how long it takes
- scope tiers and which scopes trigger review
- API access tiers or pricing that gate production use
- token lifetime / refresh behaviour that affects an always-on agent
- at least 3 blockers with exact error text when available
Aim for 15-30 well-supported claims.`;

export async function draftGuide(pack: EvidencePack, opts: { depth?: boolean } = {}) {
  const sources = pack.sources
    .map((s) => `### ${s.ref}: ${s.page.title || s.page.finalUrl}\nURL: ${s.page.finalUrl}\n${s.excerpt}`)
    .join("\n\n");
  const probes = pack.probes.map((p) => `### ${p.ref} (tested, public probe)\n${describeProbe(p.probe)}`).join("\n\n");
  const c = pack.composio;
  const composio = `### C1: Composio toolkit facts (${c.sourceUrl})
${c.slug ? `Toolkit slug: ${c.slug}. Composio-managed OAuth app: ${c.managed ? "YES" : "NO (bring your own OAuth app)"}. Auth schemes: ${c.authSchemes.join(", ") || "unknown"}. Quote: "${c.quote}"` : `${pack.appName} is NOT in Composio's toolkit catalog. A developer would need a custom toolkit / Composio's auth for custom tools, or a different integration path.`}
For Composio background (why bring your own app, where the redirect URI comes from) cite source C2 with a verbatim quote. If the app is not in Composio's catalog, cite C1 (it is a tested catalog lookup, no quote needed).`;

  const prompt = `You are Greenlight, writing a guide for a developer who must create an OAuth app with ${pack.appName} (${pack.website}) and get it approved so their AI agent's users can connect accounts through Composio.

EVIDENCE (the only facts you may rely on):
${sources || "(no provider pages could be fetched)"}

${probes || "(no probes)"}

${composio}

RULES
- Every factual statement goes into "claims" with a ref. ref S<n>/C2 requires a VERBATIM quote (<=200 chars) copied exactly from that source's text. ref P<n> for probe results (no quote needed). If you believe something but the evidence does not state it, use ref "none" and give a reason. Never invent quotes. Prefer fewer, true claims over many weak ones.
- Every section element lists claimIds of the claims it rests on.
- Difficulty rubric: ${RUBRIC}. Pick the level the evidence supports; mention uncertainty if the evidence is thin.
- verdict.firstTokenMinutes = minutes until the developer can test OAuth with their own account. verdict.productionDays = days until arbitrary users can connect, INCLUDING provider review waits. If review time is not documented, give a wide range and add a ref "none" claim explaining.
- phases: typical order create app → configure (redirect/scopes) → test with own/dev users → submit for review (if any) → provider wait (owner "provider", waiting=true) → go live. Skip phases that do not exist for this provider. Owner "agent" only for things an agent can genuinely do without logging in (draft text, fill values, check URLs).
- artefacts: write copy-paste ready text the agent produces for the developer: app-form values (name, description, homepage, redirect URI placeholder "<Composio callback URL from your auth config>"), scope justification, and if review exists: reviewer email draft / demo-video script / privacy-policy checklist.
- scopes: real scope strings from the evidence only; tier basic/sensitive/restricted; reviewTrigger true if requesting it triggers review.
- blockers: realistic failure modes with the exact error text where the evidence gives it; fallback options (Composio-managed app if available, narrower scopes, different API tier...).
- checklist: 6-14 concrete imperative steps, each with owner.
- uncertainties: plain-language list of what you could not verify.
- Be concise. No marketing language.
${opts.depth ? DEPTH : ""}`;

  const { object, modelId } = await structured("agent", Draft, prompt);
  return { draft: object, modelId };
}
