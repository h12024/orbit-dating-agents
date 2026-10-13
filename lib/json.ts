// Pulls the first parseable JSON object out of model text (tolerates prose, code fences, trailing extra objects/braces).
export function extractJSON<T>(text: string): T {
  const t = text.trim();
  try { const v = JSON.parse(t); if (v && typeof v === "object") return v as T; } catch {}
  for (let start = t.indexOf("{"); start >= 0; start = t.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)) as T; } catch { break; } }
    }
  }
  throw new Error("Model returned no JSON");
}
