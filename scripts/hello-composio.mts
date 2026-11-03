/**
 * Phase 2 hello-world: managed GitHub connection through a Composio session.
 *   1. list existing GitHub connections   2. if none: create Connect Link, wait for user
 *   3. run one read-only tool (GITHUB_GET_THE_AUTHENTICATED_USER)   4. save trace (no tokens)
 * Uses the Composio MCP session (consumer key). Swap to @composio/core when an ak_ key exists.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, writeFileSync } from "node:fs";
const { callTool } = await import("../lib/composio-mcp.ts");

const trace: any[] = [];
const step = async (name: string, args: any, t?: number) => {
  const r = await callTool(name, args, t);
  trace.push({ at: new Date().toISOString(), tool: name, args, isError: r.isError, data: r.data });
  return r.data?.data ?? r.data;
};

// one session id for every meta-tool call
const search = await step("COMPOSIO_SEARCH_TOOLS", { queries: [{ use_case: "get the authenticated GitHub user" }], session: { generate_id: true } });
const session_id = search?.session?.id;
console.log("composio session:", session_id);
const isActive = async () => {
  const l = await step("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "github", action: "list" }], session_id });
  return /"status":"ACTIVE"/i.test(JSON.stringify(l));
};
const active = await isActive();
console.log("existing github connection active:", active);
if (!active) {
  const add = await step("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "github", action: "add" }], session_id });
  const link = JSON.stringify(add).match(/https:\/\/[^"\\]*(connect|link|auth)[^"\\]*/i)?.[0];
  console.log("\n>>> OPEN THIS CONNECT LINK AND AUTHORIZE GITHUB:\n" + (link ?? JSON.stringify(add).slice(0, 1500)) + "\n");
  console.log("waiting for connection (polling every 10s, up to 30 min)...");
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    if (await isActive().catch(() => false)) { console.log("connection ACTIVE"); break; }
  }
}
const exec = await step("COMPOSIO_MULTI_EXECUTE_TOOL", {
  tools: [{ tool_slug: "GITHUB_GET_THE_AUTHENTICATED_USER", arguments: {} }], session_id,
  thought: "Greenlight hello-world: read-only identity check", current_step: "VERIFY_CONNECTION",
});
const s = JSON.stringify(exec);
const login = s.match(/"login":"([^"]+)"/)?.[1];
const logId = s.match(/"log_id":"([^"]+)"/)?.[1] ?? s.match(/"logId":"([^"]+)"/)?.[1];
console.log("RESULT login:", login, "| log id:", logId);
mkdirSync("evidence/github", { recursive: true });
// keep only list/add/execute steps (drop polling noise)
const compact = trace.filter((t, i) => t.tool !== "COMPOSIO_MANAGE_CONNECTIONS" || i < 4 || i === trace.length - 2);
const safe = JSON.stringify(compact, null, 1).replace(/"(access_token|token|refresh_token)":"[^"]+"/g, '"$1":"[redacted]"');
writeFileSync("evidence/github/composio-managed-hello.json", safe);
console.log("trace -> evidence/github/composio-managed-hello.json");
