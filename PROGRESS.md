# Greenlight: progress log

Composio APM take-home. Plan: `../Composio APM Take-home — Build Plan (Greenlight).md`; kickoff spec: `../claude-code-kickoff-prompt.md`.

## Status

| Phase | State |
|---|---|
| 1. Setup (docs, scaffold, env, DB schema, Zod) | **done (waiting on checkpoint)** |
| 2. Hello-world Composio (managed GitHub via session) | next |
| 3. Live pipeline v1 + streaming /generate | — |
| 4. Guide page (11 sections) + .md + llms.txt | — |
| 5. Gold 1–3 (GitHub e2e, Slack, Gmail) | — |
| 6. Gold 4–10, verifier, artefacts, home, OG | — |
| 7. Eval, batch, deploy, README, MEMO, Loom | — |

## Done

- Read Composio llms.txt, the Composio agent skill + platform guide, managed-auth directory, managed-vs-custom, sessions SDK reference. Notes in `docs/research-notes.md`.
- Re-verified **125 managed / 262 bring-your-own** OAuth toolkits (2026-11-03) → `data/composio-directory.json`.
- Scaffolded Next.js 15.5 (App Router, TS strict, Tailwind v4, shadcn/ui), pnpm 10.
- Deps: `ai@7`, `@ai-sdk/google@4`, `@composio/core@0.27`, `zod@4`, `drizzle-orm` + `@neondatabase/serverless`.
- `lib/schema.ts`: Zod `Guide` + `Claim` + `validateGuide()` (claim-id referential integrity, evidence completeness, ranges).
- `lib/model.ts`: provider switch (`AI_PROVIDER`), role-based models, retry/backoff on 429, serial queue.
- `lib/db/schema.ts`: `guides` (JSONB body) and `jobs` (JSONB steps) tables; `drizzle.config.ts` reads `.env.local`.
- `.gitignore` ignores `.env*` except `.env.example`; `.env.example` has empty placeholders.
- Git author set per-repo to Yugh Juneja <yugjuneja2003@gmail.com>.

## Decisions / deviations from the spec

- **Ranges as `{min,max}`, not tuples; URLs as strings + post-check.** Gemini structured output handles tuples / `format: uri` poorly. `validateGuide()` restores the guarantees.
- **Models:** agent `gemini-3.8-flash`, verifier `gemini-3.5-flash-lite`, Discover search `gemini-2.5-flash`. Search grounding is *not* free on Gemini 3.x (pricing page, 2026-11-03), only on 2.5 Flash / Flash-Lite (500 RPD).
- **Schema additions:** `verdict.summary`, `composioFit`, `phase.waiting` (hatched bars), `requirement.required`, `checklist[].owner`, `reviewStatus`, `endToEnd`.

## Open questions / blocked on Yugh

- `.claude/settings.json` (with `includeCoAuthoredBy: false`) **needs to be created by you**; Claude Code blocks itself from writing its own permission file. Contents are in the kickoff prompt §8.
- Keys needed in `.env.local`: `COMPOSIO_API_KEY`, `COMPOSIO_TEST_USER_ID`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL`.
- Deadline on the Ashby page? (Plan doc flags it as unknown.)
- Read composio.dev/auth guides to sharpen differentiation.

## Next

Phase 2: `scripts/hello-composio.ts`: session for test user → `session.authorize("github")` → Connect Link → wait → read-only tool call (get authenticated user) → log id.
