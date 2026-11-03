import type { Claim } from "@/lib/schema";
import { EVIDENCE_STYLE } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Small chip; hover/focus reveals quote, source and date (pure CSS, works without JS). */
export function EvidenceChip({ claim, compact = false }: { claim: Claim; compact?: boolean }) {
  return (
    <span className="group/chip relative inline-flex align-middle">
      <a
        href={`#claim-${claim.id}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none ring-1 ring-inset",
          EVIDENCE_STYLE[claim.evidence],
        )}
        aria-label={`${claim.evidence}: ${claim.text}`}
      >
        <Dot evidence={claim.evidence} />
        {compact ? null : claim.evidence}
      </a>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-80 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-left text-xs leading-relaxed text-popover-foreground shadow-xl group-hover/chip:block group-focus-within/chip:block"
      >
        <span className="block font-medium">{claim.text}</span>
        {claim.quote ? <span className="mt-1.5 block italic text-muted-foreground">“{claim.quote}”</span> : null}
        {claim.reason ? <span className="mt-1.5 block text-amber-300/90">{claim.reason}</span> : null}
        {claim.artifact ? <span className="mt-1.5 block font-mono text-[10px] text-emerald-300/90">{claim.artifact}</span> : null}
        <span className="mt-1.5 block text-[10px] text-muted-foreground">
          {claim.sourceUrl ? `${new URL(claim.sourceUrl).host} · ` : ""}checked {claim.checkedAt}
        </span>
      </span>
    </span>
  );
}

function Dot({ evidence }: { evidence: Claim["evidence"] }) {
  const c = evidence === "tested" ? "bg-emerald-400" : evidence === "sourced" ? "bg-sky-400" : "bg-amber-400";
  return <span className={cn("inline-block size-1.5 rounded-full", c)} />;
}

export function Chips({ ids, claims, compact = true }: { ids: string[]; claims: Map<string, Claim>; compact?: boolean }) {
  const list = ids.map((id) => claims.get(id)).filter(Boolean) as Claim[];
  if (!list.length)
    return (
      <span className="inline-flex rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300/80 ring-1 ring-inset ring-amber-500/30">
        no evidence
      </span>
    );
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((c) => (
        <EvidenceChip key={c.id} claim={c} compact={compact} />
      ))}
    </span>
  );
}
