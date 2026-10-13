# Recording checklist (3:00 max). Do this in order.

**Before you press record (2 min)**
1. Terminal 1: `cd ~/Developer/agentic-dating && npm run dev` -> http://localhost:3000 (or use the deployed URL).
2. Browser: one clean window, zoom ~110%, notifications off. Open the site. Confirm there is NO red "FIXTURE" banner.
3. Click **Load finished demo** once to confirm it loads real data (profiles show real post captions under "Evidence"). If it says "none is published yet" or shows only 3 people, use the fallback below.
4. Have `data/cohort.json` open in an editor to paste the people list from.

**Take (follow the clock)**
| Clock | Do | Say |
|---|---|---|
| 0:00 | On the home page, paste the LinkedIn + Instagram lines (26 people). Point at the "26 valid" counter. | "Every person gets an agent. The agents date each other on their behalf. These are 26 real public profiles, each a LinkedIn and a public Instagram." |
| 0:15 | Click **Send the agents out**. Let the log scroll ~8 s (scraping, "agent reading"). | "Each agent reads both sources. To save time I'll open the finished run." |
| 0:30 | Click **Load finished demo**. Profiles tab -> open ONE profile. Scroll: Needs, Hobbies, Values, Dealbreakers, **Evidence the agent found**. | "Needs and values are inferences. The evidence list is what it actually saw on their profiles, with a confidence level." |
| 1:05 | Back, open a second profile (5 s). | "A different person, different needs." |
| 1:15 | **Dates** tab. Open one date. Read two or three turns aloud. | "Two agents, each grounded only in their own person, actually talk." |
| 1:45 | Scroll to both debriefs. Point at score, needs met, friction, would-see-again. Pick a date with very different scores if one exists. | "Each agent scores the date for its own person, independently. Here they disagree, and the friction says why." |
| 2:10 | **Rankings** tab -> click a person -> read #1 (You X, them Y). Click it to jump to that date. Point at a "not dated" row. | "Every person gets a ranking: their agent's score counts 60%, the other agent's 40%." |
| 2:45 | Show the GitHub repo URL. | "Apify scrapes, Gemini analyses and runs the dates. Code is public." Stop by 3:00. |

**Fallback if the 26-person run did not finish**: say "This is a real run of 3 people" in the first 10 seconds (the site also shows a notice), paste only 3 lines, and do the same take. Never describe it as the full cohort.

**Do not**: show `.env.local`, any key, the FIXTURE demo as real, or claim anything the screen does not show.
