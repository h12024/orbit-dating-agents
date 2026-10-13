# Deploying to Vercel (Hobby, free)

Hobby is free for personal, non-commercial use; functions may run up to 300 s (our routes ask for 60-120 s). **Nothing deploys until you run the script with `--confirm`.**

1. `npx vercel login` (opens your browser; this is the only step that needs you).
2. `scripts/deploy-vercel.sh` : preflight only. Checks login, that `GEMINI_API_KEY` and `APIFY_TOKEN` exist in `.env.local` (names only), runs tests/typecheck/build, lists what is excluded from upload.
3. `scripts/deploy-vercel.sh --confirm` : links the project, copies the two secrets from `.env.local` into Vercel **without printing them**, sets `MAX_PEOPLE=12`, deploys to production, and curls `/api/health`.

## What the public site can and cannot do on free tiers
- All visitors share **one** Apify account (LinkedIn actor: 20 profiles/day) and **one** Gemini project quota. Once either is spent, runs stop with a clear message and the "Load finished demo" button remains the reliable path.
- `MAX_PEOPLE=12` caps a single run in the UI (raise it in Vercel env vars if you want). Per-IP hourly rate limits are in `lib/guard.ts`.
- The local scrape cache is disabled on Vercel (no persistent disk). Scrapes there are not cached.
- Set a monthly cap on the Gemini key in Google AI Studio and keep Apify on the free plan so overuse cannot create charges.

## After deploy: verify
`curl https://<your-app>.vercel.app/api/health` must show `"mode":"live","provider":"gemini","configured":true,"apify":true`. Then open the site, click **Load finished demo**, and open one profile, one date and one ranking. Run a 2-person test only if you are fine spending ~16 Gemini requests and 2 LinkedIn profiles of the shared daily cap.
