/**
 * Verify: the step that earns trust.
 *  1. Mechanical: re-fetch every sourced URL and fuzzy-match the quote. Miss → uncertain.
 *  2. Semantic: a second (cheap) model checks each quote actually supports its claim. No → uncertain.
 *  3. Integrity: drop dangling claim ids, fill reasons, clamp ranges.
 * Claims are downgraded, never deleted, so the reader sees what we could not prove.
 */
import { z } from "zod";
import { structured } from "@/lib/model";
import type { Claim, Guide } from "@/lib/schema";
import { validateGuide } from "@/lib/schema";
import { fetchPage, quoteMatch } from "./fetch";

export type VerifyReport = {
  checked: number;
  quoteMisses: string[];
  unsupported: string[];
  integrityFixes: number;
  verifierModel?: string;
};

/** Quotes that are just menu/footer text ("Terms of Service Privacy Policy Cookies") prove nothing. */
export function looksLikeNavigation(quote: string): boolean {
  const words = quote.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (/[0-9$€£_]/.test(quote) || /^(click|select|open|go|enable|add|choose|navigate|tap)\b/i.test(quote.trim())) return false;
  if (words.length < 4) return true;
  const title = words.filter((w) => /^[A-Z]/.test(w)).length / words.length;
  const hasSentence = /[a-z]{3,}\s+(is|are|must|can|will|should|may|require|requires|allow|allows|use|need|needs|be|have|has)\b/i.test(quote);
  const dataLike = /[0-9$€£_]/.test(quote); // table cells, prices, error codes
  const imperative = /^(click|select|open|go|enable|add|choose|navigate|tap)\b/i.test(quote.trim());
  return title > 0.7 && !hasSentence && !dataLike && !imperative;
}

export async function verifyQuotes(claims: Claim[], fresh = false): Promise<{ claims: Claim[]; misses: string[] }> {
  const misses: string[] = [];
  const out: Claim[] = [];
  for (const c of claims) {
    if (c.evidence !== "sourced" || !c.sourceUrl || !c.quote) {
      out.push(c);
      continue;
    }
    if (looksLikeNavigation(c.quote)) {
      misses.push(c.id);
      out.push({ ...c, evidence: "uncertain", reason: "Cited text is navigation/menu text, not a statement that supports the claim." });
      continue;
    }
    // fetchPage caches per process; the standalone verify script runs in a fresh process.
    const page = await fetchPage(c.sourceUrl, fresh ? 20_000 : 15_000);
    const m = page ? quoteMatch(c.quote, page.text) : { ok: false, score: 0 };
    if (m.ok) out.push(c);
    else {
      misses.push(c.id);
      out.push({
        ...c,
        evidence: "uncertain",
        reason: page
          ? `Quote not found on the cited page when re-checked (match ${m.score}). ${c.reason ?? ""}`.trim()
          : "Cited page could not be fetched when re-checked.",
      });
    }
  }
  return { claims: out, misses };
}

export async function verifySupport(claims: Claim[]) {
  const sourced = claims.filter((c) => c.evidence === "sourced" && c.quote);
  if (!sourced.length) return { claims, unsupported: [] as string[], modelId: undefined };
  const listing = sourced.map((c) => `${c.id}\nCLAIM: ${c.text}\nQUOTE: "${c.quote}"`).join("\n\n");
  try {
    const { object, modelId } = await structured(
      "verifier",
      z.object({
        verdicts: z.array(z.object({ id: z.string(), supported: z.enum(["yes", "partial", "no"]), note: z.string() })),
      }),
      `For each item, judge strictly whether the QUOTE alone supports the CLAIM. "partial" = supports part of it. Return one verdict per id.\n\n${listing}`,
    );
    const bad = new Map(
      object.verdicts.filter((v) => v.supported === "no").map((v) => [v.id, v.note] as const),
    );
    return {
      claims: claims.map((c) =>
        bad.has(c.id)
          ? { ...c, evidence: "uncertain" as const, reason: `Verifier: quote does not support claim (${bad.get(c.id)})` }
          : c,
      ),
      unsupported: [...bad.keys()],
      modelId,
    };
  } catch (e) {
    console.warn("verifier pass failed; keeping mechanical results only", (e as Error).message);
    return { claims, unsupported: [] as string[], modelId: undefined };
  }
}

export function fixIntegrity(g: Guide): { guide: Guide; fixes: number } {
  let fixes = 0;
  const ids = new Set(g.claims.map((c) => c.id));
  const clean = (list: string[]) => {
    const kept = list.filter((id) => ids.has(id));
    fixes += list.length - kept.length;
    return kept;
  };
  const range = (r: { min: number; max: number }) => {
    const min = Math.max(0, Math.min(r.min, r.max));
    const max = Math.max(r.min, r.max, min);
    if (min !== r.min || max !== r.max) fixes++;
    return { min, max };
  };
  const guide: Guide = {
    ...g,
    claims: g.claims.map((c) => {
      if (c.evidence === "uncertain" && !c.reason) {
        fixes++;
        return { ...c, reason: "No supporting source found by the agent." };
      }
      if (c.evidence === "sourced" && (!c.sourceUrl || !c.quote)) {
        fixes++;
        return { ...c, evidence: "uncertain", reason: "Missing source URL or quote." };
      }
      if (c.evidence === "tested" && !c.artifact) {
        fixes++;
        return { ...c, evidence: "uncertain", reason: "Marked tested but no artifact recorded." };
      }
      return c;
    }),
    verdict: {
      ...g.verdict,
      difficulty: Math.min(5, Math.max(1, Math.round(g.verdict.difficulty))),
      claimIds: clean(g.verdict.claimIds),
      firstTokenMinutes: range(g.verdict.firstTokenMinutes),
      productionDays: range(g.verdict.productionDays),
    },
    composioFit: { ...g.composioFit, claimIds: clean(g.composioFit.claimIds) },
    phases: g.phases.map((p) => ({ ...p, claimIds: clean(p.claimIds), minutes: range(p.minutes) })),
    requirements: g.requirements.map((r) => ({ ...r, claimIds: clean(r.claimIds) })),
    scopes: g.scopes.map((s) => ({ ...s, claimIds: clean(s.claimIds) })),
    redirectRules: g.redirectRules.map((r) => ({ ...r, claimIds: clean(r.claimIds) })),
    blockers: g.blockers.map((b) => ({ ...b, claimIds: clean(b.claimIds) })),
  };
  const remaining = validateGuide(guide);
  if (remaining.length) console.warn("integrity issues remain:", remaining.slice(0, 5));
  return { guide, fixes };
}

export async function verifyGuide(g: Guide, opts: { semantic?: boolean; fresh?: boolean } = {}) {
  const q = await verifyQuotes(g.claims, opts.fresh);
  const s = opts.semantic === false ? { claims: q.claims, unsupported: [], modelId: undefined } : await verifySupport(q.claims);
  const { guide, fixes } = fixIntegrity({ ...g, claims: s.claims });
  const report: VerifyReport = {
    checked: g.claims.filter((c) => c.evidence === "sourced").length,
    quoteMisses: q.misses,
    unsupported: s.unsupported,
    integrityFixes: fixes,
    verifierModel: s.modelId,
  };
  return { guide, report };
}
