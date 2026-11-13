// AI lane. Step 2: decide a status, funds and reason for every transaction and payroll line.
// Claude cites rules by id; code attaches the quotes and computes every dollar amount.
import { z } from "zod";
import { callStructured } from "./claude";
import { FUND_CODES, type Dataset, type GrantRule } from "../types";

const ProposalSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(), // "T-001" or "PAY-E-01"
      status: z.enum(["supported", "needs_evidence", "not_allowable"]),
      funds: z.array(z.object({ fund: z.enum(FUND_CODES as [string, ...string[]]), percent: z.number() })),
      reason: z.string(),
      ruleIds: z.array(z.string()),
      missingEvidence: z.string().nullable(),
      regulations: z.array(z.string()),
    }),
  ),
});
export type Proposal = z.infer<typeof ProposalSchema>["items"][number];

const SYSTEM = `You help a small nonprofit's finance lead decide which fund pays for each cost.
You recommend; a person approves. Never guess to make the books balance.

For every transaction and payroll line, return:
- status "supported": the evidence and the grant rules support the funds you propose.
- status "not_allowable": no grant may pay for it under the rules; propose UNRESTRICTED 100%.
- status "needs_evidence": a grant might pay, but the records don't prove it. Say exactly what document would resolve it in missingEvidence. If part of the cost is supported, propose only that part's funds.
- funds: percents that add up to 100. For payroll, use the employee's time records, never the planned budget split. Budget estimates are not evidence.
- ruleIds: the ids of the rules you relied on, from the rules list.
- reason: one or two plain sentences a finance lead can read in five seconds.
- regulations: 2 CFR references when a federal rule applies, else [].`;

export async function proposeAllocations(ds: Dataset, rules: GrantRule[]): Promise<Proposal[]> {
  const ruleList = rules.map((r) => `${r.id} [${r.fund}, ${r.kind}] ${r.citation.quote}`).join("\n");
  const payload = {
    funds: ds.funds,
    transactions: ds.transactions,
    payroll: ds.payroll.map((p) => ({ itemId: `PAY-${p.employeeId}`, ...p, total: p.grossPay + p.benefits })),
    timesheets: ds.timesheets,
  };
  const out = await callStructured({
    system: SYSTEM,
    schema: ProposalSchema,
    effort: "medium",
    content: [{ type: "text", text: `RULES\n${ruleList}\n\nRECORDS (JSON)\n${JSON.stringify(payload, null, 2)}` }],
  });
  return out.items;
}
