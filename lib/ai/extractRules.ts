// AI lane. Step 1: read each grant agreement PDF and pull out its rules with exact quotes.
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { callStructured, pdfBlock } from "./claude";
import { INPUTS_DIR } from "../data/loadDataset";
import type { Fund, GrantRule } from "../types";

export const RuleSchema = z.object({
  rules: z.array(
    z.object({
      kind: z.enum(["allowed", "disallowed", "documentation", "allocation"]),
      summary: z.string(),
      page: z.number().int(),
      quote: z.string(),
    }),
  ),
});

export const RULES_SYSTEM = `You read grant agreements for a small nonprofit's finance team.
Extract every rule that decides whether a cost can be charged to this grant:
what is allowed, what is not allowed, what documentation is required, and how shared costs must be allocated.
Make one rule per numbered clause; do not merge clauses or skip any that bear on charging costs.
For each rule, copy the clause text from the document exactly, character for character, into "quote", and give its 1-based page number.
Do not paraphrase, shorten with ellipses, or fix typos inside "quote"; code checks every quote against the PDF text.
"summary" is one plain sentence in your own words.`;

export async function extractRulesForFund(fund: Fund): Promise<GrantRule[]> {
  if (!fund.sourceDoc) return [];
  const b64 = (await fs.readFile(path.join(INPUTS_DIR, fund.sourceDoc))).toString("base64");
  const out = await callStructured({
    system: RULES_SYSTEM,
    schema: RuleSchema,
    content: [pdfBlock(b64, fund.sourceDoc), { type: "text", text: rulesUserText(fund) }],
  });
  return toGrantRules(fund, out);
}

export const rulesUserText = (fund: Fund) => `This is the agreement for fund ${fund.code} (${fund.name}). Extract its rules.`;

/** Turns Claude's rule list into GrantRules with stable ids. Quotes stay unverified until code checks them. */
export function toGrantRules(fund: Fund, out: z.infer<typeof RuleSchema>): GrantRule[] {
  const prefix = fund.code === "GRANT-FED" ? "FED" : "FDN";
  return out.rules.map((r, i) => ({
    id: `${prefix}-R${i + 1}`,
    fund: fund.code,
    kind: r.kind,
    summary: r.summary,
    citation: { sourceDoc: fund.sourceDoc!, page: r.page, quote: r.quote, verified: null },
  }));
}
