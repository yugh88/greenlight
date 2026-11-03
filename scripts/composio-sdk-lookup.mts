/**
 * Re-derive every gold guide's Composio facts from the SDK (composio.toolkits.get) and record them
 * as TESTED evidence: raw response saved to public/evidence/<slug>/composio-toolkit.json, claim added
 * to data/gold-patches/<slug>.json (applied by apply-gold-patches).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { Composio } from "@composio/core";
const composio = new Composio();
const today = new Date().toISOString().slice(0, 10);
const dir = JSON.parse(readFileSync("data/composio-directory.json", "utf8"));
for (const f of readdirSync("data/guides").filter((f) => f.endsWith(".json"))) {
  const slug = f.replace(".json", "");
  const g = JSON.parse(readFileSync(`data/guides/${f}`, "utf8"));
  const tk = g.app.composioSlug;
  if (!tk) continue;
  const t: any = await composio.toolkits.get(tk.toLowerCase());
  const managed: string[] = t.composioManagedAuthSchemes ?? [];
  const modes: string[] = (t.authConfigDetails ?? []).map((d: any) => d.mode);
  const isManaged = managed.some((m) => /oauth/i.test(m));
  const dirRow = dir.toolkits.find((r: any) => r.slug === tk);
  mkdirSync(`public/evidence/${slug}`, { recursive: true });
  writeFileSync(`public/evidence/${slug}/composio-toolkit.json`, JSON.stringify({
    call: `composio.toolkits.get("${tk.toLowerCase()}")`, sdk: "@composio/core 0.27.0", at: new Date().toISOString(),
    response: { name: t.name, slug: t.slug, composioManagedAuthSchemes: managed, authConfigModes: modes, getCurrentUserEndpoint: t.getCurrentUserEndpoint },
  }, null, 1));
  const claim = {
    id: "c-composio-sdk",
    text: isManaged
      ? `Composio manages an OAuth app for ${t.name}: toolkits.get("${tk.toLowerCase()}") returns composioManagedAuthSchemes [${managed.join(", ")}].`
      : `Composio does not manage an OAuth app for ${t.name}: toolkits.get("${tk.toLowerCase()}") returns composioManagedAuthSchemes [${managed.join(", ")}] (auth modes: ${modes.join(", ")}), so you bring your own.`,
    evidence: "tested",
    artifact: `/evidence/${slug}/composio-toolkit.json`,
    checkedAt: today,
  };
  const pp = `data/gold-patches/${slug}.json`;
  const p = existsSync(pp) ? JSON.parse(readFileSync(pp, "utf8")) : {};
  p.addClaims = [...(p.addClaims ?? []).filter((c: any) => c.id !== "c-composio-sdk"), claim];
  p.attach = { ...(p.attach ?? {}), composioFit: [...new Set([...(p.attach?.composioFit ?? []), "c-composio-sdk"])] };
  p.app = { composioManaged: isManaged, authSchemes: modes.length ? modes : managed };
  writeFileSync(pp, JSON.stringify(p, null, 2));
  console.log(`${slug.padEnd(20)} ${tk.padEnd(20)} managed=${isManaged} schemes=[${managed}] modes=[${modes}] directory=${dirRow?.composioManaged}${dirRow && dirRow.composioManaged !== isManaged ? "  ⚠ MISMATCH" : ""}`);
}
