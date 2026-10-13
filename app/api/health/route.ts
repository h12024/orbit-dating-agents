import { isFixture } from "@/lib/fixtures";
import { llmConfig } from "@/lib/llm";
// Reports configuration only (names and booleans), never key values.
export async function GET() {
  const c = llmConfig();
  return Response.json({ mode: isFixture() ? "fixture" : "live", provider: c.provider, keyVar: c.keyVar, configured: c.configured, models: c.models, apify: !!process.env.APIFY_TOKEN, maxPeople: Math.min(30, Math.max(2, Number(process.env.MAX_PEOPLE) || 30)) });
}
