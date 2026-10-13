// Verifies candidate profile URLs by fetching each PUBLIC page's og:title/description (no login, no bypass).
// A link is "verified" only if the page's own title contains the person's name tokens. Output: data/people.json
import fs from "node:fs";
import { cacheGet, cacheSet } from "../lib/scrape-cache.ts";
import { compactLinkedIn } from "../lib/scrape-compact.ts";
const C = JSON.parse(fs.readFileSync(new URL("./candidates.json", import.meta.url)));
const UA = { "user-agent": "Mozilla/5.0 (compatible; facebookexternalhit/1.1)" };
const dec = (t) => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"');
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
async function check(url, name, kind, aliases = []) {
  if (!url) return { url, status: "unverified", note: "no candidate url" };
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow" });
    const h = await r.text();
    const pick = (p) => h.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, "i"))?.[1] ?? "";
    const title = dec(pick("og:title")), desc = dec(pick("og:description"));
    const toks = norm(name).replace(/[^a-z ]/g, "").split(" ").filter((t) => t.length > 2);
    const hay = norm(title + " " + desc).replace(/['’]/g, "");
    const hit = toks.filter((t) => hay.includes(t)).length >= Math.min(2, toks.length) || aliases.some((a) => hay.includes(norm(a))); // aliases are explicit, recorded in candidates.json
    const igPublic = kind === "instagram" ? /followers/i.test(desc) : true;
    return { url, status: r.status === 200 && hit && igPublic ? "verified" : "unverified", http: r.status, page_title: title.slice(0, 120), page_desc: desc.slice(0, 160), checked_at: new Date().toISOString() };
  } catch (e) { return { url, status: "unverified", note: e.message }; }
}
const prev = fs.existsSync(new URL("../data/people.json", import.meta.url)) ? JSON.parse(fs.readFileSync(new URL("../data/people.json", import.meta.url))) : [];
const old = Object.fromEntries(prev.map((p) => [p.name, p]));
const envTok = fs.existsSync(new URL("../.env.local", import.meta.url)) ? fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^APIFY_TOKEN=(.+)$/m)?.[1] : process.env.APIFY_TOKEN;
let apifyExhausted = false; // the free LinkedIn actor allows 20 profiles/day: once hit, stop (never retry or work around it)
async function checkLinkedInApify(url, name, aliases = []) {
  const slug = url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
  if (!envTok || !slug) return null;
  try {
    let b = null; const hit = cacheGet("linkedin", slug); // profiles already fetched cost no quota
    if (hit) { try { b = JSON.parse(hit.text).basic_info ?? null; } catch {} }
    if (!b) {
      if (apifyExhausted) return { url, status: "unverified", note: "apify daily free limit reached earlier in this run; retry after it resets", checked_at: new Date().toISOString() };
      const r = await fetch(`https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items?token=${envTok}&timeout=55`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: slug, includeEmail: false }) });
      const items = await r.json();
      const first = Array.isArray(items) ? items[0] : null;
      if (first?.message && !first.basic_info) {
        if (/limit|upgrade|quota|credit/i.test(first.message)) apifyExhausted = true;
        return { url, status: "unverified", note: "apify: " + String(first.message).slice(0, 140), checked_at: new Date().toISOString() };
      }
      if (first?.basic_info) { cacheSet("linkedin", slug, { text: compactLinkedIn(first) }); b = first.basic_info; }
    }
    if (!b) return { url, status: "unverified", note: `apify returned no profile for slug "${slug}"`, checked_at: new Date().toISOString() };
    const toks = norm(name).replace(/[^a-z ]/g, "").split(" ").filter((t) => t.length > 2), hay = norm(`${b.fullname} ${b.headline}`).replace(/['’]/g, "");
    const nameOk = toks.filter((t) => hay.includes(t)).length >= Math.min(2, toks.length) || aliases.some((a) => hay.includes(norm(a)));
    const idOk = norm(b.public_identifier ?? "") === norm(slug);
    return { url, status: nameOk && idOk ? "verified" : "unverified", method: "apify:linkedin-profile-detail", page_title: `${b.fullname} - ${(b.headline ?? "").slice(0, 100)}`, page_desc: `followers: ${b.follower_count ?? "?"}`, checked_at: new Date().toISOString(), ...(nameOk && idOk ? {} : { note: `name match ${nameOk}, identifier match ${idOk}` }) };
  } catch (e) { return { url, status: "unverified", note: "apify error: " + e.message }; }
}
const MIN_LI_FOLLOWERS = 20000; // all candidates are well-known public figures: a tiny LinkedIn audience means a same-name stranger
function guard(p, li) {
  if (p.reject_linkedin) return { ...li, status: "unverified", note: "rejected after manual identity review: " + p.reject_linkedin };
  const m = /followers: (\d+)/.exec(li.page_desc ?? "");
  if (li.method?.startsWith("apify") && li.status === "verified" && m && Number(m[1]) < MIN_LI_FOLLOWERS) return { ...li, status: "unverified", note: `followers ${m[1]} < ${MIN_LI_FOLLOWERS}: likely a same-name stranger` };
  return li;
}
const out = [];
for (const p of C) {
  const o = old[p.name];
  if (o) o.linkedin = guard(p, o.linkedin); // apply guards to cached results too
  let li = o?.linkedin.status === "verified" ? o.linkedin : null, ig = o?.instagram.status === "verified" ? o.instagram : null;
  if (!li) {
    li = process.argv.includes("--apify") ? await checkLinkedInApify(p.linkedin, p.name, p.aliases) : null;
    if (!li) { li = await check(p.linkedin, p.name, "linkedin", p.aliases); await new Promise((r) => setTimeout(r, 4000)); }
  }
  if (!ig) ig = await check(p.instagram, p.name, "instagram", p.aliases);
  li = guard(p, li);
  out.push({ name: p.name, linkedin: li, instagram: ig, both_verified: li.status === "verified" && ig.status === "verified" });
  console.log(p.both_verified ? "" : "", p.name.padEnd(24), "LI:", li.status, li.http ?? "", " IG:", ig.status, ig.http ?? "");
  }
fs.writeFileSync(new URL("../data/people.json", import.meta.url), JSON.stringify(out, null, 1));
fs.writeFileSync(new URL("../data/cohort.json", import.meta.url), JSON.stringify(out.filter((o) => o.both_verified).map((o) => ({ name: o.name, linkedin: o.linkedin.url, instagram: o.instagram.url })), null, 1));
console.log("both verified:", out.filter((o) => o.both_verified).length, "/", out.length);
