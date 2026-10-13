// DEV-ONLY: LLM_MODE=fixture. Deterministic synthetic output so the UI/pipeline can be exercised without an
// Anthropic key. Everything it returns is stamped [FIXTURE]; the UI shows a banner. Never real agent activity.
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const isFixture = () => process.env.LLM_MODE === "fixture";

const LINES = ["Hi! I'm glad we finally got to sit down. What does a perfect Sunday look like for you?", "That sounds lovely. For me it's slow mornings and something outdoors. Do you travel much?", "I try to. Honestly I care a lot about someone who's curious and kind. How do you handle disagreements?", "Calmly, I hope. I'd rather talk it through than let it sit. What are you working toward right now?", "Building something I'm proud of, and making room for a real relationship alongside it.", "I'd like that. Let's keep talking over dinner next week."];
export function fixtureText(system: string, turn: number): string {
  return `[FIXTURE] ${LINES[(hash(system) + turn) % LINES.length]}`;
}
const HOBBIES = ["trail running", "pottery", "chess", "cooking", "photography", "climbing", "salsa dancing", "board games", "gardening", "cycling", "baking", "film photography"];
const VALUES = ["curiosity", "kindness", "ambition", "family", "honesty", "adventure", "stability", "creativity"];

export function fixtureJSON(system: string, user: string): any {
  if (system.startsWith("You are a perceptive")) {
    const slug = user.match(/linkedin\.com\/in\/([^/\s)]+)/)?.[1] ?? "unknown";
    const name = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const h = hash(slug), pick = (a: string[], n: number) => Array.from({ length: n }, (_, i) => `[FIXTURE] ${a[(h + i * 5) % a.length]}`);
    return { name: `${name} [FIXTURE]`, headline: "[FIXTURE] synthetic headline", location: "n/a", summary: "[FIXTURE] No model was called; this profile is synthetic.",
      needs: pick(VALUES, 2).map((v) => v + " in a partner"), hobbies: pick(HOBBIES, 3), interests: pick(HOBBIES.slice().reverse(), 2), values: pick(VALUES, 3), personality: ["[FIXTURE] trait"],
      communication_style: "[FIXTURE]", lifestyle: "[FIXTURE]", dealbreakers: ["[FIXTURE]"], looking_for: "[FIXTURE]", evidence: ["[FIXTURE] none"], confidence: "low" };
  }
  if (system.startsWith("You are a matchmaker")) {
    const ids = [...user.matchAll(/^\[(p\d+)\]/gm)].map((m) => m[1]);
    return { picks: ids.map((id) => ({ id, score: 40 + (hash(user.slice(0, 40) + id) % 55), why: "[FIXTURE] synthetic triage" })).sort((a, b) => b.score - a.score) };
  }
  const s = 30 + (hash(user) % 65);
  return { score: s, chemistry: "[FIXTURE] synthetic", needs_met: ["[FIXTURE]"], friction: ["[FIXTURE]"], would_see_again: s > 55, reason: "[FIXTURE] synthetic verdict, no model was called." };
}
