import type { CallOpts } from "./types.ts";
import { QuotaError } from "./types.ts";

let client: any = null;
export async function askAnthropic(model: string, o: CallOpts): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await client.messages.create({ model, system: o.system, messages: o.messages, max_tokens: o.maxTokens ?? 1024, temperature: o.temperature ?? 0.8 });
      return r.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
    } catch (e: any) {
      if (attempt < 3 && (e?.status === 429 || e?.status >= 500)) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      if (e?.status === 429) throw new QuotaError(e.message, "rate");
      throw e;
    }
  }
}
