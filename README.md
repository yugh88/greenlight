# Greenlight

Before a developer's users can connect an app through Composio, the developer often has to register an OAuth app with the provider and get it approved. Composio manages the OAuth app for only 125 of its 387 OAuth toolkits; for the other 262 you bring your own. Greenlight tells you how hard that is, how long it really takes (including the review queue), what will block you, and what an agent can do for you. It has 10 curated guides and a live agent that investigates any app. Every claim is labelled **tested**, **sourced** or **uncertain**.

**Scope:** the register-and-get-approved step for the provider's OAuth app, the part Composio can't do for you. Deliberately out: automating form submissions (needs the developer's logins) and shipping all 100 guides before the pipeline proved precise.

**Live app:** https://greenlight-blue-ten.vercel.app · **Video:** https://youtu.be/xdIdEFDCvdc · **Memo:** [MEMO.md](MEMO.md) · **Full details:** [docs/DETAILS.md](docs/DETAILS.md)

## Try it

1. Open the [Gmail guide](https://greenlight-blue-ten.vercel.app/guides/gmail): difficulty 4, 10–30 min to first token vs 2–13 weeks to production. Hover a coloured chip for its quote, source and date.
2. Open the [GitHub guide](https://greenlight-blue-ten.vercel.app/guides/github): it was tested end-to-end through Composio with our own OAuth app (trace and screenshots included).
3. On the [home page](https://greenlight-blue-ten.vercel.app), type an app that isn't in the library (e.g. **Todoist**) and watch the agent investigate it live (1–2 min). Cached apps open instantly; agent guides have a **Regenerate** button.
4. Click **Take the tour** (top right) for a walkthrough of every feature.

## Setup

**Prerequisites:** Node 20+, pnpm 10, a [Neon](https://neon.tech) Postgres database, a free [Google AI Studio](https://aistudio.google.com) key, and a Composio Platform project key (`ak_…`) for the SDK scripts.

```bash
git clone https://github.com/yugh88/greenlight && cd greenlight
pnpm install
cp .env.example .env.local   # fill in the variables below
pnpm db:push                 # create the guides + jobs tables
pnpm dev                     # http://localhost:3000
```

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Neon connection string (agent guides, live jobs) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini free tier; only public docs and probe results are sent |
| `AI_PROVIDER` | `google` (default), `anthropic` or `openai` |
| `COMPOSIO_API_KEY` | `ak_…` key for `toolkits.get()` and the end-to-end scripts (not needed to run the site) |
| `NEXT_PUBLIC_BASE_URL` | absolute links in Markdown, `llms.txt` and share images |

Scripts for gold guides, verification, the eval and the end-to-end test are listed in [docs/DETAILS.md](docs/DETAILS.md#12-run-it-locally).

## What testing corrected

- **Spotify is tier 5:** 5 development users; production only for organisations with 250k+ MAU.
- **Gmail Testing-mode authorizations expire after 7 days.**
- **Composio's default Slack config requests ~50 user scopes, no bot scopes.**

Full list: [DETAILS §10](docs/DETAILS.md#10-assumptions-the-evidence-corrected); what we couldn't verify: [§14](docs/DETAILS.md#14-known-limits).

## Key decisions

- **Two clocks, not one estimate.** *Time to first token* (minutes, your own account) vs *time to production* (days to months), because the provider's review queue, not engineering, is where the time goes.
- **Downgrade, never delete.** Every claim is tested, sourced (URL + verbatim quote + date, re-verified live) or uncertain (with a reason). Claims that fail verification become *uncertain* and stay visible.
- **The model can't invent a citation.** It cites evidence by id; code attaches the real URL, screenshot or probe response, re-fetches every quote, and a second model checks the quote supports the claim.
- **A gold library plus clearly labelled live generation.** The eval showed the live agent is precise but shallow (it rarely states anything wrong, but misses many facts), so the apps that matter most get curated, quote-verified gold guides, and live guides are labelled *unreviewed*.
- **Free tiers only, and the public agent never logs in.** It reads public pages and probes public endpoints only. Steps that need sign-in were done by a human for GitHub and Slack, as end-to-end tests through Composio.

## Limitations

- **Live guides are shallow.** Eval: 16% fact recall, 86% precision, 97% of citations valid. The agent misses facts on deep policy pages, especially in large portals (Google, Microsoft).
- **Free-tier model budget.** Gemini allows about 20 requests/day per Flash model, then falls back to `flash-lite`; the public endpoint is throttled to 20 generations/hour. Heavy use can exhaust the quota.
- **Some evidence needs a human.** Only GitHub and Slack were walked through end-to-end; the other gold guides are sourced plus SDK-tested Composio facts. Gold guides show *human-reviewed* only after the author signs off.
- **Review times are rarely published,** so timelines are wide ranges marked uncertain.
- **Policies drift.** Every guide shows a last-verified date; `pnpm verify` re-checks all gold quotes (200/200 present on 2026-11-03).
