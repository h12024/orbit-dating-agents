import type { DateResult, Person, Shortlist } from "./types";

export type Stage = "idle" | "profiles" | "triage" | "dating" | "done";
export type Hooks = {
  people?: (p: Person[]) => void;
  dates?: (d: DateResult[]) => void;
  shortlists?: (s: Record<string, Shortlist>) => void;
  stage?: (s: Stage) => void;
  plan?: (totalDates: number) => void;
  log?: (m: string) => void;
};
export type Options = { base?: string; k?: number; rounds?: number; concurrency?: number; resume?: RunResult };
export type RunResult = { people: Person[]; dates: DateResult[]; shortlists: Record<string, Shortlist>; halted?: string; errors?: number };

// Daily provider quota is gone: stop scheduling work and return what we have so the run can be resumed after the reset.
class Halt extends Error {}

const opts_retryMs = () => Number((globalThis as any).process?.env?.PIPELINE_RETRY_MS) || 4000;
async function post<T>(base: string, url: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(base + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (j.code === "quota_exhausted") throw new Halt(j.error);                       // real quota/credit exhaustion: stop now, resume later
    if (r.status === 429 && attempt < 4) { await new Promise((res) => setTimeout(res, (opts_retryMs()) * (attempt + 1))); continue; } // congestion / per-minute limits: back off and retry
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, stop: () => boolean = () => false) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !stop()) await fn(items[i++]); }));
}

// read -> triage -> date -> (rank is pure, see rank.ts). Same code runs in the browser and in scripts/run-cohort.mjs.
export async function runPipeline(rows: { linkedin: string; instagram: string }[], opts: Options = {}, h: Hooks = {}): Promise<RunResult> {
  const base = opts.base ?? "", K = opts.k ?? 4, rounds = opts.rounds ?? 3, conc = opts.concurrency ?? 4;
  const say = (m: string) => h.log?.(m);
  let halted = "", errors = 0;
  const done = opts.resume?.people ?? [];
  // Resume keeps already-analysed people (matched by LinkedIn URL) so a quota-limited run can continue next day.
  let people: Person[] = rows.map((r, i) => done.find((d) => d.linkedin === r.linkedin && d.status === "ready") ?? ({ id: `p${i + 1}`, linkedin: r.linkedin, instagram: r.instagram, status: "queued" } as Person));
  people = people.map((p, i) => ({ ...p, id: `p${i + 1}` }));
  const idMap = Object.fromEntries(done.map((d) => [d.id, people.find((p) => p.linkedin === d.linkedin)?.id]));
  const patch = (id: string, p: Partial<Person>) => { people = people.map((x) => (x.id === id ? { ...x, ...p } : x)); h.people?.(people); };
  h.people?.(people); h.stage?.("profiles");

  // Scrapers (Apify free plan) cannot run many actors at once, so profile reading uses lower concurrency than the later stages.
  await pool(people.filter((p) => p.status !== "ready"), Math.min(conc, 2), async (p) => {
    try {
      patch(p.id, { status: "scraping" }); say(`Scraping LinkedIn + Instagram for ${p.id}...`);
      const scraped = await post<Person["scraped"]>(base, "/api/scrape", { linkedin: p.linkedin, instagram: p.instagram });
      patch(p.id, { status: "analyzing", scraped, avatar: scraped!.instagram.avatar });
      say(`Agent ${p.id} reading LinkedIn [${scraped!.linkedin.source}] + Instagram [${scraped!.instagram.source}]...`);
      const { profile } = await post<{ profile: Person["profile"] }>(base, "/api/analyze", { scraped, linkedin: p.linkedin, instagram: p.instagram });
      patch(p.id, { status: "ready", profile }); say(`Profile ready: ${profile!.name} (confidence: ${profile!.confidence})`);
    } catch (e: any) {
      if (e instanceof Halt) { halted = e.message; patch(p.id, { status: "queued" }); say(`HALT: ${e.message}`); return; }
      patch(p.id, { status: "failed", error: e.message }); say(`FAILED ${p.id}: ${e.message}`);
    }
  }, () => !!halted);

  const good = people.filter((p) => p.status === "ready");
  const shortlists: Record<string, Shortlist> = {};
  for (const [oldId, picks] of Object.entries(opts.resume?.shortlists ?? {})) {
    const me = idMap[oldId]; const mapped = picks.map((x) => ({ ...x, id: idMap[x.id] as string })).filter((x) => x.id);
    if (me && mapped.length) shortlists[me] = mapped;
  }
  let dates: DateResult[] = [];
  for (const d of opts.resume?.dates ?? []) { const a = idMap[d.a], b = idMap[d.b]; if (a && b) dates.push({ ...d, id: `${a}-${b}`, a, b }); }
  if (halted || good.length < 2) { h.stage?.("done"); say(halted ? "Stopped: provider quota exhausted. Re-run with resume after the quota resets." : "Need at least 2 analyzed people to date."); return { people, dates, shortlists, halted: halted || undefined }; }

  h.stage?.("triage"); say("Each agent is scanning the pool and picking who to meet...");
  // Small pools: with K or fewer other people, triage would pick everyone anyway, so everyone dates everyone (no model call needed).
  for (const p of good) {
    const others = good.filter((o) => o.id !== p.id);
    if (!shortlists[p.id] && others.length <= K) {
      shortlists[p.id] = others.map((o) => ({ id: o.id, score: 50, why: "Small pool: every agent dates every other agent." }));
      say(`${p.profile!.name} meets everyone (small pool): ${others.map((o) => o.profile!.name).join(", ")}`);
    }
  }
  h.shortlists?.({ ...shortlists });
  await pool(good.filter((p) => !shortlists[p.id]), conc, async (p) => {
    try {
      const { picks } = await post<{ picks: Shortlist }>(base, "/api/shortlist", { me: p.profile, others: good.filter((o) => o.id !== p.id).map((o) => ({ id: o.id, profile: o.profile })), k: K });
      if (!picks.length) throw new Error("triage returned no valid picks");
      shortlists[p.id] = picks; h.shortlists?.({ ...shortlists });
      say(`${p.profile!.name} wants to meet: ${picks.map((x) => good.find((q) => q.id === x.id)?.profile?.name).join(", ")}`);
    } catch (e: any) {
      if (e instanceof Halt) { halted = e.message; say(`HALT: ${e.message}`); return; }
      // Triage failed or came back empty: still give this person dates (the next K profiles in the list), and say so plainly.
      const i = good.findIndex((q) => q.id === p.id), others = Array.from({ length: Math.min(K, good.length - 1) }, (_, n) => good[(i + 1 + n) % good.length]);
      shortlists[p.id] = others.map((o) => ({ id: o.id, score: 40, why: "Fallback pairing: triage returned no usable picks." })); h.shortlists?.({ ...shortlists });
      say(`Triage gave no picks for ${p.profile!.name} (${e.message}); pairing with ${others.map((o) => o.profile!.name).join(", ")} instead.`);
    }
  }, () => !!halted);

  const pairs = new Map<string, [string, string]>();
  for (const [a, picks] of Object.entries(shortlists)) for (const pk of picks) { const key = [a, pk.id].sort().join("|"); if (!pairs.has(key)) pairs.set(key, [a, pk.id]); }
  const have = new Set(dates.map((d) => [d.a, d.b].sort().join("|")));
  const list = [...pairs.values()].filter(([a, b]) => !have.has([a, b].sort().join("|")));
  h.dates?.(dates); h.plan?.(list.length + dates.length); h.stage?.("dating"); say(`${list.length} dates to run (${dates.length} already done).`);
  await pool(list, Math.max(conc, 5), async ([a, b]) => {
    const pa = good.find((p) => p.id === a)!.profile!, pb = good.find((p) => p.id === b)!.profile!;
    try {
      const r = await post<Omit<DateResult, "id" | "a" | "b">>(base, "/api/date", { a: pa, b: pb, rounds });
      dates = [...dates, { id: `${a}-${b}`, a, b, ...r }]; h.dates?.(dates);
      say(`Date done: ${pa.name} x ${pb.name} -> ${r.verdictA.score}/${r.verdictB.score}`);
    } catch (e: any) { if (e instanceof Halt) { halted = e.message; say(`HALT: ${e.message}`); return; } errors++; say(`Date failed ${pa.name} x ${pb.name}: ${e.message}`); }
  }, () => !!halted);
  h.stage?.("done"); say(halted ? `Stopped early: ${halted}` : "All dates complete. Rankings ready.");
  return { people, dates, shortlists, halted: halted || undefined, errors };
}
