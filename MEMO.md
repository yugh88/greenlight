# Greenlight: PM memo

**To:** Composio Integrations · **From:** Yugh Juneja · **Date:** 2026-11-03

## Problem

An agent builder picks Composio so their users can connect apps in one line. For most OAuth apps they then hit a step Composio can't do for them: **registering an OAuth app with the provider and getting it approved.** They piece it together from provider docs, unfamiliar consoles and emails to partner teams. Up front they can't tell whether it is an hour or a quarter of waiting, or what will get them rejected.

**How big it is (Composio's managed-auth directory, checked 2026-11-03):** Composio manages the OAuth app for **125** OAuth toolkits. For **262 (68%)** the developer must bring their own. The managed 125 aren't exempt either: teams register their own app anyway for consent-screen branding, custom scopes and a dedicated rate-limit quota, all of which Composio's docs recommend for production. Composio's 51 click-path walkthroughs (composio.dev/auth) show *where to click*. They don't say *how long, what gets reviewed, or what blocks you*, and the long tail of 300+ toolkits has nothing.

**Who feels it:** the developer at "Create auth config", stuck between a working prototype (managed app) and a production launch (own app, in review). Then the PM or founder who has to give a launch date.

## Insight

The time isn't in engineering. It's in the **provider's review queue and its gates**: Google's restricted-scope security assessment (and Testing-mode tokens that expire after 7 days), Slack's up-to-10-week Marketplace review (unlisted apps get history APIs throttled to 1 request/minute), Spotify's 5-user development mode with production access now only for organizations with 250k+ MAU, Xero's 5-connection Starter tier, Meta's business verification. So a guide must answer with **two clocks**: *time to first token* (minutes, your own account) versus *time to production* (days to months). It must also be honest about which parts are proven. A confident wrong answer about an approval process costs a launch.

## What I built and why

- **Guides that answer four questions above the fold:** difficulty 1–5, the two clocks, cost, and an "Agent / You / Provider" swimlane. The agent hands over ready artefacts: form values, scope justification, reviewer email, demo-video script.
- **An evidence label on every claim:** `tested` (a probe response, console screenshot or Composio log id), `sourced` (URL + ≤200-character verbatim quote + date) or `uncertain` (with the reason). A verifier re-fetches every quote and a second model checks the quote supports the claim. Failures are downgraded, never hidden.
- **Live generation for any app:** name or URL in, shareable guide out in 1–3 minutes, streamed step by step. The public agent only reads public pages and probes public OAuth endpoints. The model cites evidence by id, so it can't invent a URL.
- **Agent-readable from day one:** `/guides/<app>.md`, `/llms.txt` and a small MCP server (`get_guide`, `generate_guide`), so Claude Code or Cursor can pull the guide while wiring the integration. Composio is agent-first; its docs should be too.
- **Measured, not asserted:** an eval scores the live agent against hand-checked facts (fact recall and precision, citation validity, difficulty agreement). Results are on `/method` and in the README.

## How it ships inside Composio

1. **Inline in "Create auth config":** when a developer picks a bring-your-own toolkit, show the verdict card and checklist next to the client-ID field, with the Composio redirect URI pre-filled in the artefacts.
2. **A readiness column in the managed-auth directory:** difficulty and time to production next to every toolkit, so "which integration do we ship first?" has an answer.
3. **A docs MCP tool:** `get_guide` inside the Composio skill, so a coding agent warns "Gmail restricted scopes need a security assessment" before you request them.
4. **Later:** an agent that fills provider forms in a headed browser while the human signs in, closing the gap between "guide" and "done".

## Metrics

- **North star:** median time from auth-config creation to the first connected account on a *custom* auth config, segmented by difficulty tier.
- **Funnel:** guide view → custom auth config created → first connected account → 10+ connected accounts (proxy for "passed review").
- **Trust:** share of claims `tested` or `sourced`; quote-drift rate per week; eval precision and citation validity per release.
- **Deflection:** support tickets tagged OAuth-app or verification per 100 new custom auth configs.

## Risks and mitigations

- **Guides go stale:** every quote is re-checked on a schedule (`pnpm verify`). Drift downgrades a claim to `uncertain` and flags the guide.
- **A wrong answer about approval is worse than no answer:** uncertainty is shown, not hidden; gold guides need a human walkthrough; agent guides are labelled unreviewed.
- **Provider anti-bot and JS-only docs:** gold runs render pages headlessly; live runs fall back to probes and say what they couldn't read.
- **Model cost and capacity:** this prototype uses free-tier Gemini with fallbacks. In production, cache aggressively (guides change monthly, not hourly) and reserve paid capacity for regeneration.
