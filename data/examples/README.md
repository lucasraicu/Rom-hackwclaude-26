# Mock upload examples

All example records are fictional. API calls are disabled with `FUNDPROOF_MOCK=1`.

The supported Eastbay demo bundle is `data/inputs/`, paired with the existing initial/corrected fixtures and recorded caches. The older top-level `demo/` bundle uses different transaction/time-record schemas and is not supported by the current upload normalizer or exact-match demo. Do not use it as an interchangeable source for Eastbay results.

`mock-response.json` is a generated example response for the XLSX/email bundle below. It is explicitly labeled `mock`, retains the uploaded expense's ID and source location, and contains no model-approved eligibility claims.

Upload `transactions.xlsx` and optionally `approval.eml` to try one expense with spreadsheet provenance. You can also upload the existing CSVs and grant PDFs from `data/inputs/` as a 13-cost bundle. Include either `timesheets.csv` or `timesheets-corrected.csv`; replace the original rather than including both.

`POST /api/dataset` accepts multipart `files` (repeat the field for each file), optional `org`, and optional `period` (`YYYY-MM`). It returns the detected documents, warnings, missing requirements, an uploaded dataset ID and a readiness flag. `GET /api/dataset?datasetId=...` reloads that inventory. Temporary uploads expire after six hours and are not committed to the repository.

When `FUNDPROOF_MOCK=1` and the records are ready, both upload responses include `mockAnalysis`, an `AnalysisResult` containing the simulated Claude response for those records. This is available immediately without a live analysis request or API key.

`POST /api/analyze` also accepts `{ "datasetId": "<uploaded ID>" }` to analyze the saved uploaded records. In `FUNDPROOF_MOCK=1` or `cache`, it returns `buildMockAnalysis` output with `mode: "mock"`; cache mode never substitutes bundled demo results for uploaded records. Show a visible "Simulated analysis, not a Claude run" label. Uploaded analysis in any other mode returns 501 without calling an API. Invalid, missing, expired and not-ready uploads return `{ error }` with status 400, 404, 410 and 422 respectively. Requests without `datasetId` keep the existing demo behavior.

Readable PDF, CSV, XLSX, EML with a plain-text body, and UTF-8 TXT are parsed. Scanned PDFs, unsupported formats and ambiguous table headers remain visible with warnings. Common financial column aliases are recognized; arbitrary prose is not converted into fictional transactions. Receipts and emails remain supporting documents and are not counted as new costs.

Uploaded mock analysis uses the uploaded cost records and time totals, labels its output `mock`, and keeps every cost awaiting evidence/review. No grant eligibility, approval or document reliability is inferred. Grant balances remain unknown when only an award amount is provided. The separate bundled demo fixtures demonstrate supported/flagged statuses on the fixed synthetic answer key.

Limits: 20 files, 10 MB per file, 40 MB total, 100 PDF pages, 5,000 table rows per workbook and 100 columns. This contract currently supports at most one federal grant and one foundation grant, plus unrestricted funds. Additional/ambiguous grants or conflicting records need review rather than silent remapping.
