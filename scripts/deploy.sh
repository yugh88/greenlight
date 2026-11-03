#!/usr/bin/env bash
# Vercel deploy helper. Run it yourself: `! bash scripts/deploy.sh`
# Pushes only what production needs from .env.local (never the Composio key), then deploys to production.
# The project is also connected to GitHub, so a `git push` to main deploys automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
PROD_URL="${PROD_URL:-https://greenlight-blue-ten.vercel.app}"
get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
setenv() { vercel env rm "$1" production --yes >/dev/null 2>&1 || true; printf "%s" "$2" | vercel env add "$1" production >/dev/null; echo "set $1"; }
vercel link --yes --project greenlight >/dev/null
for k in DATABASE_URL GOOGLE_GENERATIVE_AI_API_KEY; do
  v="$(get "$k")"; [ -n "$v" ] || { echo "missing $k in .env.local"; exit 1; }
  setenv "$k" "$v"
done
setenv AI_PROVIDER google
setenv NEXT_PUBLIC_BASE_URL "$PROD_URL"   # plain URL (CLI 59 prints JSON, so never parse deploy output into env)
vercel deploy --prod --yes >/dev/null
echo "deployed: $PROD_URL"
