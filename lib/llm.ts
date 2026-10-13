import { extractJSON } from "./json";
import { fixtureJSON, fixtureText, isFixture } from "./fixtures";
import { askAnthropic } from "./providers/anthropic.ts";
import { askGemini } from "./providers/gemini.ts";
import { QuotaError, type CallOpts, type Role } from "./providers/types.ts";

export type Provider = "gemini" | "anthropic";
const DEFAULTS: Record<Provider, Record<Role, string>> = {
  gemini: { analyze: "gemini-3.8-flash", date: "gemini-3.5-flash-lite", verdict: "gemini-3.1-flash-lite" }, // all free-tier eligible; quotas are per model, so three models = three buckets
  anthropic: { analyze: "claude-sonnet-5-5", date: "claude-haiku-5-5", verdict: "claude-haiku-5-5" },
};

// Provider is chosen explicitly (LLM_PROVIDER) or by whichever key is present. Never silently falls back to fixtures.
export function llmConfig() {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  const provider: Provider = forced === "anthropic" || forced === "gemini" ? forced : process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "gemini";
  const keyVar = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  const d = DEFAULTS[provider];
  const models: Record<Role, string> = { analyze: process.env.ANALYZE_MODEL || d.analyze, date: process.env.DATE_MODEL || d.date, verdict: process.env.VERDICT_MODEL || process.env.DATE_MODEL || d.verdict };
  return { provider, keyVar, configured: !!process.env[keyVar], models };
}

export async function ask(opts: CallOpts): Promise<string> {
  if (isFixture()) return fixtureText(opts.system, opts.messages.length);
  const { provider, keyVar, models } = llmConfig();
  if (!process.env[keyVar]) throw new Error(`${keyVar} is not set (see .env.example)`);
  return provider === "gemini" ? askGemini(models[opts.role], opts) : askAnthropic(models[opts.role], opts);
}

export async function askJSON<T>(opts: CallOpts): Promise<T> {
  if (isFixture()) return fixtureJSON(opts.system, opts.messages[opts.messages.length - 1].content) as T;
  const text = await ask({ ...opts, json: true });
  try {
    return extractJSON<T>(text);
  } catch {
    const retry = await ask({ ...opts, json: true, temperature: 0, messages: [...opts.messages, { role: "assistant", content: text }, { role: "user", content: "That was not valid JSON. Reply with ONLY the JSON object." }] });
    return extractJSON<T>(retry);
  }
}

// Route helper: quota problems become 429 with a machine-readable code so the pipeline can back off or stop cleanly.
export function llmErrorResponse(e: any): Response {
  if (e instanceof QuotaError) return Response.json({ error: e.message, code: e.kind === "daily" ? "quota_exhausted" : "rate_limited" }, { status: 429 });
  return Response.json({ error: e?.message ?? "LLM call failed" }, { status: 500 });
}
