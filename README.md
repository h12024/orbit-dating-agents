# Orbit Dates - an agentic dating site

Every person is represented by an agent. The agents date each other on their behalf. Each person gets a ranking of who fits them best.

**Inputs:** a LinkedIn URL + a public Instagram URL per person. Those two sources are all an agent ever sees.

- Live site: https://agentic-dating-nine.vercel.app
- Demo video (about 2:45): https://youtu.be/3s6kjwps6tE
- Repo: https://github.com/h12024/orbit-dating-agents

## Try it in 30 seconds
Open https://agentic-dating-nine.vercel.app/?demo=1 (or open the site and click **Load finished demo**). It replays a saved, validated real run: **25 real public figures, 57 agent-vs-agent dates**, with every profile built from live Apify scrapes of their LinkedIn and public Instagram, and every conversation and debrief written by Gemini. Open a profile (needs / hobbies / values / evidence with sources), a date (transcript plus both agents' debriefs), and the Rankings tab (click a match to jump to the date that earned it). `Load fixture demo (synthetic)` is a clearly-labelled offline sample of 25 fictional personas and is not real output.

You can also paste your own `LinkedIn, Instagram` lines and run it live (limited to 12 people on the public site because the free Gemini and Apify quotas are shared by all visitors; when a quota is spent the UI says so and stops cleanly).

## Result of the real run (`public/demo.json`)
25 people (all high-confidence profiles), 57 dates, 228 unique conversation turns, 0 failed steps, validated by `scripts/validate-demo.mjs` (real Apify provenance, no fixture markers, structure and secret checks). Candidates are only included if verified on both platforms; three same-name strangers and one private Instagram account were rejected along the way (see `data/people.json`).

## How it works
1. **Read** - `/api/scrape` fetches both public profiles (Apify actors; public page meta tags as a thin fallback). `/api/analyze` (analysis model) writes a structured profile: needs, hobbies, interests, values, personality, lifestyle, dealbreakers, and an **evidence** list of direct observations. Needs/values/personality are inferences; `evidence` is what was actually seen. Thin data lowers `confidence`; protected traits are ignored; scraped text is treated as untrusted data.
2. **Triage** - `/api/shortlist`: each agent scans compact cards of the pool and picks who it wants to meet (+1 wildcard). ~4n dates instead of n^2 (25 people: ~90 dates, not 300).
3. **Date** - `/api/date`: two agents (date model), each grounded only in its own person's dossier, alternate 6 turns. Then each writes an independent private debrief: score, needs met, friction, would-see-again.
4. **Rank** - `lib/rank.ts`: `0.6 * own agent's score + 0.4 * counterpart's score`, minus 8 / 4 points if the own / other agent wouldn't see them again. Undated pairs fall back to the discounted triage score and are shown as "not dated".

The browser (`lib/pipeline.ts`) orchestrates the stages with bounded concurrency, so the server is stateless and fits serverless limits. `scripts/run-cohort.mjs` runs the identical pipeline headlessly.

## AI provider and credentials
The AI layer is provider-agnostic (`lib/llm.ts`): **Gemini** (official REST `generateContent`, free tier, default when `GEMINI_API_KEY` is set) or **Anthropic** (`ANTHROPIC_API_KEY`). Choose with `LLM_PROVIDER` or by whichever key is present. Fixture mode is only ever enabled explicitly with `LLM_MODE=fixture`; a missing key is an error, never a silent fallback.

| Variable | Needed for | If missing |
|---|---|---|
| `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) | **Required.** Profile analysis, triage, dates, debriefs. Free Gemini key, no card: https://aistudio.google.com/apikey | UI banner + API returns a clear error |
| `APIFY_TOKEN` | Strongly recommended. Reliable LinkedIn/Instagram scraping | Falls back to public meta tags: LinkedIn headline only, Instagram follower counts only (low-confidence profiles). LinkedIn also returns HTTP 999 after ~10 unauthenticated fetches. We do not bypass that. |
| `ANALYZE_MODEL`, `DATE_MODEL`, `VERDICT_MODEL` | Optional model overrides | Gemini: `gemini-3.5-flash-lite` / `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` |
| `GEMINI_RPM` | Optional pacing per model per process | off (relies on 429 retry/backoff) |
| `APIFY_LINKEDIN_ACTOR`, `APIFY_INSTAGRAM_ACTOR` | Optional actor overrides | `apimaestro~linkedin-profile-detail` (live scraping; free plan caps it at 20 profiles/day), `apify~instagram-profile-scraper`. The cohort's LinkedIn data was fetched in one batch with `harvestapi/linkedin-profile-scraper` (`scripts/ingest-harvest.mjs`), which the free plan allows 10 profiles per run |
| `RATE_LIMIT_SCALE` | Optional multiplier for per-IP limits | 1 |
| `LLM_MODE=fixture` | Dev only: synthetic output stamped `[FIXTURE]` + red banner | off |

Put them in `.env.local` (git-ignored). Keys stay server-side.

### Apify free-plan reality (read before the full run)
- The LinkedIn actor (`apimaestro/linkedin-profile-detail`) enforces **20 profiles per day on Apify's free plan** (verified by hitting it: "Daily free-tier limit of 20 profiles reached"). Instagram (`apify/instagram-profile-scraper`) has no such cap in our tests. Spend is tiny (~$0.19 for 25 people) but the daily cap, not money, is the constraint.
- The app treats that message as a **quota stop**, never as profile data: the scrape route returns `429 quota_exhausted`, the pipeline halts, and `run-cohort.mjs` exits 5 with a checkpoint (`data/runs/`). Re-run with `--resume` after the limit resets.
- Every successful scrape is cached locally (compacted text only, `data/runs/scrape-cache/`, 7 days, disabled on Vercel or with `SCRAPE_CACHE=off`), so no profile ever costs quota twice. Verification (`npm run verify:people -- --apify`) fills the same cache.
- Realistic schedule on the free plan: day 1 verify the last candidates and scrape up to the cap; day 2 `--resume`. Upgrading the Apify plan removes the cap but is a paid step we have not taken.

### Free-tier realities (Gemini)
- **Quotas are per model, per Google project, and reset at midnight Pacific.** Google publishes the exact RPM/RPD only inside AI Studio (login required); third-party figures disagree (from ~20 to ~1,500 requests/day for Flash models), so check your project's limits at https://aistudio.google.com/rate-limit before a big run.
- **Workload:** one date = 8 requests (6 turns + 2 debriefs). 25 people at K=4 is ~2 x 25 + ~90 dates x 8 = **~770 requests**, split over three models. Tune with `K` and `ROUNDS` env vars (K=3, ROUNDS=2 is ~420). Run `node scripts/run-cohort.mjs data/cohort.json public/demo.json --estimate` to print the budget first.
- **Resumable:** `run-cohort.mjs` checkpoints continuously. If the daily quota runs out it stops cleanly (exit 5); run the same command with `--resume` after the reset.
- **Privacy:** Google states free-tier prompts may be used to improve its products. Only run people who are fine with that (public figures here). A public deployment on the free tier shares one small quota among all visitors.

## Run
```
cp .env.example .env.local   # fill in the keys
npm i && npm run dev         # http://localhost:3000
```

## Generate the real demo (25 people)
```
GEMINI_RPM=10 npm run dev    # terminal 1, key configured in .env.local
node scripts/run-cohort.mjs data/cohort.json public/demo.json --limit 3   # real 3-person test first
npm run demo:real            # terminal 2: full cohort -> public/demo.json (add --resume after a quota stop)
```
`run-cohort.mjs` refuses to run without a key and refuses to write synthetic output to a non-fixture file name (or live output to a fixture one). Commit `public/demo.json` to publish it. `npm run demo:fixture` regenerates `public/fixture-demo.json` offline.

## People dataset
`scripts/candidates.json` -> `npm run verify:people` -> `data/people.json` + `data/cohort.json`. A profile is `verified` only when the platform's own public page returns 200 and its title/description identifies the person (explicit aliases are listed in candidates.json); Instagram must also show a follower count (public). Only people verified on **both** platforms enter `cohort.json`. Every verification is also sanity-checked against identity traps: LinkedIn profiles reached via the actor must return the same `public_identifier` and a follower count of at least 20,000 (these are public figures), and candidates rejected after manual review (same-name strangers) are listed in `candidates.json` with the reason. The script is resumable and does not retry once LinkedIn blocks (HTTP 999). These are public figures; for private individuals, get their consent first.

## Cost and abuse protection
Strict URL allow-lists (no user-supplied fetch targets: SSRF-safe), body size caps, profile sanitising, clamped rounds / pool size, per-IP hourly rate limits per route (in-memory, best-effort per instance), max 30 people per run in the UI. For hard spend limits also set a monthly cap on the Anthropic key in its console.

## Tests
```
npm test           # ranking, URL validation (SSRF), sanitising, rate limiting, JSON extraction, Gemini client vs a local STUB server (request format, thinking fallback, 429 retry, daily quota, blocked/empty output)
npm run typecheck
npm run build
```

## Deploy (Vercel)
See `docs/DEPLOY.md` and `scripts/deploy-vercel.sh` (preflight by default; deploys only with `--confirm`).

```
npx vercel login                      # browser login, once
npx vercel link
npx vercel env add GEMINI_API_KEY production      # paste when prompted (not in chat or git)
npx vercel env add APIFY_TOKEN production
npx vercel --prod
```
Then check `/api/health` on the deployed URL: it must report `"mode":"live","provider":"gemini","configured":true`.

Vercel Hobby is free (personal, non-commercial use); function limit there is 300 s, and our routes ask for 60-120 s.

## Submission text
**Overall (<=200 chars):** Every person gets an AI agent that reads their LinkedIn and Instagram, dates other agents on their behalf, and returns a mutual-fit ranking of who suits them best.

**Technical (<=500 chars):** Apify actors scrape public LinkedIn (apimaestro/linkedin-profile-detail) and Instagram (apify/instagram-profile-scraper) from Next.js route handlers, with a public-meta fallback; noisy payload fields are stripped before analysis. Gemini (free tier) extracts a structured, evidence-linked profile and runs the agent-vs-agent dates and debriefs; Anthropic is a drop-in alternative. TypeScript, Next.js 15, server-side keys, per-IP rate limits.
