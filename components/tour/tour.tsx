"use client";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, X } from "lucide-react";

type Step = { target: string; title: string; body: string };

const HOME: Step[] = [
  { target: "hero", title: "Welcome to Greenlight 👋", body: "Before your users can connect an app through Composio, you often need your own OAuth app approved by the provider. Greenlight tells you how hard that is, how long it takes, and what will block you." },
  { target: "stat", title: "Why it matters", body: "For 262 of Composio's 387 OAuth toolkits, Composio doesn't provide the OAuth app, so you must register and get approval yourself." },
  { target: "search", title: "Look up any app", body: "Type an app name or website. If it's in the library you jump straight to its guide; if not, an agent investigates it live (1–3 min) and publishes a shareable guide." },
  { target: "pillars", title: "What every guide gives you", body: "Two clocks (first token vs production), who does what (agent vs you vs provider), and an evidence label on every single claim." },
  { target: "filters", title: "Filter the library", body: "Self-serve vs review needed vs partner-only vs paid, and whether Composio already manages an OAuth app for you." },
  { target: "card", title: "Read a card in 5 seconds", body: "Difficulty 1–5, minutes to your first token, time to production including review waits, and whether the guide is gold, agent-generated, or tested end-to-end." },
  { target: "nav-compare", title: "Compare providers", body: "Put up to four apps side by side to decide which integration to ship first." },
  { target: "nav-method", title: "How we score", body: "The difficulty rubric, what tested / sourced / uncertain mean, eval results and known limits." },
  { target: "nav-llms", title: "Built for agents too", body: "Every guide is also Markdown at /guides/<app>.md, indexed in /llms.txt, and served over MCP so Claude Code or Cursor can read it." },
  { target: "tour-button", title: "Replay anytime", body: "Click here to see this tour again. Open any guide and the tour walks you through that page too." },
];

const GUIDE: Step[] = [
  { target: "verdict", title: "The verdict", body: "How hard (1–5), minutes to your first token with your own account, and how long until real users can connect, including the provider's review queue." },
  { target: "e2e", title: "Proven, not claimed", body: "This guide was tested end-to-end through Composio with our own OAuth app: custom auth config → Connect Link → a real tool call. Click for the trace." },
  { target: "next-step", title: "Start here", body: "Your next step, always. It follows the checklist below, and your progress is saved in the link so a teammate sees the same state." },
  { target: "evidence-bar", title: "How much is proven", body: "Green = we tested it, blue = a source says so (quote re-checked), amber = we couldn't verify. Hover any small chip on the page for the quote and date." },
  { target: "primer", title: "How it fits with Composio", body: "Provider OAuth app → Composio auth config → each user's connected account. Shows whether Composio manages an app and why you might still bring your own." },
  { target: "timeline", title: "Where the time goes", body: "Each phase with its owner. Hatched bars are waiting on the provider; that's usually where the weeks are." },
  { target: "who", title: "What the agent does for you", body: "Every step has an owner. The agent hands you copy-paste artefacts: form values, scope justification, reviewer email, manifests." },
  { target: "requirements", title: "What could block approval", body: "Business verification, privacy policy, security assessments, paid tiers, user caps: what's required, and when." },
  { target: "blockers", title: "Stuck? Search here", body: "Paste the error you see; it jumps to the matching blocker with cause, fix and fallback." },
  { target: "checklist", title: "Do it, step by step", body: "Tick steps as you go. Copy the URL to share your exact progress." },
  { target: "evidence", title: "Every claim, with proof", body: "Each claim's label, quote, source link or screenshot, plus everything we couldn't verify." },
  { target: "markdown", title: "Give it to your agent", body: "The same guide as Markdown, ready for Claude Code, Cursor or any LLM." },
];

const OTHER: Step[] = [
  { target: "nav-home", title: "Greenlight", body: "Start from the home page to search any app or browse the library." },
  { target: "tour-button", title: "Tours", body: "Open the home page or any guide and click Tour for a full walkthrough." },
];

function stepsFor(path: string) {
  if (path === "/") return { key: "home", steps: HOME };
  if (path.startsWith("/guides/")) return { key: "guide", steps: GUIDE };
  return { key: "other", steps: OTHER };
}

const el = (t: string) => document.querySelector<HTMLElement>(`[data-tour="${t}"]`);

export function Tour() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const { key, steps: all } = stepsFor(path);
  const [steps, setSteps] = useState<Step[]>(all);

  const start = useCallback(() => {
    const present = all.filter((s) => el(s.target));
    if (!present.length) return;
    setSteps(present);
    setI(0);
    setOpen(true);
  }, [all]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(`gl-tour-${key}`, "1");
    } catch {}
  }, [key]);

  // auto-start once per page type (home, guide) for new visitors
  useEffect(() => {
    setOpen(false);
    if (key === "other") return;
    let seen = false;
    try {
      seen = localStorage.getItem(`gl-tour-${key}`) === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(start, key === "home" ? 3200 : 1200); // let the title finish writing itself
    return () => clearTimeout(t);
  }, [key, start]);

  useEffect(() => {
    const onStart = () => start();
    window.addEventListener("greenlight:tour", onStart);
    return () => window.removeEventListener("greenlight:tour", onStart);
  }, [start]);

  // position the spotlight
  useLayoutEffect(() => {
    if (!open) return;
    const target = el(steps[i]?.target);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setRect(target.getBoundingClientRect());
    update();
    const t = setTimeout(update, 450);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [open, i, steps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, close]);

  if (!open || !rect) return null;
  const s = steps[i];
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(360, vw - 24);
  const below = rect.bottom + 16 + 190 < vh;
  const top = below ? rect.bottom + pad + 12 : Math.max(12, rect.top - pad - 12 - 190);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
  const last = i === steps.length - 1;

  return (
    <>
      <div className="fixed inset-0 z-[59]" onClick={close} aria-hidden />
      <div
        className="tour-spot"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={s.title}
        className="fixed z-[61] rounded-2xl border border-emerald-500/40 bg-zinc-950/95 p-4 shadow-[0_0_40px_-10px_rgb(52_211_153/0.6)] backdrop-blur"
        style={{ top, left, width: cardW }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-emerald-200">{s.title}</p>
          <button onClick={close} className="text-muted-foreground hover:text-foreground" aria-label="Close tour">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-emerald-400" : "w-1.5 bg-white/20"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 ? (
              <button onClick={() => setI(i - 1)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
                Back
              </button>
            ) : (
              <button onClick={close} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Skip
              </button>
            )}
            <button
              onClick={() => (last ? close() : setI(i + 1))}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400"
            >
              {last ? "Done" : `Next · ${i + 1}/${steps.length}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function TourButton() {
  return (
    <button
      data-tour="tour-button"
      onClick={() => window.dispatchEvent(new Event("greenlight:tour"))}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 shadow-[0_0_16px_-4px_rgb(52_211_153/0.6)] transition hover:bg-emerald-500/20 hover:shadow-[0_0_22px_-2px_rgb(52_211_153/0.8)]"
    >
      <Compass className="size-3.5" /> Take the tour
    </button>
  );
}
