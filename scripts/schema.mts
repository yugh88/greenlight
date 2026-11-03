import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { listTools } = await import("../lib/composio-mcp.ts");
const tools: any[] = await listTools();
for (const n of process.argv.slice(2)) { const t = tools.find(x => x.name === n); console.log(n, JSON.stringify(t?.inputSchema).slice(0, 1800)); }
