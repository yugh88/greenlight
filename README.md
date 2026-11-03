# Greenlight

**Will your OAuth app get the green light?** Greenlight tells a developer building on Composio how hard it is to get a provider's OAuth app ready and approved: how long it takes *including the review queue*, what will block them, and what an agent can do for them. Every claim is labelled **tested**, **sourced** or **uncertain**.

- **Live:** _<deploy URL>_ · **Memo:** [MEMO.md](MEMO.md) · **Agents:** [`/llms.txt`](/llms.txt), `/guides/<app>.md`, MCP at `/api/mcp`

## 30-second summary

- Composio manages the OAuth app for **125** OAuth toolkits; for **262** you must bring your own ([directory](https://docs.composio.dev/toolkits/managed-auth), checked 2026-11-03). Even managed ones need your own app for branding, scopes and quota. Registration plus approval is the slowest step in getting to a first connected account.
- Each guide answers four questions in five seconds: **difficulty 1–5**, **time to first token** vs **time to production**, **requirements and nuances**, and **agent vs. you**, plus a blocker playbook, a shareable checklist and copy-paste artefacts.
- **Library:** 10 gold guides across every tier. **Live generation:** type any app name or URL; an agent investigates public docs and probes public OAuth endpoints, then publishes a guide in 1–3 minutes, including for apps that aren't on Composio (try *Strava*).
- **Trust:** the model cites evidence by id, and code attaches URLs, so it can't invent a citation. A verifier re-fetches every quote and a second model checks support. Failures become *uncertain*, visibly.

<!-- EVAL_TABLE -->

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

<!-- LIMITS -->
