// DATA lane. Builds AnalysisSummary from allocations.
import type { Allocation, AnalysisSummary } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** byFund counts supported and not_allowable items only; needs_evidence amounts are not allocated yet. */
export function summarize(allocations: Allocation[]): AnalysisSummary {
  const s: AnalysisSummary = {
    itemCount: allocations.length,
    totalAmount: 0,
    byStatus: {
      supported: { count: 0, amount: 0 },
      needs_evidence: { count: 0, amount: 0 },
      not_allowable: { count: 0, amount: 0 },
    },
    byFund: { "GRANT-FED": 0, "GRANT-FDN": 0, UNRESTRICTED: 0 },
    citationsVerified: 0,
    citationsTotal: 0,
  };
  for (const a of allocations) {
    s.totalAmount = round2(s.totalAmount + a.amount);
    s.byStatus[a.status].count++;
    s.byStatus[a.status].amount = round2(s.byStatus[a.status].amount + a.amount);
    if (a.status !== "needs_evidence") for (const sp of a.splits) s.byFund[sp.fund] = round2(s.byFund[sp.fund] + sp.amount);
    s.citationsTotal += a.citations.length;
    s.citationsVerified += a.citations.filter((c) => c.verified).length;
  }
  return s;
}
