/**
 * Single source of truth for a Greenlight guide.
 * UI, Markdown export, eval, batch and the live agent all consume these types.
 *
 * Design notes:
 * - Ranges are `{ min, max }` objects rather than tuples: Gemini structured output
 *   handles `prefixItems` (tuples) poorly. Same reason URLs are plain strings here;
 *   `validateGuide()` checks URL shape and referential integrity after generation.
 * - Every factual element carries `claimIds`. A claim is the unit of evidence.
 */
import { z } from "zod";

// ---------- Evidence ----------

export const EvidenceLevel = z.enum(["tested", "sourced", "uncertain"]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

export const Claim = z.object({
  id: z.string().describe("Stable id, e.g. 'c-redirect-https'"),
  text: z.string().describe("One atomic, checkable statement"),
  evidence: EvidenceLevel,
  sourceUrl: z.string().optional().describe("Public URL that supports the claim (sourced)"),
  quote: z.string().max(200).optional().describe("Verbatim excerpt from sourceUrl, <= 200 chars"),
  artifact: z
    .string()
    .optional()
    .describe("Path to screenshot / probe trace / Composio log id (tested)"),
  reason: z.string().optional().describe("Why this is uncertain"),
  checkedAt: z.string().describe("ISO date the evidence was gathered"),
});
export type Claim = z.infer<typeof Claim>;

export const Range = z.object({ min: z.number(), max: z.number() });
export type Range = z.infer<typeof Range>;

// ---------- Rubric ----------

export const DIFFICULTY_LABELS = {
  1: "Self-serve",
  2: "Light review",
  3: "Full review",
  4: "Heavy review / verification",
  5: "Partner-only or paid / gated",
} as const;
export type Difficulty = keyof typeof DIFFICULTY_LABELS;

export const Owner = z.enum(["agent", "you", "provider"]);
export type Owner = z.infer<typeof Owner>;

export const ArtefactKind = z.enum([
  "app-form",
  "scope-justification",
  "privacy-checklist",
  "demo-video-script",
  "reviewer-email",
  "partner-application",
  "other",
]);

export const RequirementKind = z.enum([
  "business-verification",
  "privacy-policy",
  "terms-of-service",
  "domain-verification",
  "security-assessment",
  "demo-video",
  "paid-plan",
  "partner-application",
  "user-cap-before-review",
  "admin-consent",
  "other",
]);

// ---------- Guide ----------

export const Guide = z.object({
  slug: z.string().describe("kebab-case, e.g. 'gmail'"),
  app: z.object({
    name: z.string(),
    website: z.string(),
    developerDocsUrl: z.string().optional(),
    composioSlug: z.string().nullable().describe("Composio toolkit slug or null if not on Composio"),
    composioManaged: z
      .boolean()
      .nullable()
      .describe("true if Composio provides the OAuth app; null if not on Composio"),
    authSchemes: z.array(z.string()),
  }),

  verdict: z.object({
    difficulty: z.number().int().min(1).max(5),
    label: z.string(),
    summary: z.string().describe("One sentence a developer reads in 5 seconds"),
    firstTokenMinutes: Range.describe("Minutes until you can test with your own account"),
    productionDays: Range.describe("Days until real users can connect, incl. review waits"),
    cost: z.string(),
    claimIds: z.array(z.string()),
  }),

  composioFit: z.object({
    summary: z.string(),
    whyOwnApp: z
      .array(z.string())
      .describe("Reasons you may still want your own OAuth app (branding, scopes, quota...)"),
    claimIds: z.array(z.string()),
  }),

  phases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      owner: Owner,
      waiting: z.boolean().describe("true if this is a provider queue / wait (rendered hatched)"),
      minutes: Range,
      steps: z.array(z.string()),
      handoff: z.string().optional().describe("What the agent hands you / where you take over"),
      claimIds: z.array(z.string()),
    }),
  ),

  artefacts: z.array(
    z.object({
      id: z.string(),
      kind: ArtefactKind,
      title: z.string(),
      body: z.string().describe("Copy-paste ready text"),
    }),
  ),

  requirements: z.array(
    z.object({
      kind: RequirementKind,
      label: z.string(),
      required: z.enum(["yes", "no", "conditional"]),
      when: z.string().describe("When it applies, e.g. 'only for restricted scopes'"),
      claimIds: z.array(z.string()),
    }),
  ),

  scopes: z.array(
    z.object({
      scope: z.string(),
      purpose: z.string(),
      tier: z.enum(["basic", "sensitive", "restricted"]),
      reviewTrigger: z.boolean(),
      alternative: z.string().optional(),
      claimIds: z.array(z.string()),
    }),
  ),

  redirectRules: z.array(z.object({ rule: z.string(), claimIds: z.array(z.string()) })),

  blockers: z.array(
    z.object({
      id: z.string(),
      symptom: z.string().describe("What the developer sees, ideally the exact error text"),
      cause: z.string(),
      fix: z.string(),
      fallback: z.string(),
      claimIds: z.array(z.string()),
    }),
  ),

  checklist: z.array(
    z.object({ id: z.string(), text: z.string(), owner: Owner, phaseId: z.string().optional() }),
  ),

  claims: z.array(Claim),
  uncertainties: z.array(z.string()),

  generatedBy: z.enum(["gold", "agent"]),
  reviewStatus: z.enum(["reviewed", "unreviewed"]),
  lastVerified: z.string(),
  endToEnd: z
    .object({
      testedAt: z.string(),
      summary: z.string(),
      composioLogId: z.string().optional(),
      artifact: z.string().optional(),
    })
    .optional()
    .describe("Present only when the Composio closed loop was actually run"),
});
export type Guide = z.infer<typeof Guide>;

// ---------- Integrity checks ----------

export type IntegrityIssue = { path: string; message: string };

/**
 * Checks that the generic Zod schema can't express:
 * - every referenced claim id exists
 * - sourced claims have a URL + quote; tested claims have an artifact; uncertain claims a reason
 * - ranges are ordered, URLs parse
 */
export function validateGuide(g: Guide): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ids = new Set<string>();
  for (const c of g.claims) {
    if (ids.has(c.id)) issues.push({ path: `claims.${c.id}`, message: "duplicate claim id" });
    ids.add(c.id);
    if (c.evidence === "sourced") {
      if (!c.sourceUrl || !isUrl(c.sourceUrl))
        issues.push({ path: `claims.${c.id}`, message: "sourced claim needs a valid sourceUrl" });
      if (!c.quote) issues.push({ path: `claims.${c.id}`, message: "sourced claim needs a quote" });
    }
    if (c.evidence === "tested" && !c.artifact)
      issues.push({ path: `claims.${c.id}`, message: "tested claim needs an artifact" });
    if (c.evidence === "uncertain" && !c.reason)
      issues.push({ path: `claims.${c.id}`, message: "uncertain claim needs a reason" });
  }

  const refs: [string, string[]][] = [
    ["verdict", g.verdict.claimIds],
    ["composioFit", g.composioFit.claimIds],
    ...g.phases.map((p) => [`phases.${p.id}`, p.claimIds] as [string, string[]]),
    ...g.requirements.map((r, i) => [`requirements.${i}`, r.claimIds] as [string, string[]]),
    ...g.scopes.map((s) => [`scopes.${s.scope}`, s.claimIds] as [string, string[]]),
    ...g.redirectRules.map((r, i) => [`redirectRules.${i}`, r.claimIds] as [string, string[]]),
    ...g.blockers.map((b) => [`blockers.${b.id}`, b.claimIds] as [string, string[]]),
  ];
  for (const [path, list] of refs) {
    for (const id of list)
      if (!ids.has(id)) issues.push({ path, message: `unknown claim id '${id}'` });
  }

  const ranges: [string, Range][] = [
    ["verdict.firstTokenMinutes", g.verdict.firstTokenMinutes],
    ["verdict.productionDays", g.verdict.productionDays],
    ...g.phases.map((p) => [`phases.${p.id}.minutes`, p.minutes] as [string, Range]),
  ];
  for (const [path, r] of ranges)
    if (r.min > r.max || r.min < 0) issues.push({ path, message: "range min must be 0 <= min <= max" });

  if (!isUrl(g.app.website)) issues.push({ path: "app.website", message: "invalid URL" });
  return issues;
}

function isUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Share of claims by evidence level, used on verdict card and /method. */
export function evidenceMix(g: Guide) {
  const n = g.claims.length || 1;
  const count = (e: EvidenceLevel) => g.claims.filter((c) => c.evidence === e).length;
  return {
    tested: count("tested") / n,
    sourced: count("sourced") / n,
    uncertain: count("uncertain") / n,
    total: g.claims.length,
  };
}
