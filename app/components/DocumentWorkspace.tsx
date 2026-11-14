"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  analyzeUploads,
  sourceFile,
  validateFinancialRecords,
  type DemoReference,
  type ImportReport,
} from "./uploadAnalysis";
import { CsvPreview } from "./CsvPreview";
import {
  documentKinds,
  formatFileSize,
  inspectDocument,
  MAX_DOCUMENTS,
  type DocumentInspection,
  type DocumentKind,
} from "./documentPreview";

interface LocalDocument {
  id: number;
  file: File;
  kind: DocumentKind;
  status: "checking" | "ready" | "error";
  inspection?: DocumentInspection;
  error?: string;
}

export interface DocumentWorkspaceHandle {
  loadDemoDocuments: () => void;
}
export const DocumentWorkspace = forwardRef<
  DocumentWorkspaceHandle,
  {
    reference: DemoReference;
    onAnalyze: (report: ImportReport) => void;
    onInvalidate: () => void;
    busy: boolean;
  }
>(function DocumentWorkspace(
  { reference, onAnalyze, onInvalidate, busy },
  ref,
) {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);
  const selectFiles = useRef<HTMLInputElement>(null);
  const replaceFile = useRef<HTMLInputElement>(null);
  const replacementId = useRef<number | null>(null);
  const documentsRef = useRef<LocalDocument[]>([]);

  function update(next: LocalDocument[]) {
    documentsRef.current = next;
    setDocuments(next);
  }

  async function inspect(entry: LocalDocument) {
    try {
      const inspection = await inspectDocument(entry.file);
      validateFinancialRecords(inspection);
      update(
        documentsRef.current.map((item) =>
          item.id === entry.id
            ? { ...item, kind: inspection.kind, inspection, status: "ready" }
            : item,
        ),
      );
    } catch (cause) {
      update(
        documentsRef.current.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                status: "error",
                error:
                  cause instanceof Error
                    ? cause.message
                    : "The file could not be read. Try replacing it.",
              }
            : item,
        ),
      );
    }
  }

  function add(files: FileList | File[]) {
    const current = documentsRef.current;
    const additions: LocalDocument[] = [];
    const duplicates: string[] = [];
    let omitted = 0;
    for (const file of Array.from(files)) {
      if (
        [...current, ...additions].some(
          (item) =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified,
        )
      ) {
        duplicates.push(file.name);
        continue;
      }
      if (current.length + additions.length >= MAX_DOCUMENTS) {
        omitted++;
        continue;
      }
      additions.push({
        id: ++nextId.current,
        file,
        kind: "Unclassified",
        status: "checking",
      });
    }
    if (additions.length) onInvalidate();
    update([...current, ...additions]);
    setMessage(
      additions.length
        ? `${additions.length} document${additions.length === 1 ? "" : "s"} selected for local preview. No analysis has been performed.`
        : "No new documents added.",
    );
    setError(
      [
        duplicates.length
          ? `Already selected: ${duplicates.join(", ")}. Use Replace to change a file.`
          : "",
        omitted
          ? `${omitted} file(s) were not added. The workspace holds at most ${MAX_DOCUMENTS} documents; remove a file first.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    additions.forEach((entry) => void inspect(entry));
  }

  function replace(files: FileList | null) {
    const id = replacementId.current;
    replacementId.current = null;
    if (id === null || !files?.[0]) return;
    const file = files[0];
    const old = documentsRef.current.find((item) => item.id === id);
    if (!old) return;
    onInvalidate();
    const entry: LocalDocument = {
      id: ++nextId.current,
      file,
      kind: "Unclassified",
      status: "checking",
    };
    update(documentsRef.current.map((item) => (item.id === id ? entry : item)));
    setError("");
    setMessage(
      `${old.file.name} replaced with ${file.name}. No analysis has been performed.`,
    );
    void inspect(entry);
  }

  useImperativeHandle(ref, () => ({
    loadDemoDocuments() {
      if (
        documentsRef.current.length &&
        !window.confirm(
          "Replace the selected files with the bundled Eastbay demo documents?",
        )
      )
        return;
      update([]);
      add(reference.documents.map(sourceFile));
    },
  }));

  const ready = documents.filter((item) => item.status === "ready").length;
  const failed = documents.filter((item) => item.status === "error").length;
  const checking = documents.some((item) => item.status === "checking");

  return (
    <section
      className="document-workspace"
      id="review"
      aria-labelledby="documents-heading"
    >
      <div className="review-heading">
        <div>
          <h2 id="documents-heading">
            Your documents{" "}
            <span className="count-label">{documents.length}</span>
          </h2>
          <p>
            Grant agreements, expenses, payroll, timesheets, receipts, evidence
            registers, and supporting records.
          </p>
        </div>
        <span className="local-only-label">Stored only in this tab</span>
      </div>
      <p className="required-documents">
        To match the original scenario, select both grant PDFs, transactions.csv, payroll.csv, and timesheets.csv; funds.json is optional. Any other upload can still open the separate saved reference recommendations. Identical copies count once.
      </p>
      <div
        className={`document-dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
      >
        <span className="upload-icon" aria-hidden="true">
          ↑
        </span>
        <div>
          <h3>Select your financial documents</h3>
          <p>Drop files here or choose them from your computer.</p>
          <small>
            PDF, CSV, TXT, EML or JSON · 10 MB per file · up to 20 documents
          </small>
        </div>
        <button
          className="button primary"
          onClick={() => selectFiles.current?.click()}
        >
          Choose documents
        </button>
        <input
          ref={selectFiles}
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple
          accept=".pdf,.csv,.txt,.eml,.json,application/pdf,text/csv"
          aria-label="Choose PDF and CSV documents"
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={replaceFile}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".pdf,.csv,.txt,.eml,.json,application/pdf,text/csv"
          aria-label="Replace selected document"
          onChange={(event) => {
            replace(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="document-notice" role="status">
        {checking
          ? "Checking selected files and preparing CSV previews…"
          : message}
      </p>
      {error && (
        <div className="error-banner document-errors" role="alert">
          {error}
        </div>
      )}
      {!documents.length ? (
        <div className="documents-empty">
          <h3>No documents selected</h3>
          <p>
            Choose files from your computer, then click Import & Analyze. Or use
            Load Demo Documents for the bundled Eastbay sources.
          </p>
        </div>
      ) : (
        <>
          <div className="document-list-summary">
            <span>
              {documents.length} selected · {ready} parsed
              {failed ? ` · ${failed} need attention` : ""}
            </span>
            <span>
              Reloading or closing this tab clears the selected files.
            </span>
          </div>
          <ul className="document-list" aria-label="Selected documents">
            {documents.map((document) => (
              <li key={document.id} className="document-entry">
                <div className="document-entry-heading">
                  <div className="document-file">
                    <strong>{document.file.name}</strong>
                    <span>
                      {formatFileSize(document.file.size)} ·{" "}
                      {document.file.size.toLocaleString("en-US")} bytes ·{" "}
                      {document.inspection?.format ??
                        (document.file.name.toLowerCase().endsWith(".pdf")
                          ? "PDF"
                          : document.file.name.toLowerCase().endsWith(".csv")
                            ? "CSV"
                            : "Unsupported format")}
                    </span>
                  </div>
                  <div className="document-actions">
                    <button
                      className="button secondary"
                      aria-label={`Replace ${document.file.name}`}
                      onClick={() => {
                        replacementId.current = document.id;
                        replaceFile.current?.click();
                      }}
                    >
                      Replace
                    </button>
                    <button
                      className="button secondary"
                      aria-label={`Remove ${document.file.name}`}
                      onClick={() => {
                        onInvalidate();
                        update(
                          documentsRef.current.filter(
                            (item) => item.id !== document.id,
                          ),
                        );
                        setMessage(`${document.file.name} removed.`);
                        setError("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="document-details">
                  <label>
                    Document type
                    <select
                      aria-label={`Document type for ${document.file.name}`}
                      value={document.kind}
                      disabled={document.status === "checking"}
                      onChange={(event) =>
                        update(
                          documentsRef.current.map((item) =>
                            item.id === document.id
                              ? {
                                  ...item,
                                  kind: event.target.value as DocumentKind,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      {documentKinds.map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  <span className={`document-state ${document.status}`}>
                    {document.status === "checking"
                      ? "Checking file…"
                      : document.status === "error"
                        ? "File needs attention"
                        : "Parsed · ready to import"}
                  </span>
                </div>
                {document.error && (
                  <p className="file-error" role="alert">
                    {document.error}
                  </p>
                )}
                {document.inspection?.csv && (
                  <details className="csv-details">
                    <summary>Preview CSV: {document.file.name}</summary>
                    <CsvPreview
                      data={document.inspection.csv}
                      filename={document.file.name}
                    />
                  </details>
                )}
                {document.inspection?.format === "PDF" && (
                  <p className="pdf-pending">
                    {document.inspection.pages?.length} PDF pages parsed. Text
                    is extracted locally; matching is checked during import.
                  </p>
                )}
                {(document.inspection?.pages || document.inspection?.text) && (
                  <details className="csv-details">
                    <summary>
                      Preview extracted text: {document.file.name}
                    </summary>
                    <pre className="extracted-text">
                      {(
                        document.inspection.pages?.join(
                          "\n\n--- PAGE ---\n\n",
                        ) ??
                        document.inspection.text ??
                        ""
                      ).slice(0, 5000)}
                    </pre>
                    <p className="type-note">
                      Text preview limited to 5,000 characters. Matching uses
                      the complete parsed content.
                    </p>
                  </details>
                )}
                {document.inspection?.csv && (
                  <p className="type-note">
                    Document type is a suggestion from column names. You can
                    change it above.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="import-action-bar">
        <div>
          <h3>Ready to connect the evidence?</h3>
          <p>
            Files are parsed locally. Every import also opens the saved Eastbay
            reference recommendations, clearly separated from your uploaded-file
            statistics.
          </p>
        </div>
        <button
          className="button primary import-button"
          disabled={!documents.length || checking || busy}
          onClick={() => {
            try {
              const report = analyzeUploads(
                documents
                  .filter((item) => item.inspection)
                  .map((item) => ({
                    filename: item.file.name,
                    inspection: item.inspection!,
                  })),
                reference,
              );
              onAnalyze({
                ...report,
                documentCount: documents.length,
                filenames: documents.map((item) => item.file.name),
                reasons: [
                  ...report.reasons,
                  ...documents
                    .filter((item) => item.error)
                    .map((item) => `${item.file.name}: ${item.error}`),
                ],
              });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "The document set could not be imported.",
              );
            }
          }}
        >
          Import &amp; Analyze
        </button>
      </div>
    </section>
  );
});
