"use client";
import { useEffect, useRef, useState } from "react";
import type { ImportReport } from "./uploadAnalysis";

const stages = [
  "Importing financial documents",
  "Parsing transactions and payroll",
  "Checking grant restrictions",
  "Matching supporting evidence",
  "Preparing allocation recommendations",
  "Generating dashboard results",
];
export function DemoAnalysisVisualization({
  report,
  onComplete,
  onCancel,
}: {
  report: ImportReport;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const complete = useRef(onComplete);
  useEffect(() => {
    complete.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 200
      : 750;
    let current = 0;
    const timer = setInterval(() => {
      current++;
      if (current === stages.length) {
        clearInterval(timer);
        complete.current();
      } else setStep(current);
    }, delay);
    return () => clearInterval(timer);
  }, []);
  return (
    <section
      className="analysis-theater"
      aria-labelledby="analysis-stage-title"
    >
      <div className="theater-heading">
        <div>
          <p className="eyebrow">OFFLINE DOCUMENT WORKFLOW</p>
          <h2 id="analysis-stage-title">{stages[step]}</h2>
        </div>
        <button className="button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="demo-disclosure">
        Pre-Evaluated Demo Analysis · No live Claude API call. This animation
        presents the import checks and saved scenario; it does not run an AI
        model.
      </p>
      <div className="analysis-orbit" aria-hidden="true">
        <span>DOCUMENTS</span>
        <i />
        <strong>FundPilot-AI</strong>
        <i />
        <span>FUNDING REVIEW</span>
      </div>
      <div className="analysis-counters">
        <div>
          <strong>{step >= 0 ? report.documentCount : 0}</strong>
          <span>documents selected</span>
        </div>
        <div>
          <strong>
            {step >= 1 ? report.transactionCount + report.payrollCount : 0}
          </strong>
          <span>financial records</span>
        </div>
        <div>
          <strong>{step >= 2 ? report.pdfPages : 0}</strong>
          <span>PDF pages parsed</span>
        </div>
        <div>
          <strong>{step >= 3 ? report.csvRecords : 0}</strong>
          <span>CSV records parsed</span>
        </div>
      </div>
      <ol className="analysis-stages">
        {stages.map((label, index) => (
          <li
            key={label}
            className={index < step ? "done" : index === step ? "current" : ""}
          >
            <span>
              {index < step ? "✓" : String(index + 1).padStart(2, "0")}
            </span>
            {label}
            {index === 4 && (
              <small>
                {report.scenario
                  ? "Pre-Evaluated Demo Analysis"
                  : "Showing the separate saved reference scenario"}
              </small>
            )}
          </li>
        ))}
      </ol>
      <div
        role="progressbar"
        aria-label="Document import presentation"
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={step + 1}
        className="analysis-progress"
      >
        <span style={{ width: `${((step + 1) / 6) * 100}%` }} />
      </div>
      <p className="analysis-stage-status" role="status">
        Step {step + 1} of 6: {stages[step]}.{" "}
        {report.scenario
          ? "A supported Eastbay source set matched."
          : "Uploaded statistics and separate Eastbay reference recommendations will be shown."}
      </p>
    </section>
  );
}
