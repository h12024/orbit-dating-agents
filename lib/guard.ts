import type { Profile } from "./types";

// ---- input validation -------------------------------------------------------------------------------------
export const LINKEDIN_RE = /^https:\/\/(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/in\/([A-Za-z0-9%_-]{3,100})\/?$/;
export const INSTAGRAM_RE = /^https:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?$/;

export const linkedinUsername = (url: unknown) => (typeof url === "string" ? url.trim().match(LINKEDIN_RE)?.[1] ?? null : null);
export const instagramUsername = (url: unknown) => (typeof url === "string" ? url.trim().match(INSTAGRAM_RE)?.[1] ?? null : null);

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown, n = 12) => (Array.isArray(v) ? v.slice(0, n).map((x) => str(x, 300)).filter(Boolean) : []);

// Profiles round-trip through the browser, so never trust their shape or size on the way back in.
export function cleanProfile(p: any): Profile | null {
  if (!p || typeof p !== "object" || typeof p.name !== "string" || !p.name.trim()) return null;
  return {
    name: str(p.name, 120), headline: str(p.headline), location: str(p.location, 200), summary: str(p.summary, 1200),
    needs: arr(p.needs), hobbies: arr(p.hobbies), interests: arr(p.interests), values: arr(p.values), personality: arr(p.personality),
    communication_style: str(p.communication_style), lifestyle: str(p.lifestyle), dealbreakers: arr(p.dealbreakers),
    looking_for: str(p.looking_for), evidence: arr(p.evidence, 10),
    confidence: p.confidence === "high" || p.confidence === "medium" ? p.confidence : "low",
  };
}

export const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);

// ---- per-IP rate limiting (in-memory, best effort per serverless instance) ---------------------------------
const hits = new Map<string, number[]>();
const LIMITS: Record<string, number> = { scrape: 60, analyze: 60, shortlist: 60, date: 200 }; // per IP per hour
const HOUR = 3600_000;

export function rateLimit(req: Request, route: keyof typeof LIMITS): Response | null {
  const scale = Number(process.env.RATE_LIMIT_SCALE) || 1;
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${route}:${ip}`, now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= LIMITS[route] * scale) {
    return Response.json({ error: `Rate limit reached for ${route}. Try again later.` }, { status: 429, headers: { "retry-after": "600" } });
  }
  recent.push(now); hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k);
  return null;
}

export async function readBody(req: Request, maxBytes = 200_000): Promise<any | Response> {
  const text = await req.text();
  if (text.length > maxBytes) return Response.json({ error: "Request too large" }, { status: 413 });
  try { return JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
}
