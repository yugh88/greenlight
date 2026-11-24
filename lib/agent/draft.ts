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

/** Topics that decide difficulty; a paragraph scores per topic it touches. */
const TOPICS: RegExp[] = [
  /review|verif|approv|publish|distribut|marketplace|app store|production|go.?live|certif|submission/i,
  /test.?users?|testing|development mode|dev(elopment)? mode|sandbox|allowlist|allow.?list|whitelist|quota mode|extended quota|starter|unverified/i,
  /rate.?limit|quota|per (hour|day|minute|month)|requests|tier|plan|pric|cost|\$|€|£|credits?|connections?|billing/i,
  /scopes?|permissions?|restricted|sensitive|access level|full access|advanced access|limited access/i,
  /redirect|callback|localhost|loopback|127\.0\.0\.1|https|reply url|exact match/i,
  /error|invalid|mismatch|denied|forbidden|unauthori[sz]ed|blocked|fails?|troubleshoot/i,
  /refresh|expir|lifetime|revok|token|seven days|7 days/i,
  /business|organi[sz]ation|partner|publisher|premium|monthly active|MAU|individual|company|legal entity/i,
  /privacy|terms|policy|security assessment|cas[a ]|audit|video|screencast|demo|admin consent|tenant/i,
];
const HARD = /\b(must|required?|requires|only|cannot|can't|not allowed|not supported|limited to|up to|at least|maximum|minimum|no longer|deprecated|starting|as of|since|effective)\b/i;
const NUMERIC = /\b\d[\d,.]*\s*(\+|k\b|%|users?|days?|weeks?|months?|hours?|minutes?|requests?|calls?|connections?|apps?|workspaces?|urls?|MAU|monthly)/i;

function score(p: string) {
  let n = 0;
  for (const t of TOPICS) if (t.test(p)) n += 2;
  if (HARD.test(p)) n += 2;
  if (NUMERIC.test(p)) n += 3;
  else if (/\d/.test(p)) n += 1;
  if (/\b(20\d\d)\b/.test(p)) n += 1; // dated policy changes
  return n;
}

/**
 * Pick the most decision-relevant paragraphs of a page within a char budget, kept in page order.
 * Short consecutive lines (table rows, list items like "Starter | 5 connections") are merged into one
 * block instead of being dropped, so tier/limit tables survive.
 */
export function excerpt(text: string, budget = 12_000) {
  const blocks: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) blocks.push(run.join(" | "));
    run = [];
  };
  // Undo hard wraps (markdown docs wrap at ~80 cols): join a line to the next when it ends mid-sentence.
  const unwrapped = text.replace(/([^\n.:!?|])\n(?=[a-z(\[])/g, "$1 ");
  for (const raw of unwrapped.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length < 80 && !/^#/.test(line)) {
      run.push(line);
      if (run.join(" | ").length > 600) flush();
    } else {
      flush();
      blocks.push(line);
    }
  }
  flush();
  const paras = blocks.filter((b) => b.length > 25).map((b) => b.slice(0, 1_500));
  if (paras.join("\n").length <= budget) return paras.join("\n");

  const ranked = paras.map((p, i) => ({ p, i, s: i < 2 ? 100 : score(p) })).filter((x) => x.s > 0);
  ranked.sort((a, b) => b.s - a.s || a.i - b.i);
  const keep = new Set<number>();
  let used = 0;
  for (const r of ranked) {
    if (used + r.p.length > budget) continue;
    keep.add(r.i);
    used += r.p.length;
  }
  return paras.filter((_, i) => keep.has(i)).join("\n");
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
Aim for 25-45 well-supported claims.`;

function evidenceBlock(pack: EvidencePack) {
  const sources = pack.sources
    .map((s) => `### ${s.ref}: ${s.page.title || s.page.finalUrl}\nURL: ${s.page.finalUrl}\n${s.excerpt}`)
    .join("\n\n");
  const probes = pack.probes.map((p) => `### ${p.ref} (tested, public probe)\n${describeProbe(p.probe)}`).join("\n\n");
  const c = pack.composio;
  const composio = `### C1: Composio toolkit facts (${c.sourceUrl})
${c.slug ? `Toolkit slug: ${c.slug}. Composio-managed OAuth app: ${c.managed ? "YES" : "NO (bring your own OAuth app)"}. Auth schemes: ${c.authSchemes.join(", ") || "unknown"}. Quote: "${c.quote}"` : `${pack.appName} is NOT in Composio's toolkit catalog. A developer would need a custom toolkit / Composio's auth for custom tools, or a different integration path.`}
For Composio background (why bring your own app, where the redirect URI comes from) cite source C2 with a verbatim quote. If the app is not in Composio's catalog, cite C1 (it is a tested catalog lookup, no quote needed).`;
  return `EVIDENCE (the only facts you may rely on):
${sources || "(no provider pages could be fetched)"}

${probes || "(no probes)"}

${composio}`;
}

export async function draftGuide(pack: EvidencePack, opts: { depth?: boolean; deadline?: number; gapFill?: boolean } = {}) {
  const evidence = evidenceBlock(pack);
  const prompt = `You are Greenlight, writing a guide for a developer who must create an OAuth app with ${pack.appName} (${pack.website}) and get it approved so their AI agent's users can connect accounts through Composio.

${evidence}

RULES
- Every factual statement goes into "claims" with a ref. ref S<n>/C2 requires a VERBATIM quote (<=200 chars) copied exactly from that source's text. ref P<n> for probe results (no quote needed). If you believe something but the evidence does not state it, use ref "none" and give a reason. Never invent quotes.
- Be EXHAUSTIVE about what the evidence explicitly states: one atomic claim per distinct number, limit, user cap, price, tier, duration, date, eligibility rule, required item, or exact error string. Never merge two facts into one claim. Scan EVERY source, including the last ones. A wrong claim is worse than a missing one, so only cite what the quote says.
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

  const { object, modelId } = await structured("agent", Draft, prompt, 110_000, opts.deadline);

  // Gap-fill: a second, narrower pass that only extracts facts the draft missed. Drafting a whole guide
  // and extracting facts compete for the model's attention; asking only for "what else does the evidence
  // state?" recovers deep-page facts (quotas, eligibility, review timelines) the first pass skipped.
  let extra: DraftClaim[] = [];
  const left = opts.deadline ? opts.deadline - Date.now() : Infinity;
  if (opts.gapFill !== false && left > 75_000) {
    try {
      extra = await extractMissing(pack, evidence, object.claims, opts.deadline);
    } catch (e) {
      console.warn("gap-fill pass failed; keeping first draft", (e as Error).message);
    }
  }
  return { draft: { ...object, claims: mergeClaims(object.claims, extra) }, modelId, added: extra.length };
}

type DraftClaim = z.infer<typeof DraftClaim>;

async function extractMissing(pack: EvidencePack, evidence: string, have: DraftClaim[], deadline?: number) {
  const prompt = `You are auditing a guide about registering an OAuth app with ${pack.appName} and getting it approved for production.

${evidence}

CLAIMS ALREADY IN THE GUIDE:
${have.map((c) => `- ${c.text}`).join("\n")}

TASK: list up to 25 ADDITIONAL atomic facts that the EVIDENCE explicitly states and the guide does not yet cover. Look hardest for:
- numbers and limits: user caps in development/testing mode, rate limits, connection limits, how many redirect URIs, token lifetimes
- review / verification / certification: what triggers it, what it requires, how long it takes, eligibility (organisation vs individual, MAU thresholds, business verification, paid plans)
- API access tiers, pricing, and what each tier unlocks
- scope tiers (which scopes are sensitive/restricted or need review)
- redirect URI rules (HTTPS, localhost/loopback, exact match, case sensitivity)
- exact error strings and what causes them
- dated policy changes ("since", "as of", "starting")
Same rules as before: each claim cites ref S<n>/C2 with a VERBATIM quote (<=200 chars) copied exactly from that source, or P<n> for probes. Do not repeat or rephrase claims already listed. Use ids starting with "x-". If nothing new is stated, return an empty list.`;
  const { object } = await structured("agent", z.object({ claims: z.array(DraftClaim) }), prompt, 90_000, deadline);
  return object.claims;
}

function mergeClaims(base: DraftClaim[], extra: DraftClaim[]): DraftClaim[] {
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const ids = new Set(base.map((c) => c.id));
  const texts = new Set(base.map((c) => key(c.text)));
  const quotes = new Set(base.filter((c) => c.quote).map((c) => key(c.quote!)));
  const out = [...base];
  for (const c of extra) {
    if (texts.has(key(c.text)) || (c.quote && quotes.has(key(c.quote)))) continue;
    let id = c.id.startsWith("x-") ? c.id : `x-${c.id}`;
    while (ids.has(id)) id += "-2";
    ids.add(id);
    texts.add(key(c.text));
    if (c.quote) quotes.add(key(c.quote));
    out.push({ ...c, id });
  }
  return out;
}
