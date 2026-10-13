import { instagramUsername, linkedinUsername, rateLimit, readBody } from "@/lib/guard";
import { scrapeInstagram, scrapeLinkedIn } from "@/lib/scrape";
export const maxDuration = 60;

export async function POST(req: Request) {
  const limited = rateLimit(req, "scrape"); if (limited) return limited;
  const body = await readBody(req); if (body instanceof Response) return body;
  if (!linkedinUsername(body.linkedin) || !instagramUsername(body.instagram))
    return Response.json({ error: "Need a linkedin.com/in/<name> URL and an instagram.com/<handle> URL (https)" }, { status: 400 });
  const [li, ig] = await Promise.all([scrapeLinkedIn(body.linkedin.trim()), scrapeInstagram(body.instagram.trim())]);
  return Response.json({ linkedin: li, instagram: ig });
}
