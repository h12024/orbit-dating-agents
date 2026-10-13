// STUB of the Gemini REST API for tests only. Not Gemini. All text it returns is prefixed [STUB].
import http from "node:http";
export type Seen = { url: string; headers: http.IncomingHttpHeaders; body: any };
export function startStub(respond: (seen: Seen, n: number) => { status: number; body: any }) {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const s: Seen = { url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      seen.push(s);
      const r = respond(s, seen.length);
      res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.body));
    });
  });
  return new Promise<{ base: string; seen: Seen[]; close: () => void }>((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${(server.address() as any).port}/v1beta`, seen, close: () => server.close() })));
}
export const reply = (text: string) => ({ status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] } });
export const quotaErr = (msg: string, retry?: string) => ({ status: 429, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: msg, details: retry ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: retry }] : [] } } });

// Plays all three roles of the app from the system prompt, for route-level tests.
export function appStub(s: Seen) {
  const sys: string = s.body.systemInstruction.parts[0].text;
  const last: string = s.body.contents.at(-1).parts[0].text;
  if (sys.startsWith("You are a perceptive")) return reply(JSON.stringify({ name: "Stub Person", headline: "[STUB]", location: "n/a", summary: "[STUB] summary", needs: ["[STUB] need"], hobbies: ["[STUB] hobby"], interests: [], values: [], personality: [], communication_style: "[STUB]", lifestyle: "[STUB]", dealbreakers: [], looking_for: "[STUB]", evidence: ["[STUB]"], confidence: "low" }));
  if (sys.startsWith("You are a matchmaker")) return reply(JSON.stringify({ picks: [...last.matchAll(/^\[(p\d+)\]/gm)].map((m) => ({ id: m[1], score: 70, why: "[STUB]" })) }));
  if (sys.startsWith("You are the private debrief")) return reply(JSON.stringify({ score: 77, chemistry: "[STUB]", needs_met: ["[STUB]"], friction: [], would_see_again: true, reason: "[STUB]" }));
  return reply("[STUB] hello there");
}
