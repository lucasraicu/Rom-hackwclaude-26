"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  Allocation,
  AllocationStatus,
  AnalysisResult,
  FundCode,
} from "@/lib/types";
import initialFixture from "@/lib/fixtures/analysis.initial.json";
import { EvidenceDrawer } from "./EvidenceDrawer";
import {
  DocumentWorkspace,
  type DocumentWorkspaceHandle,
} from "./DocumentWorkspace";
import { DemoAnalysisVisualization } from "./DemoAnalysisVisualization";
import { AnalysisCharts } from "./AnalysisCharts";
import { allocationsToCsv } from "./exportCsv";
import {
  downloadFile,
  type DemoReference,
  type ImportReport,
} from "./uploadAnalysis";

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
const statuses: Record<AllocationStatus, string> = {
  supported: "Supported",
  needs_evidence: "Needs evidence",
  not_allowable: "Not eligible for grants",
};
const fundNames: Record<FundCode, string> = {
  "GRANT-FED": "Federal literacy",
  "GRANT-FDN": "Foundation tutoring",
  UNRESTRICTED: "General operating",
};
type Review = "accepted" | "rejected";
const signature = (item: Allocation) =>
  JSON.stringify([
    item.status,
    item.splits,
    item.reason,
    item.missingEvidence,
    item.citations,
  ]);

export default function FundProofWorkspace({
  reference,
}: {
  reference: DemoReference;
}) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [previous, setPrevious] = useState<AnalysisResult | null>(null);
  const [workspace, setWorkspace] = useState<"documents" | "demo" | "analysis">(
    "documents",
  );
  const documents = useRef<DocumentWorkspaceHandle>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, setPending] = useState<ImportReport | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AllocationStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const changed = new Set(
    result?.allocations
      .filter((item) => {
        const before = previous?.allocations.find(
          (old) => old.itemId === item.itemId,
        );
        return before && signature(before) !== signature(item);
      })
      .map((item) => item.itemId),
  );
  const selected = result?.allocations.find(
    (item) => item.itemId === selectedId,
  );
  const visible =
    result?.allocations.filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        `${item.label} ${item.description} ${item.itemId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];

  function applyResult(next: AnalysisResult, correction: boolean) {
    setPrevious(correction ? result : null);
    setResult(next);
    setReviews((current) =>
      correction
        ? Object.fromEntries(
            Object.entries(current).filter(([id]) => {
              const before = result?.allocations.find(
                (item) => item.itemId === id,
              );
              const after = next.allocations.find((item) => item.itemId === id);
              return before && after && signature(before) === signature(after);
            }),
          )
        : {},
    );
    setFilter("all");
    setQuery("");
    if (correction) {
      const changes = next.allocations.filter((item) => {
        const before = result?.allocations.find(
          (old) => old.itemId === item.itemId,
        );
        return before && signature(before) !== signature(item);
      });
      setNotice(
        changes.length
          ? `${changes.length} item${changes.length === 1 ? "" : "s"} changed. Review the highlighted rows and their supporting evidence.`
          : "Prerecorded demo replay complete. No allocation changes were found.",
      );
    } else setNotice(`${next.summary.itemCount} items ready for review.`);
  }

  function invalidate() {
    setResult(null);
    setPrevious(null);
    setReport(null);
    setPending(null);
    setReviews({});
    setNotice("");
    setSelectedId(null);
    setWorkspace("documents");
  }
  function startAnalysis(next: ImportReport) {
    setSelectedId(null);
    setPending(next);
    setWorkspace("analysis");
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function finishAnalysis() {
    if (!pending) return;
    // Always show the unchanged reference scenario; never attribute it to
    // unrelated uploads. The import report keeps those statistics separate.
    applyResult(initialFixture as AnalysisResult, false);
    setReport(pending);
    setPending(null);
    setWorkspace("demo");
  }
  useEffect(() => {
    if (workspace === "demo" && report) {
      const heading = document.getElementById("results-heading");
      heading?.focus();
      heading?.scrollIntoView({ block: "start" });
    }
  }, [workspace, report]);
  const period = result
    ? new Date(`${result.period}-01T12:00:00`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "October 2026";

  return (
    <div className="workspace">
      <a
        className="skip-link"
        href={workspace === "documents" ? "#review" : "#results-heading"}
      >
        Skip to workspace
      </a>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          FundPilot-AI
        </Link>
        <span className="topbar-note">Allocation workspace</span>
        <span className="fictional-label">Offline document workflow</span>
      </header>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">MONTHLY FUND REVIEW</p>
            <h1>
              {workspace === "demo"
                ? (result?.org ?? "Imported document statistics")
                : "Import. Inspect. Understand."}
            </h1>
            <p className="subtitle">
              {workspace === "demo"
                ? report?.scenario
                  ? `${period} / Matched pre-evaluated scenario`
                  : "Parsed records from your selected files; no saved allocations."
                : "From your financial documents to evidence-backed allocation review."}
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary"
              aria-pressed={workspace === "documents"}
              onClick={() => {
                setWorkspace("documents");
                setSelectedId(null);
              }}
            >
              Your documents
            </button>
            <button
              className="button secondary"
              disabled={Boolean(pending)}
              onClick={() => {
                documents.current?.loadDemoDocuments();
                setWorkspace("documents");
              }}
            >
              Load Demo Documents
            </button>
          </div>
        </div>
        <div hidden={workspace !== "documents"}>
          <DocumentWorkspace
            ref={documents}
            reference={reference}
            onAnalyze={startAnalysis}
            onInvalidate={invalidate}
            busy={Boolean(pending)}
          />
        </div>
        <div className="pre-evaluated-label">
          Pre-Analyzed Demo Results | No live Claude API call
        </div>
        {pending && (
          <DemoAnalysisVisualization
            report={pending}
            onComplete={finishAnalysis}
            onCancel={() => {
              setPending(null);
              setWorkspace(result ? "demo" : "documents");
            }}
          />
        )}
        {workspace === "demo" && report && (
          <section className="import-report" aria-labelledby="results-heading">
            <div className="review-heading">
              <div>
                <p className="eyebrow">
                  {report.scenario
                    ? "PRE-EVALUATED DEMO ANALYSIS"
                    : "PARSED DOCUMENT STATISTICS"}
                </p>
                <h2 id="results-heading" tabIndex={-1}>
                  {report.scenario
                    ? "Eastbay source content matched"
                    : "Uploaded document statistics"}
                </h2>
              </div>
              {result && (
                <button
                  className="button secondary"
                  onClick={() =>
                    downloadFile(
                      new Blob([allocationsToCsv(result, reviews)], {
                        type: "text/csv;charset=utf-8",
                      }),
                      "fundpilot-ai-" + result.period + "-initial.csv",
                    )
                  }
                >
                  Export allocations CSV
                </button>
              )}
            </div>
            <div className="import-stats">
              <div>
                <strong>{report.transactionCount}</strong>
                <span>transactions</span>
                <small>{money(report.transactionCents / 100)}</small>
              </div>
              <div>
                <strong>{report.payrollCount}</strong>
                <span>payroll records</span>
                <small>
                  {money(report.payrollCents / 100)} including benefits
                </small>
              </div>
              <div>
                <strong>{report.documentCount}</strong>
                <span>documents selected</span>
                <small>{report.pdfPages} PDF pages</small>
              </div>
              <div>
                <strong>{report.csvRecords}</strong>
                <span>CSV records parsed</span>
                <small>{report.timesheetRows} active timesheet rows</small>
              </div>
            </div>
            <details className="import-source-files">
              <summary>Imported source files ({report.documentCount})</summary>
              <ul>
                {report.filenames.map((filename, index) => (
                  <li key={index}>{filename}</li>
                ))}
              </ul>
            </details>
            {report.notices.length > 0 && (
              <div className="report-explanation" role="status">
                <ul>
                  {report.notices.map((notice, index) => (
                    <li key={index}>{notice}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.scenario ? (
              <p className="report-explanation">
                The parsed source contents match the supported Eastbay initial{" "}
                scenario. Recommendations, explanations and citations below come
                from the existing saved evaluation. They were not generated by a
                live model. Citations retain the original bundled source
                filenames.
              </p>
            ) : (
              <div className="unmatched-report">
                <p>
                  These counts and financial totals come from your uploaded
                  files. The saved recommendations below are a separate Eastbay
                  reference demonstration and were not produced from these
                  uploads.
                </p>
                <details>
                  <summary>Uploaded file checks</summary>
                  <ul>
                    {report.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </details>
                <button
                  className="button secondary"
                  onClick={() => setWorkspace("documents")}
                >
                  Review selected documents
                </button>
              </div>
            )}
          </section>
        )}
        <p className="sr-only" role="status">
          {workspace === "demo" ? notice : ""}
        </p>
        {workspace === "demo" && result ? (
          <>
            <section
              className="mode-banner reference-result-banner"
              aria-label="Reference recommendation provenance"
            >
              <div>
                <strong>
                  Reference recommendations — Eastbay Youth Literacy, October
                  2026
                </strong>
                <p>
                  These 13 pre-evaluated recommendations, amounts and citations
                  are from the original repository sample. They are shown
                  regardless of uploaded files and are not a live analysis or
                  recommendations for unrelated uploads.
                </p>
              </div>
            </section>
            <AnalysisCharts result={result} />
            <section className="summary-grid" aria-label="Allocation summary">
              <div className="summary-total">
                <span className="metric-label">Reference dataset total</span>
                <strong>{money(result.summary.totalAmount)}</strong>
                <span>
                  {result.summary.itemCount} cost items · proposed allocations
                </span>
              </div>
              {(Object.keys(statuses) as AllocationStatus[]).map((status) => (
                <button
                  key={status}
                  className={`summary-status ${status}`}
                  aria-pressed={filter === status}
                  onClick={() => setFilter(filter === status ? "all" : status)}
                >
                  <span className="metric-label">
                    <span className={`status-dot ${status}`} />
                    {statuses[status]}
                  </span>
                  <strong>
                    {result.summary.byStatus[status].count}
                    <small> items</small>
                  </strong>
                  <span>{money(result.summary.byStatus[status].amount)}</span>
                </button>
              ))}
            </section>
            <section
              className="fund-section"
              aria-label="Proposed totals by fund"
            >
              <div className="section-label">
                PROPOSED BY FUND
                <span>May exclude costs still awaiting evidence</span>
              </div>
              <div className="fund-grid">
                {result.funds.map((fund) => (
                  <div className="fund-total" key={fund.code}>
                    <span className={`fund-line ${fund.type}`} />
                    <div>
                      <span>{fundNames[fund.code]}</span>
                      <small title={fund.name}>{fund.name}</small>
                    </div>
                    <strong>{money(result.summary.byFund[fund.code])}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="review-section" id="demo-review">
              <div className="review-heading">
                <div>
                  <h2>
                    Allocation review{" "}
                    <span className="count-label">
                      {result.allocations.length}
                    </span>
                  </h2>
                  <p>
                    Review the reasoning. Follow the evidence. Make the call.
                  </p>
                </div>
                <span className="verification-summary">
                  {result.summary.citationsVerified}/
                  {result.summary.citationsTotal} source quotes verified
                </span>
              </div>
              <div className="table-toolbar">
                <div className="filter-group" aria-label="Filter by status">
                  {(
                    ["all", ...Object.keys(statuses)] as (
                      AllocationStatus | "all"
                    )[]
                  ).map((status) => (
                    <button
                      key={status}
                      aria-pressed={filter === status}
                      className={filter === status ? "active" : ""}
                      onClick={() => setFilter(status)}
                    >
                      {status === "all" ? "All items" : statuses[status]}
                    </button>
                  ))}
                </div>
                <label className="search-label">
                  <span className="sr-only">Search costs</span>
                  <input
                    type="search"
                    placeholder="Search costs…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {notice && previous && (
                <div className="change-notice">{notice}</div>
              )}
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">
                    Proposed allocations for {period}. Open an item to review
                    its evidence.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Cost item</th>
                      <th scope="col" className="amount">
                        Amount
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">Proposed funding</th>
                      <th scope="col">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr
                        key={item.itemId}
                        className={
                          changed.has(item.itemId) ? "changed-row" : ""
                        }
                      >
                        <td>
                          <button
                            className="item-button"
                            onClick={() => setSelectedId(item.itemId)}
                          >
                            {item.label}
                            <span aria-hidden="true"> ↗</span>
                          </button>
                          <span className="item-description">
                            {item.description}
                          </span>
                          <span className="item-meta">
                            {item.itemId} ·{" "}
                            {item.itemType === "payroll"
                              ? "Payroll"
                              : "Expense"}
                            {changed.has(item.itemId) && (
                              <b className="changed-label">Updated</b>
                            )}
                          </span>
                        </td>
                        <td className="amount">{money(item.amount)}</td>
                        <td>
                          <span className={`status-chip ${item.status}`}>
                            {statuses[item.status]}
                          </span>
                        </td>
                        <td>
                          <div className="splits">
                            {item.splits.length ? (
                              item.splits.map((split) => (
                                <div key={split.fund}>
                                  <span>{fundNames[split.fund]}</span>
                                  <strong>
                                    {split.percent}%{" "}
                                    <small>{money(split.amount)}</small>
                                  </strong>
                                </div>
                              ))
                            ) : (
                              <span className="muted">
                                Awaiting supporting evidence
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            className="review-button"
                            onClick={() => setSelectedId(item.itemId)}
                          >
                            {reviews[item.itemId] === "accepted"
                              ? "Accepted locally"
                              : reviews[item.itemId] === "rejected"
                                ? "Rejected locally"
                                : "View evidence"}
                            <span aria-hidden="true"> →</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length && (
                <div className="no-results">
                  <h3>No matching costs</h3>
                  <p>Try another search or show all statuses.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <div className="table-footer">
                <span>
                  {visible.length} of {result.allocations.length} items
                </span>
                <span>Proposals require human review</span>
              </div>
            </section>
          </>
        ) : null}
        <footer className="page-footer">
          <span>
            FundPilot-AI <span aria-hidden="true">/</span> Evidence before
            allocation.
          </span>
          <span>
            Local review only. Decisions are not saved or posted to your books.
          </span>
        </footer>
      </main>
      {workspace === "demo" && selected && result && (
        <EvidenceDrawer
          key={selected.itemId}
          item={selected}
          previous={previous?.allocations.find(
            (item) => item.itemId === selected.itemId,
          )}
          funds={result.funds}
          review={reviews[selected.itemId]}
          onReview={(decision) =>
            setReviews((current) => ({
              ...current,
              [selected.itemId]: decision,
            }))
          }
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
