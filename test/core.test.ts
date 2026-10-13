import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFor } from "../lib/rank.ts";
import { parseLines } from "../lib/parse.ts";
import { extractJSON } from "../lib/json.ts";

const v = (score: number, again = true) => ({ score, chemistry: "", needs_met: [], friction: [], would_see_again: again, reason: "r" });

test("parseLines pairs urls in any order and flags missing ones", () => {
  const r = parseLines("https://instagram.com/a_b, https://www.linkedin.com/in/ab/\nhttps://www.linkedin.com/in/solo/");
  assert.equal(r[0].linkedin, "https://www.linkedin.com/in/ab/");
  assert.equal(r[0].instagram, "https://instagram.com/a_b");
  assert.equal(r[1].instagram, "");
});

test("rankFor weights own agent 60/40, penalises no-second-date, falls back for undated", () => {
  const dates = [
    { id: "p1-p2", a: "p1", b: "p2", turns: [], verdictA: v(90), verdictB: v(50) },
    { id: "p1-p3", a: "p3", b: "p1", turns: [], verdictA: v(100), verdictB: v(80, false) },
  ];
  const r = rankFor("p1", ["p1", "p2", "p3", "p4"], dates, { p1: [{ id: "p4", score: 80, why: "w" }] });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(by.p2.score, Math.round(0.6 * 90 + 0.4 * 50)); // 74
  assert.equal(by.p3.score, Math.round(0.6 * 80 + 0.4 * 100 - 8)); // 80
  assert.equal(by.p4.dated, false);
  assert.equal(by.p4.score, 48);
  assert.equal(r[0].id, "p3");
});

test("extractJSON tolerates prose around the object", () => {
  assert.deepEqual(extractJSON('Sure!\n{"a":1}\nthanks'), { a: 1 });
  assert.throws(() => extractJSON("no json"));
});

import { cleanProfile, clamp, instagramUsername, linkedinUsername, rateLimit } from "../lib/guard.ts";

test("URL validators accept real profile URLs and reject SSRF-style input", () => {
  assert.equal(linkedinUsername("https://www.linkedin.com/in/simonsinek/"), "simonsinek");
  assert.equal(instagramUsername("https://www.instagram.com/garyvee/"), "garyvee");
  for (const bad of ["http://localhost:3000/in/x", "https://evil.com/?u=linkedin.com/in/abc", "https://linkedin.com.evil.com/in/abc", "https://169.254.169.254/", "https://www.linkedin.com/in/a/../../x", 5 as any])
    assert.equal(linkedinUsername(bad), null, String(bad));
  assert.equal(instagramUsername("https://instagram.com.evil.com/x"), null);
  assert.equal(instagramUsername("https://www.instagram.com/" + "a".repeat(40)), null);
});

test("cleanProfile rejects junk and truncates oversized fields", () => {
  assert.equal(cleanProfile(null), null);
  assert.equal(cleanProfile({ name: "" }), null);
  const p = cleanProfile({ name: "A", summary: "x".repeat(99999), hobbies: Array(100).fill("h"), confidence: "bogus" })!;
  assert.equal(p.summary.length, 1200);
  assert.equal(p.hobbies.length, 12);
  assert.equal(p.confidence, "low");
  assert.deepEqual(p.needs, []);
});

test("clamp bounds numbers and falls back for non-numbers", () => {
  assert.equal(clamp(99, 1, 4, 3), 4);
  assert.equal(clamp("x", 1, 4, 3), 3);
  assert.equal(clamp(NaN, 1, 4, 3), 3);
});

test("rateLimit blocks after the per-hour quota for one IP only", () => {
  const mk = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": ip } });
  let blocked = 0;
  for (let i = 0; i < 70; i++) if (rateLimit(mk("9.9.9.9"), "scrape")) blocked++;
  assert.equal(blocked, 10); // limit is 60
  assert.equal(rateLimit(mk("8.8.8.8"), "scrape"), null);
});

test("extractJSON handles fences, trailing objects and braces inside strings", () => {
  assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('{"a":"x}y"} {"b":2}'), { a: "x}y" });
  assert.deepEqual(extractJSON('Here: {"picks":[{"id":"p1"}]}\nHope this helps }'), { picks: [{ id: "p1" }] });
  assert.throws(() => extractJSON("{broken"));
});

import { compactInstagram, compactLinkedIn } from "../lib/scrape-compact.ts";

test("compactLinkedIn keeps substance, drops urls/logos/emails", () => {
  const item = { basic_info: { fullname: "Test Person", headline: "Engineer", about: "I build things and love climbing.", profile_picture_url: "https://media.licdn.com/" + "x".repeat(200), email: { address: "a@b.c" }, follower_count: 10 },
    experience: [{ title: "Staff Engineer", company: "Acme", duration: "3 yrs", company_logo_url: "https://cdn/" + "y".repeat(100) }], education: [{ school: "MIT", field_of_study: "CS" }] };
  const t = compactLinkedIn(item);
  assert.ok(t.includes("love climbing") && t.includes("Staff Engineer") && t.includes("MIT"));
  assert.ok(!/https?:/.test(t) && !t.includes("a@b.c") && !t.includes("logo"));
});

test("compactInstagram keeps captions/hashtags/places, drops related profiles and cdn urls, caps size", () => {
  const post = (i: number) => ({ type: "Image", caption: `caption ${i} ` + "z".repeat(900), hashtags: ["trail"], locationName: "Lisbon", timestamp: "2024-05-01T10:00:00.000Z", displayUrl: "https://scontent.cdninstagram.com/" + "q".repeat(300), taggedUsers: [{ username: "friend", profile_pic_url: "https://x/" + "p".repeat(200) }] });
  const item = { username: "u", biography: "bio here", followersCount: 5, relatedProfiles: [{ username: "someone_else", full_name: "Someone Else" }], latestPosts: Array.from({ length: 30 }, (_, i) => post(i)) };
  const t = compactInstagram(item);
  assert.ok(t.includes("bio here") && t.includes("Lisbon") && t.includes("trail") && t.includes("friend"));
  assert.ok(!t.includes("someone_else") && !/cdninstagram/.test(t) && t.length <= 12000);
  assert.equal((t.match(/"caption"/g) ?? []).length, 12);
  assert.ok(t.includes("2024-05-01") && !t.includes("T10:00"));
});

test("compact functions tolerate empty/odd input", () => {
  assert.equal(compactLinkedIn(null), "");
  assert.equal(compactInstagram(undefined), "");
  assert.equal(compactInstagram({}), "{}");
});
