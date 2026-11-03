# Loom script (≤ 4 min)

**0:00–0:30 · Problem + stat** (home page)
"Composio gives your users a Connect Link, but for 262 of 387 OAuth toolkits you first have to register your own OAuth app with the provider and get it approved. Nobody can tell you whether that takes an hour or a quarter. Greenlight does, with evidence on every claim."

**0:30–1:30 · Gmail guide** (`/guides/gmail`)
- Verdict card: difficulty 4, and the two clocks: *10–30 min to first token* vs *2–13 weeks to production*.
- Hover a chip: the quote, the URL and the date. Point at the amber ones: "we say what we couldn't prove."
- Timeline: the hatched bars are Google's queues (brand verification, then restricted-scope review + security assessment).
- Blocker search: type "invalid_grant" → *Testing-mode tokens expire after 7 days*. That kills always-on agents and almost nobody knows it.
- Swimlane + artefacts: copy the scope justification.

**1:30–2:30 · Live generation** (home → type "Strava")
- "Strava isn't in the library and isn't on Composio."
- Narrate the stream: found developers.strava.com → read pages → probed the authorize endpoint with a fake client (that's a *tested* fact) → draft → verifier re-fetches every quote.
- Land on the guide: Strava needs an active subscription to create an app and starts at 10 users.

**2:30–3:15 · Proof** (`/guides/github`, evidence section)
- Composio session: Connect Link → connected account → `GITHUB_GET_THE_AUTHENTICATED_USER` with the Composio log id.
- The Spotify correction: "Looks easy, and my plan said tier 2. The agent found production access is now organizations-only with 250k MAU, so it's a 5."

**3:15–4:00 · Eval + what's next** (`/method#eval`)
- Fact recall/precision, citation validity, difficulty agreement, and where it misses.
- Next inside Composio: show this card inline in "Create auth config", add a readiness column to the managed-auth directory, ship `get_guide` in the Composio skill / MCP.
