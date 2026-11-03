/**
 * Public, unauthenticated probes. Each probe produces a raw record (saved as evidence) and,
 * where informative, a `tested` claim. Probes never log in, never submit forms, never follow
 * the provider's login redirect beyond reading the first response.
 */
export type ProbeResult = {
  id: string;
  kind: "oidc-discovery" | "oauth-metadata" | "authorize-dummy-client";
  url: string;
  status: number | null;
  location?: string;
  contentType?: string;
  bodySnippet?: string;
  json?: Record<string, unknown>;
  error?: string;
  at: string;
};

const DUMMY_CLIENT = "greenlight-probe-invalid-client";
export const PROBE_REDIRECT = "http://localhost:3000/greenlight-probe-callback";

async function get(url: string): Promise<Omit<ProbeResult, "id" | "kind">> {
  const at = new Date().toISOString();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "GreenlightProbe/0.1 (public read-only)", accept: "application/json,text/html;q=0.8" },
      signal: AbortSignal.timeout(12_000),
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const body = await res.text();
    let json: Record<string, unknown> | undefined;
    if (/json/.test(contentType ?? "") || body.trim().startsWith("{")) {
      try {
        json = JSON.parse(body);
      } catch {}
    }
    return {
      url,
      status: res.status,
      location: res.headers.get("location") ?? undefined,
      contentType,
      bodySnippet: body.replace(/\s+/g, " ").slice(0, 600),
      json,
      at,
    };
  } catch (e) {
    return { url, status: null, error: (e as Error).message, at };
  }
}

/** Hosts worth checking for discovery documents, derived from the site + authorize URLs. */
export function candidateIssuers(domain: string, extraHosts: string[] = []) {
  const bare = domain.replace(/^www\./, "");
  const hosts = new Set([
    bare,
    `www.${bare}`,
    `accounts.${bare}`,
    `auth.${bare}`,
    `login.${bare}`,
    `api.${bare}`,
    ...extraHosts,
  ]);
  return [...hosts].map((h) => `https://${h}`);
}

export async function runDiscoveryProbes(issuers: string[]): Promise<ProbeResult[]> {
  const jobs: Promise<ProbeResult>[] = [];
  let i = 0;
  for (const base of issuers) {
    for (const [kind, path] of [
      ["oidc-discovery", "/.well-known/openid-configuration"],
      ["oauth-metadata", "/.well-known/oauth-authorization-server"],
    ] as const) {
      const id = `p-${kind}-${i++}`;
      jobs.push(get(base + path).then((r) => ({ id, kind, ...r })));
    }
  }
  const all = await Promise.all(jobs);
  // keep hits + a couple of misses as negative evidence
  const hits = all.filter((p) => p.json && (p.json.authorization_endpoint || p.json.issuer));
  return hits.length ? hits : all.slice(0, 2);
}

/**
 * Open the authorize endpoint with a fake client id and a localhost redirect, and record what the
 * provider says. This reveals (sometimes) whether client validation happens before redirect
 * validation, whether PKCE is demanded, and the provider's error vocabulary, without any login.
 */
export async function probeAuthorize(authorizeUrl: string, extraParams: Record<string, string> = {}) {
  const u = new URL(authorizeUrl);
  u.searchParams.set("client_id", DUMMY_CLIENT);
  u.searchParams.set("redirect_uri", PROBE_REDIRECT);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", "greenlight-probe");
  if (!u.searchParams.has("scope")) u.searchParams.set("scope", "openid"); // some providers reject missing scope before checking the client
  for (const [k, v] of Object.entries(extraParams)) u.searchParams.set(k, v);
  const r = await get(u.toString());
  return { id: `p-authorize-${u.host}`, kind: "authorize-dummy-client" as const, ...r };
}

/** Extract candidate OAuth authorize URLs mentioned in docs text. */
export function findAuthorizeUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[\w\-./]*)?(?:oauth2?|authorize|auth)[\w\-./]*/gi)) {
    const url = m[0].replace(/[.,)]+$/, "");
    if (/authorize|\/oauth2?\/auth|\/oauth\/v2\/authorize|\/auth$/i.test(url) && !/token|revoke|introspect/i.test(url))
      out.add(url);
  }
  return [...out].slice(0, 4);
}

/** Human summary of a probe, used both in the job stream and as the claim text. */
export function describeProbe(p: ProbeResult): string {
  if (p.status === null) return `${p.url} → no response (${p.error})`;
  if (p.json?.authorization_endpoint) {
    const j = p.json;
    const pkce = Array.isArray(j.code_challenge_methods_supported)
      ? ` PKCE methods: ${(j.code_challenge_methods_supported as string[]).join(", ")}.`
      : "";
    return `${p.url} → ${p.status}; publishes authorization_endpoint ${j.authorization_endpoint}.${pkce}`;
  }
  if (p.kind === "authorize-dummy-client") {
    const loc = p.location ? ` redirects to ${p.location.slice(0, 160)}` : "";
    return `Authorize URL with a fake client_id and localhost redirect → HTTP ${p.status}${loc}. Body: "${(p.bodySnippet ?? "").slice(0, 160)}"`;
  }
  return `${p.url} → HTTP ${p.status} (no discovery document)`;
}
