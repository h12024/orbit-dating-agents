import type { Scraped } from "./types";
import { instagramUsername, linkedinUsername } from "./guard";
import { isFixture } from "./fixtures";

const TOKEN = () => process.env.APIFY_TOKEN;
const LI_ACTOR = () => process.env.APIFY_LINKEDIN_ACTOR || "apimaestro~linkedin-profile-detail";
const IG_ACTOR = () => process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper";


async function apify(actor: string, input: unknown): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN()}&timeout=55`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Drop noise (urls to CDN images, ids, huge arrays) so the LLM sees signal, not payload.
function compact(obj: unknown, limit: number): string {
  const seen = (k: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return undefined;
    if (typeof v === "string" && /^https?:\/\/.*\.(jpg|jpeg|png|webp|mp4)/i.test(v)) return undefined;
    if (/^(id|pk|fbid|__typename|profilePicUrl.*|displayUrl|videoUrl|images|childPosts|taggedUsers|musicInfo)$/i.test(k)) return undefined;
    return v;
  };
  return JSON.stringify(obj, seen).slice(0, limit);
}

async function metaFallback(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; facebookexternalhit/1.1)" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (res.status === 999 || res.status === 429) throw new Error(`Blocked by platform (HTTP ${res.status}); set APIFY_TOKEN to scrape reliably`);
  const html = await res.text();
  const pick = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, "i"))?.[1] ?? "";
  const dec = (t: string) => t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  return dec([...new Set([pick("og:title"), pick("og:description"), pick("description")].filter(Boolean))].join(" | "));
}

export async function scrapeLinkedIn(url: string): Promise<Scraped["linkedin"]> {
  const username = linkedinUsername(url);
  if (!username) return { ok: false, source: "none", text: "", error: "Not a linkedin.com/in/ URL" };
  if (isFixture()) return { ok: true, source: "fixture", text: `[FIXTURE] synthetic LinkedIn text for linkedin.com/in/${username}` };
  try {
    if (TOKEN()) {
      const items = await apify(LI_ACTOR(), { username });
      if (items[0]) return { ok: true, source: "apify:linkedin", text: compact(items[0], 9000) };
    }
    const text = await metaFallback(`https://www.linkedin.com/in/${username}/`);
    if (text) return { ok: true, source: "og-meta", text };
    return { ok: false, source: "none", text: "", error: "LinkedIn returned nothing (set APIFY_TOKEN)" };
  } catch (e: any) {
    return { ok: false, source: "none", text: "", error: e.message };
  }
}

export async function scrapeInstagram(url: string): Promise<Scraped["instagram"]> {
  const username = instagramUsername(url);
  if (!username) return { ok: false, source: "none", text: "", error: "Not an instagram.com URL" };
  if (isFixture()) return { ok: true, source: "fixture", text: `[FIXTURE] synthetic Instagram text for @${username}` };
  try {
    if (TOKEN()) {
      const items = await apify(IG_ACTOR(), { usernames: [username] });
      const p = items[0];
      if (p) {
        if (p.private || p.isPrivate) return { ok: false, source: "apify:instagram", text: "", error: "Profile is private" };
        return { ok: true, source: "apify:instagram", text: compact(p, 9000), avatar: p.profilePicUrlHD || p.profilePicUrl };
      }
    }
    const text = await metaFallback(`https://www.instagram.com/${username}/`);
    if (text) return { ok: true, source: "og-meta", text };
    return { ok: false, source: "none", text: "", error: "Instagram returned nothing (set APIFY_TOKEN)" };
  } catch (e: any) {
    return { ok: false, source: "none", text: "", error: e.message };
  }
}
