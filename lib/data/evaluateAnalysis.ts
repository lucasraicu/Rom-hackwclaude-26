// DATA lane. Independent checks shared by live, cached and fixture evaluation.
// The answer key is never an input to Claude.
import { FUND_CODES, type AnalysisResult, type Dataset, type FundCode } from "../types";
import { verifyCitation } from "./verifyCitations";

export type ExpectedItems = Record<string, { status: string; splits: Record<string, number> }>;
const cents = (amount: number) => Math.round(amount * 100);
const isMoney = (amount: number) => Number.isFinite(amount) && amount >= 0 &&
  Number.isSafeInteger(cents(amount)) && Math.abs(amount * 100 - cents(amount)) < 0.000001;

export function evaluateAnalysis(result: AnalysisResult, expected: ExpectedItems, dataset: Dataset) {
  const issues: string[] = [];
  const canonical = new Map<string, { amount: number; type: string }>([
    ...dataset.transactions.map((item) => [item.id, { amount: item.amount, type: "transaction" }] as const),
    ...dataset.payroll.map((item) => [`PAY-${item.employeeId}`, { amount: item.grossPay + item.benefits, type: "payroll" }] as const),
  ]);
  const expectedIds = Object.keys(expected);
  if (canonical.size !== 13 || expectedIds.length !== 13) issues.push("Dataset and answer key must each contain 13 canonical items.");
  for (const id of canonical.keys()) if (!expected[id]) issues.push(`Answer key is missing ${id}.`);
  for (const id of expectedIds) if (!canonical.has(id)) issues.push(`Answer key has unknown item ${id}.`);
  if (result.org !== dataset.org || result.period !== dataset.period) issues.push("Result organization or period differs from the dataset.");
  if (result.allocations.length !== expectedIds.length) issues.push(`Expected ${expectedIds.length} allocations, got ${result.allocations.length}.`);
  let matched = 0;
  let citationsVerified = 0;
  let citationsTotal = 0;
  let totalCents = 0;
  const byStatus = {
    supported: { count: 0, cents: 0 },
    needs_evidence: { count: 0, cents: 0 },
    not_allowable: { count: 0, cents: 0 },
  };
  const byFund: Record<FundCode, number> = { "GRANT-FED": 0, "GRANT-FDN": 0, UNRESTRICTED: 0 };
  const seen = new Set<string>();
  const ruleIds = new Set<string>();
  const checkCitation = (citation: AnalysisResult["rules"][number]["citation"], label: string) => {
    const actual = verifyCitation(citation, dataset.grantDocs);
    const valid = actual.verified === true && actual.page === citation.page;
    if (!valid) issues.push(`${label}: quote does not match the specified PDF/page.`);
    if (citation.verified !== valid) issues.push(`${label}: verified flag does not match source verification.`);
    return valid;
  };
  for (const rule of result.rules) {
    if (ruleIds.has(rule.id)) issues.push(`Duplicate rule ${rule.id}.`);
    ruleIds.add(rule.id);
    const doc = dataset.grantDocs.find((document) => document.file === rule.citation.sourceDoc);
    if (!FUND_CODES.includes(rule.fund) || doc?.fund !== rule.fund) issues.push(`${rule.id}: rule fund does not match its source document.`);
    checkCitation(rule.citation, rule.id);
  }
  for (const allocation of result.allocations) {
    const id = allocation.itemId;
    const duplicate = seen.has(id);
    if (duplicate) issues.push(`Duplicate allocation ${id}.`);
    seen.add(id);
    const source = canonical.get(id);
    if (!source) issues.push(`Unknown allocation ${id}.`);
    if (!isMoney(allocation.amount) || !source || cents(allocation.amount) !== cents(source.amount)) issues.push(`${id}: amount differs from the canonical cost or is not valid cents.`);
    if (source && allocation.itemType !== source.type) issues.push(`${id}: incorrect item type.`);
    totalCents += cents(allocation.amount);
    if (Object.hasOwn(byStatus, allocation.status)) {
      byStatus[allocation.status].count++;
      byStatus[allocation.status].cents += cents(allocation.amount);
    } else issues.push(`${id}: unknown status ${allocation.status}.`);
    if (!allocation.reason?.trim()) issues.push(`${id}: missing explanation.`);
    if (allocation.status === "needs_evidence" && !allocation.missingEvidence?.trim()) issues.push(`${id}: missing evidence request.`);
    const funds = new Set<string>();
    const actualSplits: Record<string, number> = {};
    let splitCents = 0;
    let percentTotal = 0;
    for (const split of allocation.splits) {
      if (!FUND_CODES.includes(split.fund) || funds.has(split.fund)) issues.push(`${id}: unknown or repeated split fund ${split.fund}.`);
      funds.add(split.fund);
      if (!isMoney(split.amount)) issues.push(`${id}: split amount must be nonnegative integer cents.`);
      if (!Number.isFinite(split.percent) || split.percent < 0 || split.percent > 100) issues.push(`${id}: invalid split percent.`);
      actualSplits[split.fund] = split.amount;
      splitCents += cents(split.amount);
      percentTotal += split.percent;
      if (Math.abs(cents(split.amount) - allocation.amount * split.percent) > 1.000001) issues.push(`${id}: split amount disagrees with its percentage.`);
      if (allocation.status !== "needs_evidence" && FUND_CODES.includes(split.fund)) byFund[split.fund] += cents(split.amount);
      if (allocation.status === "supported" && split.fund !== "UNRESTRICTED" && split.amount > 0) {
        const fund = dataset.funds.find((item) => item.code === split.fund);
        const transaction = dataset.transactions.find((item) => item.id === id);
        const payroll = dataset.payroll.find((item) => `PAY-${item.employeeId}` === id);
        const period = payroll?.period;
        const outside = transaction
          ? (fund?.periodStart && transaction.date < fund.periodStart) || (fund?.periodEnd && transaction.date > fund.periodEnd)
          : period && ((fund?.periodStart && period < fund.periodStart.slice(0, 7)) || (fund?.periodEnd && period > fund.periodEnd.slice(0, 7)));
        if (!fund || outside) issues.push(`${id}: supported charge is outside its funding period or fund is unknown.`);
      }
    }
    if (allocation.splits.length && (splitCents !== cents(allocation.amount) || Math.abs(percentTotal - 100) > 0.000001)) issues.push(`${id}: splits must conserve the item amount and total 100%.`);
    if (allocation.status !== "needs_evidence" && !allocation.splits.length) issues.push(`${id}: finalized proposal has no splits.`);
    const exp = expected[id];
    const splitMatch = exp && Object.keys(actualSplits).length === Object.keys(exp.splits).length &&
      Object.entries(exp.splits).every(([fund, amount]) => Object.hasOwn(actualSplits, fund) && cents(actualSplits[fund]) === cents(amount));
    if (!duplicate && exp && allocation.status === exp.status && splitMatch) matched++;
    else issues.push(`${id}: expected ${exp?.status ?? "no item"} ${JSON.stringify(exp?.splits ?? {})}, got ${allocation.status} ${JSON.stringify(actualSplits)}.`);
    for (const citation of allocation.citations) {
      citationsTotal++;
      if (checkCitation(citation, id)) citationsVerified++;
    }
    if (allocation.status === "supported" && allocation.splits.some((split) => split.fund !== "UNRESTRICTED" && split.amount > 0)) {
      if (!allocation.citations.length) issues.push(`${id}: supported restricted allocation needs source citations.`);
      if (!funds.has("GRANT-FED") && allocation.regulations?.some((reference) => /2\s*CFR/i.test(reference))) issues.push(`${id}: private-only supported allocation cites federal regulations.`);
    }
  }
  for (const id of expectedIds) if (!seen.has(id)) issues.push(`Missing allocation ${id}.`);
  for (const fund of dataset.funds) if (fund.budgetRemaining !== undefined && byFund[fund.code] > cents(fund.budgetRemaining)) issues.push(`${fund.code}: allocations exceed the known remaining budget.`);
  const summary = result.summary;
  if (summary.itemCount !== result.allocations.length || cents(summary.totalAmount) !== totalCents) issues.push("Summary item count or total is incorrect.");
  for (const status of Object.keys(byStatus) as (keyof typeof byStatus)[]) {
    if (summary.byStatus[status]?.count !== byStatus[status].count || cents(summary.byStatus[status]?.amount) !== byStatus[status].cents) issues.push(`Summary ${status} totals are incorrect.`);
  }
  for (const fund of FUND_CODES) if (cents(summary.byFund[fund]) !== byFund[fund]) issues.push(`Summary ${fund} total is incorrect.`);
  if (summary.citationsTotal !== citationsTotal || summary.citationsVerified !== citationsVerified) issues.push("Summary citation counts are incorrect.");
  return { matched, total: expectedIds.length, citationsVerified, citationsTotal, issues, passed: issues.length === 0 };
}
