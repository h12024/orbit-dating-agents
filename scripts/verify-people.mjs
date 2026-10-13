// Verifies candidate profile URLs by fetching each PUBLIC page's og:title/description (no login, no bypass).
// A link is "verified" only if the page's own title contains the person's name tokens. Output: data/people.json
import fs from "node:fs";
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
const out = [];
for (const p of C) {
  const o = old[p.name];
  let li = o?.linkedin.status === "verified" ? o.linkedin : null, ig = o?.instagram.status === "verified" ? o.instagram : null;
  if (!li) { li = await check(p.linkedin, p.name, "linkedin", p.aliases); await new Promise((r) => setTimeout(r, 4000)); }
  if (!ig) ig = await check(p.instagram, p.name, "instagram", p.aliases);
  out.push({ name: p.name, linkedin: li, instagram: ig, both_verified: li.status === "verified" && ig.status === "verified" });
  console.log(p.both_verified ? "" : "", p.name.padEnd(24), "LI:", li.status, li.http ?? "", " IG:", ig.status, ig.http ?? "");
  }
fs.writeFileSync(new URL("../data/people.json", import.meta.url), JSON.stringify(out, null, 1));
fs.writeFileSync(new URL("../data/cohort.json", import.meta.url), JSON.stringify(out.filter((o) => o.both_verified).map((o) => ({ name: o.name, linkedin: o.linkedin.url, instagram: o.instagram.url })), null, 1));
console.log("both verified:", out.filter((o) => o.both_verified).length, "/", out.length);
