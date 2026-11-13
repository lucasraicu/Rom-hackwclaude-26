// AI lane. Step 1: read each grant agreement PDF and pull out its rules with exact quotes.
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { callStructured, pdfBlock } from "./claude";
import { INPUTS_DIR } from "../data/loadDataset";
import type { Fund, GrantRule } from "../types";

const RuleSchema = z.object({
  rules: z.array(
    z.object({
      kind: z.enum(["allowed", "disallowed", "documentation", "allocation"]),
      summary: z.string(),
      page: z.number().int(),
      quote: z.string(),
    }),
  ),
});

const SYSTEM = `You read grant agreements for a small nonprofit's finance team.
Extract every rule that decides whether a cost can be charged to this grant:
what is allowed, what is not allowed, what documentation is required, and how shared costs must be allocated.
For each rule, copy the sentence from the document exactly, character for character, into "quote", and give its 1-based page number.
Do not paraphrase inside "quote". "summary" is one plain sentence in your own words.`;

export async function extractRulesForFund(fund: Fund): Promise<GrantRule[]> {
  if (!fund.sourceDoc) return [];
  const b64 = (await fs.readFile(path.join(INPUTS_DIR, fund.sourceDoc))).toString("base64");
  const out = await callStructured({
    system: SYSTEM,
    schema: RuleSchema,
    content: [pdfBlock(b64, fund.sourceDoc), { type: "text", text: `This is the agreement for fund ${fund.code} (${fund.name}). Extract its rules.` }],
  });
  const prefix = fund.code === "GRANT-FED" ? "FED" : "FDN";
  return out.rules.map((r, i) => ({
    id: `${prefix}-R${i + 1}`,
    fund: fund.code,
    kind: r.kind,
    summary: r.summary,
    citation: { sourceDoc: fund.sourceDoc!, page: r.page, quote: r.quote, verified: null },
  }));
}
