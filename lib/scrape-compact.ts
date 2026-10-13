// Turns raw Apify actor items into compact, substantive text for the analysis model.
// Keeps what a person said/did (about, roles, captions, hashtags, places); drops signed CDN urls, tracking links,
// emails, and OTHER people's data (Instagram relatedProfiles, tagged accounts' avatars).
const NOISE_KEY = /(url|urn|logo|picture|image|avatar|thumb|dimension|shortcode|ownerid|timestamp(?!$)|postal|memorialized|premium|show_follower|email|^id$|_id$|pk$|typename|lynx|shimmed|inputurl)/i;

function clean(v: any, depth = 0): any {
  if (v == null || v === "" || v === false) return undefined;
  if (typeof v === "string") return /^https?:\/\//i.test(v) && v.length > 60 ? undefined : v.slice(0, 1500);
  if (Array.isArray(v)) { const a = v.slice(0, 25).map((x) => clean(x, depth + 1)).filter((x) => x !== undefined); return a.length ? a : undefined; }
  if (typeof v === "object" && depth < 5) {
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) { if (NOISE_KEY.test(k)) continue; const c = clean(x, depth + 1); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return typeof v === "number" || v === true ? v : undefined;
}

const day = (t: unknown) => (typeof t === "string" ? t.slice(0, 10) : undefined);

export function compactLinkedIn(item: any, limit = 12000): string {
  if (!item || typeof item !== "object") return "";
  const { email, ...rest } = item; // never forward emails
  const cleaned = clean(rest);
  return JSON.stringify(cleaned ?? {}).slice(0, limit);
}

export function compactInstagram(item: any, limit = 12000): string {
  if (!item || typeof item !== "object") return "";
  const post = (p: any) => clean({
    type: p.type, date: day(p.timestamp), caption: typeof p.caption === "string" ? p.caption.slice(0, 500) : undefined,
    hashtags: p.hashtags, mentions: p.mentions, location: p.locationName, likes: p.likesCount, comments: p.commentsCount,
    tagged: Array.isArray(p.taggedUsers) ? p.taggedUsers.map((t: any) => t?.username).filter(Boolean) : undefined,
    alt: typeof p.alt === "string" ? p.alt.slice(0, 200) : undefined,
  });
  const out = clean({
    username: item.username, fullName: item.fullName, biography: item.biography, verified: item.verified, businessCategory: item.businessCategoryName,
    externalLink: item.externalUrl && !/instagram\.com/.test(item.externalUrl) ? item.externalUrl : undefined,
    followers: item.followersCount, following: item.followsCount, posts: item.postsCount,
    recentPosts: (item.latestPosts ?? []).slice(0, 12).map(post).filter(Boolean),
    recentVideos: (item.latestIgtvVideos ?? []).slice(0, 3).map(post).filter(Boolean),
  });
  return JSON.stringify(out ?? {}).slice(0, limit);
}
