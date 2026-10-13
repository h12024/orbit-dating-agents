// Independent validation of a demo file before publishing. Exit 0 only if everything holds. Usage: node scripts/validate-demo.mjs public/demo.json [expectedPeople]
import fs from "node:fs";
const [, , file = "public/demo.json", expect = "25"] = process.argv;
const d = JSON.parse(fs.readFileSync(file, "utf8")), raw = fs.readFileSync(file, "utf8");
const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
const { meta, people, dates, shortlists } = d;
ok(meta?.kind === "live" && meta.provider === "gemini", `meta.kind/provider = ${meta?.kind}/${meta?.provider}`);
ok(meta?.errors === 0 && meta?.failed === 0, `meta errors=${meta?.errors} failed=${meta?.failed}`);
ok(!/\[FIXTURE\]|\[STUB\]|SYNTHETIC/i.test(raw), "contains fixture/stub markers");
ok(people.length >= Number(expect), `people ${people.length} < ${expect}`);
const ids = new Set(people.map((p) => p.id)); ok(ids.size === people.length, "duplicate person ids");
const li = new Set(), ig = new Set();
for (const p of people) {
  ok(p.status === "ready" && p.profile, `${p.id} not ready`);
  ok(/^apify:linkedin/.test(p.scraped?.linkedin?.source ?? "") && p.scraped.linkedin.text.length > 300, `${p.id} LinkedIn not real apify data (${p.scraped?.linkedin?.source}, ${p.scraped?.linkedin?.text?.length})`);
  ok(/^apify:instagram/.test(p.scraped?.instagram?.source ?? "") && p.scraped.instagram.text.length > 300, `${p.id} Instagram not real apify data (${p.scraped?.instagram?.source}, ${p.scraped?.instagram?.text?.length})`);
  const pr = p.profile ?? {}; ok(pr.name && pr.needs?.length >= 2 && pr.evidence?.length >= 3 && ((pr.hobbies?.length ?? 0) + (pr.interests?.length ?? 0) + (pr.values?.length ?? 0)) > 0, `${p.id} (${pr.name}) thin profile`);
  ok(pr.confidence !== "low", `${p.id} (${pr.name}) confidence=${pr.confidence}`);
  li.add(p.linkedin); ig.add(p.instagram);
}
ok(li.size === people.length && ig.size === people.length, "duplicate profile URLs");
const seen = new Set(), texts = new Set(); let turns = 0;
for (const x of dates) {
  const key = [x.a, x.b].sort().join("|"); ok(!seen.has(key), `duplicate date ${key}`); seen.add(key);
  ok(ids.has(x.a) && ids.has(x.b) && x.a !== x.b, `date ${x.id} bad ids`);
  ok(x.turns.length >= 4 && x.turns.every((t, i) => t.speaker === (i % 2 ? "b" : "a") && t.text.length > 40), `date ${x.id} malformed turns`);
  for (const t of x.turns) { texts.add(t.text); turns++; }
  for (const v of [x.verdictA, x.verdictB]) ok(Number.isInteger(v.score) && v.score >= 0 && v.score <= 100 && v.reason?.length > 40 && Array.isArray(v.friction) && typeof v.would_see_again === "boolean", `date ${x.id} bad verdict`);
}
ok(texts.size === turns, `repeated turn text (${texts.size}/${turns} unique)`);
for (const p of people) ok((shortlists[p.id] ?? []).length > 0, `${p.id} has no shortlist`);
const sc = dates.flatMap((x) => [x.verdictA.score, x.verdictB.score]);
const avgLen = Math.round([...texts].reduce((a, t) => a + t.length, 0) / texts.size);
ok(!/(apify_api_|AIza[0-9A-Za-z_-]{30}|AQ\.[A-Za-z0-9_-]{30,}|sk-ant-|"email"\s*:\s*"[^"]+@)/.test(raw), "secret/email-like string in file");
ok(!/https?:\/\/[^"\s]*(fbcdn|cdninstagram|licdn)/.test(raw.replace(/"avatar":\s*"[^"]*"/g, "")), "signed cdn url in text");
console.log(`people ${people.length} | dates ${dates.length} | turns ${turns} (${texts.size} unique, avg ${avgLen} chars) | scores min/avg/max ${Math.min(...sc)}/${Math.round(sc.reduce((a, b) => a + b, 0) / sc.length)}/${Math.max(...sc)} | confidence: ${JSON.stringify(people.reduce((m, p) => ((m[p.profile.confidence] = (m[p.profile.confidence] ?? 0) + 1), m), {}))}`);
console.log(`both-agree-to-see-again ${dates.filter((x) => x.verdictA.would_see_again && x.verdictB.would_see_again).length} | disagreements>=30pts ${dates.filter((x) => Math.abs(x.verdictA.score - x.verdictB.score) >= 30).length} | models ${JSON.stringify(meta.models)}`);
if (bad.length) { console.log(`\nVALIDATION FAILED (${bad.length}):`); bad.slice(0, 25).forEach((b) => console.log(" -", b)); process.exit(1); }
console.log("\nVALIDATION PASSED");
