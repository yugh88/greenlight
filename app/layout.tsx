import type { Metadata } from "next";
import Link from "next/link";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import { LogoMark } from "@/components/brand/logo";
import { Sparkles } from "@/components/fx/sparkles";
import { GlowTracker } from "@/components/fx/glow-tracker";
import { Tour, TourButton } from "@/components/tour/tour";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const hand = Caveat({ variable: "--font-hand", subsets: ["latin"], weight: ["600", "700"] });

function safeBase() {
  const raw = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
  try {
    return new URL(raw).origin;
  } catch {
    return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
  }
}
const base = safeBase();

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: { default: "Greenlight: OAuth app setup & approval guides", template: "%s · Greenlight" },
  description:
    "How hard is it to get an OAuth app approved? Difficulty, time to first token, time to production, requirements, blockers, and what an agent can do for you. Evidence on every claim.",
  openGraph: { siteName: "Greenlight", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${hand.variable}`}>
      <body className="font-sans min-h-screen bg-background text-foreground antialiased">
        <Sparkles />
        <GlowTracker />
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4">
            <Link href="/" data-tour="nav-home" className="group flex items-center gap-2">
              <LogoMark size={26} />
              <span
                className="text-2xl font-bold leading-none tracking-wide text-emerald-100 transition group-hover:text-emerald-50 group-hover:[text-shadow:0_0_14px_rgb(52_211_153/0.7)]"
                style={{ fontFamily: "var(--font-hand)" }}
              >
                Greenlight
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/#library" className="hover:text-foreground">Library</Link>
              <Link href="/compare?apps=github,gmail,spotify,x" data-tour="nav-compare" className="hidden hover:text-foreground sm:inline">Compare</Link>
              <Link href="/method" data-tour="nav-method" className="hover:text-foreground">Method</Link>
              <Link href="/agents" data-tour="nav-llms" className="hidden hover:text-foreground sm:inline">For agents</Link>
            </nav>
            <div className="ml-auto">
              <TourButton />
            </div>
          </div>
        </header>
        <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24">{children}</main>
        <footer className="relative z-10 border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
          Greenlight: OAuth app setup guides for agent builders on Composio. Every claim is labelled{" "}
          <span className="text-emerald-400">tested</span>, <span className="text-sky-400">sourced</span> or{" "}
          <span className="text-amber-400">uncertain</span>. <Link href="/method" className="underline">How we score</Link> ·{" "}
          <Link href="/agents" className="underline">For agents</Link>
        </footer>
        <Tour />
      </body>
    </html>
  );
}
