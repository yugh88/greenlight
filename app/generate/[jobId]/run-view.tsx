"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { at: string; stage: string; message: string };
type Job = { id: string; input: string; status: "queued" | "running" | "done" | "error"; slug: string | null; steps: Step[]; error: string | null; createdAt: string };

const STAGES = [
  ["discover", "Discover", "official site, developer docs, Composio toolkit"],
  ["investigate", "Investigate", "read OAuth / review / pricing pages, probe public endpoints"],
  ["draft", "Draft", "structured guide; every fact cites evidence"],
  ["verify", "Verify", "re-fetch every quote; second model checks support"],
  ["publish", "Publish", "permanent link + Markdown"],
] as const;

export function RunView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (r.status === 404) return setMissing(true);
      const j: Job = await r.json();
      if (stop) return;
      setJob(j);
      if (j.status === "done" && j.slug) setTimeout(() => router.push(`/guides/${j.slug}`), 1500);
      else if (j.status !== "error") setTimeout(tick, 1200);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId, router]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [job?.steps.length]);

  if (missing) return <p className="pt-16 text-muted-foreground">This run does not exist. <Link href="/" className="underline">Start a new one</Link>.</p>;

  const reached = new Set(job?.steps.map((s) => s.stage));
  const current = job?.steps.at(-1)?.stage;
  const elapsed = job ? Math.round(((job.steps.at(-1) ? new Date(job.steps.at(-1)!.at).getTime() : Date.now()) - new Date(job.createdAt).getTime()) / 1000) : 0;

  return (
    <div className="pt-10">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Live investigation</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{job?.input ?? "…"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The agent reads public pages and probes public OAuth endpoints only. It never logs in or submits forms. Usually 1–3 minutes.
        {job ? ` · ${elapsed}s` : ""}
      </p>

      <ol className="mt-8 grid gap-2 sm:grid-cols-5">
        {STAGES.map(([key, label, hint]) => {
          const done = reached.has(key) && current !== key;
          const active = current === key && job?.status !== "done";
          return (
            <li key={key} className={cn("rounded-xl border p-3", active ? "border-emerald-500/50 bg-emerald-500/[0.06]" : done || job?.status === "done" ? "border-border bg-white/[0.02]" : "border-dashed border-border/60 opacity-60")}>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {active ? <Loader2 className="size-3.5 animate-spin text-emerald-400" /> : done || job?.status === "done" ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <span className="size-3.5 rounded-full border border-border" />}
                {label}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-xl border border-border bg-black/30 p-4 font-mono text-xs leading-relaxed">
        {(job?.steps ?? []).map((s, i) => (
          <div key={i} className={cn("flex gap-3", s.stage === "error" && "text-rose-300")}>
            <span className="w-20 shrink-0 text-muted-foreground">{s.stage}</span>
            <span className="break-words">{s.message}</span>
          </div>
        ))}
        {job && job.status !== "done" && job.status !== "error" ? (
          <div className="flex gap-3 text-muted-foreground">
            <span className="w-20 shrink-0" />
            <Loader2 className="size-3 animate-spin" />
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {job?.status === "error" ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/[0.06] p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 text-rose-300" />
          <div>
            <p className="font-medium">The run failed.</p>
            <p className="mt-1 text-muted-foreground">{job.error}</p>
            <p className="mt-2">Free-tier model capacity is the usual cause. <Link href={`/?regenerate=${encodeURIComponent(job.input)}`} className="underline">Try again</Link>.</p>
          </div>
        </div>
      ) : null}
      {job?.status === "done" && job.slug ? (
        <p className="mt-4 text-sm">
          Done. Opening <Link href={`/guides/${job.slug}`} className="text-emerald-300 underline">/guides/{job.slug}</Link>…
        </p>
      ) : null}
    </div>
  );
}
