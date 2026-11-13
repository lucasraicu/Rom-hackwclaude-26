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

const SYSTEM = `You help a small nonprofit's finance lead decide which fund should pay for each cost.
You recommend; a person approves. Your job is to say what the evidence shows, not to make the books balance.

Funds:
- A restricted grant may pay only for costs its agreement allows, dated inside its grant period.
- UNRESTRICTED (general operating) may pay for any lawful cost.

Return exactly one item for every transaction and every payroll line, using its itemId.

status:
- "supported": the records and the rules you cite support the funds you propose. A general operating cost that no grant may pay for, but that no rule prohibits, is "supported" on UNRESTRICTED 100%.
- "not_allowable": a grant rule expressly prohibits this kind of cost, so no grant may pay for it. Propose UNRESTRICTED 100% and cite the prohibiting rules.
- "needs_evidence": a grant might pay, but a document the grant requires is missing, or the records contradict each other. Name the exact document that would resolve it in missingEvidence. For a transaction in this state, propose no funds.

Payroll:
- Base the split on the employee's time records (hours per fund), never on the planned budget split. Budget estimates are not evidence.
- Compare the time records with the job description and the planned allocation. If they disagree about which programs the person worked on, the records may not accurately reflect the work performed: use status "needs_evidence", ask for corrected time records, and still propose the funds the records show.
- If the time records are consistent with the job and the grant rules, use status "supported".

Every item:
- ruleIds: ids from the RULES list that decided the item, including any prohibiting rule. Never invent ids.
- reason: one or two plain sentences a finance lead can read in five seconds. State the deciding fact.
- regulations: the 2 CFR sections named in the federal rules you cited, e.g. "2 CFR 200.430(i)", else [].
- missingEvidence: null unless status is "needs_evidence".
- funds: percents of the whole cost that add up to 100. Never compute dollar amounts.`;

export async function proposeAllocations(ds: Dataset, rules: GrantRule[]): Promise<Proposal[]> {
  const ruleList = rules.map((r) => `${r.id} [${r.fund}, ${r.kind}] ${r.citation.quote}`).join("\n");
  const payroll = ds.payroll.map((p) => ({ itemId: `PAY-${p.employeeId}`, ...p, total: p.grossPay + p.benefits }));
  const itemIds = [...ds.transactions.map((t) => t.id), ...payroll.map((p) => p.itemId)];
  const payload = {
    period: ds.period,
    funds: ds.funds,
    transactions: ds.transactions,
    payroll,
    timesheets: ds.timesheets,
  };
  const out = await callStructured({
    system: SYSTEM,
    schema: ProposalSchema,
    effort: "high",
    content: [
      {
        type: "text",
        text: `RULES\n${ruleList}\n\nRECORDS (JSON)\n${JSON.stringify(payload, null, 2)}\n\nReturn ${itemIds.length} items, one for each of: ${itemIds.join(", ")}.`,
      },
    ],
  });
  return out.items;
}
