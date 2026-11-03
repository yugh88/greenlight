import Link from "next/link";
import { Bot, FileText, ListTree, Plug } from "lucide-react";
import { listGuides } from "@/lib/store";
import { CopyButton } from "@/components/guide/interactive";
import { DIFFICULTY_STYLE } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "For agents" };
export const revalidate = 300;

const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("http") ? process.env.NEXT_PUBLIC_BASE_URL! : "https://greenlight-blue-ten.vercel.app";

export default async function AgentsPage() {
  const guides = await listGuides();
  const mcpCmd = `claude mcp add --transport http greenlight ${base}/api/mcp`;
  const cursorJson = JSON.stringify({ mcpServers: { greenlight: { url: `${base}/api/mcp` } } }, null, 2);
  const prompt = `Before we set up the Gmail integration, read ${base}/guides/gmail.md and tell me which scopes will trigger Google's security assessment.`;

  return (
    <div className="pt-10">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">For agents</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Greenlight speaks agent, too</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Composio users build with coding agents. Every guide is published in formats an agent can read directly, so Claude Code or Cursor can check
        &ldquo;will this scope trigger a review?&rdquo; <em>before</em> wiring the integration. These files are plain text on purpose: they&apos;re for
        machines, and this page is the human-friendly explanation.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card icon={<ListTree className="size-5" />} title="/llms.txt" tag="the index">
          A convention (<a className="underline" href="https://llmstxt.org">llmstxt.org</a>) like <code>robots.txt</code>, but for LLMs: one plain-text
          file listing every guide with its difficulty and timing, so an agent finds the right page without crawling the site.
          <div className="mt-3 flex gap-2">
            <a href="/llms.txt" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-white/5">Open raw</a>
            <CopyButton text={`${base}/llms.txt`} label="Copy URL" />
          </div>
        </Card>
        <Card icon={<FileText className="size-5" />} title="/guides/<app>.md" tag="each guide">
          The full guide as Markdown, with every claim tagged <code>[tested]</code>, <code>[sourced]</code> or <code>[uncertain]</code>, ready to paste into
          any LLM context.
          <div className="mt-3 flex gap-2">
            <a href="/guides/gmail.md" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-white/5">Example: gmail.md</a>
            <CopyButton text={prompt} label="Copy a prompt" />
          </div>
        </Card>
        <Card icon={<Plug className="size-5" />} title="MCP server" tag="tools">
          Four tools for MCP clients: <code>list_guides</code>, <code>get_guide</code>, <code>generate_guide</code> (live investigation for any app) and{" "}
          <code>get_generation</code>.
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={mcpCmd} label="Copy Claude Code command" />
            <CopyButton text={cursorJson} label="Copy Cursor config" />
          </div>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Bot className="size-5 text-emerald-300" /> Set up in 10 seconds
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Snippet title="Claude Code" body={mcpCmd} />
          <Snippet title="Cursor (.cursor/mcp.json)" body={cursorJson} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">What an agent sees in llms.txt</h2>
        <p className="mt-1 text-sm text-muted-foreground">The same index, rendered for humans.</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          {guides.map((g) => {
            const d = DIFFICULTY_STYLE[g.difficulty];
            return (
              <div key={g.slug} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-white/[0.03]">
                <span className={cn("w-8 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold ring-1 ring-inset", d.bg, d.text, d.ring)}>{g.difficulty}</span>
                <Link href={`/guides/${g.slug}`} className="min-w-40 font-medium hover:underline">{g.name}</Link>
                <span className="text-muted-foreground">{g.label}</span>
                <code className="ml-auto font-mono text-xs text-sky-300">/guides/{g.slug}.md</code>
                <span className="text-xs text-muted-foreground">{g.generatedBy === "gold" ? "gold" : "agent · unreviewed"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Card({ icon, title, tag, children }: { icon: React.ReactNode; title: string; tag: string; children: React.ReactNode }) {
  return (
    <div className="glow-card flex flex-col rounded-2xl border border-border bg-white/[0.02] p-5 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-base text-emerald-200">
          {icon} {title}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{tag}</span>
      </div>
      <div className="mt-3 leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Snippet({ title, body }: { title: string; body: string }) {
  return (
    <div className="glow-card rounded-2xl border border-border bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <CopyButton text={body} />
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-100/90">{body}</pre>
    </div>
  );
}
