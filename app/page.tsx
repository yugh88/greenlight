import { Suspense } from "react";
import Link from "next/link";
import { listGuides } from "@/lib/store";
import { SearchBox } from "@/components/home/search-box";
import { Library } from "@/components/home/library";
import directory from "@/data/composio-directory.json";
import { HeroTitle } from "@/components/brand/hero-title";

export const revalidate = 60;

export default async function Home() {
  const guides = await listGuides();
  const d = directory as { counts: { managed: number; bringYourOwn: number }; checkedAt: string };
  const total = d.counts.managed + d.counts.bringYourOwn;
  const gold = guides.filter((g) => g.generatedBy === "gold");
  const reviewed = gold.filter((g) => g.reviewStatus === "reviewed").length;
  const e2e = gold.filter((g) => g.endToEnd).length;
  return (
    <div>
      <section className="mx-auto max-w-3xl pt-12 text-center sm:pt-16">
        <div data-tour="hero" className="mb-6 inline-block">
          <HeroTitle />
        </div>
        <br />
        <p data-tour="stat" className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {d.counts.bringYourOwn} of {total} OAuth toolkits on Composio need you to bring your own OAuth app
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-5xl">
          Will your OAuth app get the green light?
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          How hard it is, how long it really takes (including the provider&apos;s review queue), what will block you, and what an agent can do for you.
          Every claim is <span className="text-emerald-300">tested</span>, <span className="text-sky-300">sourced</span> or honestly marked{" "}
          <span className="text-amber-300">uncertain</span>.
        </p>
        <div data-tour="search" className="mx-auto mt-8 max-w-2xl text-left">
          <Suspense>
            <SearchBox known={guides.map((g) => ({ slug: g.slug, name: g.name }))} />
          </Suspense>
        </div>
      </section>

      <section data-tour="pillars" className="mt-16 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Two clocks", "Time to first token (minutes, your own account) vs. time to production (days to weeks, after review)."],
          ["Agent vs. you", "Every step has an owner. The agent hands you pre-filled forms, scope justifications and reviewer emails."],
          ["Proof, not prose", "Quotes are re-fetched and checked. Public endpoints are probed. GitHub and Slack are tested end-to-end through Composio with our own OAuth apps."],
        ].map(([t, b]) => (
          <div key={t} className="glow-card rounded-2xl border border-border bg-white/[0.02] p-4">
            <p className="font-medium">{t}</p>
            <p className="mt-1 text-muted-foreground">{b}</p>
          </div>
        ))}
      </section>

      <section id="library" className="mt-16 scroll-mt-20">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Library</h2>
            <p className="text-sm text-muted-foreground">
              {gold.length} gold guides built from curated official sources, every quote re-verified live: {reviewed} human-reviewed,{" "}
              {e2e} tested end-to-end through Composio. Agent guides are generated live and labelled unreviewed.
            </p>
          </div>
          <Link href="/method" className="hidden text-sm text-muted-foreground underline sm:inline">How we score</Link>
        </div>
        <Library guides={guides} />
      </section>
    </div>
  );
}
