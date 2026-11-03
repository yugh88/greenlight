"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { GuideSummary } from "@/lib/store";
import { DIFFICULTY_STYLE, fmtDays, fmtMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "self", label: "Self-serve", test: (g: GuideSummary) => g.difficulty === 1 },
  { id: "review", label: "Review needed", test: (g: GuideSummary) => g.difficulty >= 2 && g.difficulty <= 4 },
  { id: "partner", label: "Partner-only", test: (g: GuideSummary) => g.requirementKinds.includes("partner-application") || (g.difficulty === 5 && !/\$|paid|pay/i.test(g.cost)) },
  { id: "paid", label: "Paid", test: (g: GuideSummary) => g.requirementKinds.includes("paid-plan") || /\$|paid|subscription/i.test(g.cost) },
] as const;

const COMPOSIO = [
  { id: "any", label: "Any" },
  { id: "managed", label: "Composio-managed" },
  { id: "byo", label: "Bring your own app" },
] as const;

export function Library({ guides }: { guides: GuideSummary[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [c, setC] = useState<(typeof COMPOSIO)[number]["id"]>("any");
  const shown = useMemo(
    () =>
      guides.filter(
        (g) =>
          FILTERS.find((x) => x.id === f)!.test(g) &&
          (c === "any" || (c === "managed" ? g.composioManaged === true : g.composioManaged !== true)),
      ),
    [guides, f, c],
  );
  return (
    <div>
      <div data-tour="filters" className="flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Pill key={x.id} on={f === x.id} onClick={() => setF(x.id)}>
            {x.label}
          </Pill>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {COMPOSIO.map((x) => (
          <Pill key={x.id} on={c === x.id} onClick={() => setC(x.id)}>
            {x.label}
          </Pill>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{shown.length} guides</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((g, idx) => {
          const d = DIFFICULTY_STYLE[g.difficulty];
          return (
            <Link key={g.slug} href={`/guides/${g.slug}`} data-tour={idx === 0 ? "card" : undefined} className="glow-card group flex flex-col rounded-2xl border border-border bg-white/[0.02] p-4 hover:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.composioManaged === true ? "Composio-managed" : g.composioManaged === false ? "Bring your own app" : "Not on Composio"}
                  </p>
                </div>
                <span className={cn("rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-inset", d.bg, d.text, d.ring)}>
                  {g.difficulty} · {g.label}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{g.summary}</p>
              <div className="mt-auto flex items-center gap-3 pt-4 text-xs">
                <span><span className="text-muted-foreground">first token </span>{fmtMinutes(g.firstTokenMinutes)}</span>
                <span><span className="text-muted-foreground">prod </span>{fmtDays(g.productionDays)}</span>
                <span className="ml-auto">
                  {g.endToEnd ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck className="size-3.5" />e2e tested</span>
                  ) : g.generatedBy === "gold" ? (
                    <span className="text-emerald-300/80">gold</span>
                  ) : (
                    <span className="text-violet-300/80">agent · unreviewed</span>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
