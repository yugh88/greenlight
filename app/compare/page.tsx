import Link from "next/link";
import { getGuide, listGuides } from "@/lib/store";
import { DIFFICULTY_STYLE, fmtDays, fmtMinutes } from "@/lib/format";
import { evidenceMix, type Guide } from "@/lib/schema";
import { cn } from "@/lib/utils";

export const metadata = { title: "Compare" };
export const dynamic = "force-dynamic";

export default async function Compare({ searchParams }: { searchParams: Promise<{ apps?: string }> }) {
  const { apps = "" } = await searchParams;
  const slugs = apps.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const guides = (await Promise.all(slugs.map((s) => getGuide(s)))).filter(Boolean) as Guide[];
  const all = await listGuides();
  return (
    <div className="pt-10">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Compare</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Which integration do we ship first?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick up to four:{" "}
        {all.map((g) => (
          <Link key={g.slug} href={`/compare?apps=${[...new Set([...slugs, g.slug])].slice(-4).join(",")}`} className={cn("mr-2 underline-offset-2 hover:underline", slugs.includes(g.slug) && "text-emerald-300")}>
            {g.name}
          </Link>
        ))}
      </p>
      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, guides.length)}, minmax(0, 1fr))` }}>
        {guides.map((g) => {
          const d = DIFFICULTY_STYLE[g.verdict.difficulty];
          const mix = evidenceMix(g);
          return (
            <Link key={g.slug} href={`/guides/${g.slug}`} className={cn("glow-card rounded-2xl p-4 ring-1 ring-inset", d.bg, d.ring)}>
              <p className="text-lg font-semibold">{g.app.name}</p>
              <p className={cn("mt-1 text-3xl font-semibold", d.text)}>
                {g.verdict.difficulty} <span className="text-base">{g.verdict.label}</span>
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row k="First token" v={fmtMinutes(g.verdict.firstTokenMinutes)} />
                <Row k="Production" v={fmtDays(g.verdict.productionDays)} />
                <Row k="Cost" v={g.verdict.cost} />
                <Row k="Composio" v={g.app.composioManaged === null ? "not on Composio" : g.app.composioManaged ? "managed app" : "bring your own"} />
                <Row k="Must-haves" v={g.requirements.filter((r) => r.required === "yes").map((r) => r.label).join(", ") || "none"} />
                <Row k="Evidence" v={`${mix.total} claims, ${Math.round((1 - mix.uncertain) * 100)}% proven`} />
              </dl>
            </Link>
          );
        })}
      </div>
      {!guides.length ? <p className="mt-6 text-sm text-muted-foreground">Choose apps above.</p> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
