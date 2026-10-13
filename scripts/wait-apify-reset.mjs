// Polls the Apify LinkedIn actor until its free daily cap has reset. Every probe fetches a profile we need anyway
// (cached on success); while capped, the actor returns only a message item. No timing is assumed.
// Usage: node scripts/wait-apify-reset.mjs [slug=rbranson] [intervalMin=20] [maxHours=30]
import fs from "node:fs";
import { cacheSet } from "../lib/scrape-cache.ts";
import { compactLinkedIn } from "../lib/scrape-compact.ts";
const [, , slug = "rbranson", every = "20", maxH = "30"] = process.argv;
const tok = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^APIFY_TOKEN=(.+)$/m)?.[1];
if (!tok) { console.error("APIFY_TOKEN missing"); process.exit(3); }
fs.mkdirSync("data/runs", { recursive: true });
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); fs.appendFileSync("data/runs/apify-reset.log", l + "\n"); };
const deadline = Date.now() + Number(maxH) * 3600_000;
for (let n = 1; Date.now() < deadline; n++) {
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items?token=${tok}&timeout=55`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: slug, includeEmail: false }) });
    const first = (await r.json())?.[0];
    if (first?.basic_info) { cacheSet("linkedin", slug, { text: compactLinkedIn(first) }); log(`probe ${n}: QUOTA AVAILABLE (fetched ${slug}, cached)`); process.exit(0); }
    log(`probe ${n}: still limited -> ${String(first?.message ?? "no data").slice(0, 90)}`);
  } catch (e) { log(`probe ${n}: error ${e.message}`); }
  await new Promise((r) => setTimeout(r, Number(every) * 60_000));
}
log("gave up: deadline reached"); process.exit(1);
