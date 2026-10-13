// Ingests data/runs/harvest-batch.json (harvestapi/linkedin-profile-scraper output) into the scrape cache and the verification record.
// A LinkedIn profile is "verified" only if: publicIdentifier == the slug in our URL, the name matches the candidate, and followerCount >= 20000.
import fs from "node:fs";
import { cacheSet } from "../lib/scrape-cache.ts";
import { compactLinkedInHarvest } from "../lib/scrape-compact.ts";
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "");
const items = JSON.parse(fs.readFileSync("data/runs/harvest-batch.json", "utf8")).filter((x) => !x.error);
const cands = JSON.parse(fs.readFileSync("scripts/candidates.json", "utf8"));
const people = JSON.parse(fs.readFileSync("data/people.json", "utf8"));
const now = new Date().toISOString(); let ok = 0;
for (const c of cands) {
  const slug = c.linkedin.replace(/\/$/, "").split("/in/")[1];
  const it = items.find((x) => norm(x.publicIdentifier ?? "") === norm(slug));
  const p = people.find((x) => x.name === c.name); if (!it || !p) continue;
  const full = `${it.firstName} ${it.lastName}`, toks = norm(c.name).replace(/[^a-z ]/g, "").split(" ").filter((t) => t.length > 2);
  const nameOk = toks.filter((t) => norm(full + " " + it.headline).includes(t)).length >= Math.min(2, toks.length) || (c.aliases ?? []).some((a) => norm(full + " " + it.headline).includes(norm(a)));
  const folOk = (it.followerCount ?? 0) >= 20000;
  const verified = nameOk && folOk;
  p.linkedin = { url: c.linkedin, status: verified ? "verified" : "unverified", method: "apify:harvestapi/linkedin-profile-scraper", page_title: `${full} - ${(it.headline ?? "").slice(0, 100)}`, page_desc: `followers: ${it.followerCount}`, checked_at: now, ...(verified ? {} : { note: `name match ${nameOk}, followers>=20000 ${folOk}` }) };
  if (verified) { cacheSet("linkedin", slug, { text: compactLinkedInHarvest(it) }); ok++; }
  p.both_verified = p.linkedin.status === "verified" && p.instagram.status === "verified";
}
fs.writeFileSync("data/people.json", JSON.stringify(people, null, 1));
const cohort = people.filter((p) => p.both_verified).map((p) => ({ name: p.name, linkedin: p.linkedin.url, instagram: p.instagram.url }));
fs.writeFileSync("data/cohort.json", JSON.stringify(cohort, null, 1));
console.log(`ingested+cached ${ok} LinkedIn profiles | both-platform verified: ${cohort.length}/${people.length}`);
console.log("not verified:", people.filter((p) => !p.both_verified).map((p) => `${p.name} (LI:${p.linkedin.status} IG:${p.instagram.status})`).join("; "));
