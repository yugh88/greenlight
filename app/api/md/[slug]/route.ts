import { getGuide } from "@/lib/store";
import { guideToMarkdown } from "@/lib/markdown";

export const revalidate = 300;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug.replace(/\.md$/, ""));
  if (!g) return new Response("# Not found\n", { status: 404, headers: { "content-type": "text/markdown; charset=utf-8" } });
  const base = new URL(req.url).origin;
  return new Response(guideToMarkdown(g, base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
