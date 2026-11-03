# Greenlight — project rules for Claude Code

## Git (non-negotiable)
- Every commit's author AND committer must be: Yugh Juneja <yugjuneja2003@gmail.com>. This repo's local git config already sets this; never override it.
- Never add `Co-Authored-By`, "Generated with Claude Code", or any AI/Claude attribution to commit messages, PR titles or PR descriptions.
- Before every push, run `git log --format='%an <%ae> | %cn <%ce>' origin/HEAD..HEAD 2>/dev/null || git log --format='%an <%ae> | %cn <%ce>' -5` and confirm every line is Yugh only. If anything else appears, stop and tell me.
- No force-push. Never commit `.env.local` or any secret.

## Working rules
- Follow the kickoff prompt's phases; stop at each CHECKPOINT. Keep PROGRESS.md current.
- Never type my passwords or 2FA codes; open a headed browser and wait for me to sign in.
- Never invent provider facts: label them `uncertain` with a reason.
