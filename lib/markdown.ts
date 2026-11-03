import type { Claim, Guide } from "@/lib/schema";
import { evidenceMix } from "@/lib/schema";
import { fmtDays, fmtMinutes, fmtSpan } from "@/lib/format";

const tag = (c?: Claim) => (c ? `[${c.evidence}:${c.id}]` : "");

export function guideToMarkdown(g: Guide, base = process.env.NEXT_PUBLIC_BASE_URL ?? ""): string {
  const claims = new Map(g.claims.map((c) => [c.id, c] as const));
  const refs = (ids: string[]) => ids.map((id) => tag(claims.get(id))).filter(Boolean).join(" ");
  const mix = evidenceMix(g);
  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p(`# ${g.app.name}: OAuth app setup & approval guide`);
  p();
  p(`> ${g.generatedBy === "gold" ? "Gold guide" : "Agent-generated, " + g.reviewStatus} · last verified ${g.lastVerified} · ${mix.total} claims (${Math.round(mix.tested * mix.total)} tested, ${Math.round(mix.sourced * mix.total)} sourced, ${Math.round(mix.uncertain * mix.total)} uncertain)`);
  p(`> Web version: ${base}/guides/${g.slug}`);
  p();
  p(`## Verdict`);
  p(`- **Difficulty:** ${g.verdict.difficulty}/5, ${g.verdict.label}`);
  p(`- **Time to first token:** ${fmtMinutes(g.verdict.firstTokenMinutes)} (until you can test with your own account)`);
  p(`- **Time to production:** ${fmtDays(g.verdict.productionDays)} (including provider review waits)`);
  p(`- **Cost:** ${g.verdict.cost}`);
  p(`- ${g.verdict.summary} ${refs(g.verdict.claimIds)}`);
  if (g.endToEnd) p(`- **Tested end-to-end through Composio on ${g.endToEnd.testedAt}:** ${g.endToEnd.summary}`);
  p();
  p(`## Composio fit`);
  p(`- App: ${g.app.website}${g.app.developerDocsUrl ? ` · docs: ${g.app.developerDocsUrl}` : ""}`);
  p(`- Composio toolkit: ${g.app.composioSlug ?? "not in catalog"} · Composio-managed OAuth app: ${g.app.composioManaged === null ? "n/a" : g.app.composioManaged ? "yes" : "no (bring your own)"}`);
  p(`- ${g.composioFit.summary} ${refs(g.composioFit.claimIds)}`);
  for (const w of g.composioFit.whyOwnApp) p(`  - ${w}`);
  p(`- Flow: provider OAuth app → Composio auth config (paste client ID/secret; copy the redirect URI Composio shows into the provider console) → your users' connected accounts via Connect Link.`);
  p();
  p(`## Timeline`);
  for (const ph of g.phases)
    p(`- **${ph.name}** (${ph.owner}${ph.waiting ? ", waiting" : ""}, ${fmtSpan(ph.minutes)}) ${refs(ph.claimIds)}${ph.steps.length ? "\n" + ph.steps.map((s) => `  - ${s}`).join("\n") : ""}${ph.handoff ? `\n  - ↪ Handoff: ${ph.handoff}` : ""}`);
  p();
  if (g.artefacts.length) {
    p(`## Agent artefacts (copy-paste ready)`);
    for (const a of g.artefacts) {
      p(`### ${a.title}`);
      p("```text");
      p(a.body);
      p("```");
    }
    p();
  }
  p(`## Requirements`);
  for (const r of g.requirements) p(`- **${r.label}** [${r.required}]: ${r.when} ${refs(r.claimIds)}`);
  p();
  if (g.scopes.length) {
    p(`## Scopes`);
    p(`| Scope | Tier | Triggers review | Safer alternative |`);
    p(`|---|---|---|---|`);
    for (const s of g.scopes) p(`| \`${s.scope}\` (${s.purpose}) | ${s.tier} | ${s.reviewTrigger ? "yes" : "no"} | ${s.alternative ?? "n/a"} |`);
    p();
  }
  p(`## Redirect URI rules`);
  for (const r of g.redirectRules) p(`- ${r.rule} ${refs(r.claimIds)}`);
  p(`- Paste the redirect URI shown in the Composio dashboard (custom auth config) exactly.`);
  p();
  p(`## Blockers`);
  for (const b of g.blockers) {
    p(`### ${b.symptom}`);
    p(`- Cause: ${b.cause}`);
    p(`- Fix: ${b.fix}`);
    p(`- Fallback: ${b.fallback}`);
  }
  p();
  p(`## Checklist`);
  for (const c of g.checklist) p(`- [ ] ${c.text} _(${c.owner})_`);
  p();
  p(`## Evidence`);
  for (const c of g.claims) {
    const src = c.sourceUrl ? ` (${c.sourceUrl}${c.quote ? `: "${c.quote}"` : ""})` : c.artifact ? ` (artifact: ${c.artifact})` : c.reason ? ` (uncertain: ${c.reason})` : "";
    p(`- **${c.id}** [${c.evidence}, ${c.checkedAt}] ${c.text}${src}`);
  }
  if (g.uncertainties.length) {
    p();
    p(`## Open questions`);
    for (const u of g.uncertainties) p(`- ${u}`);
  }
  p();
  return L.join("\n");
}
