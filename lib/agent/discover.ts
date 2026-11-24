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
  /** Fetch-verified official docs pages suggested by the planner, read directly (not just mined for links). */
  seedPages: Page[];
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

export async function resolveInput(input: string, plannedDomain?: string): Promise<{ name: string; domain: string; website: string }> {
  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed);
  if (looksLikeUrl) {
    const u = new URL(/^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const domain = u.hostname.replace(/^www\./, "");
    const label = domain.split(".").slice(-2, -1)[0] ?? domain;
    return { name: label.charAt(0).toUpperCase() + label.slice(1), domain, website: `https://${domain}` };
  }
  // Planner's official domain first ("Meta Ads" → facebook.com, not metaads.io), verified by fetch.
  if (plannedDomain) {
    const p = await fetchPage(`https://${plannedDomain}`, 8_000);
    if (p && p.status < 400) {
      const finalHost = new URL(p.finalUrl).hostname.replace(/^www\./, "");
      return { name: trimmed, domain: finalHost, website: `https://${finalHost}` };
    }
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
  const plan = await planSources(input).catch(() => null);
  const looksLikeUrl = /^https?:\/\//i.test(input.trim()) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(input.trim());
  const { name, domain, website } = await resolveInput(input, looksLikeUrl ? undefined : plan?.officialDomain);
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

  // Planner hints (model knowledge, verified by fetch before use): the pages where the decisive facts
  // live (review/verification, quotas, dev-mode caps, redirect rules, errors), which are usually several
  // clicks deep and often on an umbrella portal (Gmail → developers.google.com + support.google.com).
  const hints = plan?.docsUrls ?? [];
  if (hints.length) emit(`Checking ${hints.length} likely docs URLs (review, quotas, scopes, redirect rules, errors)`);
  const orgTokens = new Set([root.split(".")[0], ...(plan?.officialDomain ? [plan.officialDomain.split(".").slice(-2)[0]] : [])]);
  const appToken = slugify(name).split("-")[0];
  const fetchedHints = await mapLimit(hints, 6, (h) => fetchPage(h, 10_000));
  const hintPages: Page[] = [];
  for (const p of fetchedHints) {
    if (!p || p.status >= 400 || p.text.length < 300) continue;
    const host = safeHost(p.finalUrl) ?? "";
    const official = [...orgTokens].some((t) => t.length > 1 && host.includes(t));
    const relevant = p.text.toLowerCase().includes(appToken) && OAUTH_WORDS.test(p.text);
    if ((official || relevant) && !hintPages.some((x) => x.finalUrl === p.finalUrl)) hintPages.push(p);
  }
  if (hintPages.length) emit(`Verified ${hintPages.length} docs URL(s): ${hintPages.map((p) => p.finalUrl).join(", ")}`);
  if (hintPages.length) portalUrls.unshift(...hintPages.map((p) => p.finalUrl));

  // Fetch candidates in parallel, keep the first (in priority order) that is a real page.
  const portalPages = await mapLimit([...new Set(portalUrls)].slice(0, 14), 7, (u) => fetchPage(u, 10_000));
  const portal = portalPages.find((p) => p && p.status < 400 && p.text.length > 400) ?? null;
  if (portal) emit(`Developer docs found: ${portal.finalUrl}`);
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
    // llms.txt: an agent-oriented index of every doc page (Mintlify, many modern doc sites).
    // Checked on the portal and on the origins of verified hint pages (docs often live on another host).
    const origins = [...new Set([origin, ...hintPages.map((p) => new URL(p.finalUrl).origin)])].slice(0, 3);
    for (const o of origins) {
      for (const u of [`${o}/llms.txt`, `${o}/docs/llms.txt`]) {
        const lt = await fetchPage(u, 8_000);
        if (lt && lt.status < 400 && /\]\(https?:\/\//.test(lt.text)) {
          for (const m of lt.text.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g)) extra.push({ href: m[2], text: m[1] });
          emit(`Read ${u} (agent index of the docs)`);
          break;
        }
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
  return { name, domain: bare, website, homepage, portal, seedPages: hintPages, candidates };
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
Pick up to ${max} links (by index) that most likely document, in priority order: app review / verification / production access / publishing or distribution requirements; development-mode or testing limits (user caps, test users, allowlists); rate limits, quotas, API access tiers or pricing; scopes (and which are sensitive/restricted); redirect URI rules; OAuth authorization flow and app registration; error troubleshooting; developer terms/policies.
Cover as many DIFFERENT topics as possible rather than several pages on one topic. Prefer official docs over blog/marketing pages.\n\n${listing}`,
  );
  return object.picks
    .filter((i) => i >= 0 && i < links.length)
    .slice(0, max)
    .map((i) => links[i].href);
}

export { matchToolkit };

export type SourcePlan = { officialDomain?: string; docsUrls: string[] };

/**
 * One cheap model call that plans where to look: the provider's official domain and up to 12 official
 * docs URLs, one or more per topic that decides difficulty. Hints only: every URL is fetch-verified
 * before use, and facts still come only from fetched page text.
 */
export async function planSources(input: string): Promise<SourcePlan> {
  const { object } = await structured(
    "verifier",
    z.object({
      officialDomain: z.string().describe("the company's main website domain, e.g. 'spotify.com' (no scheme)"),
      docsUrls: z.array(z.string()).describe("up to 12 official documentation URLs, most decisive first"),
    }),
    `A developer must register an OAuth app with "${input}" and get it approved so real users can connect their accounts.
Give the provider's official domain, and up to 12 URLs of its OFFICIAL developer documentation pages, covering as many of these topics as exist:
1. app review / verification / production access / publishing or public distribution (incl. marketplace review)
2. development or testing mode limits (user caps, test users, allowlists, quota modes)
3. rate limits, quotas, API access tiers, connection limits, pricing
4. OAuth scopes reference (and which scopes are sensitive / restricted / require review)
5. redirect URI rules
6. creating / registering the app and the OAuth authorization flow
7. troubleshooting OAuth errors
8. access levels or partner programs that gate production use
Only official vendor docs (including the vendor's support/help center). Use exact URLs you are confident exist; fewer is better than guessed.`,
  );
  const domain = object.officialDomain?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  return {
    officialDomain: domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain.toLowerCase() : undefined,
    docsUrls: [...new Set(object.docsUrls.filter((u) => /^https:\/\//.test(u)))].slice(0, 12),
  };
}

/** Run `fn` over items with at most `limit` in flight; preserves order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
