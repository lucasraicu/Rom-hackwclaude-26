// AI lane owns this file. Runs the whole analysis:
// load records -> grant rules (cache or Claude) -> Claude proposals -> code computes $ -> verify quotes -> summary.
import fs from "node:fs/promises";
import path from "node:path";
import { loadDataset } from "./data/loadDataset";
import { percentsFromTimesheets, splitByPercent } from "./data/computeSplits";
import { verifyCitation } from "./data/verifyCitations";
import { summarize } from "./data/summarize";
import { extractRulesForFund } from "./ai/extractRules";
import { proposeAllocations } from "./ai/proposeAllocations";
import type { Allocation, AnalysisResult, FundCode, GrantRule } from "./types";

const RULES_CACHE = path.join(process.cwd(), "data", "cache", "grant-rules.json");

/** Grant rules rarely change, so they are cached after the first good run. Delete the file to re-extract. */
async function getRules(ds: Awaited<ReturnType<typeof loadDataset>>): Promise<GrantRule[]> {
  try {
    return JSON.parse(await fs.readFile(RULES_CACHE, "utf8"));
  } catch {
    const perFund = await Promise.all(ds.funds.map(extractRulesForFund));
    const rules = perFund.flat().map((r) => ({ ...r, citation: verifyCitation(r.citation, ds.grantDocs) }));
    await fs.mkdir(path.dirname(RULES_CACHE), { recursive: true });
    await fs.writeFile(RULES_CACHE, JSON.stringify(rules, null, 2));
    return rules;
  }
}

export async function runAnalysis(opts: { timesheetsCsv?: string } = {}): Promise<AnalysisResult> {
  const ds = await loadDataset(opts);
  const rules = await getRules(ds);
  const proposals = await proposeAllocations(ds, rules);
  const byId = new Map(proposals.map((p) => [p.itemId, p]));

  const items = [
    ...ds.transactions.map((t) => ({ itemId: t.id, itemType: "transaction" as const, label: t.vendor, description: t.description, amount: t.amount })),
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
    const p = byId.get(item.itemId);
    if (!p) {
      return { ...item, status: "needs_evidence", splits: [], reason: "Claude returned no proposal for this item.", citations: [] };
    }
    // Payroll percents come from time records in code, not from Claude, whenever records exist.
    let parts = p.funds.map((f) => ({ fund: f.fund as FundCode, percent: f.percent }));
    if ("employeeId" in item && p.status === "supported") {
      const fromHours = percentsFromTimesheets(item.employeeId, ds.timesheets);
      if (fromHours.length) parts = fromHours;
    }
    const citations = p.ruleIds
      .map((id) => rules.find((r) => r.id === id)?.citation)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => verifyCitation(c, ds.grantDocs));
    return {
      itemId: item.itemId,
      itemType: item.itemType,
      label: item.label,
      description: item.description,
      amount: item.amount,
      status: p.status,
      splits: parts.length ? splitByPercent(item.amount, parts) : [],
      reason: p.reason,
      citations,
      ...(p.missingEvidence ? { missingEvidence: p.missingEvidence } : {}),
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
