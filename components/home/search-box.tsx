"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

export function SearchBox({ known }: { known: { slug: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(input: string, regenerate = false) {
    const v = input.trim();
    if (v.length < 2) return;
    const hit = !regenerate && known.find((k) => k.name.toLowerCase() === v.toLowerCase() || k.slug === v.toLowerCase());
    if (hit) return router.push(`/guides/${hit.slug}`);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: v, regenerate }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Request failed");
      router.push(j.slug ? `/guides/${j.slug}` : `/generate/${j.jobId}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  useEffect(() => {
    const r = params.get("regenerate");
    if (r) {
      setQ(r);
      go(r, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = q.length > 0 ? known.filter((k) => k.name.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5) : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="relative"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/[0.03] p-2 shadow-2xl shadow-emerald-500/5 focus-within:border-emerald-500/50">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="App name or website, e.g. Strava, notion.so, Pipedrive"
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground"
          aria-label="App name or website"
        />
        <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {busy ? "Starting…" : "Get guide"}
        </button>
      </div>
      {suggestions.length ? (
        <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl border border-border bg-popover p-1 text-sm">
          {suggestions.map((s) => (
            <button key={s.slug} type="button" onClick={() => router.push(`/guides/${s.slug}`)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5">
              {s.name} <span className="text-xs text-muted-foreground">in library</span>
            </button>
          ))}
        </div>
      ) : null}
      {err ? <p className="mt-2 text-sm text-rose-300">{err}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">Not in the library? An agent investigates it live (1–3 min) and publishes a shareable guide.</p>
    </form>
  );
}
