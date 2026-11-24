/**
 * The live pipeline: Discover → Investigate → Draft → Verify → (Publish by caller).
 * `emit` streams human-readable steps to the job log / UI.
 */
import { DIFFICULTY_LABELS, type Claim, type Guide } from "@/lib/schema";
import type { JobStep } from "@/lib/db/schema";
import { fetchPage, type Page } from "./fetch";
import { discover, mapLimit, rankLinks, slugify } from "./discover";
import { composioFacts } from "./composio";
import {
  candidateIssuers,
  describeProbe,
  findAuthorizeUrls,
  probeAuthorize,
  runDiscoveryProbes,
  type ProbeResult,
} from "./probes";
import { draftGuide, excerpt, type EvidencePack } from "./draft";
import { verifyGuide, type VerifyReport } from "./verify";

export type Emit = (stage: JobStep["stage"], message: string, detail?: unknown) => void;

export type PipelineResult = {
  guide: Guide;
  probes: ProbeResult[];
  report: VerifyReport & { draftModel: string; sources: number; ms: number };
};

export type PipelineOptions = {
  /** Curated source URLs (gold path): skip link ranking and read exactly these. */
  seedUrls?: string[];
  name?: string;
  website?: string;
  composioSlug?: string;
  slug?: string;
  excerptBudget?: number;
  /** Ask for the full coverage checklist (gold runs, eval). */
  depth?: boolean;
};

export async function runPipeline(input: string, emit: Emit, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const t0 = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Discover
  emit("discover", `Looking up "${input}"`);
  const d = await discover(opts.website ?? input, (m) => emit("discover", m));
  if (opts.name) d.name = opts.name;
  const slug = opts.slug ?? slugify(d.name);
  const comp = await composioFacts(d.name || d.domain, opts.composioSlug);
  emit(
    "discover",
    comp.slug
      ? `Composio toolkit ${comp.slug}: ${comp.managed ? "Composio-managed OAuth app available" : "bring your own OAuth app"} (via ${comp.via})`
      : `${d.name} is not in Composio's toolkit catalog`,
    { composio: comp },
  );

  // 2. Investigate: verified planner pages + ranked links (parallel), then one deterministic hop deeper.
  const MAX_PAGES = Number(process.env.GREENLIGHT_MAX_PAGES ?? 20);
  emit("investigate", `Ranking ${d.candidates.length} links to read`);
  const picks = opts.seedUrls ?? (d.candidates.length ? await rankLinks(d.name, d.candidates, 12) : []);
  const pages: Page[] = [];
  const seen = new Set<string>();
  const key = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "");
  const keep = (p: Page | null) => {
    if (!p || p.status >= 400 || p.text.length <= 200 || pages.length >= MAX_PAGES) return false;
    if (seen.has(key(p.finalUrl)) || seen.has(key(p.url))) return false;
    seen.add(key(p.finalUrl)).add(key(p.url));
    pages.push(p);
    emit("investigate", `Read ${p.title ? `"${p.title.slice(0, 70)}"` : p.finalUrl}`, { url: p.finalUrl });
    return true;
  };
  if (!opts.seedUrls) {
    if (d.portal) keep(d.portal);
    for (const p of d.seedPages) keep(p);
  }
  const fresh = picks.filter((h) => !seen.has(key(h)));
  for (const p of await mapLimit(fresh, 6, (h) => fetchPage(h))) keep(p);

  // Second hop: decisive facts often sit one click below the pages we read (e.g. quota-modes,
  // production-readiness, limits). Score links on those pages by topic words, same hosts only.
  if (!opts.seedUrls && pages.length < MAX_PAGES) {
    const hosts = new Set(pages.map((p) => new URL(p.finalUrl).host));
    const hop = new Map<string, number>();
    for (const p of pages)
      for (const l of p.links) {
        let host: string;
        try {
          host = new URL(l.href).host;
        } catch {
          continue;
        }
        const k = key(l.href);
        if (!hosts.has(host) || seen.has(k) || /\.(png|jpe?g|svg|pdf|zip)$/i.test(k)) continue;
        const sc = hopScore(`${l.text} ${l.href}`);
        if (sc > 0) hop.set(l.href.replace(/#.*$/, ""), Math.max(hop.get(l.href) ?? 0, sc));
      }
    const next = [...hop.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(8, MAX_PAGES - pages.length)).map(([h]) => h);
    if (next.length) emit("investigate", `Following ${next.length} deeper links (review, limits, quotas, errors)`);
    for (const p of await mapLimit(next, 6, (h) => fetchPage(h))) keep(p);
  }
  if (!pages.length && d.homepage) pages.push(d.homepage);

  // probes
  const allText = pages.map((p) => p.text).join("\n");
  const authorizeUrls = findAuthorizeUrls(allText);
  const extraHosts = [...new Set(authorizeUrls.map((u) => new URL(u).host))].filter(
    (h) => !candidateIssuers(d.domain).includes(`https://${h}`),
  );
  emit("investigate", `Probing public OAuth endpoints on ${d.domain}${extraHosts.length ? ` and ${extraHosts.join(", ")}` : ""}`);
  const probes: ProbeResult[] = await runDiscoveryProbes(candidateIssuers(d.domain, extraHosts));
  const discovered = probes.find((p) => p.json?.authorization_endpoint)?.json?.authorization_endpoint as string | undefined;
  const authTargets = [...new Set([discovered, ...authorizeUrls].filter(Boolean) as string[])].slice(0, 2);
  for (const a of authTargets) probes.push(await probeAuthorize(a));
  for (const p of probes) emit("investigate", describeProbe(p), { probe: p.id });

  // Composio's own managed-vs-custom page, so Composio-fit claims are quotable
  const composioDoc = await fetchPage("https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app.md");

  // 3. Draft. ~180k chars (~45k tokens) of evidence in total: well inside Flash context and free-tier TPM.
  const budgets = allocateBudgets(pages.map((p) => p.text.length), Number(process.env.GREENLIGHT_EVIDENCE_CHARS ?? 200_000));
  const pack: EvidencePack = {
    appName: d.name,
    website: d.website,
    sources: [
      ...pages.map((page, i) => ({ ref: `S${i + 1}`, page, excerpt: excerpt(page.text, opts.excerptBudget ?? budgets[i]) })),
      ...(composioDoc ? [{ ref: "C2", page: composioDoc, excerpt: excerpt(composioDoc.text, 3_500) }] : []),
    ],
    probes: probes.map((probe, i) => ({ ref: `P${i + 1}`, probe, artifact: `probe:${probe.id}` })),
    composio: { ...comp, ref: "C1" },
  };
  emit("draft", `Drafting guide from ${pack.sources.length} pages and ${pack.probes.length} probes`);
  // Vercel functions stop at 300s: leave ~60s for verify + publish after the draft.
  const deadline = t0 + Number(process.env.GREENLIGHT_DRAFT_BUDGET_MS ?? 230_000);
  const { draft, modelId, added } = await draftGuide(pack, { depth: opts.depth ?? true, deadline });
  emit("draft", `Draft ready (${draft.claims.length} claims${added ? `, ${added} added by the gap-fill pass` : ""}) via ${modelId}`);

  // map refs → evidence
  const claims: Claim[] = draft.claims.map((c) => {
    const s = pack.sources.find((x) => x.ref === c.ref);
    const p = pack.probes.find((x) => x.ref === c.ref);
    if (s && c.quote)
      return { id: c.id, text: c.text, evidence: "sourced", sourceUrl: s.page.finalUrl, quote: c.quote.slice(0, 200), checkedAt: today };
    if (p)
      return { id: c.id, text: c.text, evidence: "tested", artifact: p.artifact, checkedAt: p.probe.at.slice(0, 10) };
    if (c.ref === "C1" && comp.slug)
      return { id: c.id, text: c.text, evidence: "sourced", sourceUrl: comp.sourceUrl, quote: (c.quote || comp.quote).slice(0, 200), checkedAt: comp.checkedAt };
    if (c.ref === "C1" && !comp.slug)
      return {
        id: c.id, text: c.text, evidence: "tested",
        artifact: `lookup:composio-directory (${d.name} not among 387 OAuth toolkits on docs.composio.dev/toolkits/managed-auth)`,
        checkedAt: today,
      };
    return { id: c.id, text: c.text, evidence: "uncertain", reason: c.reason ?? `No usable evidence (ref ${c.ref}).`, checkedAt: today };
  });

  const difficulty = Math.min(5, Math.max(1, Math.round(draft.verdict.difficulty))) as 1 | 2 | 3 | 4 | 5;
  let guide: Guide = {
    ...draft,
    slug,
    app: {
      name: d.name,
      website: d.website,
      developerDocsUrl: opts.seedUrls ? pages[0]?.finalUrl : d.portal?.finalUrl,
      composioSlug: comp.slug,
      composioManaged: comp.managed,
      authSchemes: comp.authSchemes.length ? comp.authSchemes : ["OAUTH2"],
    },
    verdict: { ...draft.verdict, difficulty, label: DIFFICULTY_LABELS[difficulty] },
    claims,
    generatedBy: "agent",
    reviewStatus: "unreviewed",
    lastVerified: today,
    probes: probes.map((p) => ({
      id: p.id, kind: p.kind, url: p.url, status: p.status, location: p.location,
      bodySnippet: p.bodySnippet?.slice(0, 400), at: p.at,
    })),
  };

  // 4. Verify
  emit("verify", `Re-checking ${claims.filter((c) => c.evidence === "sourced").length} quotes against their pages`);
  const v = await verifyGuide(guide);
  guide = { ...v.guide, generation: { draftModel: modelId, verifierModel: v.report.verifierModel, ms: Date.now() - t0, sources: pack.sources.length } };
  emit(
    "verify",
    `Verified: ${v.report.quoteMisses.length} quote misses, ${v.report.unsupported.length} unsupported → moved to uncertain; ${v.report.integrityFixes} integrity fixes`,
    v.report,
  );

  return {
    guide,
    probes,
    report: { ...v.report, draftModel: modelId, sources: pack.sources.length, ms: Date.now() - t0 },
  };
}

/** Deterministic link score for the second hop: topics that decide difficulty and timelines. */
const HOP_TOPICS: [RegExp, number][] = [
  [/review|verif|approv|production|go.?live|publish|distribut|certif|marketplace|app.?store|submission/i, 4],
  [/quota|rate.?limit|limits?\b|tiers?\b|pricing|plans?\b|access.?level|extended/i, 4],
  [/test.?users?|testing|dev(elopment)?.?mode|sandbox|allowlist|unverified/i, 3],
  [/scopes?|permissions?|restricted|sensitive/i, 2],
  [/redirect|callback|reply.?url/i, 2],
  [/troubleshoot|errors?\b/i, 2],
  [/oauth|authori[sz]/i, 1],
];
function hopScore(s: string) {
  if (/blog|changelog\/?$|careers|press|login|signin|sign-in|status\.|community|forum/i.test(s)) return 0;
  return HOP_TOPICS.reduce((n, [re, w]) => n + (re.test(s) ? w : 0), 0);
}

/**
 * Split a total evidence budget across pages: short pages are included whole, and what they leave
 * unused goes to the long ones (water-filling), each capped at 30k chars.
 */
export function allocateBudgets(lengths: number[], total: number, cap = 30_000): number[] {
  const out = new Array<number>(lengths.length).fill(0);
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => a.len - b.len);
  let left = total;
  for (const [k, { len, i }] of order.entries()) {
    const share = Math.floor(left / (order.length - k));
    out[i] = Math.max(4_000, Math.min(len, share, cap));
    left -= Math.min(len, out[i]);
  }
  return out;
}
