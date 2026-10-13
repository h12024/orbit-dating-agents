# Orbit Dates - an agentic dating site

Every person is represented by an agent. The agents date each other on their behalf. Each person gets a ranking of who fits them best.

**Inputs:** a LinkedIn URL + a public Instagram URL per person. Those two sources are all an agent ever sees.

- Repo: https://github.com/h12024/orbit-dating-agents
- Live site: _not deployed yet - see "Deploy"_
- Demo: `Load finished demo` (real model output, appears once `public/demo.json` is generated) and `Load fixture demo (synthetic)` (25 fictional personas, always available, always labelled).

## How it works
1. **Read** - `/api/scrape` fetches both public profiles (Apify actors; public page meta tags as a thin fallback). `/api/analyze` (Claude Sonnet) writes a structured profile: needs, hobbies, interests, values, personality, lifestyle, dealbreakers, and an **evidence** list of direct observations. Needs/values/personality are inferences; `evidence` is what was actually seen. Thin data lowers `confidence`; protected traits are ignored; scraped text is treated as untrusted data.
2. **Triage** - `/api/shortlist`: each agent scans compact cards of the pool and picks who it wants to meet (+1 wildcard). ~4n dates instead of n^2 (25 people: ~90 dates, not 300).
3. **Date** - `/api/date`: two agents (Claude Haiku), each grounded only in its own person's dossier, alternate 6 turns. Then each writes an independent private debrief: score, needs met, friction, would-see-again.
4. **Rank** - `lib/rank.ts`: `0.6 * own agent's score + 0.4 * counterpart's score`, minus 8 / 4 points if the own / other agent wouldn't see them again. Undated pairs fall back to the discounted triage score and are shown as "not dated".

The browser (`lib/pipeline.ts`) orchestrates the stages with bounded concurrency, so the server is stateless and fits serverless limits. `scripts/run-cohort.mjs` runs the identical pipeline headlessly.

## Credentials
| Variable | Needed for | If missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Required.** Analysis, triage, dates, debriefs | UI banner + API returns a clear error |
| `APIFY_TOKEN` | Strongly recommended. Reliable LinkedIn/Instagram scraping | Falls back to public meta tags: LinkedIn headline only, Instagram follower counts only (low-confidence profiles). LinkedIn also returns HTTP 999 after ~10 unauthenticated fetches. We do not bypass that. |
| `ANALYZE_MODEL`, `DATE_MODEL` | Optional model overrides | defaults in `lib/llm.ts` |
| `APIFY_LINKEDIN_ACTOR`, `APIFY_INSTAGRAM_ACTOR` | Optional actor overrides | `apimaestro~linkedin-profile-detail`, `apify~instagram-profile-scraper` (verify these before a big run) |
| `RATE_LIMIT_SCALE` | Optional multiplier for per-IP limits | 1 |
| `LLM_MODE=fixture` | Dev only: synthetic output | off. Output is stamped `[FIXTURE]` and the UI shows a red banner |

Put them in `.env.local` (git-ignored). Never commit them. Keys stay server-side.

## Run
```
cp .env.example .env.local   # fill in the keys
npm i && npm run dev         # http://localhost:3000
```

## Generate the real demo (25 people)
```
npm run dev                  # terminal 1, with keys configured
npm run demo:real            # terminal 2: reads data/cohort.json, writes public/demo.json
```
`run-cohort.mjs` refuses to run without a key and refuses to write synthetic output to a non-fixture file name (or live output to a fixture one). Commit `public/demo.json` to publish it. `npm run demo:fixture` regenerates `public/fixture-demo.json` offline.

## People dataset
`scripts/candidates.json` -> `npm run verify:people` -> `data/people.json` + `data/cohort.json`. A profile is `verified` only when the platform's own public page returns 200 and its title/description identifies the person (explicit aliases are listed in candidates.json); Instagram must also show a follower count (public). Only people verified on **both** platforms enter `cohort.json`. The script is resumable and does not retry once LinkedIn blocks (HTTP 999). These are public figures; for private individuals, get their consent first.

## Cost and abuse protection
Strict URL allow-lists (no user-supplied fetch targets: SSRF-safe), body size caps, profile sanitising, clamped rounds / pool size, per-IP hourly rate limits per route (in-memory, best-effort per instance), max 30 people per run in the UI. For hard spend limits also set a monthly cap on the Anthropic key in its console.

## Tests
```
npm test           # ranking maths, URL validation (SSRF cases), profile sanitising, rate limiting, JSON extraction
npm run typecheck
npm run build
```

## Deploy (Vercel)
```
npx vercel login                      # browser login, once
npx vercel link
npx vercel env add ANTHROPIC_API_KEY production   # paste when prompted (not in chat or git)
npx vercel env add APIFY_TOKEN production
npx vercel --prod
```
Then check `/api/health` on the deployed URL: it must report `"mode":"live","anthropic":true`.

## Submission text
**Overall (<=200 chars):** Every person gets an AI agent that reads their LinkedIn and Instagram, dates other agents on their behalf, and returns a mutual-fit ranking of who suits them best.

**Technical (<=500 chars):** Apify actors scrape public LinkedIn (apimaestro/linkedin-profile-detail) and Instagram (apify/instagram-profile-scraper) from Next.js route handlers, with a public-meta fallback; noisy payload fields are stripped before analysis. Claude Sonnet extracts a structured, evidence-linked profile; Claude Haiku runs the agent-vs-agent dates and debriefs. Anthropic SDK, TypeScript, Next.js 15, server-side keys, per-IP rate limits.
