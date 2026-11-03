import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/guide/guide-view";
import { getGuide } from "@/lib/store";
import { fmtDays, fmtMinutes } from "@/lib/format";
import { goldGuides } from "@/data/guides";

export const revalidate = 300;

export function generateStaticParams() {
  return goldGuides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) return { title: "Guide not found" };
  const description = `Difficulty ${g.verdict.difficulty}/5 (${g.verdict.label}). First token in ${fmtMinutes(g.verdict.firstTokenMinutes)}, production in ${fmtDays(g.verdict.productionDays)}. ${g.verdict.summary}`;
  return {
    title: `${g.app.name} OAuth app guide`,
    description,
    openGraph: { title: `${g.app.name}: OAuth app setup & approval`, description },
    twitter: { card: "summary_large_image" },
    alternates: { types: { "text/markdown": `/guides/${g.slug}.md` } },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) notFound();
  return <GuideView guide={g} />;
}
