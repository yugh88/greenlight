// Smoke-tests each credential without printing it.
import { config } from "dotenv";
config({ path: ".env.local" });

const t = (ms: number) => AbortSignal.timeout(ms);

async function composio() {
  const r = await fetch("https://backend.composio.dev/api/v3.1/toolkits/github", {
    headers: { "x-api-key": process.env.COMPOSIO_API_KEY! }, signal: t(20000) });
  const body = await r.text();
  return `${r.status} ${body.slice(0, 300)}`;
}
async function gemini() {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST", signal: t(30000),
    headers: { "x-goog-api-key": process.env.GOOGLE_GENERATIVE_AI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }) });
  const j = await r.json();
  return `${r.status} ${JSON.stringify(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? j?.error ?? j).slice(0, 300)}`;
}
async function neon() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  const r = await sql`select version()`;
  return String(r[0].version).slice(0, 60);
}
for (const [n, f] of [["composio", composio], ["gemini", gemini], ["neon", neon]] as const) {
  try { console.log(n, "->", await f()); } catch (e) { console.log(n, "ERROR", (e as Error).message); }
}
