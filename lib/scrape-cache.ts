// Tiny on-disk cache of COMPACTED Apify results (never raw payloads), so a profile never costs scraper quota twice:
// the Apify free LinkedIn actor allows only 20 profiles/day. Local/dev only: disabled on Vercel (no persistent disk) or SCRAPE_CACHE=off.
import fs from "node:fs";
import path from "node:path";

const DAY = 86_400_000, TTL = 7 * DAY;
export const cacheDir = () => process.env.SCRAPE_CACHE_DIR || "data/runs/scrape-cache";
export const cacheEnabled = () => process.env.SCRAPE_CACHE !== "off" && !process.env.VERCEL;
const file = (kind: string, user: string) => path.join(cacheDir(), `${kind}-${user.toLowerCase().replace(/[^a-z0-9._-]/g, "_")}.json`);

export function cacheGet(kind: "linkedin" | "instagram", user: string): { text: string; avatar?: string } | null {
  if (!cacheEnabled()) return null;
  try {
    const j = JSON.parse(fs.readFileSync(file(kind, user), "utf8"));
    return Date.now() - j.fetched_at < TTL && typeof j.text === "string" && j.text.length > 20 ? { text: j.text, avatar: j.avatar } : null;
  } catch { return null; }
}

export function cacheSet(kind: "linkedin" | "instagram", user: string, value: { text: string; avatar?: string }) {
  if (!cacheEnabled()) return;
  try { fs.mkdirSync(cacheDir(), { recursive: true }); fs.writeFileSync(file(kind, user), JSON.stringify({ ...value, fetched_at: Date.now() })); } catch {}
}
