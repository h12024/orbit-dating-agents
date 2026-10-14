import type { Scraped } from "./types";
import { instagramUsername, linkedinUsername } from "./guard.ts";
import { isFixture } from "./fixtures.ts";
import { compactInstagram, compactLinkedIn } from "./scrape-compact.ts";
import { cacheGet, cacheSet } from "./scrape-cache.ts";

const TOKEN = () => process.env.APIFY_TOKEN;
const BASE = () => process.env.APIFY_BASE_URL || "https://api.apify.com/v2";
const LI_ACTOR = () => process.env.APIFY_LINKEDIN_ACTOR || "apimaestro~linkedin-profile-detail";
const IG_ACTOR = () => process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper";

// The actor's own daily/credit limit. Not a failed profile: the run must stop and resume later (never analyse the limit message).
export class ActorLimitError extends Error {}
// Apify answers 402 "actor-memory-limit-exceeded" when too many runs are in flight for the plan. That is congestion, not exhausted credit: retry.
export class ActorBusyError extends Error {}

const BUSY_WAITS = () => (process.env.APIFY_BUSY_WAIT_MS ?? "3000,5000").split(",").map(Number);
async function apify(actor: string, input: unknown): Promise<any[]> {
  const waits = BUSY_WAITS();
  for (let attempt = 0; ; attempt++) {
    try { return await apifyOnce(actor, input); }
    catch (e) { if (e instanceof ActorBusyError && attempt < waits.length) { await new Promise((r) => setTimeout(r, waits[attempt])); continue; } throw e; }
  }
}
async function apifyOnce(actor: string, input: unknown): Promise<any[]> {
  const res = await fetch(`${BASE()}/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN()}&timeout=55`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(70_000) });
  const body = await res.text();
  if (res.status === 402) {
    if (/memory|concurren|too[- ]many|actor-memory-limit/i.test(body)) throw new ActorBusyError("Apify is busy (too many scrapes at once)");
    throw new ActorLimitError("Apify account has no credit left for this actor");
  }
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${body.slice(0, 200).replace(TOKEN() ?? "\0", "<token>")}`);
  return JSON.parse(body);
}

// Actors report problems as a data item like {message: "Daily free-tier limit of 20 profiles reached..."}.
function actorMessage(item: any, hasData: boolean): string | null {
  if (!item || hasData) return null;
  const m = typeof item.message === "string" ? item.message : typeof item.error === "string" ? item.error : typeof item.errorDescription === "string" ? item.errorDescription : null;
  return m ? m.slice(0, 300) : null;
}
const isLimit = (m: string) => /limit|upgrade|quota|credit|exceed/i.test(m);

async function metaFallback(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; facebookexternalhit/1.1)" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (res.status === 999 || res.status === 429) throw new Error(`Blocked by platform (HTTP ${res.status}); set APIFY_TOKEN to scrape reliably`);
  const html = await res.text();
  const pick = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, "i"))?.[1] ?? "";
  const dec = (t: string) => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"');
  return dec([...new Set([pick("og:title"), pick("og:description"), pick("description")].filter(Boolean))].join(" | "));
}

export async function scrapeLinkedIn(url: string): Promise<Scraped["linkedin"]> {
  const username = linkedinUsername(url);
  if (!username) return { ok: false, source: "none", text: "", error: "Not a linkedin.com/in/ URL" };
  if (isFixture()) return { ok: true, source: "fixture", text: `[FIXTURE] synthetic LinkedIn text for linkedin.com/in/${username}` };
  const hit = cacheGet("linkedin", username);
  if (hit) return { ok: true, source: "apify:linkedin (cached)", text: hit.text };
  try {
    if (TOKEN()) {
      const items = await apify(LI_ACTOR(), { username, includeEmail: false }); // schema verified against the actor build; never fetch emails
      const item = items[0];
      const msg = actorMessage(item, !!item?.basic_info);
      if (msg) { if (isLimit(msg)) throw new ActorLimitError(msg); return { ok: false, source: "apify:linkedin", text: "", error: `Apify: ${msg}` }; }
      if (item?.basic_info) { const text = compactLinkedIn(item); cacheSet("linkedin", username, { text }); return { ok: true, source: "apify:linkedin", text }; }
    }
    const text = await metaFallback(`https://www.linkedin.com/in/${username}/`);
    if (text) return { ok: true, source: "og-meta", text };
    return { ok: false, source: "none", text: "", error: "LinkedIn returned nothing (set APIFY_TOKEN)" };
  } catch (e: any) {
    return { ok: false, source: "none", text: "", error: e.message, quota: e instanceof ActorLimitError || undefined, busy: e instanceof ActorBusyError || undefined };
  }
}

export async function scrapeInstagram(url: string): Promise<Scraped["instagram"]> {
  const username = instagramUsername(url);
  if (!username) return { ok: false, source: "none", text: "", error: "Not an instagram.com URL" };
  if (isFixture()) return { ok: true, source: "fixture", text: `[FIXTURE] synthetic Instagram text for @${username}` };
  const hit = cacheGet("instagram", username);
  if (hit) return { ok: true, source: "apify:instagram (cached)", text: hit.text, avatar: hit.avatar };
  try {
    if (TOKEN()) {
      const items = await apify(IG_ACTOR(), { usernames: [username] });
      const p = items[0];
      const msg = actorMessage(p, !!p?.username);
      if (msg) { if (isLimit(msg)) throw new ActorLimitError(msg); return { ok: false, source: "apify:instagram", text: "", error: `Apify: ${msg}` }; }
      if (p?.username) {
        if (p.private || p.isPrivate) return { ok: false, source: "apify:instagram", text: "", error: "Profile is private" };
        const text = compactInstagram(p), avatar = p.profilePicUrlHD || p.profilePicUrl;
        cacheSet("instagram", username, { text, avatar });
        return { ok: true, source: "apify:instagram", text, avatar };
      }
    }
    const text = await metaFallback(`https://www.instagram.com/${username}/`);
    if (text) return { ok: true, source: "og-meta", text };
    return { ok: false, source: "none", text: "", error: "Instagram returned nothing (set APIFY_TOKEN)" };
  } catch (e: any) {
    return { ok: false, source: "none", text: "", error: e.message, quota: e instanceof ActorLimitError || undefined, busy: e instanceof ActorBusyError || undefined };
  }
}
