/**
 * Composio facts about a toolkit. Order of preference:
 *  1. @composio/core SDK `toolkits.get(slug)` when a Platform key (ak_...) is configured
 *  2. the public toolkit page https://docs.composio.dev/toolkits/<slug>.md (citable, no key)
 *  3. the managed-auth directory snapshot in data/composio-directory.json
 */
import directory from "@/data/composio-directory.json";
import { fetchPage } from "./fetch";

export type ComposioFacts = {
  slug: string | null;
  name: string | null;
  managed: boolean | null;
  authSchemes: string[];
  sourceUrl: string;
  quote: string;
  via: "sdk" | "docs-page" | "directory" | "none";
  checkedAt: string;
};

type Row = { name: string; slug: string; composioManaged: boolean };
const rows = (directory as { toolkits: Row[] }).toolkits;

const simplify = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

/** Fuzzy match an app name / domain to a Composio toolkit row. */
export function matchToolkit(nameOrDomain: string): Row | null {
  const q = simplify(nameOrDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0]);
  const qFull = simplify(nameOrDomain);
  return (
    rows.find((r) => simplify(r.slug) === qFull || simplify(r.name) === qFull) ??
    rows.find((r) => simplify(r.slug) === q || simplify(r.name) === q) ??
    null
  );
}

export async function composioFacts(nameOrDomain: string, explicitSlug?: string | null): Promise<ComposioFacts> {
  const checkedAt = new Date().toISOString().slice(0, 10);
  const row = explicitSlug ? rows.find((r) => r.slug === explicitSlug.toUpperCase()) ?? null : matchToolkit(nameOrDomain);
  const slug = row?.slug ?? null;

  // 1. SDK (only with a Platform project key)
  if (slug && process.env.COMPOSIO_API_KEY?.startsWith("ak_")) {
    try {
      const { Composio } = await import("@composio/core");
      const composio = new Composio();
      const tk: any = await composio.toolkits.get(slug.toLowerCase());
      const managedSchemes: string[] = tk?.composioManagedAuthSchemes ?? [];
      const schemes: string[] = (tk?.authConfigDetails ?? []).map((d: any) => d.mode).filter(Boolean);
      return {
        slug, name: tk?.name ?? row?.name ?? null,
        managed: managedSchemes.some((s) => /oauth/i.test(s)),
        authSchemes: schemes.length ? schemes : managedSchemes,
        sourceUrl: `https://docs.composio.dev/toolkits/${slug.toLowerCase()}`,
        quote: `composioManagedAuthSchemes: [${managedSchemes.join(", ")}]`,
        via: "sdk", checkedAt,
      };
    } catch {
      /* fall through */
    }
  }

  // 2. Public toolkit docs page
  if (slug) {
    const url = `https://docs.composio.dev/toolkits/${slug.toLowerCase()}.md`;
    const page = await fetchPage(url);
    if (page && page.status === 200) {
      const auth = page.text.match(/\*\*Auth:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "";
      const managedLine = page.text.match(/\*\*Composio-managed OAuth available\?\*\*\s*([^\n]+)/)?.[1]?.trim();
      return {
        slug, name: row?.name ?? null,
        managed: managedLine ? /^yes/i.test(managedLine) : row?.composioManaged ?? null,
        authSchemes: auth.split(/[,/]/).map((s) => s.trim()).filter(Boolean),
        sourceUrl: url.replace(/\.md$/, ""),
        quote: `Composio-managed OAuth available? ${managedLine ?? "?"}`.slice(0, 200),
        via: "docs-page", checkedAt,
      };
    }
  }

  // 3. Directory snapshot
  if (row) {
    return {
      slug, name: row.name, managed: row.composioManaged, authSchemes: ["OAUTH2"],
      sourceUrl: "https://docs.composio.dev/toolkits/managed-auth",
      quote: row.composioManaged ? "Composio-managed OAuth available" : "Bring your own OAuth app",
      via: "directory", checkedAt,
    };
  }
  return {
    slug: null, name: null, managed: null, authSchemes: [],
    sourceUrl: "https://docs.composio.dev/toolkits/managed-auth",
    quote: "", via: "none", checkedAt,
  };
}
