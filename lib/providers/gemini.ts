import { QuotaError, type CallOpts } from "./types.ts";

// Official Gemini API, REST models.generateContent (https://ai.google.dev/api/generate-content). Key via header, never the URL.
const lastCall = new Map<string, number>();
const noThinking = new Set<string>(); // models that rejected thinkingConfig
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Optional pacing: GEMINI_RPM=10 keeps one process under 10 requests/minute per model (quotas are per model).
async function gate(model: string) {
  const rpm = Number(process.env.GEMINI_RPM);
  if (!rpm) return;
  const gap = 60_000 / rpm, now = Date.now(), next = Math.max(now, (lastCall.get(model) ?? 0) + gap);
  lastCall.set(model, next);
  if (next > now) await sleep(next - now);
}

const retryDelayMs = (body: string) => {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? body.match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
};

export async function askGemini(model: string, o: CallOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (free key: https://aistudio.google.com/apikey)");
  const base = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  // Gemini 3.x models "think" by default and thinking tokens count against maxOutputTokens, so leave headroom.
  const maxOutputTokens = Math.min(8192, (o.maxTokens ?? 1024) * 4);

  for (let attempt = 0; ; attempt++) {
    const thinking = !noThinking.has(model);
    const body = {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: o.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: o.temperature ?? 0.8, maxOutputTokens,
        ...(o.json ? { responseMimeType: "application/json" } : {}),
        ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    };
    await gate(model);
    const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(50_000),
    });
    const raw = await res.text();

    if (res.ok) {
      const data = JSON.parse(raw);
      const cand = data.candidates?.[0];
      if (!cand) throw new Error(`Gemini returned no candidate${data.promptFeedback?.blockReason ? ` (prompt blocked: ${data.promptFeedback.blockReason})` : ""}`);
      const text = (cand.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("").trim();
      if (!text) throw new Error(`Gemini returned empty text (finishReason: ${cand.finishReason ?? "unknown"})`);
      return text;
    }
    if (res.status === 400 && thinking && /thinking/i.test(raw)) { noThinking.add(model); continue; }
    if (res.status === 429) {
      if (/per ?day|PerDay|daily/i.test(raw)) throw new QuotaError(`Gemini free-tier DAILY quota exhausted for ${model}. It resets at midnight Pacific time.`, "daily");
      const wait = retryDelayMs(raw) ?? 5000 * (attempt + 1);
      if (attempt >= 3 || wait > 60_000) throw new QuotaError(`Gemini rate limit hit for ${model} (retry in ~${Math.round(wait / 1000)}s)`, "rate");
      await sleep(wait + 500); continue;
    }
    if (res.status >= 500 && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
    let msg = raw.slice(0, 200);
    try { msg = JSON.parse(raw).error?.message ?? msg; } catch {}
    throw new Error(`Gemini API ${res.status}: ${msg}`);
  }
}
