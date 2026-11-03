# Greenlight

**Will your OAuth app get the green light?** Greenlight tells a developer building on Composio how hard it is to get a provider's OAuth app ready and approved: how long it takes *including the review queue*, what will block them, and what an agent can do for them. Every claim is labelled **tested**, **sourced** or **uncertain**.

- **Live:** _<deploy URL>_ · **Memo:** [MEMO.md](MEMO.md) · **Agents:** [`/llms.txt`](/llms.txt), `/guides/<app>.md`, MCP at `/api/mcp`

## 30-second summary

- Composio manages the OAuth app for **125** OAuth toolkits; for **262** you must bring your own ([directory](https://docs.composio.dev/toolkits/managed-auth), checked 2026-11-03). Even managed ones need your own app for branding, scopes and quota. Registration plus approval is the slowest step in getting to a first connected account.
- Each guide answers four questions in five seconds: **difficulty 1–5**, **time to first token** vs **time to production**, **requirements and nuances**, and **agent vs. you**, plus a blocker playbook, a shareable checklist and copy-paste artefacts.
- **Library:** 10 gold guides across every tier. **Live generation:** type any app name or URL; an agent investigates public docs and probes public OAuth endpoints, then publishes a guide in 1–3 minutes, including for apps that aren't on Composio (try *Strava*).
- **Trust:** the model cites evidence by id, and code attaches URLs, so it can't invent a citation. A verifier re-fetches every quote and a second model checks support. Failures become *uncertain*, visibly.

<!-- EVAL_TABLE -->
## Eval (live agent vs. hand-checked facts)

| Run | Fact recall | Fact precision | Citation validity | Difficulty exact / ±1 |
|---|---|---|---|---|
| v1 (homepage-first discovery) | 13% | 100% | 94% | 50% / 63% |
| **v2 (llms.txt + verified doc hints)** | 16% | 86% | 97% | 25% / 63% |

38 facts across 8 apps (`eval/ground-truth.json`, every quote verified live), run 2026-11-03. The agent ran with **open discovery** (no curated sources), which is what a developer gets for an app outside the library. Per-app detail: [/method#eval](/method#eval) and `eval/results.json`.

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

## Architecture

```
input ─▶ Discover ─▶ Investigate ─────────────▶ Draft ─────────────▶ Verify ─────────▶ Publish
         site +      read ≤8 provider pages      structured output    re-fetch quotes   Neon (JSONB)
         dev portal  (LLM-ranked) + probes:      into Zod Guide;      fuzzy-match;      /guides/<slug>
         + sitemap   /.well-known/*,             cites S1/P2/C1 ids   2nd model checks  /guides/<slug>.md
         + Composio  authorize?client_id=fake    (no raw URLs)        support → else    /llms.txt · OG
         toolkit     &redirect_uri=localhost                          "uncertain"       /api/mcp
```

| Layer | Choice |
|---|---|
| App | Next.js 15 App Router, TypeScript strict, Tailwind v4, shadcn/ui |
| Models | Vercel AI SDK v7 (`generateText` + `Output.object`) on **Gemini free tier**, with fallback chains in `lib/model.ts` (`AI_PROVIDER` switch) |
| Composio | Session meta-tools over Composio's hosted MCP (`lib/composio-mcp.ts`); toolkit facts from the SDK when a project key exists, else public toolkit pages |
| Storage | Neon Postgres + Drizzle (`guides`, `jobs`); gold guides ship as JSON in `data/guides` |
| Long jobs | Route handler + `after()`; `maxDuration = 300`; UI polls `/api/jobs/<id>` |
| Schema | `lib/schema.ts`: one Zod `Guide` used by the UI, Markdown, eval and batch |

Free-tier constraints found while building (recorded in `docs/research-notes.md`): Gemini Search grounding has **zero** free quota for new projects, and `gemini-2.5-flash` is closed to new users. So discovery crawls the provider's own site, which is a better evidence source anyway.

## Evidence model

| Label | Meaning | What's attached |
|---|---|---|
| `tested` | We did it | probe raw response, console screenshot, or Composio log id |
| `sourced` | A public page says so | URL + verbatim quote ≤200 chars + fetch date, re-verified |
| `uncertain` | Believed, not proven | the reason (and what would confirm it) |

`pnpm verify` re-fetches every gold quote and reports drift (`--write` downgrades misses).

<!-- GOLD_TABLE -->
## Gold guides: what was tested vs. sourced

| App | Difficulty | Time to production | Composio | Tested | Sourced | Uncertain | End-to-end |
|---|---|---|---|---|---|---|---|
| [GitHub](/guides/github) | 1 Self-serve | same day | managed | 10 (probe, Composio call, screenshot) | 21 | 1 | ✅ 2026-11-03 |
| [Slack](/guides/slack) | 2 Light review | <1–70 days | managed | 1 (Composio call) | 19 | 0 | n/a |
| [X (Twitter)](/guides/x) | 2 Light review | 1–7 days | BYO | 1 (Composio call) | 16 | 3 | n/a |
| [Microsoft Entra ID](/guides/microsoft-entra-id) | 3 Full review | 1–21 days | BYO | 1 (Composio call) | 18 | 0 | n/a |
| [Shopify](/guides/shopify) | 3 Full review | 3–14 days | BYO | 2 (probe, Composio call) | 16 | 0 | n/a |
| [Xero](/guides/xero) | 3 Full review | 1–14 days | BYO | 1 (Composio call) | 24 | 0 | n/a |
| [Gmail (Google)](/guides/gmail) | 4 Heavy review / verification | 2–13 weeks | managed | 2 (probe, Composio call) | 24 | 5 | n/a |
| [LinkedIn Ads (Marketing API)](/guides/linkedin-ads) | 4 Heavy review / verification | 7–30 days | BYO | 1 (Composio call) | 23 | 1 | n/a |
| [Meta Ads (Marketing API)](/guides/meta-ads) | 4 Heavy review / verification | 3–14 days | BYO | 1 (Composio call) | 16 | 2 | n/a |
| [Spotify](/guides/spotify) | 5 Partner-only or paid / gated | 4–26 weeks | BYO | 2 (probe, Composio call) | 22 | 3 | n/a |

Every sourced quote is re-checked against the live page (`pnpm verify`); curation edits live in `data/gold-patches/` and are applied by a script that rejects any quote it can't find.
<!-- /GOLD_TABLE -->

## Run locally

```bash
pnpm install
cp .env.example .env.local   # COMPOSIO_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, DATABASE_URL
pnpm db:push                 # create tables in Neon
pnpm dev                     # http://localhost:3000

pnpm tsx scripts/generate.mts "Strava"            # live pipeline from the CLI
GREENLIGHT_RENDER=1 pnpm tsx scripts/gold.mts xero  # gold draft from curated sources (renders JS docs)
pnpm verify                                        # re-check every gold quote
pnpm eval                                          # score the live agent vs. eval/ground-truth.json
pnpm tsx scripts/hello-composio.mts                # managed GitHub connection + read-only tool call
```

## Known limits

- **Open discovery is precise but incomplete.** The eval shows that what the live agent says is rarely contradicted, but it misses facts that sit deep in large shared portals (Google, Microsoft): "Gmail" resolves to accounts.google.com and the agent never reaches the verification docs. That is why the library ships curated **gold** guides; live guides are labelled *unreviewed*.
- **Free-tier model budget.** Gemini's free tier allows **20 requests/day/model** on Flash models (hit during this build). The app falls back to `gemini-3.5-flash-lite` automatically, and the public endpoint is throttled (`GENERATIONS_PER_HOUR`, default 20). Paid Flash would cost cents per guide.
- **Tested evidence is thin without sign-in.** Public probes are real tests of the provider's public surface, but console walkthroughs and the Composio round trip need a human signed in (see PROGRESS.md). Gold guides are therefore mostly *sourced*, with every quote re-verified live.
- **Composio key type.** This build used a Composio consumer key (`ck_…`) via Composio's hosted MCP. Creating custom auth configs programmatically requires a Platform project key (`ak_…`); the code switches to the SDK automatically when one is set.
- **Review times are rarely published.** When a provider gives no SLA, timelines are wide ranges and marked uncertain.
- **Policies drift.** `pnpm verify` re-fetches every gold quote (200/200 present on 2026-11-03) and can downgrade misses.
