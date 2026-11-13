// DATA lane. All dollar math lives here. Claude never computes amounts.
import type { FundCode, Split, TimesheetRow } from "../types";
import { FUND_CODES } from "../types";

/** Integer apportionment keeps totals exact, even when there are fewer cents than funds. */
function apportion(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => (weight / weightTotal) * total);
  const amounts = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - amounts[index] }))
    .sort((a, b) => b.remainder - a.remainder || b.index - a.index);
  const remaining = total - amounts.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remaining; i++) amounts[order[i].index]++;
  return amounts;
}

/** Splits integer cents by percent; equal rounding remainders favor the last fund. */
export function splitByPercent(total: number, parts: { fund: FundCode; percent: number }[]): Split[] {
  const cents = Math.round((total + Number.EPSILON) * 100);
  if (!Number.isFinite(total) || total < 0 || !Number.isSafeInteger(cents)) {
    throw new Error("Allocation total must be a nonnegative, finite amount within the safe cent range.");
  }
  if (!parts.length) return [];
  const seen = new Set<FundCode>();
  for (const part of parts) {
    if (!FUND_CODES.includes(part.fund) || seen.has(part.fund)) throw new Error("Allocation funds must be known and unique.");
    if (!Number.isFinite(part.percent) || part.percent < 0 || part.percent > 100) {
      throw new Error("Allocation percentages must be finite and between 0 and 100.");
    }
    seen.add(part.fund);
  }
  const percentTotal = parts.reduce((sum, part) => sum + part.percent, 0);
  if (Math.abs(percentTotal - 100) > 0.000001) throw new Error("Allocation percentages must sum to 100.");
  const amounts = apportion(cents, parts.map((part) => part.percent));
  return parts.map((part, index) => ({ ...part, amount: amounts[index] / 100 }));
}

/** Percent of an employee's logged hours per fund, from time records. */
export function percentsFromTimesheets(employeeId: string, rows: TimesheetRow[]): { fund: FundCode; percent: number }[] {
  const mine = rows.filter((r) => r.employeeId === employeeId);
  if (new Set(mine.map((row) => row.period)).size > 1) throw new Error("Time records must cover a single payroll period.");
  if (mine.some((row) => !FUND_CODES.includes(row.fund) || !Number.isFinite(row.hours) || row.hours < 0)) {
    throw new Error("Time records must use known funds and nonnegative, finite hours.");
  }
  const total = mine.reduce((s, r) => s + r.hours, 0);
  if (!Number.isFinite(total)) throw new Error("Total logged hours must be finite.");
  if (!total) return [];
  const byFund = new Map<FundCode, number>();
  for (const r of mine) if (r.hours > 0) byFund.set(r.fund, (byFund.get(r.fund) ?? 0) + r.hours);
  const funds = [...byFund.keys()];
  const percentages = apportion(10000, [...byFund.values()]);
  return funds.map((fund, index) => ({ fund, percent: percentages[index] / 100 }));
}
