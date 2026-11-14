import type { AnalysisResult } from "@/lib/types";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export function AnalysisCharts({ result }: { result: AnalysisResult }) {
  const maximum = Math.max(1, ...Object.values(result.summary.byFund));
  const statuses = {
    supported: "Supported",
    needs_evidence: "Needs evidence",
    not_allowable: "Not eligible for grants",
  } as const;
  return (
    <section className="charts-grid" aria-label="Saved evaluation charts">
      <figure>
        <figcaption>
          Proposed funding by source{" "}
          <small>Saved evaluation data · excludes unresolved funding</small>
        </figcaption>
        {result.funds.map((fund) => (
          <div className="chart-row" key={fund.code}>
            <div>
              <span>{fund.name}</span>
              <strong>{money(result.summary.byFund[fund.code])}</strong>
            </div>
            <div className="chart-track">
              <span
                className={fund.type}
                style={{
                  width: `${(result.summary.byFund[fund.code] / maximum) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </figure>
      <figure>
        <figcaption>
          Evidence and eligibility{" "}
          <small>{result.summary.itemCount} saved cost-item decisions</small>
        </figcaption>
        <div className="status-chart-bar" aria-hidden="true">
          {(Object.keys(statuses) as (keyof typeof statuses)[]).map(
            (status) => (
              <span
                key={status}
                className={status}
                style={{
                  width: `${(result.summary.byStatus[status].count / Math.max(1, result.summary.itemCount)) * 100}%`,
                }}
              />
            ),
          )}
        </div>
        {(Object.keys(statuses) as (keyof typeof statuses)[]).map((status) => (
          <div className="chart-status" key={status}>
            <span>
              <i className={`status-dot ${status}`} />
              {statuses[status]}
            </span>
            <strong>
              {result.summary.byStatus[status].count} items ·{" "}
              {money(result.summary.byStatus[status].amount)}
            </strong>
          </div>
        ))}
      </figure>
    </section>
  );
}
