// AI lane owns this file. Runs the whole analysis:
// load records -> grant rules (cache or Claude) -> Claude proposals -> code checks and computes $ -> verify quotes -> summary.
import fs from "node:fs/promises";
import path from "node:path";
import { loadDataset } from "./data/loadDataset";
import { percentsFromTimesheets, splitByPercent } from "./data/computeSplits";
import { verifyCitation } from "./data/verifyCitations";
import { summarize } from "./data/summarize";
import { extractRulesForFund } from "./ai/extractRules";
import { proposeAllocations, type Proposal } from "./ai/proposeAllocations";
import { FUND_CODES, type Allocation, type AnalysisResult, type Dataset, type FundCode, type GrantRule } from "./types";

const RULES_CACHE = path.join(process.cwd(), "data", "cache", "grant-rules.json");

/** Grant rules rarely change, so they are cached after the first good run. Delete the file to re-extract. */
async function getRules(ds: Dataset): Promise<GrantRule[]> {
  try {
    const cached: GrantRule[] = JSON.parse(await fs.readFile(RULES_CACHE, "utf8"));
    return cached.map((r) => ({ ...r, citation: verifyCitation(r.citation, ds.grantDocs) }));
  } catch {
    const perFund = await Promise.all(ds.funds.map(extractRulesForFund));
    const rules = perFund.flat().map((r) => ({ ...r, citation: verifyCitation(r.citation, ds.grantDocs) }));
    const ok = rules.filter((r) => r.citation.verified).length;
    console.log(`[fundproof] extracted ${rules.length} grant rules, ${ok} quotes verified against the PDFs`);
    await fs.mkdir(path.dirname(RULES_CACHE), { recursive: true });
    await fs.writeFile(RULES_CACHE, JSON.stringify(rules, null, 2));
    return rules;
  }
}

type Item = {
  itemId: string;
  itemType: "transaction" | "payroll";
  label: string;
  description: string;
  amount: number;
  date?: string;
  employeeId?: string;
};

type Parts = { fund: FundCode; percent: number }[];

const needsEvidence = (reason: string, missingEvidence: string) => ({
  status: "needs_evidence" as const,
  parts: [] as Parts,
  reason,
  missingEvidence,
});

/**
 * Code has the last word on every split. Claude picks status, funds and reason;
 * this function enforces the rules no prompt can be trusted to follow every time.
 */
function decide(item: Item, p: Proposal, ds: Dataset) {
  const status = p.status;
  const reason = p.reason;
  let missingEvidence = p.missingEvidence ?? undefined;
  let parts: Parts = p.funds
    .filter((f) => (FUND_CODES as string[]).includes(f.fund) && f.percent > 0)
    .map((f) => ({ fund: f.fund as FundCode, percent: f.percent }));

  if (status === "not_allowable") {
    // No grant may pay: the only home for it is unrestricted money.
    return { status, parts: [{ fund: "UNRESTRICTED" as FundCode, percent: 100 }], reason, missingEvidence: undefined };
  }

  if (item.itemType === "payroll") {
    // Payroll percents come from hours in the time records, computed in code, never from Claude or the budget.
    const fromHours = percentsFromTimesheets(item.employeeId!, ds.timesheets);
    if (!fromHours.length) {
      return needsEvidence(reason, missingEvidence ?? `Time records for ${item.label} for ${ds.period}.`);
    }
    parts = fromHours;
  } else if (status === "needs_evidence") {
    // An unproven transaction is not allocated to any fund until the missing document arrives.
    return { status, parts: [] as Parts, reason, missingEvidence };
  }

  if (status === "supported") {
    const total = parts.reduce((s, f) => s + f.percent, 0);
    if (!parts.length || Math.abs(total - 100) > 0.05) {
      return needsEvidence(
        `${reason} (Held for review: the proposed split adds up to ${total}%, not 100%.)`,
        "A reviewer's decision on how to split this cost.",
      );
    }
    // A grant can only pay for costs dated inside its period.
    for (const f of parts) {
      const fund = ds.funds.find((x) => x.code === f.fund);
      const date = item.date ?? `${ds.period}-01`;
      if (fund?.periodStart && fund.periodEnd && (date < fund.periodStart || date > fund.periodEnd)) {
        return needsEvidence(
          `${reason} (Held for review: ${date} is outside the ${fund.code} grant period ${fund.periodStart} to ${fund.periodEnd}.)`,
          `Written approval from the ${fund.name} funder to charge a cost outside the grant period.`,
        );
      }
    }
    missingEvidence = undefined;
  }

  return { status, parts, reason, missingEvidence };
}

export async function runAnalysis(opts: { timesheetsCsv?: string } = {}): Promise<AnalysisResult> {
  const ds = await loadDataset(opts);
  const rules = await getRules(ds);
  const proposals = await proposeAllocations(ds, rules);
  return buildResult(ds, rules, proposals);
}

/** Pure step after Claude: checks proposals, computes every dollar, verifies quotes. No API calls. */
export function buildResult(ds: Dataset, rules: GrantRule[], proposals: Proposal[]): AnalysisResult {
  const byId = new Map(proposals.map((p) => [p.itemId, p]));

  const items: Item[] = [
    ...ds.transactions.map((t) => ({
      itemId: t.id,
      itemType: "transaction" as const,
      label: t.vendor,
      description: t.description,
      amount: t.amount,
      date: t.date,
    })),
    ...ds.payroll.map((p) => ({
      itemId: `PAY-${p.employeeId}`,
      itemType: "payroll" as const,
      label: p.name,
      description: `${p.title}, ${p.period} payroll`,
      amount: Math.round((p.grossPay + p.benefits) * 100) / 100,
      employeeId: p.employeeId,
    })),
  ];

  const allocations: Allocation[] = items.map((item) => {
    const base = {
      itemId: item.itemId,
      itemType: item.itemType,
      label: item.label,
      description: item.description,
      amount: item.amount,
    };
    const p = byId.get(item.itemId);
    if (!p) {
      return {
        ...base,
        status: "needs_evidence",
        splits: [],
        reason: "Claude returned no proposal for this item, so it is held for a person to review.",
        citations: [],
        missingEvidence: "A reviewer's decision on this item.",
      };
    }
    const d = decide(item, p, ds);
    // Only rule ids that exist are cited; each quote is re-checked against the PDF text.
    const citations = [...new Set(p.ruleIds)]
      .map((id) => rules.find((r) => r.id === id)?.citation)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => verifyCitation(c, ds.grantDocs));
    return {
      ...base,
      status: d.status,
      splits: d.parts.length ? splitByPercent(item.amount, d.parts) : [],
      reason: d.reason,
      citations,
      ...(d.missingEvidence ? { missingEvidence: d.missingEvidence } : {}),
      ...(p.regulations.length ? { regulations: p.regulations } : {}),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: "live",
    org: ds.org,
    period: ds.period,
    funds: ds.funds,
    rules,
    allocations,
    summary: summarize(allocations),
  };
}
