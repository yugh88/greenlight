"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { OWNER_STYLE } from "@/lib/format";

type Item = { id: string; text: string; owner: "agent" | "you" | "provider"; phaseId?: string };

/** Checklist progress lives in the URL hash (#done=a,b,c) so a shared link shows the same state. */
function readDone(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const m = window.location.hash.match(/done=([^&]*)/);
  return new Set(m?.[1] ? decodeURIComponent(m[1]).split(",").filter(Boolean) : []);
}
function useDone() {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    const sync = () => setDone(readDone());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("greenlight:done", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("greenlight:done", sync);
    };
  }, []);
  const toggle = useCallback((id: string) => {
    const next = readDone();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const hash = next.size ? `#done=${[...next].join(",")}` : " ";
    history.replaceState(null, "", hash === " " ? window.location.pathname + window.location.search : hash);
    window.dispatchEvent(new Event("greenlight:done"));
  }, []);
  return { done, toggle };
}

export function NextStep({ items }: { items: Item[] }) {
  const { done, toggle } = useDone();
  const next = items.find((i) => !done.has(i.id));
  const pct = Math.round((done.size / Math.max(1, items.length)) * 100);
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">
          {done.size === 0 ? "Start here" : next ? "Your next step" : "All done"}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {done.size}/{items.length} done
        </p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {next ? (
        <div className="mt-3 flex items-start gap-3">
          <button
            onClick={() => toggle(next.id)}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-emerald-400/60 hover:bg-emerald-400/20"
            aria-label="Mark done"
          />
          <div>
            <p className="text-[15px] font-medium leading-snug">{next.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner: <OwnerTag owner={next.owner} /> · <a href="#checklist" className="underline">full checklist</a>
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm">Every step is checked off. Your users can connect. 🎉</p>
      )}
    </div>
  );
}

export function Checklist({ items }: { items: Item[] }) {
  const { done, toggle } = useDone();
  return (
    <ol className="space-y-1.5">
      {items.map((i, n) => {
        const d = done.has(i.id);
        return (
          <li key={i.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
              <input type="checkbox" checked={d} onChange={() => toggle(i.id)} className="mt-1 size-4 accent-emerald-500" />
              <span className={cn("flex-1 text-sm leading-relaxed", d && "text-muted-foreground line-through")}>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{n + 1}.</span>
                {i.text}
              </span>
              <OwnerTag owner={i.owner} />
            </label>
          </li>
        );
      })}
    </ol>
  );
}

export function OwnerTag({ owner }: { owner: Item["owner"] }) {
  const s = OWNER_STYLE[owner];
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", s.cls)}>{s.label}</span>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
    >
      {ok ? <Check className="size-3" /> : <Copy className="size-3" />}
      {ok ? "Copied" : label}
    </button>
  );
}

type Blocker = { id: string; symptom: string; cause: string; fix: string; fallback: string };

/** "I'm stuck at…" search: filters blockers and jumps to the best match. */
export function BlockerSearch({ blockers }: { blockers: Blocker[] }) {
  const [q, setQ] = useState("");
  const scored = useMemo(() => {
    const terms = q.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (!terms.length) return blockers.map((b) => ({ b, s: 1 }));
    return blockers
      .map((b) => {
        const hay = `${b.symptom} ${b.cause} ${b.fix}`.toLowerCase();
        return { b, s: terms.filter((t) => hay.includes(t)).length / terms.length };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
  }, [q, blockers]);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && scored[0]) document.getElementById(`blocker-${scored[0].b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          placeholder="I'm stuck at… (paste the error, e.g. redirect_uri mismatch)"
          className="w-full rounded-lg border border-border bg-white/[0.02] py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-emerald-500/50"
        />
      </div>
      <div className="mt-3 space-y-3">
        {scored.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching blocker. Check the <a className="underline" href="#evidence">uncertainties</a> or regenerate this guide.
          </p>
        ) : (
          scored.map(({ b }) => (
            <div key={b.id} id={`blocker-${b.id}`} className="scroll-mt-24 rounded-lg border border-border bg-white/[0.02] p-4">
              <p className="font-mono text-[13px] text-rose-300">{b.symptom}</p>
              <dl className="mt-2 grid gap-1.5 text-sm sm:grid-cols-[90px_1fr]">
                <dt className="text-muted-foreground">Cause</dt>
                <dd>{b.cause}</dd>
                <dt className="text-muted-foreground">Fix</dt>
                <dd>{b.fix}</dd>
                <dt className="text-muted-foreground">Fallback</dt>
                <dd>{b.fallback}</dd>
              </dl>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
