/**
 * Minimal MCP server (Streamable HTTP, JSON responses) exposing Greenlight to coding agents.
 *   claude mcp add --transport http greenlight https://<host>/api/mcp
 * Tools: list_guides, get_guide, generate_guide (+ poll via get_generation).
 */
import { after } from "next/server";
import { nanoid } from "nanoid";
import { createJob, findRunningJob, getGuide, getJob, listGuides } from "@/lib/store";
import { guideToMarkdown } from "@/lib/markdown";
import { runJob } from "@/lib/agent/run-job";
import { slugify } from "@/lib/agent/discover";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TOOLS = [
  {
    name: "list_guides",
    description: "List OAuth app setup guides in the Greenlight library with difficulty (1-5) and time to production.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_guide",
    description:
      "Get the full OAuth app setup & approval guide for an app as Markdown: difficulty, time to first token, time to production incl. review waits, requirements, scopes, redirect rules, blockers, checklist, and evidence labels.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string", description: "App slug or name, e.g. 'gmail', 'slack'" } },
      required: ["app"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_guide",
    description:
      "Start a live investigation for an app not in the library (1-3 minutes). Returns a job id; call get_generation to poll. Returns the guide directly if it already exists.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string", description: "App name or website" } },
      required: ["app"],
      additionalProperties: false,
    },
  },
  {
    name: "get_generation",
    description: "Poll a generate_guide job. Returns progress steps, or the Markdown guide when done.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
];

const text = (t: string) => ({ content: [{ type: "text", text: t }] });

async function call(name: string, args: Record<string, string>, base: string) {
  switch (name) {
    case "list_guides": {
      const gs = await listGuides();
      return text(gs.map((g) => `- ${g.slug}: ${g.name}, difficulty ${g.difficulty}/5 (${g.label}), ${g.generatedBy}`).join("\n"));
    }
    case "get_guide": {
      const g = await getGuide(slugify(args.app ?? ""));
      return g ? text(guideToMarkdown(g, base)) : text(`No guide for "${args.app}". Call generate_guide to create one.`);
    }
    case "generate_guide": {
      const input = (args.app ?? "").trim().slice(0, 120);
      const cached = await getGuide(slugify(input));
      if (cached) return text(guideToMarkdown(cached, base));
      const running = await findRunningJob(input);
      if (running) return text(`Already running. jobId: ${running.id}`);
      const jobId = nanoid(10);
      await createJob(jobId, input);
      after(() => runJob(jobId, input));
      return text(`Started. jobId: ${jobId}. Watch live at ${base}/generate/${jobId} or poll get_generation.`);
    }
    case "get_generation": {
      const job = await getJob(args.jobId ?? "");
      if (!job) return text("Unknown jobId");
      if (job.status === "done" && job.slug) {
        const g = await getGuide(job.slug);
        return text(g ? guideToMarkdown(g, base) : `Done: ${base}/guides/${job.slug}`);
      }
      return text(`${job.status}\n${job.steps.map((s) => `[${s.stage}] ${s.message}`).join("\n")}${job.error ? `\nerror: ${job.error}` : ""}`);
    }
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function POST(req: Request) {
  const base = new URL(req.url).origin;
  const msg = await req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== "2.0") return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notification
  const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: msg.id, result });
  try {
    switch (msg.method) {
      case "initialize":
        return ok({
          protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "greenlight", version: "0.1.0" },
          instructions: "Use get_guide before setting up an OAuth app for a provider; use generate_guide for apps not in the library.",
        });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call":
        return ok(await call(msg.params?.name, msg.params?.arguments ?? {}, base));
      default:
        return Response.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (e) {
    return ok({ ...text(`Error: ${(e as Error).message}`), isError: true });
  }
}

export async function GET() {
  return new Response("Greenlight MCP endpoint. POST JSON-RPC here.", { status: 405, headers: { allow: "POST" } });
}
