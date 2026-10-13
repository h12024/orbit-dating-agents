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
export type Options = { base?: string; k?: number; rounds?: number; concurrency?: number };
export type RunResult = { people: Person[]; dates: DateResult[]; shortlists: Record<string, Shortlist> };

async function post<T>(base: string, url: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(base + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429 && attempt < 2) { await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))); continue; }
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// read -> triage -> date -> (rank is pure, see rank.ts). Same code runs in the browser and in scripts/run-cohort.mjs.
export async function runPipeline(rows: { linkedin: string; instagram: string }[], opts: Options = {}, h: Hooks = {}): Promise<RunResult> {
  const base = opts.base ?? "", K = opts.k ?? 4, rounds = opts.rounds ?? 3, conc = opts.concurrency ?? 4;
  const say = (m: string) => h.log?.(m);
  let people: Person[] = rows.map((r, i) => ({ id: `p${i + 1}`, linkedin: r.linkedin, instagram: r.instagram, status: "queued" }));
  const patch = (id: string, p: Partial<Person>) => { people = people.map((x) => (x.id === id ? { ...x, ...p } : x)); h.people?.(people); };
  h.people?.(people); h.stage?.("profiles");

  await pool(people, conc, async (p) => {
    try {
      patch(p.id, { status: "scraping" }); say(`Scraping LinkedIn + Instagram for ${p.id}...`);
      const scraped = await post<Person["scraped"]>(base, "/api/scrape", { linkedin: p.linkedin, instagram: p.instagram });
      patch(p.id, { status: "analyzing", scraped, avatar: scraped!.instagram.avatar });
      say(`Agent ${p.id} reading LinkedIn [${scraped!.linkedin.source}] + Instagram [${scraped!.instagram.source}]...`);
      const { profile } = await post<{ profile: Person["profile"] }>(base, "/api/analyze", { scraped, linkedin: p.linkedin, instagram: p.instagram });
      patch(p.id, { status: "ready", profile }); say(`Profile ready: ${profile!.name} (confidence: ${profile!.confidence})`);
    } catch (e: any) { patch(p.id, { status: "failed", error: e.message }); say(`FAILED ${p.id}: ${e.message}`); }
  });

  const good = people.filter((p) => p.status === "ready");
  const shortlists: Record<string, Shortlist> = {};
  let dates: DateResult[] = [];
  if (good.length < 2) { h.stage?.("done"); say("Need at least 2 analyzed people to date."); return { people, dates, shortlists }; }

  h.stage?.("triage"); say("Each agent is scanning the pool and picking who to meet...");
  await pool(good, conc, async (p) => {
    try {
      const { picks } = await post<{ picks: Shortlist }>(base, "/api/shortlist", { me: p.profile, others: good.filter((o) => o.id !== p.id).map((o) => ({ id: o.id, profile: o.profile })), k: K });
      shortlists[p.id] = picks; h.shortlists?.({ ...shortlists });
      say(`${p.profile!.name} wants to meet: ${picks.map((x) => good.find((q) => q.id === x.id)?.profile?.name).join(", ")}`);
    } catch (e: any) { say(`Triage failed for ${p.id}: ${e.message}`); }
  });

  const pairs = new Map<string, [string, string]>();
  for (const [a, picks] of Object.entries(shortlists)) for (const pk of picks) { const key = [a, pk.id].sort().join("|"); if (!pairs.has(key)) pairs.set(key, [a, pk.id]); }
  const list = [...pairs.values()];
  h.plan?.(list.length); h.stage?.("dating"); say(`${list.length} dates scheduled.`);
  await pool(list, Math.max(conc, 5), async ([a, b]) => {
    const pa = good.find((p) => p.id === a)!.profile!, pb = good.find((p) => p.id === b)!.profile!;
    try {
      const r = await post<Omit<DateResult, "id" | "a" | "b">>(base, "/api/date", { a: pa, b: pb, rounds });
      dates = [...dates, { id: `${a}-${b}`, a, b, ...r }]; h.dates?.(dates);
      say(`Date done: ${pa.name} x ${pb.name} -> ${r.verdictA.score}/${r.verdictB.score}`);
    } catch (e: any) { say(`Date failed ${pa.name} x ${pb.name}: ${e.message}`); }
  });
  h.stage?.("done"); say("All dates complete. Rankings ready.");
  return { people, dates, shortlists };
}
