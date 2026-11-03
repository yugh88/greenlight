#!/usr/bin/env bash
# One-shot Vercel deploy. Run it yourself: `! bash scripts/deploy.sh`
# Pushes only what production needs from .env.local (never the Composio key), then deploys to production.
set -euo pipefail
cd "$(dirname "$0")/.."
get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
vercel link --yes --project greenlight >/dev/null
for k in DATABASE_URL GOOGLE_GENERATIVE_AI_API_KEY; do
  v="$(get "$k")"; [ -n "$v" ] || { echo "missing $k in .env.local"; exit 1; }
  vercel env rm "$k" production --yes >/dev/null 2>&1 || true
  printf "%s" "$v" | vercel env add "$k" production >/dev/null
  echo "set $k"
done
vercel env rm AI_PROVIDER production --yes >/dev/null 2>&1 || true; printf "google" | vercel env add AI_PROVIDER production >/dev/null
URL=$(vercel deploy --prod --yes)
echo "deployed: $URL"
vercel env rm NEXT_PUBLIC_BASE_URL production --yes >/dev/null 2>&1 || true
printf "%s" "$URL" | vercel env add NEXT_PUBLIC_BASE_URL production >/dev/null
URL2=$(vercel deploy --prod --yes)
echo "redeployed with NEXT_PUBLIC_BASE_URL: $URL2"
