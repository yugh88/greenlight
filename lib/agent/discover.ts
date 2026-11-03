/**
 * Discover: resolve "app name or website" → official site, developer portal, OAuth-relevant pages.
 *
 * No search engine (Gemini free-tier grounding has 0 quota for this project; Composio's
 * Firecrawl search is paid). Instead: domain resolution + well-known developer-portal URL
 * patterns + link following on the provider's own site + an LLM ranking pass over link text.
 * Every page we keep is on a domain we reached from the provider's official site.
 */
import { z } from "zod";
import { structured } from "@/lib/model";
import { fetchPage, type Page } from "./fetch";
import { matchToolkit } from "./composio";

export type Discovery = {
  name: string;
  domain: string;
  website: string;
  homepage: Page | null;
  portal: Page | null;
  candidates: { href: string; text: string }[];
};

/** Known seeds: only URLs, never facts. They speed discovery; evidence still comes from fetched pages. */
const SEEDS: Record<string, string> = {
  strava: "https://developers.strava.com/docs/authentication/",
  linear: "https://linear.app/developers/oauth-2-0-authentication",
  github: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
  slack: "https://docs.slack.dev/authentication/installing-with-oauth",
  spotify: "https://developer.spotify.com/documentation/web-api/concepts/authorization",
  twitter: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
  x: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
  xero: "https://developer.xero.com/documentation/guides/oauth2/overview/",
  shopify: "https://shopify.dev/docs/apps/build/authentication-authorization",
  notion: "https://developers.notion.com/docs/authorization",
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.(com|io|app|dev|co|net|org|ai)(\/.*)?$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function resolveInput(input: string): Promise<{ name: string; domain: string; website: string }> {
  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed);
  if (looksLikeUrl) {
    const u = new URL(/^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const domain = u.hostname.replace(/^www\./, "");
    const label = domain.split(".").slice(-2, -1)[0] ?? domain;
    return { name: label.charAt(0).toUpperCase() + label.slice(1), domain, website: `https://${domain}` };
  }
  // name → try <name>.com, .io, .app, .dev
  const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const tld of ["com", "io", "app", "dev", "co"]) {
    const domain = `${base}.${tld}`;
    const p = await fetchPage(`https://${domain}`, 8_000);
    if (p && p.status < 400) {
      const finalHost = new URL(p.finalUrl).hostname.replace(/^www\./, "");
      return { name: trimmed, domain: finalHost, website: `https://${finalHost}` };
    }
  }
  return { name: trimmed, domain: `${base}.com`, website: `https://${base}.com` };
}

const OAUTH_WORDS =
  /oauth|authori[sz]|authenticat|scope|consent|app.?review|verification|verify|redirect|callback|rate.?limit|quota|pricing|tier|partner|terms|polic|getting.?started|create.?an?.?app|register|developer.?program|marketplace|publish|distribution|webhook/i;

export async function discover(input: string, emit: (m: string) => void): Promise<Discovery> {
  const { name, domain, website } = await resolveInput(input);
  emit(`Resolved "${input}" → ${website}`);

  const homepage = await fetchPage(website);
  const bare = domain.replace(/^www\./, "");
  const root = bare.split(".").slice(-2).join(".");

  // developer portal candidates
  const seedKey = slugify(name);
  const portalUrls = [
    SEEDS[seedKey],
    `https://developers.${root}`,
    `https://developer.${root}`,
    `https://docs.${root}`,
    `https://${root}/developers`,
    `https://${root}/developer`,
    `https://${root}/api`,
    `https://api.${root}`,
    ...(homepage?.links ?? [])
      .filter((l) => /developer|api docs|\bapi\b|docs/i.test(l.text + " " + l.href))
      .map((l) => l.href)
      .slice(0, 5),
  ].filter(Boolean) as string[];

  // Model-knowledge hints (verified by fetch before use): helps umbrella providers whose
  // product docs live deep in a shared portal (Gmail → developers.google.com/workspace/gmail).
  const hints = await docHints(name, root).catch(() => [] as string[]);
  if (hints.length) emit(`Checking ${hints.length} likely docs URLs`);
  const hintPages: Page[] = [];
  for (const h of hints) {
    const p = await fetchPage(h, 10_000);
    if (p && p.status < 400 && /oauth|authoriz/i.test(p.text)) hintPages.push(p);
  }
  if (hintPages.length) emit(`Verified ${hintPages.length} docs URL(s): ${hintPages.map((p) => p.finalUrl).join(", ")}`);
  if (hintPages.length) portalUrls.unshift(...hintPages.map((p) => p.finalUrl));

  let portal: Page | null = null;
  for (const u of portalUrls) {
    const p = await fetchPage(u, 10_000);
    if (p && p.status < 400 && p.text.length > 400) {
      portal = p;
      emit(`Developer docs found: ${p.finalUrl}`);
      break;
    }
  }
  if (!portal) emit(`No developer portal found at common locations for ${root}`);

  // gather links from portal (+ homepage), keep same-org domains
  const orgToken = root.split(".")[0];
  const pool = new Map<string, { href: string; text: string }>();
  const portalHost = portal ? safeHost(portal.finalUrl) : null;
  const hintOrgs = [...new Set(hintPages.map((p) => (safeHost(p.finalUrl) ?? "").split(".").slice(-2)[0]).filter((t) => t && t.length > 2))];
  // JS-rendered doc sites expose few links per page: also read portal root, /docs/ and sitemap.xml
  const extra: { href: string; text: string }[] = [];
  if (portal) {
    const origin = new URL(portal.finalUrl).origin;
    for (const u of [`${origin}/`, `${origin}/docs/`]) {
      const p = await fetchPage(u, 8_000);
      if (p && p.status < 400) extra.push(...p.links);
    }
    // llms.txt: an agent-oriented index of every doc page (Mintlify, many modern doc sites)
    for (const u of [`${origin}/llms.txt`, `${origin}/docs/llms.txt`]) {
      const lt = await fetchPage(u, 8_000);
      if (lt && lt.status < 400 && /\]\(https?:\/\//.test(lt.text)) {
        for (const m of lt.text.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g)) extra.push({ href: m[2], text: m[1] });
        emit(`Read ${u} (agent index of the docs)`);
        break;
      }
    }
    const sm = await fetchPage(`${origin}/sitemap.xml`, 8_000);
    if (sm && sm.status < 400 && /<loc>/i.test(sm.text)) {
      for (const m of sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        try {
          const href = m[1];
          extra.push({ href, text: decodeURIComponent(new URL(href).pathname).replace(/[/_-]+/g, " ").trim() });
        } catch {}
        if (extra.length > 600) break;
      }
    }
  }
  if (portal) {
    const origin = new URL(portal.finalUrl).origin;
    const tok = slugify(name).split("-")[0];
    for (const u of [`${origin}/${tok}`, `${origin}/docs/${tok}`]) {
      const p = await fetchPage(u, 8_000);
      if (p && p.status < 400) extra.push(...p.links);
    }
  }
  for (const p of hintPages) extra.push({ href: p.finalUrl, text: p.title || "docs" }, ...p.links);
  for (const l of [...(portal?.links ?? []), ...extra, ...(homepage?.links ?? [])]) {
    const host = safeHost(l.href);
    if (!host || !(host.includes(orgToken) || hintOrgs.some((t) => host.includes(t)))) continue;
    const docsNav = host === portalHost && /doc|guide|getting|start|limit|reference|app|review|auth/i.test(l.href + " " + l.text);
    if (docsNav || OAUTH_WORDS.test(l.text + " " + l.href)) pool.set(l.href.replace(/#.*$/, ""), l);
  }
  const nameToken = slugify(name).split("-")[0];
  const all = [...pool.values()];
  const named = all.filter((l) => nameToken.length > 2 && (l.href + " " + l.text).toLowerCase().includes(nameToken));
  const candidates = [...named, ...all.filter((l) => !named.includes(l))].slice(0, 150);
  emit(`Collected ${candidates.length} OAuth-related links from the provider's own site`);
  return { name, domain: bare, website, homepage, portal, candidates };
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

/** Ask a cheap model which links to read. Only link text + URLs are sent (public data). */
export async function rankLinks(appName: string, links: { href: string; text: string }[], max = 7) {
  if (links.length <= max) return links.map((l) => l.href);
  const listing = links.map((l, i) => `${i}. ${l.text || "(no text)"} — ${l.href}`).join("\n");
  const { object } = await structured(
    "verifier",
    z.object({ picks: z.array(z.number().int()).describe("indices, most useful first") }),
    `We are writing a guide on how a developer creates an OAuth app with ${appName} and gets it approved for production.
Pick up to ${max} links (by index) that most likely document: OAuth flow/authorization, scopes, app registration/creation, app review or verification, rate limits or API tiers/pricing, redirect URI rules, developer terms/policies.
Prefer official docs over blog/marketing pages.\n\n${listing}`,
  );
  return object.picks
    .filter((i) => i >= 0 && i < links.length)
    .slice(0, max)
    .map((i) => links[i].href);
}

export { matchToolkit };

/** Ask a cheap model for likely official OAuth docs URLs. Hints only: callers must fetch-verify. */
async function docHints(name: string, root: string): Promise<string[]> {
  const { object } = await structured(
    "verifier",
    z.object({ urls: z.array(z.string()).describe("up to 4 official documentation URLs") }),
    `List up to 4 URLs of ${name}'s OFFICIAL developer documentation pages about: creating an OAuth app / OAuth authorization, scopes, and app review or verification / production access. The company's main domain appears to be ${root}. Only official vendor docs. If unsure, return fewer.`,
  );
  return object.urls.filter((u) => /^https:\/\//.test(u)).slice(0, 4);
}
