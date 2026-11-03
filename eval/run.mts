/**
 * Eval: run the LIVE agent (open discovery, no curated sources) on gold apps and score it against
 * hand-checked facts in eval/ground-truth.json.
 *
 *   pnpm eval            # run agent + judge (reuses eval/runs/<slug>.json if present)
 *   FRESH=1 pnpm eval    # force new agent runs
 *
 * Metrics
 *  - factRecall:        facts the agent's guide states (judge: "stated") / all facts
 *  - factPrecision:     stated / (stated + contradicted): how often what it says about our facts is right
 *  - citationValidity:  sourced quotes found on their page at verify time / sourced quotes drafted
 *  - difficulty:        exact and within-1 agreement with the gold difficulty
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
const { runPipeline } = await import("../lib/agent/pipeline.ts");
const { structured } = await import("../lib/model.ts");

type Fact = { id: string; statement: string; sourceUrl: string; quote: string };
type App = { slug: string; input: string; goldDifficulty: number; facts: Fact[] };
const gt: { confirmedBy?: string; apps: App[] } = JSON.parse(readFileSync("eval/ground-truth.json", "utf8"));
mkdirSync("eval/runs", { recursive: true });

const only = process.argv.slice(2);
const perApp: any[] = [];
let stated = 0, contradicted = 0, total = 0, quotesDrafted = 0, quotesValid = 0, exact = 0, within1 = 0, scored = 0;

for (const app of gt.apps) {
  if (only.length && !only.includes(app.slug)) continue;
  const path = `eval/runs/${app.slug}.json`;
  let run: any;
  try {
    if (existsSync(path) && !process.env.FRESH) run = JSON.parse(readFileSync(path, "utf8"));
    else {
      const r = await runPipeline(app.input, (s, m) => console.log(`[${app.slug}:${s}] ${m}`));
      run = { guide: r.guide, report: r.report, runAt: new Date().toISOString() };
      writeFileSync(path, JSON.stringify(run, null, 1));
    }
  } catch (e) {
    perApp.push({ slug: app.slug, gold: app.goldDifficulty, agent: null, covered: 0, contradicted: 0, total: app.facts.length, citations: "n/a", error: (e as Error).message.slice(0, 80) });
    total += app.facts.length;
    continue;
  }
  const g = run.guide;
  const claimsText = g.claims.map((c: any) => `- ${c.text}`).join("\n");
  const body = `Verdict: difficulty ${g.verdict.difficulty}/5 ${g.verdict.label}. ${g.verdict.summary}. First token ${g.verdict.firstTokenMinutes.min}-${g.verdict.firstTokenMinutes.max} min; production ${g.verdict.productionDays.min}-${g.verdict.productionDays.max} days; cost ${g.verdict.cost}.
Requirements: ${g.requirements.map((r: any) => `${r.label} [${r.required}] ${r.when}`).join("; ")}
Scopes: ${g.scopes.map((s: any) => `${s.scope} (${s.tier}${s.reviewTrigger ? ", triggers review" : ""})`).join("; ")}
Redirect rules: ${g.redirectRules.map((r: any) => r.rule).join("; ")}
Blockers: ${g.blockers.map((b: any) => b.symptom + " / " + b.cause).join("; ")}
Claims:\n${claimsText}`;

  const { object } = await structured(
    "verifier",
    z.object({ judgments: z.array(z.object({ id: z.string(), verdict: z.enum(["stated", "contradicted", "absent"]), why: z.string() })) }),
    `You grade a generated guide against reference facts. For each FACT decide:
- "stated": the guide clearly states this fact or something equivalent
- "contradicted": the guide says something incompatible with the fact
- "absent": the guide does not address it
Be strict: vague or partial mentions count as absent.

GUIDE (${app.slug}):
${body}

FACTS:
${app.facts.map((f) => `${f.id}: ${f.statement}`).join("\n")}`,
  );
  const j = new Map(object.judgments.map((x) => [x.id, x] as const));
  const s = app.facts.filter((f) => j.get(f.id)?.verdict === "stated").length;
  const c = app.facts.filter((f) => j.get(f.id)?.verdict === "contradicted").length;
  stated += s; contradicted += c; total += app.facts.length;
  const drafted = run.report.checked ?? 0;
  const valid = drafted - (run.report.quoteMisses?.length ?? 0);
  quotesDrafted += drafted; quotesValid += valid;
  const ad = g.verdict.difficulty;
  scored++;
  if (ad === app.goldDifficulty) exact++;
  if (Math.abs(ad - app.goldDifficulty) <= 1) within1++;
  perApp.push({ slug: app.slug, gold: app.goldDifficulty, agent: ad, covered: s, contradicted: c, total: app.facts.length, citations: `${valid}/${drafted}`,
    judgments: app.facts.map((f) => ({ id: f.id, ...j.get(f.id) })) });
  console.log(`${app.slug}: stated ${s}/${app.facts.length}, contradicted ${c}, difficulty agent ${ad} vs gold ${app.goldDifficulty}, citations ${valid}/${drafted}`);
}

const results = {
  runAt: new Date().toISOString().slice(0, 10),
  apps: perApp.length,
  facts: total,
  factRecall: total ? stated / total : 0,
  factPrecision: stated + contradicted ? stated / (stated + contradicted) : 0,
  citationValidity: quotesDrafted ? quotesValid / quotesDrafted : 0,
  difficultyExact: scored ? exact / scored : 0,
  difficultyWithin1: scored ? within1 / scored : 0,
  perApp,
  notes: [
    "The live agent runs with open discovery (no curated source list), so this measures what a developer gets for an app outside the library.",
    "Judge: a second model (verifier role) compares the generated guide to each reference fact. Spot-check eval/results.json → perApp[].judgments.",
    gt.confirmedBy ? `Ground truth confirmed by ${gt.confirmedBy}.` : "Ground-truth facts are sourced with verbatim quotes and re-verified by script; human confirmation pending.",
  ],
};
writeFileSync("eval/results.json", JSON.stringify(results, null, 1));
console.log("\n", JSON.stringify({ ...results, perApp: undefined }, null, 1));
