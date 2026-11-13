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
import { FUND_CODES, type Allocation, type Citation, type AnalysisResult, type Dataset, type FundCode, type GrantRule, type SupportingDoc } from "./types";

const RULES_CACHE = path.join(process.cwd(), "data", "cache", "grant-rules.json");

/** A quote that can't be checked counts as unverified; it never aborts the run. */
function safeVerify(c: Citation, ds: Dataset): Citation {
  try {
    return verifyCitation(c, ds.grantDocs);
  } catch {
    return { ...c, verified: false };
  }
}

/** Grant rules rarely change, so they are cached after the first good run. Delete the file to re-extract. */
async function getRules(ds: Dataset): Promise<GrantRule[]> {
  try {
    const cached: GrantRule[] = JSON.parse(await fs.readFile(RULES_CACHE, "utf8"));
    return cached.map((r) => ({ ...r, citation: safeVerify(r.citation, ds) }));
  } catch {
    const perFund = await Promise.all(ds.funds.map(extractRulesForFund));
    const rules = perFund.flat().map((r) => ({ ...r, citation: safeVerify(r.citation, ds) }));
    const ok = rules.filter((r) => r.citation.verified).length;
    console.log(`[fundproof] extracted ${rules.length} grant rules, ${ok} quotes verified against the PDFs`);
    await fs.mkdir(path.dirname(RULES_CACHE), { recursive: true });
    await fs.writeFile(RULES_CACHE, JSON.stringify(rules, null, 2));
    return rules;
  }
}

/**
 * A "supported" charge to a grant needs proof in code, not just Claude's word:
 * at least one verified quote from that grant's own agreement, and room left in its budget.
 */
function supportProblem(
  splits: { fund: FundCode; amount: number }[],
  cited: { fund: FundCode; citation: Citation }[],
  usedByFund: Map<FundCode, number>,
  ds: Dataset,
): { why: string; missing: string } | null {
  for (const sp of splits) {
    const fund = ds.funds.find((f) => f.code === sp.fund);
    if (!fund || fund.type === "unrestricted") continue;
    if (!cited.some((c) => c.fund === sp.fund && c.citation.verified)) {
      return {
        why: `no verified clause from the ${fund.name} agreement backs the ${sp.fund} charge.`,
        missing: `The clause in the ${fund.name} agreement that allows this cost.`,
      };
    }
    if (fund.budgetRemaining !== undefined) {
      const after = Math.round(((usedByFund.get(sp.fund) ?? 0) + sp.amount) * 100) / 100;
      if (after > fund.budgetRemaining) {
        return {
          why: `charging $${sp.amount.toFixed(2)} would exceed the $${fund.budgetRemaining.toFixed(2)} left in the ${sp.fund} budget.`,
          missing: "A budget amendment or another fund for this cost.",
        };
      }
    }
  }
  return null;
}

const normReg = (s: string) => s.replace(/§\s*/g, "").replace(/\s+/g, " ").trim();

/**
 * Regulation references are shown next to verified quotes, so they get the same treatment:
 * keep one only if an item cites a federal grant rule and the federal agreement's text names it.
 * Never a federal regulation on a foundation-only or unrestricted decision.
 */
function checkedRegulations(refs: string[], ruleIds: string[], rules: GrantRule[], ds: Dataset): string[] {
  const fedCited = rules.some((r) => ruleIds.includes(r.id) && ds.funds.find((f) => f.code === r.fund)?.type === "federal");
  if (!fedCited) return [];
  const fedText = ds.grantDocs
    .filter((d) => ds.funds.find((f) => f.code === d.fund)?.type === "federal")
    .map((d) => normReg(d.pages.join(" ")))
    .join(" ");
  return [...new Set(refs.map(normReg))].filter((r) => r && fedText.includes(r));
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
    if (!parts.length || !(Math.abs(total - 100) <= 0.05)) {
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

export async function runAnalysis(opts: { timesheetsCsv?: string; supportingDocs?: SupportingDoc[] } = {}): Promise<AnalysisResult> {
  const ds = await loadDataset({ timesheetsCsv: opts.timesheetsCsv });
  const rules = await getRules(ds);
  const proposals = await proposeAllocations(ds, rules, opts.supportingDocs ?? []);
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

  // Grant money already proposed in this run, in item order, to check against each fund's remaining budget.
  const usedByFund = new Map<FundCode, number>();

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
    // Only rule ids that exist are cited; each quote is re-checked against the PDF text.
    const cited = [...new Set(p.ruleIds)]
      .map((id) => rules.find((r) => r.id === id))
      .filter((r): r is GrantRule => !!r)
      .map((r) => ({ fund: r.fund, citation: safeVerify(r.citation, ds) }));
    const citations = cited.map((c) => c.citation);
    const regs = checkedRegulations(p.regulations, p.ruleIds, rules, ds);
    const regulations = regs.length ? { regulations: regs } : {};
    try {
      // The DATA helpers throw on invalid inputs (bad percents, mixed periods...). Fail closed for this item only.
      const d = decide(item, p, ds);
      const splits = d.parts.length ? splitByPercent(item.amount, d.parts) : [];
      if (d.status === "supported") {
        const held = supportProblem(splits, cited, usedByFund, ds);
        if (held) {
          return {
            ...base,
            status: "needs_evidence" as const,
            splits: [],
            reason: `${d.reason} (Held for review: ${held.why})`,
            citations,
            missingEvidence: held.missing,
            ...regulations,
          };
        }
        for (const sp of splits) usedByFund.set(sp.fund, (usedByFund.get(sp.fund) ?? 0) + sp.amount);
      }
      return {
        ...base,
        status: d.status,
        splits,
        reason: d.reason,
        citations,
        ...(d.missingEvidence ? { missingEvidence: d.missingEvidence } : {}),
        ...regulations,
      };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return {
        ...base,
        status: "needs_evidence" as const,
        splits: [],
        reason: `${p.reason} (Held for review: the split failed a check: ${why})`,
        citations,
        missingEvidence: "A reviewer's decision on how to split this cost.",
        ...regulations,
      };
    }
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
