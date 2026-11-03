/**
 * Composio half of the closed loop (provider console steps are done in the user's Chrome).
 * Usage: pnpm tsx scripts/e2e-composio.mts <toolkit> <clientId> <readOnlyToolSlug>
 * The client secret is read from the macOS clipboard (user clicks the provider's copy button),
 * kept in memory only, never printed or written. The clipboard is cleared afterwards.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Composio } from "@composio/core";

const [toolkit, clientId, toolSlug, slugArg] = process.argv.slice(2);
const slug = slugArg ?? toolkit;
const CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
const USER_ID = process.env.COMPOSIO_TEST_USER_ID ?? "yugh-test";
const OUT = `public/evidence/${slug}`;
mkdirSync(OUT, { recursive: true });

let secret = execSync("pbpaste").toString().trim();
const looksRight = toolkit === "github" ? /^[0-9a-f]{40}$/.test(secret) : /^[0-9a-f]{20,64}$/i.test(secret);
if (!looksRight) {
  secret = "";
  console.log("✗ Clipboard does not contain a client secret in the expected format (nothing was printed). Copy it and re-run.");
  process.exit(2);
}
execSync("printf '' | pbcopy"); // clear clipboard
const scrub = (s: string) => (secret ? s.split(secret).join("[REDACTED]") : s);
const trace: { at: string; step: string; detail?: unknown }[] = [];
const step = (s: string, detail?: unknown) => {
  trace.push({ at: new Date().toISOString(), step: s, detail });
  console.log(scrub(`• ${s}${detail ? " " + JSON.stringify(detail) : ""}`));
};

const composio = new Composio();
const state: Record<string, unknown> = { toolkit, clientId, callback: CALLBACK, userId: USER_ID };
try {
  const ac: any = await composio.authConfigs.create(toolkit, {
    type: "use_custom_auth",
    authScheme: "OAUTH2",
    name: `Greenlight test (custom ${toolkit} OAuth app)`,
    credentials: { client_id: clientId, client_secret: secret, oauth_redirect_uri: CALLBACK },
  } as any);
  secret = ""; // no longer needed
  const acId: string = ac?.id ?? ac?.authConfig?.id;
  state.authConfigId = acId;
  step("composio.authConfigs.create (use_custom_auth, OAUTH2)", { authConfigId: acId, redirectUri: CALLBACK });

  const session: any = await composio.create(USER_ID, { authConfigs: { [toolkit]: acId } } as any);
  state.sessionId = session.sessionId ?? session.id;
  const req: any = await session.authorize(toolkit);
  state.connectedAccountId = req.id;
  step("session.authorize → Connect Link", { sessionId: state.sessionId, connectedAccountId: req.id });
  console.log(`CONNECT_LINK ${req.redirectUrl}`);

  const connected: any = await req.waitForConnection(15 * 60_000);
  step("connected account ACTIVE", { connectedAccountId: connected?.id ?? req.id, status: connected?.status, authConfigId: acId });

  const res: any = await session.execute(toolSlug, {});
  const s = JSON.stringify(res);
  const who = s.match(/"(login|user|name|real_name)":"([^"]+)"/)?.[2];
  const logId = res?.logId ?? res?.log_id ?? s.match(/"log_?[iI]d":"([^"]+)"/)?.[1];
  state.toolResult = { tool: toolSlug, successful: !res?.error, identity: who, logId, error: res?.error ?? null };
  step(`session.execute(${toolSlug})`, state.toolResult);
} catch (e) {
  step("ERROR", { message: scrub(String((e as Error).message)).slice(0, 400) });
  process.exitCode = 1;
} finally {
  secret = "";
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(`${OUT}/e2e-trace.json`, JSON.stringify({ testedAt: today, sdk: "@composio/core 0.27.0", state, trace }, null, 1));
  console.log(`trace → ${OUT}/e2e-trace.json`);
}
