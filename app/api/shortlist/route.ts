import { ANALYZE_MODEL, askJSON } from "@/lib/llm";
import { clamp, cleanProfile, rateLimit, readBody } from "@/lib/guard";
import { SHORTLIST_SYSTEM, card, dossier } from "@/lib/prompts";
export const maxDuration = 60;

export async function POST(req: Request) {
  const limited = rateLimit(req, "shortlist"); if (limited) return limited;
  const body = await readBody(req, 400_000); if (body instanceof Response) return body;
  const me = cleanProfile(body.me);
  const others = (Array.isArray(body.others) ? body.others.slice(0, 40) : [])
    .map((o: any) => ({ id: String(o?.id ?? "").slice(0, 20), profile: cleanProfile(o?.profile) })).filter((o: any) => o.id && o.profile) as { id: string; profile: NonNullable<ReturnType<typeof cleanProfile>> }[];
  if (!me || !others.length) return Response.json({ error: "Need a profiled person and at least one candidate" }, { status: 400 });
  const k = clamp(body.k, 1, 8, 4);
  try {
    const r = await askJSON<{ picks: { id: string; score: number; why: string }[] }>({
      model: ANALYZE_MODEL, system: SHORTLIST_SYSTEM, maxTokens: 1500, temperature: 0.3,
      messages: [{ role: "user", content: `PERSON:\n${dossier(me)}\n\nCANDIDATES:\n${others.map((o) => card(o.id, o.profile)).join("\n")}\n\nPick the top ${k} (plus one wildcard included in that count).` }],
    });
    const valid = new Set(others.map((o) => o.id));
    const picks = (r.picks ?? []).filter((p) => valid.has(p.id)).map((p) => ({ id: p.id, score: clamp(p.score, 0, 100, 50), why: String(p.why ?? "").slice(0, 300) })).slice(0, k);
    return Response.json({ picks });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
