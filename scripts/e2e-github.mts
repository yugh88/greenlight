/**
 * Closed loop through Composio with OUR OWN GitHub OAuth app (gold-path evidence).
 *   headed browser → (human signs in) → create OAuth App "Greenlight test" with Composio's callback
 *   → generate client secret (human confirms sudo/2FA if asked) → composio.authConfigs.create (custom OAuth2)
 *   → session.authorize → Connect Link (human clicks Authorize) → GITHUB_GET_THE_AUTHENTICATED_USER
 * The client secret only lives in memory: never logged, never written, masked in screenshots.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { Composio } from "@composio/core";

const CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
const USER_ID = process.env.COMPOSIO_TEST_USER_ID ?? "yugh-test";
const OUT = "public/evidence/github";
const today = new Date().toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });
mkdirSync("scratch", { recursive: true });

let secret = "";
const scrub = (s: string) => (secret ? s.split(secret).join("[REDACTED]") : s);
const log = (...a: unknown[]) => console.log(scrub(a.map(String).join(" ")));
const trace: { at: string; step: string; detail?: unknown }[] = [];
const step = (s: string, detail?: unknown) => {
  trace.push({ at: new Date().toISOString(), step: s, detail });
  log(`• ${s}`);
};
let n = 0;
async function shot(page: Page, name: string) {
  const file = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  const mask = secret ? [page.getByText(secret, { exact: false })] : [];
  await page.screenshot({ path: file, mask, maskColor: "#111" }).catch(() => undefined);
  step(`screenshot ${file}`);
  return file;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits until ANY open tab matches; switches `page` to it (sign-in flows may open/close tabs). */
async function waitForUrl(_p: Page, re: RegExp, what: string, minutes = 15) {
  const end = Date.now() + minutes * 60_000;
  let told = false;
  while (Date.now() < end) {
    const pages = browser.pages().filter((p) => !p.isClosed());
    const hit = pages.find((p) => re.test(p.url()));
    if (hit) { page = hit; await page.bringToFront().catch(() => undefined); return; }
    if (!pages.length) page = await browser.newPage().then(async (p) => { await p.goto(TARGET).catch(() => undefined); return p; });
    if (!told) { log(`⏳ waiting for you: ${what}`); told = true; }
    await sleep(1500);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const TARGET = "https://github.com/settings/applications/new";
async function fill(page: Page, ids: string[], label: RegExp, value: string) {
  for (const id of ids) {
    const l = page.locator(id);
    if (await l.count()) { await l.first().fill(value); return; }
  }
  await page.getByLabel(label).first().fill(value);
}

const browser = await chromium.launchPersistentContext("scratch/pw-profile", { headless: false, viewport: { width: 1280, height: 900 } });
let page: Page = browser.pages()[0] ?? (await browser.newPage());
const state: Record<string, string> = {};
try {
  // 1. sign in + open the new OAuth App form
  await page.goto(TARGET);
  log("Browser open. If you land elsewhere after signing in, the script reopens the form automatically.");
  // after sign-in GitHub may redirect to the dashboard: nudge back to the form
  const nudge = setInterval(async () => {
    const p = browser.pages().find((x) => !x.isClosed() && /^https:\/\/github\.com\/?(\?.*)?$/.test(x.url()));
    if (p) await p.goto(TARGET).catch(() => undefined);
  }, 4000);
  await waitForUrl(page, /github\.com\/settings\/applications\/new/, "sign in to GitHub in the browser window (Chromium)");
  clearInterval(nudge);
  await page.waitForLoadState("domcontentloaded");
  step("GitHub: New OAuth App form open");
  await fill(page, ["#oauth_application_name"], /application name/i, "Greenlight test");
  await fill(page, ["#oauth_application_url"], /homepage url/i, "https://github.com/yugh88");
  const desc = page.locator("#oauth_application_description");
  if (await desc.count()) await desc.fill("Test app for the Greenlight take-home: verifies the Composio custom auth config flow end-to-end. Safe to delete.");
  await fill(page, ["#oauth_application_callback_url"], /callback url/i, CALLBACK);
  await shot(page, "github-new-oauth-app-form");
  await page.getByRole("button", { name: /register application/i }).click();

  // 2. app created (GitHub may ask for sudo confirmation first)
  await waitForUrl(page, /github\.com\/settings\/applications\/\d+/, "confirm access (password / passkey / 2FA) if GitHub asks");
  state.githubAppUrl = page.url().split("?")[0];
  await page.waitForLoadState("domcontentloaded");
  const body = await page.content();
  const clientId = body.match(/\b(Ov2[0-9A-Za-z]{17}|Iv1\.[0-9a-f]{16}|[0-9a-f]{20})\b/)?.[1];
  if (!clientId) throw new Error("could not read Client ID from the app page");
  state.clientId = clientId;
  step("GitHub: OAuth App registered", { appUrl: state.githubAppUrl, clientId });
  await shot(page, "github-app-registered");

  // 3. generate a client secret
  await page.getByRole("button", { name: /generate a new client secret/i }).click();
  const end = Date.now() + 15 * 60_000;
  let told = false;
  while (Date.now() < end && !secret) {
    const m = (await page.content()).match(/\b([0-9a-f]{40})\b/);
    if (m) secret = m[1];
    else {
      if (!told) { log("⏳ waiting for you: confirm access if GitHub asks, so the new client secret appears"); told = true; }
      await sleep(1500);
    }
  }
  if (!secret) throw new Error("client secret did not appear");
  step("GitHub: client secret generated (kept in memory only)");
  await shot(page, "github-client-secret-generated-masked");

  // 4. Composio custom auth config
  const composio = new Composio();
  const ac: any = await composio.authConfigs.create("github", {
    type: "use_custom_auth",
    authScheme: "OAUTH2",
    name: "Greenlight test (custom GitHub OAuth app)",
    credentials: { client_id: clientId, client_secret: secret, oauth_redirect_uri: CALLBACK },
  } as any);
  const acId: string = ac?.id ?? ac?.authConfig?.id;
  state.authConfigId = acId;
  step("Composio: custom auth config created", { authConfigId: acId, toolkit: "github", authScheme: "OAUTH2", redirectUri: CALLBACK });
  secret = secret; // still needed for masking; never persisted

  // 5. session + Connect Link
  const session: any = await composio.create(USER_ID, { authConfigs: { github: acId } } as any);
  state.sessionId = session.sessionId ?? session.id ?? "";
  const req: any = await session.authorize("github");
  step("Composio: Connect Link created", { sessionId: state.sessionId, connectedAccountId: req.id });
  state.connectedAccountId = req.id;
  await page.goto(req.redirectUrl);
  await page.waitForTimeout(2500);
  await shot(page, "composio-connect-link");
  log("⏳ waiting for you: click through the Connect Link and press 'Authorize' on GitHub's consent screen");
  // capture the GitHub consent screen showing OUR app name
  const consentEnd = Date.now() + 5 * 60_000;
  while (Date.now() < consentEnd) {
    const p = browser.pages().find((x) => !x.isClosed() && /github\.com\/login\/oauth\/authorize/.test(x.url()));
    if (p) { page = p; break; }
    await sleep(1000);
  }
  if (/github\.com\/login\/oauth\/authorize/.test(page.url())) {
    await page.waitForTimeout(1500);
    await shot(page, "github-consent-screen-greenlight-test");
  }
  const connected: any = await req.waitForConnection(15 * 60_000);
  step("Composio: connected account ACTIVE", { connectedAccountId: connected?.id, status: connected?.status });
  await sleep(2000);
  const last = browser.pages().filter((x) => !x.isClosed()).at(-1);
  if (last) await shot(last, "after-authorize");

  // 6. one read-only tool call through the session
  const res: any = await session.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {});
  const data = res?.data ?? res;
  const login = JSON.stringify(data).match(/"login":"([^"]+)"/)?.[1];
  const logId = res?.logId ?? res?.log_id ?? JSON.stringify(res).match(/"log_?[iI]d":"([^"]+)"/)?.[1];
  step("Composio: GITHUB_GET_THE_AUTHENTICATED_USER", { successful: res?.successful ?? !res?.error, login, logId, error: res?.error ?? null });
  state.login = login ?? "";
  state.logId = logId ?? "";
} catch (e) {
  step("ERROR", { message: scrub((e as Error).message).slice(0, 400) });
  process.exitCode = 1;
} finally {
  const safe = scrub(JSON.stringify({ testedAt: today, userId: USER_ID, callback: CALLBACK, state, trace }, null, 1));
  writeFileSync(`${OUT}/e2e-trace.json`, safe);
  writeFileSync("scratch/e2e-github-state.json", scrub(JSON.stringify(state, null, 1)));
  log(`trace → ${OUT}/e2e-trace.json`);
  secret = "";
  await browser.close();
}
