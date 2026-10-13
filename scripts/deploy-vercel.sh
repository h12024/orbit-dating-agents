#!/usr/bin/env bash
# Deploys to Vercel (Hobby, free). Does NOTHING irreversible unless you pass --confirm.
#   scripts/deploy-vercel.sh            -> preflight only (login, env presence, build, what would be uploaded)
#   scripts/deploy-vercel.sh --confirm  -> link project, copy env vars from .env.local WITHOUT printing them, deploy to production
set -euo pipefail
cd "$(dirname "$0")/.."
CONFIRM=0; [ "${1:-}" = "--confirm" ] && CONFIRM=1
VARS=(GEMINI_API_KEY APIFY_TOKEN)                       # secrets, copied from .env.local
PLAIN=("MAX_PEOPLE=12" "GEMINI_TIMEOUT_MS=55000")      # non-secret settings for the public site (free quotas are shared by all visitors)

echo "== 1. Vercel login"; if ! npx --yes vercel whoami >/dev/null 2>&1; then echo "NOT LOGGED IN. Run:  npx vercel login   (browser), then re-run this script."; exit 2; fi
echo "logged in as: $(npx vercel whoami 2>/dev/null | tail -1)"
echo "== 2. Local env present (names only)"; for v in "${VARS[@]}"; do grep -q "^$v=." .env.local && echo "  $v: set" || { echo "  $v: MISSING in .env.local"; exit 3; }; done
echo "== 3. Checks"; npm test --silent 2>&1 | grep -E "^ℹ (pass|fail)"; npm run -s typecheck && echo "  typecheck OK"; npx next build >/dev/null 2>&1 && echo "  build OK"
echo "== 4. Will not upload"; sed 's/^/  /' .vercelignore | tr '\n' ' '; echo
echo "   public/demo.json present? $( [ -f public/demo.json ] && echo yes || echo 'no (the Load finished demo button will say none is published)')"
if [ $CONFIRM -eq 0 ]; then echo; echo "Preflight OK. Re-run with --confirm to link, set env vars and deploy to production."; exit 0; fi
echo "== 5. Link + env + deploy"
npx vercel link --yes >/dev/null
for v in "${VARS[@]}"; do val="$(grep "^$v=" .env.local | cut -d= -f2-)"; printf '%s' "$val" | npx vercel env add "$v" production --force >/dev/null 2>&1 && echo "  set $v (value not shown)"; unset val; done
for kv in "${PLAIN[@]}"; do printf '%s' "${kv#*=}" | npx vercel env add "${kv%%=*}" production --force >/dev/null 2>&1 && echo "  set ${kv%%=*}"; done
URL=$(npx vercel --prod --yes 2>&1 | grep -Eo 'https://[a-z0-9.-]+\.vercel\.app' | tail -1); echo "deployed: $URL"
echo "== 6. Verify production"; curl -s "$URL/api/health"; echo
