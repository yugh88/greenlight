import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import type { Claim, Guide } from "@/lib/schema";
import { evidenceMix } from "@/lib/schema";
import { DIFFICULTY_STYLE, fmtDays, fmtMinutes, fmtSpan } from "@/lib/format";
import { cn } from "@/lib/utils";
import composioGuides from "@/data/composio-auth-guides.json";

const GUIDE_ALIASES: Record<string, string> = { gmail: "googleapps", x: "twitter", "meta-ads": "facebook", "linkedin-ads": "linkedin" };
function composioWalkthrough(g: Guide) {
  const key = GUIDE_ALIASES[g.slug] ?? g.app.composioSlug?.toLowerCase() ?? g.slug;
  return (composioGuides as { slugs: string[] }).slugs.includes(key) ? `https://composio.dev/auth/${key}` : null;
}
import { Chips, EvidenceChip } from "./evidence";
import { BlockerSearch, Checklist, CopyButton, NextStep, OwnerTag } from "./interactive";

export function GuideView({ guide: g }: { guide: Guide }) {
  const claims = new Map(g.claims.map((c) => [c.id, c] as const));
  const d = DIFFICULTY_STYLE[g.verdict.difficulty];
  const mix = evidenceMix(g);

  return (
    <article className="pt-8">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">OAuth app setup guide</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{g.app.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href={g.app.website} className="hover:underline">{g.app.website.replace(/^https?:\/\//, "")}</a>
            {g.app.developerDocsUrl ? (
              <>
                {" · "}
                <a href={g.app.developerDocsUrl} className="inline-flex items-center gap-1 hover:underline">
                  developer docs <ExternalLink className="size-3" />
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {g.endToEnd ? (
            <a
              data-tour="e2e"
              href={g.endToEnd.artifact ?? "#evidence"}
              title={g.endToEnd.summary}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/60 hover:bg-emerald-500/30"
            >
              <ShieldCheck className="size-3.5" /> Tested end-to-end through Composio · {g.endToEnd.testedAt}
            </a>
          ) : null}
          <ProvenanceBadge g={g} />
          <a href={`/guides/${g.slug}.md`} data-tour="markdown" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <FileText className="size-3.5" /> Markdown
          </a>
          {g.generatedBy === "agent" ? (
            <Link href={`/?regenerate=${encodeURIComponent(g.app.name)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <RefreshCw className="size-3.5" /> Regenerate
            </Link>
          ) : null}
        </div>
      </div>

      {/* 1. verdict */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div data-tour="verdict" className={cn("glow-card rounded-2xl p-5 ring-1 ring-inset", d.bg, d.ring)}>
          <div className="flex items-center gap-4">
            <div className={cn("grid size-16 shrink-0 place-items-center rounded-xl bg-black/30 text-4xl font-semibold", d.text)}>
              {g.verdict.difficulty}
            </div>
            <div>
              <p className={cn("text-lg font-semibold", d.text)}>{g.verdict.label}</p>
              <DifficultyScale level={g.verdict.difficulty} />
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed">
            {g.verdict.summary} <Chips ids={g.verdict.claimIds} claims={claims} />
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Clock label="Time to first token" hint="until you can test with your own account" value={fmtMinutes(g.verdict.firstTokenMinutes)} />
            <Clock label="Time to production" hint="incl. provider review waits" value={fmtDays(g.verdict.productionDays)} />
            <Clock label="Cost" hint="provider-side" value={g.verdict.cost} small />
          </dl>
          {g.endToEnd ? (
            <div className="mt-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 ring-1 ring-inset ring-emerald-500/40">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4" /> Tested end-to-end through Composio on {g.endToEnd.testedAt}
              </p>
              <p className="mt-1 text-xs text-emerald-200/80">
                {g.endToEnd.summary}
                {g.endToEnd.composioLogId ? <> Composio log <code className="font-mono">{g.endToEnd.composioLogId}</code>.</> : null}{" "}
                {g.endToEnd.artifact ? <a className="underline" href={g.endToEnd.artifact}>Trace</a> : null}
              </p>
            </div>
          ) : null}
        </div>
        {/* 2. start here */}
        <div className="flex flex-col gap-4">
          <div data-tour="next-step">
            <NextStep items={g.checklist} />
          </div>
          <div data-tour="evidence-bar" className="glow-card rounded-xl border border-border p-4 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Evidence on this page</p>
            <EvidenceBar mix={mix} />
            <p className="mt-2 text-xs text-muted-foreground">
              Last verified {g.lastVerified}. Hover any chip for its quote and source. <Link href="/method" className="underline">What the labels mean</Link>
            </p>
          </div>
        </div>
      </section>

      {/* 3. primer */}
      <Section id="primer" title="How this fits with Composio">
        <Primer g={g} claims={claims} />
      </Section>

      {/* 4. timeline */}
      <Section id="timeline" title="Timeline" sub="Hatched bars are waiting on the provider. Bar length is log-scaled.">
        <Timeline g={g} claims={claims} />
      </Section>

      {/* 5. swimlane + artefacts */}
      <Section id="who" title="Who does what" sub="What an agent can do for you, and where you take over.">
        <Swimlane g={g} claims={claims} />
        {g.artefacts.length ? (
          <div className="mt-6">
            <h3 className="text-sm font-medium">What the agent hands you</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {g.artefacts.map((a) => (
                <div key={a.id} className="glow-card flex flex-col rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <CopyButton text={a.body} />
                  </div>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">{a.body}</pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      {/* 6. requirements */}
      <Section id="requirements" title="Requirements">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody>
              {g.requirements.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="w-28 p-3 align-top">
                    <ReqBadge v={r.required} />
                  </td>
                  <td className="p-3 align-top">
                    <p className="font-medium">{r.label}</p>
                    <p className="mt-0.5 text-muted-foreground">{r.when}</p>
                  </td>
                  <td className="w-24 p-3 text-right align-top">
                    <Chips ids={r.claimIds} claims={claims} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 7. scopes */}
      {g.scopes.length ? (
        <Section id="scopes" title="Scopes" sub="Request the narrowest scopes you can: sensitive and restricted scopes are what trigger review.">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Triggers review?</th>
                  <th className="p-3">Safer alternative</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {g.scopes.map((s) => (
                  <tr key={s.scope} className="border-t border-border align-top">
                    <td className="p-3">
                      <code className="font-mono text-[13px]">{s.scope}</code>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.purpose}</p>
                    </td>
                    <td className="p-3">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", s.tier === "basic" ? "bg-emerald-500/15 text-emerald-300" : s.tier === "sensitive" ? "bg-orange-500/15 text-orange-300" : "bg-rose-500/15 text-rose-300")}>{s.tier}</span>
                    </td>
                    <td className="p-3">{s.reviewTrigger ? "Yes" : "No"}</td>
                    <td className="p-3 text-muted-foreground">{s.alternative ?? "n/a"}</td>
                    <td className="p-3 text-right">
                      <Chips ids={s.claimIds} claims={claims} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {/* 8. redirect */}
      <Section id="redirect" title="Redirect URI rules">
        <ul className="space-y-2 text-sm">
          {g.redirectRules.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {r.rule} <Chips ids={r.claimIds} claims={claims} />
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2 rounded-lg border border-border bg-white/[0.02] p-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <span>
              <strong>Composio callback:</strong> paste the redirect URI the Composio dashboard shows when you create a custom auth config
              (Auth Configs → Create Auth Config → {g.app.name} → OAuth2) into the provider console exactly as shown.
            </span>
          </li>
        </ul>
      </Section>

      {/* 9. blockers */}
      <Section id="blockers" title="Blockers playbook">
        <BlockerSearch blockers={g.blockers} />
      </Section>

      {/* 10. checklist */}
      <Section id="checklist" title="Checklist" sub="Progress is saved in the link, so share it and your teammate sees the same state.">
        <Checklist items={g.checklist} />
      </Section>

      {/* 11. evidence */}
      <Section id="evidence" title="Evidence & uncertainty">
        {g.uncertainties.length ? (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
            <p className="text-sm font-medium text-amber-300">What we could not verify</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {g.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ol className="space-y-2">
          {g.claims.map((c) => (
            <ClaimRow key={c.id} c={c} probes={g.probes} />
          ))}
        </ol>
        <Sources claims={g.claims} />
        <p className="mt-6 text-xs text-muted-foreground">
          {g.generatedBy === "gold"
            ? "Gold guide: researched and walked through by a human, with an agent re-checking every quote."
            : "Agent-generated from public pages and public endpoint probes only. Unreviewed: verify before relying on it."}
          {g.generation ? ` Draft model ${g.generation.draftModel}; verifier ${g.generation.verifierModel ?? "n/a"}; ${Math.round(g.generation.ms / 1000)}s; ${g.generation.sources} sources.` : ""}
        </p>
      </Section>
    </article>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} data-tour={id} className="mt-12 scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline">{title}</a>
      </h2>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Clock({ label, hint, value, small }: { label: string; hint: string; value: string; small?: boolean }) {
  return (
    <div className={cn("rounded-xl bg-black/25 p-3", small && "col-span-2 sm:col-span-1")}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-semibold tabular-nums", small ? "text-sm leading-snug" : "text-xl")}>{value}</dd>
      <dd className="mt-0.5 text-[11px] text-muted-foreground">{hint}</dd>
    </div>
  );
}

function DifficultyScale({ level }: { level: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-1" aria-label={`Difficulty ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("h-1.5 w-7 rounded-full", n <= level ? DIFFICULTY_STYLE[level].bar : "bg-white/10")} />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">of 5</span>
    </div>
  );
}

function EvidenceBar({ mix }: { mix: ReturnType<typeof evidenceMix> }) {
  return (
    <div className="mt-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
        <div className="bg-emerald-400" style={{ width: `${mix.tested * 100}%` }} />
        <div className="bg-sky-400" style={{ width: `${mix.sourced * 100}%` }} />
        <div className="bg-amber-400" style={{ width: `${mix.uncertain * 100}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-emerald-300">{Math.round(mix.tested * mix.total)} tested</span>
        <span className="text-sky-300">{Math.round(mix.sourced * mix.total)} sourced</span>
        <span className="text-amber-300">{Math.round(mix.uncertain * mix.total)} uncertain</span>
      </p>
    </div>
  );
}

function ProvenanceBadge({ g }: { g: Guide }) {
  return g.generatedBy === "gold" ? (
    <span className="rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/40">
      Gold guide{g.reviewStatus === "reviewed" ? " · human-reviewed" : ""}
    </span>
  ) : (
    <span className="rounded-md bg-violet-500/15 px-2.5 py-1.5 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/40">
      Agent-generated · {g.reviewStatus}
    </span>
  );
}

function Primer({ g, claims }: { g: Guide; claims: Map<string, Claim> }) {
  const managed = g.app.composioManaged;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-2 text-sm leading-relaxed">
        <p>
          <strong>1. Provider OAuth app.</strong> You register an app with {g.app.name}. It holds the client ID and secret, the redirect URI and
          the scopes, and it is what users see on the consent screen.
        </p>
        <p>
          <strong>2. Composio auth config.</strong> Your integration&apos;s blueprint in Composio: which OAuth app (yours or Composio&apos;s), which scopes.
        </p>
        <p>
          <strong>3. Connected accounts.</strong> Each of your users authorizes once through a Connect Link; Composio stores and refreshes their tokens.
        </p>
        <div className="mt-3 rounded-xl border border-border bg-white/[0.02] p-3">
          <p className="font-medium">
            {managed === true
              ? `Composio manages an OAuth app for ${g.app.name}: you can skip step 1 while building.`
              : managed === false
                ? `Composio does not manage an OAuth app for ${g.app.name}: you must bring your own (this guide).`
                : `${g.app.name} is not in Composio's toolkit catalog yet.`}{" "}
            <Chips ids={g.composioFit.claimIds} claims={claims} />
          </p>
          <p className="mt-1 text-muted-foreground">{g.composioFit.summary}</p>
          {composioWalkthrough(g) ? (
            <p className="mt-2">
              Click-by-click console screenshots:{" "}
              <a className="text-sky-300 underline" href={composioWalkthrough(g)!}>
                Composio&apos;s {g.app.name} walkthrough
              </a>
              . This guide adds difficulty, timing, review requirements and blockers on top.
            </p>
          ) : null}
          {g.composioFit.whyOwnApp.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {g.composioFit.whyOwnApp.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <FlowDiagram name={g.app.name} managed={managed} />
    </div>
  );
}

function FlowDiagram({ name, managed }: { name: string; managed: boolean | null }) {
  const box = "rounded-xl border px-3 py-3 text-center text-sm";
  return (
    <div className="flex flex-col items-stretch justify-center gap-2 self-start rounded-2xl border border-border bg-white/[0.015] p-4 sm:flex-row sm:items-center">
      <div className={cn(box, "border-sky-500/40 bg-sky-500/[0.06]")}>
        <p className="text-[10px] uppercase tracking-wider text-sky-300">You create once</p>
        <p className="mt-1 font-medium">{name} OAuth app</p>
        <p className="mt-0.5 text-xs text-muted-foreground">client ID · secret · redirect · scopes</p>
        {managed ? <p className="mt-1 text-[10px] text-emerald-300">optional: Composio has one</p> : null}
      </div>
      <Arrow />
      <div className={cn(box, "border-violet-500/40 bg-violet-500/[0.06]")}>
        <p className="text-[10px] uppercase tracking-wider text-violet-300">In Composio</p>
        <p className="mt-1 font-medium">Auth config</p>
        <p className="mt-0.5 text-xs text-muted-foreground">ac_… per toolkit</p>
      </div>
      <Arrow />
      <div className={cn(box, "border-emerald-500/40 bg-emerald-500/[0.06]")}>
        <p className="text-[10px] uppercase tracking-wider text-emerald-300">Per end user</p>
        <p className="mt-1 font-medium">Connected accounts</p>
        <p className="mt-0.5 text-xs text-muted-foreground">via Connect Link</p>
      </div>
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />;
}

function Timeline({ g, claims }: { g: Guide; claims: Map<string, Claim> }) {
  const maxLog = Math.log10(Math.max(...g.phases.map((p) => p.minutes.max), 10) + 1);
  return (
    <div className="space-y-2.5">
      {g.phases.map((p) => {
        const w = Math.max(6, (Math.log10(p.minutes.max + 1) / maxLog) * 100);
        const wMin = Math.max(3, (Math.log10(p.minutes.min + 1) / maxLog) * 100);
        const color = p.owner === "agent" ? "bg-violet-400/70" : p.owner === "you" ? "bg-sky-400/70" : "bg-zinc-400/60";
        return (
          <div key={p.id} className="grid items-center gap-2 sm:grid-cols-[220px_1fr_110px]">
            <div className="flex items-center gap-2 text-sm">
              <OwnerTag owner={p.owner} />
              <span className="truncate">{p.name}</span>
            </div>
            <div className="relative h-6 rounded-md bg-white/[0.03]">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-md opacity-40", color, p.waiting && "hatched")}
                style={{ width: `${w}%` }}
              />
              <div className={cn("absolute inset-y-0 left-0 rounded-md", color, p.waiting && "hatched")} style={{ width: `${wMin}%` }} />
            </div>
            <div className="flex items-center justify-end gap-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {fmtSpan(p.minutes)}
              <Chips ids={p.claimIds} claims={claims} />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">Solid = optimistic, faded = pessimistic.</p>
    </div>
  );
}

function Swimlane({ g, claims }: { g: Guide; claims: Map<string, Claim> }) {
  const lanes = ["agent", "you", "provider"] as const;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-3 gap-3">
        {lanes.map((l) => (
          <div key={l} className="text-center">
            <OwnerTag owner={l} />
          </div>
        ))}
        {g.phases.map((p) => (
          <div key={p.id} className="contents">
            {lanes.map((l) => (
              <div key={l} className={cn("rounded-xl p-3", l === p.owner ? "glow-card border border-border bg-white/[0.03]" : "border border-dashed border-white/5")}>
                {l === p.owner ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{p.name}</p>
                      <Chips ids={p.claimIds} claims={claims} />
                    </div>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {p.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    {p.handoff ? <p className="mt-2 border-t border-border pt-2 text-xs text-violet-300">↪ {p.handoff}</p> : null}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReqBadge({ v }: { v: "yes" | "no" | "conditional" }) {
  const cls = v === "yes" ? "bg-rose-500/15 text-rose-300" : v === "conditional" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300";
  return <span className={cn("rounded px-2 py-0.5 text-xs font-medium", cls)}>{v === "yes" ? "Required" : v === "conditional" ? "Sometimes" : "Not needed"}</span>;
}

function ClaimRow({ c, probes }: { c: Claim; probes?: Guide["probes"] }) {
  const probe = c.artifact?.startsWith("probe:") ? probes?.find((p) => `probe:${p.id}` === c.artifact) : undefined;
  return (
    <li id={`claim-${c.id}`} className="glow-card scroll-mt-24 rounded-lg border border-border p-3 text-sm target:border-emerald-500/60 target:bg-emerald-500/[0.04]">
      <div className="flex items-start gap-2">
        <EvidenceChip claim={c} />
        <div className="min-w-0 flex-1">
          <p>{c.text}</p>
          {c.quote ? <p className="mt-1 text-xs italic text-muted-foreground">“{c.quote}”</p> : null}
          {c.reason ? <p className="mt-1 text-xs text-amber-300/90">{c.reason}</p> : null}
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
            {c.sourceUrl ? <a href={c.sourceUrl} className="hover:underline">{c.sourceUrl}</a> : null}
            {c.artifact ? (
              c.artifact.startsWith("/") ? <a href={c.artifact} className="text-emerald-300 hover:underline">{c.artifact}</a> : <span className="text-emerald-300">{c.artifact}</span>
            ) : null}
            {" · "}
            {c.checkedAt} · #{c.id}
          </p>
          {c.artifact && /\.(png|jpe?g)$/i.test(c.artifact) ? (
            <a href={c.artifact} className="mt-2 block w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.artifact} alt={c.text} className="max-h-40 rounded border border-border" loading="lazy" />
            </a>
          ) : null}
          {probe ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">raw probe response</summary>
              <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[10px] text-muted-foreground">
                {`GET ${probe.url}\n→ HTTP ${probe.status}${probe.location ? `\nLocation: ${probe.location}` : ""}\n${probe.bodySnippet ?? ""}\n(${probe.at})`}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Sources({ claims }: { claims: Claim[] }) {
  const urls = [...new Set(claims.map((c) => c.sourceUrl).filter(Boolean) as string[])];
  if (!urls.length) return null;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium">Sources</h3>
      <ul className="mt-2 space-y-1 text-xs">
        {urls.map((u) => (
          <li key={u} className="break-all">
            <a href={u} className="text-sky-300 hover:underline">{u}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
