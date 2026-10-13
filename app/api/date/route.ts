import { ask, askJSON, llmErrorResponse } from "@/lib/llm";
import { VERDICT_SYSTEM, agentSystem, transcript, verdictUser } from "@/lib/prompts";
import { clamp, cleanProfile, rateLimit, readBody } from "@/lib/guard";
import type { Turn, Verdict } from "@/lib/types";
export const maxDuration = 120; // Vercel Hobby allows up to 300s; slow free-tier retries need headroom

// One date = two real agents taking alternating turns, each grounded only in its own principal's dossier,
// followed by two independent private debriefs. Agent A always opens.
export async function POST(req: Request) {
  const limited = rateLimit(req, "date"); if (limited) return limited;
  const body = await readBody(req); if (body instanceof Response) return body;
  const a = cleanProfile(body.a), b = cleanProfile(body.b), rounds = clamp(body.rounds, 1, 4, 3);
  if (!a || !b) return Response.json({ error: "Two profiled people are required" }, { status: 400 });
  try {
    const turns: Turn[] = [];
    for (let i = 0; i < rounds * 2; i++) {
      const speaker = i % 2 === 0 ? "a" : "b";
      const me = speaker === "a" ? a : b;
      const other = speaker === "a" ? b : a;
      const history = turns.map((t) => ({ role: (t.speaker === speaker ? "assistant" : "user") as "assistant" | "user", content: t.text }));
      const starter = { role: "user" as const, content: `(The date begins. ${i === 0 ? `You greet ${other.name} first.` : `${other.name} is across the table.`})` };
      const messages = history[0]?.role === "user" ? history : [starter, ...history];
      const text = await ask({ role: "date", system: agentSystem(me, other, rounds * 2 - i), messages, maxTokens: 220, temperature: 0.9 });
      turns.push({ speaker, text });
    }
    const tx = transcript(a, b, turns);
    const [verdictA, verdictB] = await Promise.all([
      askJSON<Verdict>({ role: "verdict", system: VERDICT_SYSTEM, maxTokens: 500, temperature: 0.2, messages: [{ role: "user", content: verdictUser(a, b, tx) }] }),
      askJSON<Verdict>({ role: "verdict", system: VERDICT_SYSTEM, maxTokens: 500, temperature: 0.2, messages: [{ role: "user", content: verdictUser(b, a, tx) }] }),
    ]);
    const fix = (v: Verdict): Verdict => ({ score: clamp(v.score, 0, 100, 50), chemistry: String(v.chemistry ?? "").slice(0, 300), needs_met: (v.needs_met ?? []).slice(0, 8).map(String), friction: (v.friction ?? []).slice(0, 8).map(String), would_see_again: !!v.would_see_again, reason: String(v.reason ?? "").slice(0, 600) });
    return Response.json({ turns, verdictA: fix(verdictA), verdictB: fix(verdictB), fixture: process.env.LLM_MODE === "fixture" });
  } catch (e: any) {
    return llmErrorResponse(e);
  }
}
