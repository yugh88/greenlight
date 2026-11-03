import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { DIFFICULTY_LABELS } from "@/lib/schema";
import { DIFFICULTY_STYLE } from "@/lib/format";
import { cn } from "@/lib/utils";
import directory from "@/data/composio-directory.json";

export const metadata = { title: "Method" };

type EvalResults = {
  runAt: string;
  apps: number;
  facts: number;
  factRecall: number;
  factPrecision: number;
  citationValidity: number;
  difficultyExact: number;
  difficultyWithin1: number;
  perApp: { slug: string; gold: number; agent: number | null; covered: number; contradicted: number; total: number; citations: string; error?: string }[];
  notes?: string[];
};

async function loadEval(): Promise<EvalResults | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "eval/results.json"), "utf8"));
  } catch {
    return null;
  }
}

const RUBRIC: Record<number, string> = {
  1: "Register an app in a console and go. No review before real users can connect (rate limits may still apply).",
  2: "Light, mostly-automatic gates: e.g. a listing/distribution toggle, a user cap lifted by a short form, or review only for a marketplace listing you can skip.",
  3: "A real human review before production (app review, publisher verification, quota extension), typically days to a couple of weeks.",
  4: "Heavy review: business verification, security assessment, demo videos, or restricted scopes; weeks, sometimes months.",
  5: "You cannot self-serve production access: partner-only programs, or access gated behind a paid tier.",
};

export default async function MethodPage() {
  const ev = await loadEval();
  const d = directory as { counts: { managed: number; bringYourOwn: number }; checkedAt: string; source: string };
  return (
    <article className="prose-invert max-w-3xl pt-10">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Method</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">How Greenlight builds and scores a guide</h1>

      <H2 id="primer">OAuth app → auth config → connected accounts</H2>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Provider OAuth app", "Registered once with the provider (GitHub, Google…). Holds client ID/secret, redirect URI, scopes, consent-screen branding. Review and verification happen here."],
          ["Composio auth config", "Your integration's blueprint in Composio: which OAuth app (Composio-managed or yours) and which scopes. Bring your own by pasting client ID and secret; Composio shows the redirect URI to paste back."],
          ["Connected accounts", "One per end user. Created when a user completes a Connect Link. Composio stores and refreshes tokens; your agent calls tools on their behalf."],
        ].map(([t, b]) => (
          <div key={t} className="rounded-xl border border-border p-4">
            <p className="font-medium">{t}</p>
            <p className="mt-1 text-muted-foreground">{b}</p>
          </div>
        ))}
      </div>
      <P>
        Composio manages the OAuth app for <strong>{d.counts.managed}</strong> OAuth toolkits and asks you to bring your own for{" "}
        <strong>{d.counts.bringYourOwn}</strong> (<a className="underline" href={d.source}>managed-auth directory</a>, checked {d.checkedAt}). Even where it is managed,
        teams register their own app for consent-screen branding, custom scopes and a dedicated rate-limit quota. That registration and approval step is what
        Greenlight covers.
      </P>

      <H2 id="rubric">Difficulty rubric</H2>
      <div className="space-y-2">
        {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => {
          const n = Number(k);
          return (
            <div key={k} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg font-semibold ring-1 ring-inset", DIFFICULTY_STYLE[n].bg, DIFFICULTY_STYLE[n].text, DIFFICULTY_STYLE[n].ring)}>{k}</span>
              <div>
                <p className="font-medium">{v}</p>
                <p className="text-muted-foreground">{RUBRIC[n]}</p>
              </div>
            </div>
          );
        })}
      </div>
      <P>
        <strong>Two clocks.</strong> <em>Time to first token</em> is minutes until you can complete OAuth with your own account (development mode, test users).
        <em> Time to production</em> is days until arbitrary users can connect, including the provider&apos;s review queue. That queue, not engineering, is where
        most of the time goes.
      </P>

      <H2 id="evidence">Evidence labels</H2>
      <div className="space-y-2 text-sm">
        <Label c="text-emerald-300 bg-emerald-500/15 ring-emerald-500/40" t="tested">
          We did it: a public endpoint probe with its raw response, a console walkthrough screenshot, or a Composio tool call with its log id.
        </Label>
        <Label c="text-sky-300 bg-sky-500/15 ring-sky-500/40" t="sourced">
          A public page says so. Every sourced claim carries the URL, a verbatim quote of 200 characters or less, and the fetch date. A checker re-fetches the page and fuzzy-matches
          the quote; a second model checks the quote actually supports the claim.
        </Label>
        <Label c="text-amber-300 bg-amber-500/15 ring-amber-500/40" t="uncertain">
          We believe it but could not prove it, or the proof failed re-verification. Shown with the reason, never silently dropped.
        </Label>
      </div>

      <H2 id="pipeline">Live generation pipeline</H2>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li><strong>Discover:</strong> resolve the name or URL to the official site; find the developer portal (common URL patterns, homepage links, sitemap); look up the Composio toolkit and whether its OAuth app is managed.</li>
        <li><strong>Investigate:</strong> a cheap model picks the most relevant OAuth / review / limits / pricing pages from the provider&apos;s own site; we read them; we probe <code>/.well-known/openid-configuration</code>, <code>/.well-known/oauth-authorization-server</code> and the authorize URL with a fake client and a localhost redirect.</li>
        <li><strong>Draft:</strong> structured output into one Zod schema. The model cites evidence by id (S1, P2, C1); URLs and artifacts are attached by code, so it cannot invent a citation.</li>
        <li><strong>Verify:</strong> quote re-fetch + support check; failures move to <em>uncertain</em>; integrity checks remove dangling references.</li>
        <li><strong>Publish:</strong> web page, Markdown at <code>/guides/&lt;slug&gt;.md</code>, <code>/llms.txt</code>, OG image.</li>
      </ol>
      <P>
        The public agent only reads public pages and probes public endpoints. It never logs in, creates accounts or submits forms. Gold guides add what only a signed-in human can
        produce: console walkthroughs and an end-to-end Composio test.
      </P>

      <H2 id="eval">Eval</H2>
      {ev ? (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Fact recall" v={pct(ev.factRecall)} />
            <Stat k="Fact precision" v={pct(ev.factPrecision)} />
            <Stat k="Citation validity" v={pct(ev.citationValidity)} />
            <Stat k="Difficulty ±1" v={pct(ev.difficultyWithin1)} sub={`exact ${pct(ev.difficultyExact)}`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {ev.facts} hand-checked facts across {ev.apps} apps; live agent run {ev.runAt}. Recall = facts the agent stated; precision = stated facts not contradicted;
            citation validity = sourced quotes still found on the cited page.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-2">App</th><th className="p-2">Gold diff.</th><th className="p-2">Agent diff.</th><th className="p-2">Facts covered</th><th className="p-2">Contradicted</th><th className="p-2">Citations valid</th></tr>
              </thead>
              <tbody>
                {ev.perApp.map((a) => (
                  <tr key={a.slug} className="border-t border-border">
                    <td className="p-2"><Link className="underline" href={`/guides/${a.slug}`}>{a.slug}</Link></td>
                    <td className="p-2">{a.gold}</td>
                    <td className="p-2">{a.agent ?? "n/a"}</td>
                    <td className="p-2">{a.covered}/{a.total}</td>
                    <td className="p-2">{a.contradicted}</td>
                    <td className="p-2">{a.citations}{a.error ? ` (${a.error})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ev.notes?.length ? <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">{ev.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        </div>
      ) : (
        <P>Eval results will appear here after <code>pnpm eval</code> runs.</P>
      )}

      <H2 id="limits">Known limits</H2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Review times are rarely documented. When a provider gives no SLA, we show a wide range and mark it uncertain rather than guess.</li>
        <li>Policies change. Every guide shows its last-verified date; the quote checker can be re-run to catch drift.</li>
        <li>Docs that render only with JavaScript or block bots can make the live agent miss pages; gold guides render those pages in a headless browser.</li>
        <li>The live agent runs on a free-tier model (Gemini Flash family, with fallbacks). Gold guides reduce reliance on it.</li>
        <li>Probes test the public surface only (discovery documents, authorize-endpoint error behaviour). They do not prove that a console flow works; console walkthroughs do.</li>
      </ul>
    </article>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mb-3 mt-10 scroll-mt-20 text-xl font-semibold tracking-tight">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
function Label({ c, t, children }: { c: string; t: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-3">
      <span className={cn("rounded-full px-2 py-0.5 font-mono text-xs ring-1 ring-inset", c)}>{t}</span>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
