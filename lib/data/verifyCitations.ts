// DATA lane. Checks every quote Claude cites against the actual PDF text.
// This is the answer to "what if it hallucinates?" in the demo.
import type { Citation, GrantDoc } from "../types";

const norm = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/** Returns a copy with verified set. If the quote is on a different page, the page is corrected. */
export function verifyCitation(c: Citation, docs: GrantDoc[]): Citation {
  const doc = docs.find((d) => d.file === c.sourceDoc);
  if (!doc) return { ...c, verified: false };
  const q = norm(c.quote);
  if (norm(doc.pages[c.page - 1] ?? "").includes(q)) return { ...c, verified: true };
  const idx = doc.pages.findIndex((p) => norm(p).includes(q));
  return idx >= 0 ? { ...c, page: idx + 1, verified: true } : { ...c, verified: false };
}
