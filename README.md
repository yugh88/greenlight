# Greenlight

**Will your OAuth app get the green light?** Greenlight tells a developer building an AI agent on Composio how hard it is to get a provider's OAuth app set up and approved, how long it really takes (including the provider's review queue), what will block them, and what an agent can do for them. Every claim is labelled **tested**, **sourced** or **uncertain**.

| | |
|---|---|
| **Live app** | https://greenlight-blue-ten.vercel.app |
| **PM memo (1 page)** | [MEMO.md](MEMO.md) |
| **How scoring and evidence work** | https://greenlight-blue-ten.vercel.app/method |
| **For agents** | [`/llms.txt`](https://greenlight-blue-ten.vercel.app/llms.txt) · `/guides/<app>.md` · MCP endpoint `/api/mcp` |
| **Loom walkthrough** | _link added at submission_ |

---

## 1. The problem

- A developer's users connect apps through Composio, but **for 262 of Composio's 387 OAuth toolkits Composio does not provide an OAuth app**. The developer has to register one with the provider and get it approved ([managed-auth directory](https://docs.composio.dev/toolkits/managed-auth), checked 2026-11-03).
- Even for the 125 managed toolkits, Composio's docs recommend your own app in production for consent-screen branding, custom scopes and a dedicated rate-limit quota.
- Today developers piece this together from scattered docs, unfamiliar consoles and emails to providers. They can't tell whether it takes **an hour or a quarter**, or what will get them rejected. The time sink is not engineering; it is the **review queue and its gates**.

## 2. What Greenlight does

1. **A library of guides**: 10 hand-curated *gold* guides covering every difficulty tier (GitHub → Spotify).
2. **Live generation for any app**: type a name or website; an agent investigates the provider's public docs, probes its public OAuth endpoints, and publishes a shareable guide in 1–3 minutes, including apps that aren't on Composio at all.
3. **Every guide answers four questions above the fold:**
   - *How hard?* Difficulty 1–5 (Self-serve → Partner-only / gated)
   - *How long?* Two clocks: **time to first token** (minutes, your own account) vs **time to production** (days to weeks, including review)
   - *What could change the setup?* Requirements, scopes, redirect rules, blockers
   - *What can an agent do, and where do I take over?* An Agent / You / Provider swimlane plus copy-paste artefacts
4. **Proof instead of prose**: every claim has an evidence label; quotes are re-verified against the live page; GitHub and Slack were **tested end-to-end through Composio** with our own OAuth apps.

## 3. Try it in two minutes

1. Open the **[Gmail guide](https://greenlight-blue-ten.vercel.app/guides/gmail)**: difficulty 4, *10–30 min* to first token vs *2–13 weeks* to production. Hover any coloured chip to see the quote, source and date.
2. In the **Blockers** box, type `invalid_grant`: it jumps to *"Testing-mode tokens expire after 7 days"*, the issue that silently breaks always-on agents.
3. Tick a checklist item, then copy the URL: the link carries your progress (`#done=…`).
4. Open the **[GitHub guide](https://greenlight-blue-ten.vercel.app/guides/github)** and look for the green *"Tested end-to-end through Composio"* badge, the trace and the console screenshots.
5. On the **[home page](https://greenlight-blue-ten.vercel.app)**, type **Strava** (not in the library and not on Composio) and watch the agent's steps stream live.
6. Compare apps side by side: [/compare?apps=github,gmail,spotify,x](https://greenlight-blue-ten.vercel.app/compare?apps=github,gmail,spotify,x).
7. Read it the way an agent does: [/guides/spotify.md](https://greenlight-blue-ten.vercel.app/guides/spotify.md) or `claude mcp add --transport http greenlight https://greenlight-blue-ten.vercel.app/api/mcp`.

## 4. What a guide contains

| # | Section | Answers |
|---|---|---|
| 1 | **Verdict card**: difficulty, time to first token, time to production, cost, end-to-end badge | How hard? How long? |
| 2 | **Start here / your next step**: follows checklist progress | Where do I start? What's next? |
| 3 | **How this fits with Composio**: provider OAuth app → Composio auth config → users' connected accounts; managed or bring-your-own; why you might still want your own app | What is an OAuth app and why do I need one? |
| 4 | **Timeline**: phases with owners; provider waits drawn hatched | Where does the time go? |
| 5 | **Who does what**: Agent / You / Provider swimlane plus copyable artefacts (app-form values, scope justification, reviewer email, demo-video script, manifests) | What can an agent do for me? |
| 6 | **Requirements**: business verification, privacy policy, security assessment, paid tiers, user caps… | What could block approval? |
| 7 | **Scopes**: tier, whether it triggers review, safer alternative | Which scopes cost me weeks? |
| 8 | **Redirect URI rules**: HTTPS, localhost, exact match, Composio's callback | Why is my redirect rejected? |
| 9 | **Blockers playbook** with an *"I'm stuck at…"* search | How do I get unstuck? |
| 10 | **Checklist**, shareable via the URL | What exactly do I do? |
| 11 | **Evidence & uncertainty**: every claim, its label, quote/screenshot/probe, and what we couldn't verify | Can I trust this? |

## 5. How it works

```
 app name / URL
      │
      ▼
 ┌──────────┐   ┌─────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
 │ Discover │──▶│ Investigate │──▶│  Draft   │──▶│  Verify  │──▶│ Publish  │
 └──────────┘   └─────────────┘   └──────────┘   └──────────┘   └──────────┘
  official site   read ≤8 pages     structured      re-fetch every   Neon (JSON)
  dev portal      from the          output into     quote (fuzzy);   web page
  llms.txt,       provider's own    one Zod Guide;  2nd model checks /guides/x.md
  sitemap         site; probe       model cites     quote supports   /llms.txt
  Composio        /.well-known/*    S1/P2/C1 ids,   claim; failures  OG image
  toolkits.get()  + authorize URL   code attaches   → "uncertain"    /api/mcp
                  (fake client)     the URLs
```

- **The model can't invent a citation.** It references evidence by id (S1 = page 1, P2 = probe 2, C1 = Composio lookup), and code attaches the real URL, screenshot or probe response.
- **The public agent never logs in.** It only reads public pages and probes public endpoints (e.g. the authorize URL with a fake client id and a localhost redirect, recording the provider's response).
- **Gold path:** curated source lists (`data/gold-sources.json`) → agent draft → human patch files (`data/gold-patches/`). A script re-verifies every added quote live and **refuses to apply a patch if any quote is missing**.

## 6. Evidence model

| Label | Meaning | What's attached |
|---|---|---|
| 🟢 `tested` | We did it | raw probe response, console screenshot, Composio SDK response or tool-call log id |
| 🔵 `sourced` | A public page says so | URL + verbatim quote (≤200 chars) + fetch date; re-checked by script |
| 🟡 `uncertain` | Believed but not proven | the reason, and what would confirm it |

Claims are **downgraded, never deleted**, so the reader sees what we couldn't prove. Menu/footer text is rejected as evidence (this caught a fake "privacy policy required" claim). `pnpm verify` re-fetches every gold quote: **200/200 present on 2026-11-03**.

## 7. Proof: tested end-to-end through Composio

For GitHub and Slack we registered **our own OAuth apps** and ran the full Composio flow with `@composio/core`: `authConfigs.create` (custom OAuth2, Composio callback) → `composio.create(userId, { authConfigs })` → `session.authorize()` Connect Link → the owner clicks Authorize → `session.execute()` read-only tool.

| App | Our OAuth app | Composio auth config | Tool call | Result | Evidence |
|---|---|---|---|---|---|
| GitHub | "Greenlight test" OAuth App | custom OAuth2 | `GITHUB_GET_THE_AUTHENTICATED_USER` | ✅ returned the user · log `log_dLtTw8mgVQ_M` | [trace](https://greenlight-blue-ten.vercel.app/evidence/github/e2e-trace.json) + 3 screenshots |
| Slack | "Greenlight test" app (from a manifest) | custom OAuth2 | `SLACK_FETCH_TEAM_INFO` | ✅ returned the workspace · log `log_vWLRLhgETi4L` | [trace](https://greenlight-blue-ten.vercel.app/evidence/slack/e2e-trace.json) + 4 screenshots |

The tests found things no doc says, and they are now `tested` claims in the guides:
- Both consent screens showed **our app's name** instead of Composio's: the branding reason to bring your own app, proven.
- **Composio's default scopes are broad**: GitHub requested `repo user gist notifications project workflow codespace`; Slack requested ~50 **user** scopes and no bot scopes. Guides tell you to narrow them.
- GitHub creates OAuth apps **instantly with no review**, enables **expiring user tokens by default**, and requires **sudo re-confirmation** to generate a client secret.
- Slack's create-app dialog now leads with an **"AI agent" template**; the app's workspace **can't be changed later**.

All 10 gold guides also carry a `tested` claim from **`composio.toolkits.get()`** (`composioManagedAuthSchemes`), with the raw SDK response saved under `public/evidence/<app>/`.

<!-- GOLD_TABLE -->
## 8. The gold library: what was tested vs. sourced

| App | Difficulty | Time to production | Composio | Tested | Sourced | Uncertain | End-to-end |
|---|---|---|---|---|---|---|---|
| [GitHub](https://greenlight-blue-ten.vercel.app/guides/github) | 1 Self-serve | same day | managed | 10 (probe, Composio call, screenshot) | 21 | 1 | ✅ 2026-11-03 |
| [Slack](https://greenlight-blue-ten.vercel.app/guides/slack) | 2 Light review | <1–70 days | managed | 8 (Composio call, screenshot) | 19 | 0 | ✅ 2026-11-03 |
| [X (Twitter)](https://greenlight-blue-ten.vercel.app/guides/x) | 2 Light review | 1–7 days | BYO | 1 (Composio call) | 16 | 3 | n/a |
| [Microsoft Entra ID](https://greenlight-blue-ten.vercel.app/guides/microsoft-entra-id) | 3 Full review | 1–21 days | BYO | 1 (Composio call) | 18 | 0 | n/a |
| [Shopify](https://greenlight-blue-ten.vercel.app/guides/shopify) | 3 Full review | 3–14 days | BYO | 2 (probe, Composio call) | 16 | 0 | n/a |
| [Xero](https://greenlight-blue-ten.vercel.app/guides/xero) | 3 Full review | 1–14 days | BYO | 1 (Composio call) | 24 | 0 | n/a |
| [Gmail (Google)](https://greenlight-blue-ten.vercel.app/guides/gmail) | 4 Heavy review / verification | 2–13 weeks | managed | 2 (probe, Composio call) | 24 | 5 | n/a |
| [LinkedIn Ads (Marketing API)](https://greenlight-blue-ten.vercel.app/guides/linkedin-ads) | 4 Heavy review / verification | 7–30 days | BYO | 1 (Composio call) | 23 | 1 | n/a |
| [Meta Ads (Marketing API)](https://greenlight-blue-ten.vercel.app/guides/meta-ads) | 4 Heavy review / verification | 3–14 days | BYO | 1 (Composio call) | 16 | 2 | n/a |
| [Spotify](https://greenlight-blue-ten.vercel.app/guides/spotify) | 5 Partner-only or paid / gated | 4–26 weeks | BYO | 2 (probe, Composio call) | 22 | 3 | n/a |

Every sourced quote is re-checked against the live page (`pnpm verify`); curation edits live in `data/gold-patches/` and are applied by a script that rejects any quote it can't find.
<!-- /GOLD_TABLE -->

<!-- EVAL_TABLE -->
## 9. Eval: live agent vs. hand-checked facts

| Run | Fact recall | Fact precision | Citation validity | Difficulty exact / ±1 |
|---|---|---|---|---|
| v1 (homepage-first discovery) | 13% | 100% | 94% | 50% / 63% |
| **v2 (llms.txt + verified doc hints)** | 16% | 86% | 97% | 25% / 63% |

38 facts across 8 apps (`eval/ground-truth.json`, every quote verified live), run 2026-11-03. The agent ran with **open discovery** (no curated sources), which is what a developer gets for an app outside the library. Per-app detail: [/method#eval](https://greenlight-blue-ten.vercel.app/method#eval) and `eval/results.json`.

| App | Gold | Agent | Facts stated | Contradicted | Citations valid |
|---|---|---|---|---|---|
| github | 1 | 1 | 2/5 | 0 | 14/14 |
| slack | 2 | 2 | 1/5 | 1 | 16/17 |
| gmail | 4 | 3 | 0/6 | 0 | 14/15 |
| spotify | 5 | 3 | 2/6 | 0 | 15/15 |
| microsoft-entra-id | 3 | 2 | 1/5 | 0 | 9/10 |
| xero | 3 | 2 | 0/5 | 0 | 12/12 |
| x | 2 | 4 | 0/3 | 0 | 1/1 |
| meta-ads | 4 | 2 | 0/3 | 0 | 4/4 |
<!-- /EVAL_TABLE -->

**How to read the eval:** what the live agent *states* is reliable (high precision and citation validity) but *shallow* (low recall). It reads about 7 pages and misses facts on deep policy pages, and it underrates gated providers when it never reaches the gating page. That's why the library ships curated gold guides and labels live guides *unreviewed*. The next investment is clear: read more pages and use a stronger model.

## 10. What the evidence corrected

The original plan's guesses, corrected by the sources:

| App | Plan assumed | Evidence showed |
|---|---|---|
| Spotify | Tier 2–4 | **Tier 5.** Development mode allows **5 users**; production (extended quota) is only for **organizations with 250k+ MAU** (since 2025-05-15) |
| Gmail | Weeks of review | Also: Testing-mode authorizations **expire after 7 days**; Testing is capped at **100 users** |
| Slack | Light review | Unlisted apps created after 2025-05-29 get history APIs throttled to **1 request/minute**; Marketplace review can take **up to 10 weeks** |
| X | Tier 5, paid/gated | Now **pay-per-use credits**, no subscription or review: the blocker is cost (tier 2, Paid filter) |
| LinkedIn Ads | Partner-only | The Advertising API is open to **any approved developer** via an application; only Audience Insights / Media Planning are restricted |
| Xero | Certification cap | The free Starter tier is **5 connections**; Core is $35 AUD/mo for 50; each organisation can connect at most 5 *uncertified* apps |

## 11. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), TypeScript strict, Tailwind v4, shadcn/ui, deployed on Vercel |
| Models | Vercel AI SDK v7 (`generateText` + `Output.object`) on the **Gemini free tier**, with per-role fallback chains and a provider switch (`lib/model.ts`, `AI_PROVIDER`) |
| Composio | `@composio/core` SDK: `toolkits.get`, `authConfigs.create`, sessions (`composio.create`, `authorize`, `execute`) |
| Storage | Neon Postgres + Drizzle (`guides`, `jobs`); gold guides ship as JSON in `data/guides/` |
| Long jobs | Route handler + `after()`, `maxDuration = 300`; the `/generate/<id>` page polls job steps |
| Schema | `lib/schema.ts`: one Zod `Guide`, used by the UI, Markdown, eval and gold scripts, with referential-integrity checks |
| Agent access | Markdown per guide, `/llms.txt`, MCP endpoint (`list_guides`, `get_guide`, `generate_guide`, `get_generation`) |

Free-tier facts found while building (details in `docs/research-notes.md`): Gemini Search grounding has **zero** free quota for new projects, `gemini-2.5-flash` is closed to new users, and Flash models allow **20 requests/day**. So discovery crawls the provider's own site (portal patterns, `llms.txt`, sitemap, fetch-verified doc hints), and everything falls back to `gemini-3.5-flash-lite`.

## 12. Run it locally

**Prerequisites:** Node 20+, pnpm 10, a Neon Postgres database, a Google AI Studio key (free), and a Composio **Platform** project key (`ak_…`).

```bash
git clone https://github.com/yugh88/greenlight && cd greenlight
pnpm install
cp .env.example .env.local      # fill in the variables below
pnpm db:push                    # create the guides + jobs tables
pnpm dev                        # http://localhost:3000
```

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Neon connection string (agent guides + live jobs) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini (free tier); only public docs and probe results are sent |
| `AI_PROVIDER` | `google` (default) · `anthropic` · `openai` |
| `COMPOSIO_API_KEY` | `ak_…` project key (SDK lookups, end-to-end scripts); not needed in production |
| `COMPOSIO_TEST_USER_ID` | user id for the end-to-end scripts |
| `NEXT_PUBLIC_BASE_URL` | absolute links in Markdown, `llms.txt` and OG images |

**Useful scripts**

```bash
pnpm tsx scripts/generate.mts "Strava"                 # run the live pipeline from the CLI
GREENLIGHT_RENDER=1 pnpm tsx scripts/gold.mts xero     # gold draft from curated sources (renders JS-only docs)
pnpm tsx scripts/apply-gold-patches.mts [slug]         # apply curation patches (aborts on any missing quote)
pnpm tsx scripts/composio-sdk-lookup.mts               # re-derive Composio facts via toolkits.get()
pnpm tsx scripts/e2e-composio.mts github <clientId> GITHUB_GET_THE_AUTHENTICATED_USER   # Composio half of the closed loop
pnpm verify                                            # re-check every gold quote against the live page
pnpm eval                                              # score the live agent vs eval/ground-truth.json
pnpm tsx scripts/readme-tables.mts                     # refresh the data-driven README tables
```

## 13. Repo map

```
app/                  pages: / · /guides/[slug] (+ .md, OG image) · /generate/[jobId] · /compare · /method · /llms.txt
  api/                generate · jobs/[id] · md/[slug] · mcp
components/guide/     the 11 guide sections (server) + interactive pieces (checklist, blocker search, copy)
lib/schema.ts         the Guide / Claim Zod schema + integrity checks
lib/agent/            discover · probes · draft · verify · pipeline · composio facts
lib/model.ts          model roles, fallback chains, retries, daily-quota handling
data/guides/          10 gold guides (JSON)      data/gold-patches/  human curation (quote-verified)
data/gold-sources.json curated source URLs       data/composio-directory.json  125 managed / 262 BYO snapshot
public/evidence/      screenshots, SDK responses, end-to-end traces
eval/                 ground-truth.json (38 facts, quotes verified) · run.mts · results*.json
scripts/              gold, patches, verify, eval, end-to-end, deploy helpers
MEMO.md · PROGRESS.md · docs/research-notes.md · docs/loom-script.md
```

## 14. Known limits

- **Live discovery is precise but incomplete** (see the eval). Large shared portals (Google, Microsoft) hide the gating pages; gold guides cover the apps that matter most.
- **Free-tier model budget.** 20 Flash requests/day, then `flash-lite`. The public endpoint is throttled (`GENERATIONS_PER_HOUR`, default 20). Paid Flash would cost cents per guide.
- **Some evidence needs a human.** Sign-in, sudo confirmation and consent clicks stay human; GitHub and Slack were walked through; the other gold guides are mostly *sourced* plus SDK-tested Composio facts.
- **Review times are rarely published.** Without a provider SLA, timelines are wide ranges marked uncertain.
- **Policies drift.** Every guide shows its last-verified date; `pnpm verify` catches quote drift.
- **Gold guides are agent-drafted and human-patched**, but still labelled *unreviewed* until the author signs off on each one.

## 15. What I'd build next (inside Composio)

1. **Inline in "Create auth config":** when someone picks a bring-your-own toolkit, show the verdict card and checklist beside the client-ID field, with the redirect URI pre-filled.
2. **A readiness column in the managed-auth directory:** difficulty and time to production for every toolkit.
3. **`get_guide` in the Composio skill / MCP**, so coding agents warn about restricted scopes *before* they are requested.
4. **A nightly re-verify job** plus a stronger model and deeper crawl for the live agent; promote agent guides to gold after a human walkthrough.
