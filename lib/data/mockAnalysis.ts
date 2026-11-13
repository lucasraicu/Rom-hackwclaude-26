// Explicitly simulated analysis of uploaded facts. No SDK, API, cached rules or demo input imports.
import type { Allocation, AnalysisResult, Dataset } from "../types";
import { percentsFromTimesheets, splitByPercent } from "./computeSplits";
import { summarize } from "./summarize";

export function buildMockAnalysis(dataset: Dataset): AnalysisResult {
  const allocations: Allocation[] = dataset.transactions.map((item) => ({
    itemId: item.id, itemType: "transaction", label: item.vendor || "Payee not supplied", description: item.description,
    amount: item.amount, status: "needs_evidence", splits: [], citations: [],
    reason: "Simulated Claude response: this uploaded expense is awaiting review. No grant eligibility or source evidence has been assessed.",
    missingEvidence: "Review the expense, applicable grant terms, and supporting documents before proposing a funding split.",
    sourceRefs: dataset.recordSources?.[item.id] ?? [],
  }));
  for (const employee of dataset.payroll) {
    const amount = Math.round((employee.grossPay + employee.benefits) * 100) / 100;
    let splits: Allocation["splits"] = [];
    let warning = "";
    try {
      const rows = dataset.timesheets.filter((row) => row.period === employee.period);
      const percentages = percentsFromTimesheets(employee.employeeId, rows);
      splits = percentages.length ? splitByPercent(amount, percentages) : [];
    } catch { warning = " Uploaded time records contain invalid values and need correction."; }
    const itemId = `PAY-${employee.employeeId}`;
    allocations.push({ itemId, itemType: "payroll", label: employee.name, description: `${employee.title || "Employee"}, ${employee.period} payroll`,
      amount, status: "needs_evidence", splits, citations: [],
      reason: `Simulated Claude response: ${splits.length ? "the proposed percentages reflect uploaded logged hours only" : "no valid work-hour split is available"}. Grant eligibility, completeness and reliability of those records have not been assessed.${warning}`,
      missingEvidence: "Human review of actual-work records, payroll completeness, grant restrictions and supporting evidence is required.",
      sourceRefs: dataset.recordSources?.[itemId] ?? [] });
  }
  return { generatedAt: new Date().toISOString(), mode: "mock", org: dataset.org, period: dataset.period, funds: dataset.funds,
    rules: [], allocations, summary: summarize(allocations), documents: dataset.documents ?? [],
    warnings: [...new Set([...(dataset.warnings ?? []), "MOCK: Claude was not called. All uploaded costs remain needs_evidence; proposed payroll splits are illustrative and unapproved."])] };
}
