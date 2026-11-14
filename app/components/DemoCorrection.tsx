"use client";

import { useRef, useState } from "react";
import { CsvPreview } from "./CsvPreview";
import {
  inspectDocument,
  formatFileSize,
  type CsvPreviewData,
} from "./documentPreview";
import {
  matchesCorrection,
  sourceFile,
  downloadFile,
  type DemoSource,
} from "./uploadAnalysis";

export function DemoCorrection({
  onReplay,
  expectedCsv,
  correctionSource,
}: {
  onReplay: (filename: string, rowCount: number) => void;
  expectedCsv: string;
  correctionSource: DemoSource;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{
    name: string;
    size: number;
    data: CsvPreviewData;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [played, setPlayed] = useState(false);
  const requestId = useRef(0);
  async function choose(file?: File) {
    if (!file) return;
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError("");
    setCsv(null);
    setPlayed(false);
    try {
      if (!file.name.toLowerCase().endsWith(".csv"))
        throw new Error("Choose the corrected demo timesheet as a CSV file.");
      const inspection = await inspectDocument(file);
      if (!inspection.csv)
        throw new Error("No CSV records could be previewed.");
      const required = [
        "employee_id",
        "period",
        "activity",
        "fund_code",
        "hours",
      ];
      if (required.some((header) => !inspection.csv!.headers.includes(header)))
        throw new Error(
          `The demo timesheet needs these columns: ${required.join(", ")}. Use Your documents for other records.`,
        );
      if (!matchesCorrection(await file.text(), expectedCsv))
        throw new Error(
          "This timesheet does not match the supported Eastbay correction. Its saved results cannot be used. Import it in Your documents to inspect the actual records.",
        );
      if (currentRequest === requestId.current)
        setCsv({ name: file.name, size: file.size, data: inspection.csv });
    } catch (cause) {
      if (currentRequest === requestId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The file could not be read.",
        );
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }
  return (
    <section
      className="demo-correction"
      aria-labelledby="demo-correction-heading"
    >
      <div className="review-heading">
        <div>
          <p className="eyebrow">PRERECORDED DEMONSTRATION</p>
          <h2 id="demo-correction-heading">
            Maria’s corrected-timesheet demonstration
          </h2>
          <p>
            Choose the demo correction CSV to preview it, then explicitly replay
            the prepared before/after result.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Upload corrected timesheet
        </button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".csv,text/csv"
          aria-label="Corrected demo timesheet CSV"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <div className="demo-correction-body">
        <p className="demo-disclosure">
          Pre-Evaluated Demo Analysis. Only a timesheet matching all records in
          the bundled Eastbay correction can unlock the saved after-fix result.
          No live Claude API call.
        </p>
        {busy && <p role="status">Preparing the CSV preview…</p>}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {csv && (
          <>
            <div className="document-entry-heading">
              <p className="demo-file-name">
                <strong>{csv.name}</strong> · {formatFileSize(csv.size)} · CSV /
                demo timesheet
              </p>
              <button
                className="text-button"
                onClick={() => {
                  requestId.current++;
                  setCsv(null);
                  setError("");
                  setPlayed(false);
                }}
              >
                Remove demo CSV
              </button>
            </div>
            <details className="csv-details">
              <summary>Preview corrected demo CSV</summary>
              <CsvPreview data={csv.data} filename={csv.name} />
            </details>
            <button
              className="button primary"
              disabled={played}
              onClick={() => {
                onReplay(csv.name, csv.data.rowCount);
                setPlayed(true);
              }}
            >
              Import &amp; Analyze Correction
            </button>
            {played && (
              <p role="status">
                Prerecorded correction shown. Maria’s updated row and
                before/after evidence are available above. This is not an live
                AI analysis of the selected CSV.
              </p>
            )}
          </>
        )}
        <button
          className="text-button"
          onClick={() =>
            downloadFile(
              sourceFile(correctionSource),
              correctionSource.filename,
            )
          }
        >
          Download known corrected timesheet
        </button>
      </div>
    </section>
  );
}
