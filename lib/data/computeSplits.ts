// DATA lane. All dollar math lives here. Claude never computes amounts.
import type { FundCode, Split, TimesheetRow } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Splits a total by percent. The last split absorbs rounding so amounts always sum to the total. */
export function splitByPercent(total: number, parts: { fund: FundCode; percent: number }[]): Split[] {
  let used = 0;
  return parts.map((p, i) => {
    const amount = i === parts.length - 1 ? round2(total - used) : round2((total * p.percent) / 100);
    used = round2(used + amount);
    return { fund: p.fund, amount, percent: p.percent };
  });
}

/** Percent of an employee's logged hours per fund, from time records. */
export function percentsFromTimesheets(employeeId: string, rows: TimesheetRow[]): { fund: FundCode; percent: number }[] {
  const mine = rows.filter((r) => r.employeeId === employeeId);
  const total = mine.reduce((s, r) => s + r.hours, 0);
  if (!total) return [];
  const byFund = new Map<FundCode, number>();
  for (const r of mine) byFund.set(r.fund, (byFund.get(r.fund) ?? 0) + r.hours);
  return [...byFund].map(([fund, hours]) => ({ fund, percent: round2((hours / total) * 100) }));
}
