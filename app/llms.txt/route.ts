import { listGuides } from "@/lib/store";
import { fmtDays, fmtMinutes } from "@/lib/format";
import directory from "@/data/composio-directory.json";

export const revalidate = 300;

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const guides = await listGuides();
  const d = directory as { counts: { managed: number; bringYourOwn: number }; checkedAt: string };
  const lines = [
    "# Greenlight",
    "",
    "> OAuth app setup & approval guides for developers building AI agents on Composio. Each guide states difficulty (1-5), time to first token, time to production including provider review waits, requirements, scopes, blockers, and what an agent can do vs. what you must do. Every claim is labelled tested / sourced / uncertain.",
    "",
    `Context: Composio manages the OAuth app for ${d.counts.managed} OAuth toolkits; for ${d.counts.bringYourOwn} the developer must bring their own (https://docs.composio.dev/toolkits/managed-auth, checked ${d.checkedAt}).`,
    "",
    "Every guide is available as Markdown at /guides/<slug>.md. To generate a guide for any app: POST /api/generate {\"input\":\"<app name or website>\"} → {jobId} then poll GET /api/jobs/<jobId>.",
    "",
    "## Guides",
    "",
    ...guides.map(
      (g) =>
        `- [${g.name}](${base}/guides/${g.slug}.md): difficulty ${g.difficulty}/5 (${g.label}); first token ${fmtMinutes(g.firstTokenMinutes)}; production ${fmtDays(g.productionDays)}; Composio-managed: ${g.composioManaged === null ? "not on Composio" : g.composioManaged ? "yes" : "no"}; ${g.generatedBy}${g.generatedBy === "agent" ? ", unreviewed" : ""}`,
    ),
    "",
    "## Optional",
    "",
    `- [Method](${base}/method): scoring rubric, evidence labels, eval results, known limits`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
