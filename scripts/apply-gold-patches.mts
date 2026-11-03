/**
 * Gold curation: apply data/gold-patches/<slug>.json onto data/guides/<slug>.json.
 * Every added sourced claim is checked against the live page; a miss aborts (nothing written).
 *
 * Patch shape (all optional):
 *  { verdict: Partial<Verdict>, addClaims: Claim[] (evidence defaults to "sourced"),
 *    setClaims: { [id]: Partial<Claim> }, removeClaims: string[],
 *    attach: { verdict?: string[], composioFit?: string[], phases?: {[phaseId]: string[]}, requirements?: {[index]: string[]} },
 *    composioFit: Partial<...>, prependPhases / appendPhases / replacePhases, addRequirements, addBlockers, addScopes,
 *    addRedirectRules, addArtefacts, checklist (replace), addUncertainties, removeUncertainties: number[],
 *    endToEnd, reviewStatus }
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
const { verifyQuotes } = await import("../lib/agent/verify.ts");
const { Guide, validateGuide } = await import("../lib/schema.ts");
const today = new Date().toISOString().slice(0, 10);
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("data/gold-patches").map((f) => f.replace(".json", ""));
for (const slug of slugs) {
  const gp = `data/guides/${slug}.json`, pp = `data/gold-patches/${slug}.json`;
  if (!existsSync(gp) || !existsSync(pp)) { console.log("skip", slug); continue; }
  const g = JSON.parse(readFileSync(gp, "utf8"));
  const p = JSON.parse(readFileSync(pp, "utf8"));
  const add = (p.addClaims ?? []).map((c: any) => ({ evidence: "sourced", checkedAt: today, ...c }));
  const check = await verifyQuotes(add.filter((c: any) => c.evidence === "sourced"), true);
  if (check.misses.length) { console.log(`✗ ${slug}: quotes not found → ${check.misses.join(", ")}`); process.exitCode = 1; continue; }
  const uniq = (list: any[], key: (x: any) => string) => { const seen = new Set<string>(); return list.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true))); };
  const ids = new Set(add.map((c: any) => c.id));
  g.claims = [...g.claims.filter((c: any) => !ids.has(c.id) && !(p.removeClaims ?? []).includes(c.id)), ...add];
  for (const [id, patch] of Object.entries<any>(p.setClaims ?? {})) g.claims = g.claims.map((c: any) => (c.id === id ? { ...c, ...patch } : c));
  if (p.verdict) g.verdict = { ...g.verdict, ...p.verdict };
  if (p.composioFit) g.composioFit = { ...g.composioFit, ...p.composioFit };
  if (p.attach?.verdict) g.verdict.claimIds = [...new Set([...g.verdict.claimIds, ...p.attach.verdict])];
  if (p.attach?.composioFit) g.composioFit.claimIds = [...new Set([...g.composioFit.claimIds, ...p.attach.composioFit])];
  for (const [pid, list] of Object.entries<any>(p.attach?.phases ?? {})) g.phases = g.phases.map((ph: any) => (ph.id === pid ? { ...ph, claimIds: [...new Set([...ph.claimIds, ...list])] } : ph));
  if (p.replacePhases) g.phases = p.replacePhases;
  if (p.prependPhases) g.phases = uniq([...p.prependPhases, ...g.phases], (x) => x.id);
  if (p.appendPhases) g.phases = uniq([...g.phases, ...p.appendPhases], (x) => x.id);
  if (p.replaceRequirements) g.requirements = p.replaceRequirements;
  if (p.addRequirements) g.requirements = uniq([...g.requirements, ...p.addRequirements], (r) => r.label);
  if (p.addBlockers) g.blockers = uniq([...p.addBlockers, ...g.blockers], (b) => b.id);
  if (p.replaceScopes) g.scopes = p.replaceScopes;
  if (p.addScopes) g.scopes = uniq([...g.scopes, ...p.addScopes], (x) => x.scope);
  if (p.replaceBlockers) g.blockers = p.replaceBlockers;
  if (p.replaceArtefacts) g.artefacts = p.replaceArtefacts;
  if (p.addRedirectRules) g.redirectRules = uniq([...g.redirectRules, ...p.addRedirectRules], (r) => r.rule);
  if (p.addArtefacts) g.artefacts = uniq([...g.artefacts, ...p.addArtefacts], (a) => a.id);
  if (p.checklist) g.checklist = p.checklist;
  if (p.removeUncertainties) g.uncertainties = g.uncertainties.filter((_: any, i: number) => !p.removeUncertainties.includes(i));
  if (p.addUncertainties) g.uncertainties = uniq([...g.uncertainties, ...p.addUncertainties], (u) => u);
  // drop references to removed claims everywhere
  const live = new Set(g.claims.map((c: any) => c.id));
  const strip = (o: any) => { if (o && Array.isArray(o.claimIds)) o.claimIds = o.claimIds.filter((id: string) => live.has(id)); };
  strip(g.verdict); strip(g.composioFit);
  for (const k of ["phases", "requirements", "scopes", "redirectRules", "blockers"]) (g[k] ?? []).forEach(strip);
  if (p.endToEnd) g.endToEnd = p.endToEnd;
  if (p.reviewStatus) g.reviewStatus = p.reviewStatus;
  g.lastVerified = today;
  const parsed = Guide.parse(g);
  const issues = validateGuide(parsed);
  if (issues.length) { console.log(`✗ ${slug}: integrity`, issues.slice(0, 6)); process.exitCode = 1; continue; }
  writeFileSync(gp, JSON.stringify(parsed, null, 1));
  console.log(`✓ ${slug}: +${add.length} claims (all quotes verified), ${parsed.claims.length} total`);
}
