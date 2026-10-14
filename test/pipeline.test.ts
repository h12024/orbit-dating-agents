import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runPipeline } from "../lib/pipeline.ts";

// STUB of the app's own API routes. Not real scraping or AI.
function stubApi(opts: { shortlistPicks: (body: any) => any[] }) {
  const calls: Record<string, number> = {};
  const profile = (n: string) => ({ name: n, headline: "h", location: "l", summary: "s", needs: ["n"], hobbies: ["h"], interests: [], values: [], personality: [], communication_style: "c", lifestyle: "l", dealbreakers: [], looking_for: "x", evidence: ["e"], confidence: "high" });
  const v = { score: 70, chemistry: "c", needs_met: ["n"], friction: [], would_see_again: true, reason: "r" };
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls[req.url!] = (calls[req.url!] ?? 0) + 1; const b = raw ? JSON.parse(raw) : {};
      const send = (o: any, st = 200) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url === "/api/scrape") return send({ linkedin: { ok: true, source: "stub", text: "x" }, instagram: { ok: true, source: "stub", text: "y" } });
      if (req.url === "/api/analyze") return send({ profile: profile("P" + Math.random().toString(36).slice(2, 6)) });
      if (req.url === "/api/shortlist") return send({ picks: opts.shortlistPicks(b) });
      if (req.url === "/api/date") return send({ turns: [{ speaker: "a", text: "hi" }, { speaker: "b", text: "hello" }], verdictA: v, verdictB: v });
      send({ error: "nope" }, 404);
    });
  });
  return new Promise<{ base: string; calls: Record<string, number>; close: () => void }>((ok) => server.listen(0, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${(server.address() as any).port}`, calls, close: () => server.close() })));
}
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ linkedin: `https://www.linkedin.com/in/person-${i}/`, instagram: `https://www.instagram.com/person.${i}/` }));

test("2-3 person pool: everyone dates everyone, no triage model call", async () => {
  const s = await stubApi({ shortlistPicks: () => [] }); // a triage that would have returned nothing
  try {
    const r = await runPipeline(rows(3), { base: s.base, k: 4, rounds: 1 }, {});
    assert.equal(r.dates.length, 3); assert.equal(r.errors, 0); assert.equal(s.calls["/api/shortlist"] ?? 0, 0);
    const r2 = await runPipeline(rows(2), { base: s.base, k: 4, rounds: 1 }, {});
    assert.equal(r2.dates.length, 1);
  } finally { s.close(); }
});

test("larger pool: an empty triage answer falls back to neighbours instead of leaving the person undated", async () => {
  const s = await stubApi({ shortlistPicks: () => [] });
  try {
    const logs: string[] = [];
    const r = await runPipeline(rows(7), { base: s.base, k: 2, rounds: 1 }, { log: (m) => logs.push(m) });
    assert.ok(r.dates.length >= 7, `dates ${r.dates.length}`); // every person got dates
    assert.ok(logs.some((l) => /Triage gave no picks/.test(l)), "says so plainly");
    const dated = new Set(r.dates.flatMap((d) => [d.a, d.b])); assert.equal(dated.size, 7);
  } finally { s.close(); }
});

test("a normal triage answer is used as given", async () => {
  const s = await stubApi({ shortlistPicks: (b) => [{ id: b.others[0].id, score: 90, why: "picked" }] });
  try {
    const r = await runPipeline(rows(7), { base: s.base, k: 2, rounds: 1 }, {});
    assert.ok(Object.values(r.shortlists).every((l) => l.length === 1 && l[0].score === 90));
    assert.equal(s.calls["/api/shortlist"], 7);
  } finally { s.close(); }
});

// Scrape route that misbehaves: answers 429 with a code a few times, then works.
function stubScrape(first: { n: number; code: string }) {
  let scrapes = 0; const profile = (n: string) => ({ name: n, headline: "h", location: "l", summary: "s", needs: ["n"], hobbies: ["h"], interests: [], values: [], personality: [], communication_style: "c", lifestyle: "l", dealbreakers: [], looking_for: "x", evidence: ["e"], confidence: "high" });
  const v = { score: 70, chemistry: "c", needs_met: ["n"], friction: [], would_see_again: true, reason: "r" };
  const server = http.createServer((req, res) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const send = (o: any, st = 200) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/api/scrape") { scrapes++; return scrapes <= first.n ? send({ error: "limit", code: first.code }, 429) : send({ linkedin: { ok: true, source: "stub", text: "x" }, instagram: { ok: true, source: "stub", text: "y" } }); }
    if (req.url === "/api/analyze") return send({ profile: profile("P" + Math.random().toString(36).slice(2, 6)) });
    if (req.url === "/api/date") return send({ turns: [{ speaker: "a", text: "hi" }, { speaker: "b", text: "yo" }], verdictA: v, verdictB: v });
    send({ picks: [] });
  }); });
  return new Promise<{ base: string; scrapes: () => number; close: () => void }>((ok) => server.listen(0, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${(server.address() as any).port}`, scrapes: () => scrapes, close: () => server.close() })));
}

test("congestion 429 (rate_limited) is retried with backoff and the run completes", async () => {
  process.env.PIPELINE_RETRY_MS = "5";
  const s = await stubScrape({ n: 3, code: "rate_limited" });
  try { const r = await runPipeline(rows(3), { base: s.base, rounds: 1 }, {}); assert.equal(r.halted, undefined); assert.equal(r.people.filter((p) => p.status === "ready").length, 3); assert.equal(r.dates.length, 3); } finally { s.close(); }
});

test("real quota exhaustion halts at once: no retries, nothing analysed, resumable", async () => {
  process.env.PIPELINE_RETRY_MS = "5";
  const s = await stubScrape({ n: 999, code: "quota_exhausted" });
  try { const r = await runPipeline(rows(4), { base: s.base, rounds: 1 }, {}); assert.ok(r.halted, "halted"); assert.ok(s.scrapes() <= 2, `scrape calls ${s.scrapes()} (no retries; concurrency 2)`); assert.equal(r.dates.length, 0); } finally { s.close(); }
});
