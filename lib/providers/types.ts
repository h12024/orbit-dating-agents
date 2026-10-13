export type Role = "analyze" | "date" | "verdict";
export type CallOpts = {
  role: Role;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
};
// kind "daily": the free-tier daily quota is gone (retrying today is pointless). kind "rate": per-minute/token limit (retry later).
export class QuotaError extends Error {
  kind: "daily" | "rate";
  constructor(message: string, kind: "daily" | "rate") { super(message); this.name = "QuotaError"; this.kind = kind; }
}
