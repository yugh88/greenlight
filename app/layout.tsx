import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className={`font-sans min-h-screen bg-background text-foreground antialiased`}>
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="inline-block size-3 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/70" />
              Greenlight
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/#library" className="hover:text-foreground">Library</Link>
              <Link href="/compare?apps=github,gmail,x" className="hidden hover:text-foreground sm:inline">Compare</Link>
              <Link href="/method" className="hover:text-foreground">Method</Link>
              <a href="/llms.txt" className="hidden font-mono text-xs hover:text-foreground sm:inline">llms.txt</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24">{children}</main>
        <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
          Greenlight: OAuth app setup guides for agent builders on Composio. Every claim is labelled{" "}
          <span className="text-emerald-400">tested</span>, <span className="text-sky-400">sourced</span> or{" "}
          <span className="text-amber-400">uncertain</span>. <Link href="/method" className="underline">How we score</Link>.
        </footer>
      </body>
    </html>
  );
}
