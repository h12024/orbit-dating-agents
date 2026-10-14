# Narration script (record your own voice)

Video: `orbit-dates-demo.mp4`, 1920x1080, **2:35 (155 s)**, silent screen capture of the live site (https://agentic-dating-nine.vercel.app) loading the finished 25-person demo. On-screen captions are already burned in. This file is the script the narration was recorded from.

Length: 278 words over 155 s (about 108 words/min; the busiest segment is 2.1 words/s). That is a relaxed pace with pauses. Timestamps come from the recorder's own scene markers, so they match the footage exactly.

## Timed script

| Start | End | Scene | On screen | Say (about) | Words |
|---|---|---|---|---|---|
| 0:00 | 0:04 | Title card | Title fades out into the live site. | Orbit Dates. Every person gets an agent. | 7 |
| 0:04 | 0:11 | The live site | Home page; the Load finished demo button is visible. | The live site. Twenty-five real public figures: a LinkedIn and an Instagram each. | 13 |
| 0:11 | 0:17 | Load the finished run | Cursor clicks Load finished demo. | I'll open the finished run: no waiting, no new AI calls. | 11 |
| 0:17 | 0:32 | Step 1: the agent reads the person | Profiles tab, 25 cards; page scrolls down and back. | Step one: every agent reads its person. Apify scrapes their LinkedIn and Instagram, and Gemini turns that into needs, hobbies, values, and evidence. Here are all twenty-five. | 27 |
| 0:32 | 0:43 | A profile page (Adam Grant) | Profile page opens; needs, hobbies, values on screen. | Let's open Adam Grant. His profile lists needs, hobbies, interests, values and dealbreakers, plus a confidence level: high, here. | 19 |
| 0:43 | 0:53 | Evidence the agent found | Scrolls to the Evidence list. | Here's the evidence the agent read, like his post about rejoining his old diving team. Needs are inferred; this is observed. | 21 |
| 0:53 | 1:00 | Sources | Sources line is on screen. | Every profile shows its sources: LinkedIn and Instagram data, scraped through Apify. | 12 |
| 1:00 | 1:09 | Step 2: the agents date | Dates tab: grid of date cards with both scores. | Step two: the dates. There are fifty-seven. Each agent picks who to meet, then actually goes on the date. | 19 |
| 1:09 | 1:30 | The conversation (Sara Blakely x Daymond John) | Date opens; the four turns scroll into view. | Here, Sara Blakely's agent meets Daymond John's. Each agent knows only its own person, and Gemini wrote the conversation: four turns, nothing scripted. They ask questions and react to each other's answers. | 32 |
| 1:30 | 1:40 | Both debriefs | Scrolls to the two debrief cards. | Then each agent writes its own debrief: score, needs met, friction, and whether it would see them again. | 18 |
| 1:40 | 1:51 | Same date, two verdicts: 92 vs 20 | Both debriefs side by side: 92 / would see again, 20 / would not. | And they can disagree. Sara's agent scores this one ninety-two. Daymond's scores it twenty, because it flagged a dealbreaker it found in public data. | 24 |
| 1:51 | 1:59 | Step 3: rankings | Rankings tab: list of all 25 people. | Step three: rankings. Every person gets a ranked list of who fits them best. | 14 |
| 1:59 | 2:13 | Sara Blakely's ranking | Right panel: Best fits for Sara Blakely (92, 88, 67, 67). | For Sara Blakely, the top matches are Gary Vaynerchuk at ninety-two and Alex Hormozi at eighty-eight. Her agent's verdict counts sixty percent, the other agent's forty. | 26 |
| 2:13 | 2:25 | Click-through to the date | Cursor clicks her #1; the Sara x Gary date opens with both debriefs. | Click any match to jump to the exact date that earned it. Here, Sara and Gary Vaynerchuk. | 17 |
| 2:25 | 2:34 | End card | Fade to the end card with the live URL and repo. | That's Orbit Dates: twenty-five real people, fifty-seven agent dates. The code is public on GitHub. Thanks for watching. | 18 |

Start each line about 0.3 s after its start time so the caption has appeared. If a line runs long, drop the last sentence of that row rather than speeding up; the next scene begins on the cue regardless.

## Read-through (uninterrupted)

**[0:00]** Orbit Dates. Every person gets an agent.

**[0:04]** The live site. Twenty-five real public figures: a LinkedIn and an Instagram each.

**[0:11]** I'll open the finished run: no waiting, no new AI calls.

**[0:17]** Step one: every agent reads its person. Apify scrapes their LinkedIn and Instagram, and Gemini turns that into needs, hobbies, values, and evidence. Here are all twenty-five.

**[0:32]** Let's open Adam Grant. His profile lists needs, hobbies, interests, values and dealbreakers, plus a confidence level: high, here.

**[0:43]** Here's the evidence the agent read, like his post about rejoining his old diving team. Needs are inferred; this is observed.

**[0:53]** Every profile shows its sources: LinkedIn and Instagram data, scraped through Apify.

**[1:00]** Step two: the dates. There are fifty-seven. Each agent picks who to meet, then actually goes on the date.

**[1:09]** Here, Sara Blakely's agent meets Daymond John's. Each agent knows only its own person, and Gemini wrote the conversation: four turns, nothing scripted. They ask questions and react to each other's answers.

**[1:30]** Then each agent writes its own debrief: score, needs met, friction, and whether it would see them again.

**[1:40]** And they can disagree. Sara's agent scores this one ninety-two. Daymond's scores it twenty, because it flagged a dealbreaker it found in public data.

**[1:51]** Step three: rankings. Every person gets a ranked list of who fits them best.

**[1:59]** For Sara Blakely, the top matches are Gary Vaynerchuk at ninety-two and Alex Hormozi at eighty-eight. Her agent's verdict counts sixty percent, the other agent's forty.

**[2:13]** Click any match to jump to the exact date that earned it. Here, Sara and Gary Vaynerchuk.

**[2:25]** That's Orbit Dates: twenty-five real people, fifty-seven agent dates. The code is public on GitHub. Thanks for watching.

## What the video shows (all verified)

- 25 profiles and 57 dates come from one real run: LinkedIn and Instagram data scraped via Apify, profiles, conversations and debriefs generated by Gemini. `public/demo.json` passes `scripts/validate-demo.mjs` (no fixture markers, 228 unique turns, 25/25 high confidence).
- The footage only *loads* the saved demo; no new scraping or AI calls were made while recording.
- Adam Grant's profile, the Sara Blakely x Daymond John date (92 vs 20), Sara's ranking (Gary Vaynerchuk 92, Alex Hormozi 88) and the click-through to the Sara x Gary date are all read straight from that file.

## Adding your voice afterwards

Record one take reading the timed script (a phone voice memo is fine), export `narration.wav`, then:

```
ffmpeg -i orbit-dates-demo.mp4 -i narration.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest orbit-dates-demo-narrated.mp4
```

If your recording starts late or early, shift it with `-itsoffset 0.5` before `-i narration.wav` (positive = later). Keep the video under 3:00; with `-shortest` it will not run longer than the footage.


## Status: narration added

The narrator's own recording was synced to the footage: each sentence is placed on the moment its caption appears (timed from per-caption markers captured while recording), the voice was loudness-normalised (about -36 LUFS to -16 LUFS), and a few still moments were held or trimmed by up to a few seconds so the pace matches the spoken delivery. The timestamps in the table above refer to the original silent cut; the final video is **2:46 (165.6 s)**.

- `orbit-dates-demo.mp4`: final video with narration (1920x1080, H.264, AAC).
- `orbit-dates-demo-silent.mp4`: same footage, no audio, retimed to match the narrated cut's recording.
