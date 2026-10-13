import { askJSON, llmErrorResponse } from "@/lib/llm";
import { cleanProfile, instagramUsername, linkedinUsername, rateLimit, readBody } from "@/lib/guard";
import { ANALYZE_SYSTEM } from "@/lib/prompts";
import type { Profile } from "@/lib/types";
export const maxDuration = 60;

const src = (s: any) => ({ ok: !!s?.ok, source: String(s?.source ?? "none").slice(0, 40), text: String(s?.text ?? "").slice(0, 10_000), error: s?.error ? String(s.error).slice(0, 200) : undefined });

export async function POST(req: Request) {
  const limited = rateLimit(req, "analyze"); if (limited) return limited;
  const body = await readBody(req); if (body instanceof Response) return body;
  if (!linkedinUsername(body.linkedin) || !instagramUsername(body.instagram)) return Response.json({ error: "Invalid profile URLs" }, { status: 400 });
  const li = src(body.scraped?.linkedin), ig = src(body.scraped?.instagram);
  if (!li.ok && !ig.ok) return Response.json({ error: "Both sources failed to scrape: " + [li.error, ig.error].filter(Boolean).join(" / ") }, { status: 422 });
  try {
    const raw = await askJSON<Profile>({
      role: "analyze", system: ANALYZE_SYSTEM, maxTokens: 1800, temperature: 0.3,
      messages: [{ role: "user", content: `<linkedin url="${body.linkedin}" source="${li.source}">\n${li.text || "(unavailable: " + li.error + ")"}\n</linkedin>\n\n<instagram url="${body.instagram}" source="${ig.source}">\n${ig.text || "(unavailable: " + ig.error + ")"}\n</instagram>` }],
    });
    const profile = cleanProfile(raw);
    if (!profile) return Response.json({ error: "Model returned an unusable profile" }, { status: 502 });
    return Response.json({ profile });
  } catch (e: any) {
    return llmErrorResponse(e);
  }
}
