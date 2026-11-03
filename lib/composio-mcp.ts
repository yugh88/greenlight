/**
 * Minimal client for Composio's hosted MCP endpoint (https://connect.composio.dev/mcp).
 *
 * Why this exists: the project currently has a Composio "For You" consumer key (ck_...), which
 * the v3.1 REST API / @composio/core SDK reject (401 APIKey_InvalidAPIKey), but which the MCP
 * endpoint accepts via the `x-consumer-api-key` header. The MCP server exposes the same session
 * meta tools (COMPOSIO_SEARCH_TOOLS, COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_MULTI_EXECUTE_TOOL...).
 * When a Platform key (ak_...) is present, lib/composio.ts prefers the SDK instead.
 */
const ENDPOINT = process.env.COMPOSIO_MCP_URL ?? "https://connect.composio.dev/mcp";

let sessionId: string | undefined;
let nextId = 1;

async function rpc(method: string, params: unknown, timeoutMs = 60_000): Promise<any> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-consumer-api-key": key,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  sessionId = res.headers.get("mcp-session-id") ?? sessionId;
  const body = await res.text();
  if (!res.ok) throw new Error(`Composio MCP ${method} → ${res.status}: ${body.slice(0, 300)}`);
  // Streamable HTTP: either a JSON body or SSE frames ("data: {...}").
  const frames = body.trim().startsWith("{")
    ? [body]
    : body.split("\n").filter((l) => l.startsWith("data: {")).map((l) => l.slice(6));
  const msg = frames.map((f) => JSON.parse(f)).find((m) => "result" in m || "error" in m);
  if (!msg) throw new Error(`Composio MCP ${method}: no result frame`);
  if (msg.error) throw new Error(`Composio MCP ${method}: ${JSON.stringify(msg.error).slice(0, 300)}`);
  return msg.result;
}

let initialized: Promise<void> | null = null;
function init() {
  initialized ??= rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "greenlight", version: "0.1.0" },
  }).then(() => undefined);
  return initialized;
}

export async function listTools(): Promise<{ name: string; description?: string }[]> {
  await init();
  return (await rpc("tools/list", {})).tools;
}

/** Call an MCP tool; returns parsed JSON from the first text content block when possible. */
export async function callTool(name: string, args: Record<string, unknown>, timeoutMs = 120_000) {
  await init();
  const r = await rpc("tools/call", { name, arguments: args }, timeoutMs);
  const text = (r?.content ?? []).find((c: any) => c.type === "text")?.text ?? "";
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { isError: Boolean(r?.isError), data, raw: r };
}
