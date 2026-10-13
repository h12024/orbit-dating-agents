import { test } from "node:test";
import assert from "node:assert/strict";
import { askGemini } from "../lib/providers/gemini.ts";
import { QuotaError } from "../lib/providers/types.ts";
import { quotaErr, reply, startStub } from "./stub-gemini.ts";

const opts = { role: "date" as const, system: "SYS", messages: [{ role: "user" as const, content: "hi" }, { role: "assistant" as const, content: "yo" }, { role: "user" as const, content: "ok" }], maxTokens: 100, temperature: 0.5 };
const withStub = async (respond: Parameters<typeof startStub>[0], fn: (s: Awaited<ReturnType<typeof startStub>>) => Promise<void>) => {
  const s = await startStub(respond);
  process.env.GEMINI_API_KEY = "test-key-123"; process.env.GEMINI_BASE_URL = s.base;
  try { await fn(s); } finally { s.close(); }
};

test("gemini request format: key in header not URL, roles mapped, system instruction, JSON mode, token headroom", () =>
  withStub(() => reply("ok"), async (s) => {
    assert.equal(await askGemini("m-format", { ...opts, json: true }), "ok");
    const r = s.seen[0];
    assert.match(r.url, /\/models\/m-format:generateContent$/);
    assert.ok(!r.url.includes("test-key-123"), "key must not be in the URL");
    assert.equal(r.headers["x-goog-api-key"], "test-key-123");
    assert.deepEqual(r.body.contents.map((c: any) => c.role), ["user", "model", "user"]);
    assert.equal(r.body.systemInstruction.parts[0].text, "SYS");
    assert.equal(r.body.generationConfig.responseMimeType, "application/json");
    assert.equal(r.body.generationConfig.maxOutputTokens, 400);
  }));

test("drops thinkingConfig once if the model rejects it, then remembers", () =>
  withStub((s) => (s.body.generationConfig.thinkingConfig ? { status: 400, body: { error: { message: "thinking_level is not supported for this model" } } } : reply("fine")), async (s) => {
    assert.equal(await askGemini("m-think", opts), "fine");
    assert.equal(s.seen.length, 2);
    await askGemini("m-think", opts);
    assert.equal(s.seen.length, 3); // second call goes straight to the working variant
    assert.equal(s.seen[2].body.generationConfig.thinkingConfig, undefined);
  }));

test("per-minute 429 is retried using retryDelay", () =>
  withStub((_s, n) => (n === 1 ? quotaErr("Quota exceeded for requests per minute", "0s") : reply("after retry")), async (s) => {
    assert.equal(await askGemini("m-rate", opts), "after retry");
    assert.equal(s.seen.length, 2);
  }));

test("daily 429 throws QuotaError(daily) immediately without retrying", () =>
  withStub(() => quotaErr("Quota exceeded for metric generate_content_free_tier_requests, limit: 20, PerDay"), async (s) => {
    await assert.rejects(askGemini("m-day", opts), (e: any) => e instanceof QuotaError && e.kind === "daily");
    assert.equal(s.seen.length, 1);
  }));

test("blocked prompt and empty/thought-only output surface as clear errors", async () => {
  await withStub(() => ({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }), async () => {
    await assert.rejects(askGemini("m-block", opts), /prompt blocked: SAFETY/);
  });
  await withStub(() => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: "secret reasoning", thought: true }] }, finishReason: "MAX_TOKENS" }] } }), async () => {
    await assert.rejects(askGemini("m-empty", opts), /empty text.*MAX_TOKENS/);
  });
});

test("invalid key surfaces Google's message; missing key fails before any request", async () => {
  await withStub(() => ({ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }), async () => {
    await assert.rejects(askGemini("m-key", opts), /API key not valid/);
  });
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(askGemini("m-nokey", opts), /GEMINI_API_KEY is not set/);
});

test("MALFORMED_RESPONSE with no text is retried, not fatal", () =>
  withStub((_s, n) => (n === 1 ? { status: 200, body: { candidates: [{ finishReason: "MALFORMED_RESPONSE" }] } } : reply("recovered")), async (s) => {
    assert.equal(await askGemini("m-malformed", opts), "recovered");
    assert.equal(s.seen.length, 2);
  }));
