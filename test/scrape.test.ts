import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scrapeInstagram, scrapeLinkedIn } from "../lib/scrape.ts";

// STUB of the Apify run-sync endpoint. Not Apify.
function stubApify(respond: (actor: string, input: any, n: number) => any[]) {
  let n = 0; const calls: string[] = [];
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { const actor = req.url!.match(/acts\/([^/]+)\//)![1]; calls.push(actor); res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify(respond(actor, JSON.parse(raw), ++n))); });
  });
  return new Promise<{ calls: string[]; close: () => void }>((ok) => server.listen(0, "127.0.0.1", () => {
    process.env.APIFY_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`; process.env.APIFY_TOKEN = "stub-token";
    ok({ calls, close: () => server.close() });
  }));
}
const LI = "https://www.linkedin.com/in/test-person/", IG = "https://www.instagram.com/test.person/";
const profile = { basic_info: { fullname: "Test Person", headline: "Engineer", about: "I love climbing and cooking.", email: { address: "x@y.z" }, profile_picture_url: "https://media.licdn.com/" + "a".repeat(120) }, experience: [{ title: "Staff Engineer", company: "Acme" }] };

test("actor daily-limit message is flagged as quota, never analysed as a profile", async () => {
  process.env.SCRAPE_CACHE = "off";
  const s = await stubApify(() => [{ profile_input: "test-person", message: "Daily free-tier limit of 20 profiles reached. Upgrade your Apify plan or wait until tomorrow." }]);
  try {
    const r = await scrapeLinkedIn(LI);
    assert.equal(r.ok, false); assert.equal(r.quota, true); assert.equal(r.text, ""); assert.match(r.error!, /limit of 20/);
  } finally { s.close(); }
});

test("normal profile: substance kept, email/urls dropped, no fallback to meta scraping", async () => {
  process.env.SCRAPE_CACHE = "off";
  const s = await stubApify((actor, input) => (actor.includes("linkedin") ? (assert.equal(input.includeEmail, false), [profile]) : [{ username: "test.person", fullName: "Test Person", biography: "bio text", followersCount: 5, latestPosts: [{ caption: "hello trail", hashtags: ["run"] }], relatedProfiles: [{ username: "stranger" }] }]));
  try {
    const li = await scrapeLinkedIn(LI), ig = await scrapeInstagram(IG);
    assert.ok(li.ok && li.source === "apify:linkedin" && li.text.includes("love climbing") && !li.text.includes("x@y.z") && !/https?:/.test(li.text));
    assert.ok(ig.ok && ig.text.includes("hello trail") && !ig.text.includes("stranger"));
  } finally { s.close(); }
});

test("cache: second scrape of the same profile costs no actor call", async () => {
  process.env.SCRAPE_CACHE = "on"; delete process.env.VERCEL;
  process.env.SCRAPE_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-cache-"));
  const s = await stubApify(() => [profile]);
  try {
    const a = await scrapeLinkedIn(LI), b = await scrapeLinkedIn(LI);
    assert.equal(a.source, "apify:linkedin"); assert.equal(b.source, "apify:linkedin (cached)"); assert.equal(b.text, a.text);
    assert.equal(s.calls.length, 1);
  } finally { s.close(); fs.rmSync(process.env.SCRAPE_CACHE_DIR!, { recursive: true, force: true }); }
});

test("a limit message is not cached and non-limit actor messages are plain failures", async () => {
  process.env.SCRAPE_CACHE = "on"; process.env.SCRAPE_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-cache-"));
  const s = await stubApify((_a, _i, n) => (n === 1 ? [{ message: "Profile not found" }] : [{ message: "Daily free-tier limit reached" }]));
  try {
    const a = await scrapeLinkedIn(LI); assert.equal(a.ok, false); assert.equal(a.quota, undefined); assert.match(a.error!, /not found/);
    const b = await scrapeLinkedIn(LI); assert.equal(b.quota, true);
    assert.equal(fs.readdirSync(process.env.SCRAPE_CACHE_DIR!).length, 0);
  } finally { s.close(); fs.rmSync(process.env.SCRAPE_CACHE_DIR!, { recursive: true, force: true }); }
});
