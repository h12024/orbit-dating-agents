# Video: 3:00 max. Record the LIVE site, 25 real people.

**Before recording (not on camera)**
1. `.env.local` has `ANTHROPIC_API_KEY` and `APIFY_TOKEN`; `npm run demo:real` finished and `public/demo.json` is deployed (or loaded locally).
2. Open the site on a clean tab, zoom to ~110%, close other windows, mute notifications. Have `data/cohort.json` URLs ready in a text file to paste.
3. Do one dry run of the click path below with a stopwatch. Target 2:45 so you have buffer.

| Time | On screen | Say | Action |
|---|---|---|---|
| 0:00-0:15 | Home page | "Every person gets an agent. The agents date each other on their behalf. Here are 25 real people, each a LinkedIn and a public Instagram." | Paste the 25 `LinkedIn, Instagram` lines. Point at the "25 valid" counter. |
| 0:15-0:30 | Progress steps + live log | "Each agent scrapes and reads both sources." | Click **Send the agents out**. Let the log run ~10 s, then say "I'll jump to the finished run so we don't wait." Click **Load finished demo**. |
| 0:30-1:05 | Profiles tab -> one profile page | "This is how an agent analyzes a person." | Open one profile. Read aloud: a need, a hobby, then the **Evidence the agent found** list. Say "Evidence is what it saw; needs and values are inferences." Show the confidence tag. |
| 1:05-1:15 | Back, open a second profile | "Another person, different needs." | 5 s only. |
| 1:15-1:30 | Triage line in the log / Dates tab header | "Each agent picks who it wants to meet, plus a wildcard, so 25 people means about 90 dates, not 300." | Switch to **Dates**. |
| 1:30-2:10 | One date transcript | "Two agents, each only knowing its own person, actually talk." | Open a date. Read 2-3 turns aloud. Scroll to both debriefs: point at **score**, **needs met**, **friction**, **would see again**. "Each agent scores the date for its own person, independently." |
| 2:10-2:45 | Rankings tab | "Every person gets a ranking." | Click a person. Read #1 with "You 88, them 74". Click #1 to jump to the date that earned it. Point at one "not dated" entry: "ranked on triage only". |
| 2:45-3:00 | Home / GitHub repo | "Apify scrapes, Claude Sonnet profiles, Claude Haiku runs the dates, ranking weighs my agent 60, theirs 40. Code is public." | Show the repo URL. Stop at 3:00. |

**Must be visible (per the brief):** agents actually dating (transcript + debriefs), profile page with analysis (needs / hobbies / interests / evidence), the site's full flow from pasting links to the final rankings, 25 real people.

**Do not**: show `.env.local` or any key; use the *fixture* demo in the final video (it is synthetic and labelled); claim anything the screen doesn't show.
