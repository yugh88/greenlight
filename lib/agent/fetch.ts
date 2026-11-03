/**
 * Public-page fetcher for the agent. Read-only: GET only, no cookies, no form submission.
 */
export type Page = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  links: { href: string; text: string }[];
  fetchedAt: string;
};

const UA =
  "Mozilla/5.0 (compatible; GreenlightBot/0.1; +https://github.com/yughjuneja/greenlight) public-docs-reader";

const cache = new Map<string, Promise<Page | null>>();

export function fetchPage(url: string, timeoutMs = 15_000): Promise<Page | null> {
  const key = url.replace(/#.*$/, "");
  if (!cache.has(key)) cache.set(key, doFetch(key, timeoutMs));
  return cache.get(key)!;
}

async function doFetch(url: string, timeoutMs: number): Promise<Page | null> {
  const page = await plainFetch(withEnglish(url), timeoutMs);
  // JS-rendered docs (e.g. Xero): render with a headless browser, only where allowed (local gold runs)
  if (page && page.status < 400 && page.text.length < 300 && process.env.GREENLIGHT_RENDER === "1") {
    const rendered = await renderFetch(url).catch(() => null);
    if (rendered && rendered.text.length > page.text.length) return rendered;
  }
  return page;
}

function withEnglish(url: string) {
  try {
    const u = new URL(url);
    if (/(^|\.)google\.com$/.test(u.hostname) && !u.searchParams.has("hl")) u.searchParams.set("hl", "en");
    return u.toString();
  } catch {
    return url;
  }
}

async function renderFetch(url: string): Promise<Page | null> {
  const { chromium } = await import(/* webpackIgnore: true */ "playwright" as string);
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ locale: "en-US", userAgent: UA });
    const res = await p.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => null);
    await p.waitForTimeout(1500);
    const html: string = await p.content();
    return {
      url,
      finalUrl: p.url(),
      status: res?.status() ?? 200,
      title: await p.title(),
      text: htmlToText(html),
      links: extractLinks(html, p.url()),
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

async function plainFetch(url: string, timeoutMs: number): Promise<Page | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,text/markdown,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!/text|json|xml|markdown/.test(type)) return null;
    const raw = (await res.text()).slice(0, 2_000_000);
    const isHtml = /html/.test(type) || /^\s*<(!doctype|html)/i.test(raw);
    return {
      url,
      finalUrl: cleanUrl(res.url || url),
      status: res.status,
      title: isHtml ? decode(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() : "",
      text: isHtml ? htmlToText(raw) : raw,
      links: isHtml ? extractLinks(raw, res.url || url) : [],
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/pre)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<h([1-6])[^>]*>/gi, (_, n) => "\n" + "#".repeat(Number(n)) + " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

function extractLinks(html: string, base: string) {
  const out: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(decode(m[1]), base).toString();
      if (!/^https?:/.test(href) || seen.has(href)) continue;
      seen.add(href);
      out.push({ href, text: decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120) });
    } catch {}
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
}

/** Normalise for fuzzy quote matching. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’“”`"']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Is `quote` present in `text`? Exact normalised substring, else best sliding-window token
 * overlap >= threshold (tolerates small rewording / markup differences).
 */
export function quoteMatch(quote: string, text: string, threshold = 0.85): { ok: boolean; score: number } {
  const q = norm(quote);
  const t = norm(text);
  if (!q) return { ok: false, score: 0 };
  if (t.includes(q)) return { ok: true, score: 1 };
  const qt = q.split(" ");
  const tt = t.split(" ");
  const qset = new Map<string, number>();
  for (const w of qt) qset.set(w, (qset.get(w) ?? 0) + 1);
  const win = qt.length;
  let best = 0;
  const counts = new Map<string, number>();
  let hits = 0;
  const add = (w: string, d: number) => {
    const need = qset.get(w);
    if (!need) return;
    const before = counts.get(w) ?? 0;
    const after = before + d;
    counts.set(w, after);
    hits += Math.min(after, need) - Math.min(before, need);
  };
  for (let i = 0; i < tt.length; i++) {
    add(tt[i], 1);
    if (i >= win) add(tt[i - win], -1);
    if (hits / win > best) best = hits / win;
    if (best >= 0.999) break;
  }
  return { ok: best >= threshold, score: Number(best.toFixed(3)) };
}

/** Drop tracking/session params so cited URLs are stable. */
export function cleanUrl(u: string) {
  try {
    const x = new URL(u);
    for (const k of ["visit_id", "rd", "utm_source", "utm_medium", "utm_campaign"]) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return u;
  }
}
