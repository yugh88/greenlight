/**
 * The live pipeline: Discover → Investigate → Draft → Verify → (Publish by caller).
 * `emit` streams human-readable steps to the job log / UI.
 */
import { DIFFICULTY_LABELS, type Claim, type Guide } from "@/lib/schema";
import type { JobStep } from "@/lib/db/schema";
import { fetchPage, type Page } from "./fetch";
import { discover, rankLinks, slugify } from "./discover";
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

  // 2. Investigate: read top pages
  emit("investigate", `Ranking ${d.candidates.length} links to read`);
  const picks = opts.seedUrls ?? (d.candidates.length ? await rankLinks(d.name, d.candidates, 7) : []);
  const pages: Page[] = [];
  if (d.portal && !opts.seedUrls) pages.push(d.portal);
  for (const href of picks) {
    if (pages.some((p) => p.finalUrl === href || p.url === href)) continue;
    const p = await fetchPage(href);
    if (p && p.status < 400 && p.text.length > 200) {
      pages.push(p);
      emit("investigate", `Read ${p.title ? `"${p.title.slice(0, 70)}"` : p.finalUrl}`, { url: p.finalUrl });
    }
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

  // 3. Draft
  const pack: EvidencePack = {
    appName: d.name,
    website: d.website,
    sources: [
      ...pages.slice(0, 8).map((page, i) => ({ ref: `S${i + 1}`, page, excerpt: excerpt(page.text, opts.excerptBudget) })),
      ...(composioDoc ? [{ ref: "C2", page: composioDoc, excerpt: excerpt(composioDoc.text, 3_500) }] : []),
    ],
    probes: probes.map((probe, i) => ({ ref: `P${i + 1}`, probe, artifact: `probe:${probe.id}` })),
    composio: { ...comp, ref: "C1" },
  };
  emit("draft", `Drafting guide from ${pack.sources.length} pages and ${pack.probes.length} probes`);
  const { draft, modelId } = await draftGuide(pack, { depth: Boolean(opts.seedUrls) || opts.depth });
  emit("draft", `Draft ready (${draft.claims.length} claims) via ${modelId}`);

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
