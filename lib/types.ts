export type Profile = {
  name: string;
  headline: string;
  location: string;
  summary: string;
  needs: string[];
  hobbies: string[];
  interests: string[];
  values: string[];
  personality: string[];
  communication_style: string;
  lifestyle: string;
  dealbreakers: string[];
  looking_for: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
};

export type Scraped = {
  linkedin: { ok: boolean; source: string; text: string; error?: string; quota?: boolean };
  instagram: { ok: boolean; source: string; text: string; avatar?: string; error?: string; quota?: boolean };
};

export type Person = {
  id: string;
  linkedin: string;
  instagram: string;
  status: "queued" | "scraping" | "analyzing" | "ready" | "failed";
  error?: string;
  scraped?: Scraped;
  profile?: Profile;
  avatar?: string;
};

export type Turn = { speaker: "a" | "b"; text: string };

export type Verdict = {
  score: number;
  chemistry: string;
  needs_met: string[];
  friction: string[];
  would_see_again: boolean;
  reason: string;
};

export type DateResult = {
  id: string;
  a: string;
  b: string;
  turns: Turn[];
  verdictA: Verdict;
  verdictB: Verdict;
};

export type Shortlist = { id: string; score: number; why: string }[];

export type RankEntry = {
  id: string;
  score: number;
  dated: boolean;
  mine?: number;
  theirs?: number;
  reason: string;
  dateId?: string;
};
