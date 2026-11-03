# Research notes (verified facts we build on)

All checked 2026-11-03 unless stated.

## Composio

- **Managed vs bring-your-own counts.** The managed-auth directory lists **125** OAuth toolkits under
  "Composio-managed OAuth available" and **262** under "Bring your own OAuth app" (387 OAuth toolkits total).
  Source: https://docs.composio.dev/toolkits/managed-auth (parsed into `data/composio-directory.json`).
- **How to check programmatically:** `GET https://backend.composio.dev/api/v3.1/toolkits/<slug>` and read
  `composio_managed_auth_schemes`. If it contains the OAuth method, Composio provides the OAuth app.
- **Why bring your own app even when managed** (https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app):
  your app name on consent screens; custom scopes; dedicated rate-limit quota (managed apps share quota);
  faster polling triggers (managed enforces a 2-minute minimum); custom/self-hosted instances; enterprise branding.
  Token custody is unchanged either way.
- **Custom auth config flow:** Dashboard → Create Auth Config → pick toolkit → OAuth2 → dashboard shows the
  redirect URI to paste into the provider console → paste Client ID/Secret → copy `ac_...` id → pass
  `authConfigs: { <toolkit>: "ac_..." }` to `composio.create(userId, ...)`.
- **SDK pattern (TS, @composio/core 0.27):** `const composio = new Composio(); const session = await composio.create(userId)`;
  `session.authorize(toolkit)` → Connect Link + `waitForConnection()`; `session.execute(...)`; `session.tools()`.
  Default meta tools: COMPOSIO_SEARCH_TOOLS, COMPOSIO_GET_TOOL_SCHEMAS, COMPOSIO_MULTI_EXECUTE_TOOL,
  COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_WAIT_FOR_CONNECTIONS, COMPOSIO_REMOTE_WORKBENCH, COMPOSIO_REMOTE_BASH_TOOL.
- **Existing Composio content to differentiate from:** composio.dev/auth hosts step-by-step OAuth setup guides
  (Google, GitHub, Slack, HubSpot, "All toolkits"). Greenlight must go beyond: difficulty + time-to-production
  incl. review wait, evidence labels, blockers, agent artefacts, live generation. **TODO: read a few of these pages.**

## Gold-set status on Composio (from the directory)

| App | Toolkit slug | Composio-managed? |
|---|---|---|
| GitHub | GITHUB | yes |
| Slack | SLACK (+ SLACKBOT) | yes |
| Gmail | GMAIL | yes |
| Linear | LINEAR | yes |
| Notion | NOTION | yes |
| LinkedIn (non-ads) | LINKEDIN | yes |
| Spotify | SPOTIFY | **no** (BYO) |
| Microsoft Entra ID | MICROSOFT_ENTRA_ID | **no** (BYO) |
| Xero | XERO | **no** (BYO) |
| Shopify | SHOPIFY | **no** (BYO) |
| X (Twitter) | TWITTER | **no** (BYO) |
| Meta Ads | METAADS | **no** (BYO) |
| LinkedIn Ads | LINKEDIN_ADS | **no** (BYO) |
| Strava | — | **not on Composio** → good live demo |

## Gemini free tier (https://ai.google.dev/gemini-api/docs/pricing)

- Free input/output: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`.
- **Google Search grounding on the free tier: "Not available" for every Gemini 3.x model.** Only `gemini-2.5-flash` /
  `gemini-2.5-flash-lite` list it as "Free of charge, up to 500 RPD". → Discover step uses `gemini-2.5-flash` for
  grounded search; agent loop uses `gemini-3.8-flash`; verifier uses `gemini-3.5-flash-lite`.
- Free tier: "Content used to improve our products: Yes". Only public docs / probe results go to the model.
- Per-project rate limits are shown in AI Studio (not on the pricing page) → **TODO: read limits once key exists.**
