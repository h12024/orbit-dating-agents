#!/usr/bin/env bash
# Deploys to Vercel (Hobby, free). Does NOTHING irreversible unless you pass --confirm.
#   scripts/deploy-vercel.sh            -> preflight only (login, env presence, build, what would be uploaded)
#   scripts/deploy-vercel.sh --confirm  -> link project, copy env vars from .env.local WITHOUT printing them, deploy to production
set -euo pipefail
cd "$(dirname "$0")/.."
CONFIRM=0; [ "${1:-}" = "--confirm" ] && CONFIRM=1
VARS=(GEMINI_API_KEY APIFY_TOKEN)                       # secrets, copied from .env.local
PLAIN=("MAX_PEOPLE=12" "GEMINI_TIMEOUT_MS=55000")      # non-secret settings for the public site (free quotas are shared by all visitors)

FAIL=0; warn(){ echo "  !! $*"; FAIL=1; }
echo "== 1. Repo + identity"
REMOTE=$(git remote get-url origin); echo "  origin: $REMOTE"; [[ "$REMOTE" == *"h12024/orbit-dating-agents"* ]] || warn "origin is not the personal repo"
[[ "$REMOTE" != *[Oo]rbit[Aa][Ii]* ]] || warn "origin points at an OrbitAI repo"
[ -z "$(git status --short)" ] && echo "  working tree: clean" || warn "uncommitted changes (deploys would not match GitHub)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ] && echo "  HEAD == origin/master ($(git rev-parse --short HEAD))" || warn "HEAD differs from origin/master"
echo "== 2. Local env present (names only)"; for v in "${VARS[@]}"; do grep -q "^$v=." .env.local && echo "  $v: set" || warn "$v MISSING in .env.local"; done
echo "== 3. Checks"; npm test --silent 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo; npm run -s typecheck && echo "  typecheck OK" || warn "typecheck failed"; npx next build >/dev/null 2>&1 && echo "  build OK" || warn "build failed"
echo "== 4. Upload manifest audit (what 'vercel --prod' would publish)"
UP=$(git ls-files -co | grep -vE '^(node_modules|\.next|\.git|\.vercel)/' | python3 -c "
import sys,fnmatch,os
pats=[l.strip() for l in open('.vercelignore') if l.strip() and not l.startswith('#')]
def ignored(path):
    base=os.path.basename(path)
    for p in pats:
        q=p.rstrip('/')
        if fnmatch.fnmatch(path,q) or fnmatch.fnmatch(base,q) or path.startswith(q+'/') or ('/'+q+'/') in ('/'+path): return True
    return False
for l in sys.stdin:
    l=l.strip()
    if l and not ignored(l): print(l)
" | sort -u)
echo "  files: $(echo "$UP" | wc -l | tr -d ' ')"
BAD=$(echo "$UP" | grep -E '(^|/)\.env(\.local|\.production|\.development|$)|\.incomplete\.json$|\.checkpoint\.json$|^data/runs/|scrape-cache/|\.pem$|id_rsa' || true); [ -z "$BAD" ] && echo "  no secrets / env / incomplete runs / checkpoints / caches in upload" || { warn "risky files would be uploaded:"; echo "$BAD" | sed 's/^/     /'; }
SECRET_HITS=$(echo "$UP" | xargs grep -lEI '(apify_api_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|AQ\.Ab8[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,})' 2>/dev/null || true); [ -z "$SECRET_HITS" ] && echo "  no key-like strings in uploaded files" || { warn "key-like strings in: $SECRET_HITS"; }
if [ -f public/demo.json ]; then KIND=$(python3 -c "import json;m=json.load(open('public/demo.json')).get('meta',{});print(m.get('kind'),m.get('people'),'people',m.get('dates'),'dates','errors=',m.get('errors'),'failed=',m.get('failed'))"); echo "  public/demo.json (PUBLISHED AS THE REAL DEMO): $KIND"; else echo "  public/demo.json: absent -> 'Load finished demo' will say none is published (correct until the full run completes)"; fi
FK=$(python3 -c "import json;print(json.load(open('public/fixture-demo.json'))['meta']['kind'])"); echo "  public/fixture-demo.json: meta.kind=$FK (UI shows a red SYNTHETIC banner)"; [ "$FK" = "fixture" ] || warn "fixture demo not marked fixture"
echo "== 5. Vercel login"; if npx --yes vercel whoami >/dev/null 2>&1; then echo "  logged in as: $(npx vercel whoami 2>/dev/null | tail -1)"; else echo "  NOT LOGGED IN -> run:  npx vercel login   (browser) then re-run"; FAIL=1; fi
echo; [ $FAIL -eq 0 ] && echo "PREFLIGHT: PASS" || echo "PREFLIGHT: BLOCKED (see !! / NOT LOGGED IN above)"
if [ $CONFIRM -eq 0 ]; then [ $FAIL -eq 0 ] && echo "Re-run with --confirm to link, set env vars and deploy to production." ; exit $FAIL; fi
[ $FAIL -eq 0 ] || { echo "Refusing to deploy: preflight not passing."; exit 1; }
echo "== 5. Link + env + deploy"
npx vercel link --yes >/dev/null
for v in "${VARS[@]}"; do val="$(grep "^$v=" .env.local | cut -d= -f2-)"; printf '%s' "$val" | npx vercel env add "$v" production --force >/dev/null 2>&1 && echo "  set $v (value not shown)"; unset val; done
for kv in "${PLAIN[@]}"; do printf '%s' "${kv#*=}" | npx vercel env add "${kv%%=*}" production --force >/dev/null 2>&1 && echo "  set ${kv%%=*}"; done
URL=$(npx vercel --prod --yes 2>&1 | grep -Eo 'https://[a-z0-9.-]+\.vercel\.app' | tail -1); echo "deployed: $URL"
echo "== 6. Verify production"; curl -s "$URL/api/health"; echo
