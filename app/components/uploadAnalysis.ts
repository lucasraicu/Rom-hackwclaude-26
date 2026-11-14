import type { DocumentInspection, DocumentKind } from "./documentPreview";
import { parseCsvRecords } from "./documentPreview";

export interface DemoSource {
  filename: string;
  kind: DocumentKind;
  size: number;
  mimeType: string;
  base64: string;
  text?: string;
  pages?: string[];
}
export interface DemoReference {
  documents: DemoSource[];
}
export interface ParsedUpload {
  filename: string;
  inspection: DocumentInspection;
}
export interface ImportReport {
  scenario: "initial" | null;
  filenames: string[];
  documentCount: number;
  pdfPages: number;
  csvRecords: number;
  transactionCount: number;
  payrollCount: number;
  timesheetRows: number;
  transactionCents: number;
  payrollCents: number;
  reasons: string[];
  notices: string[];
}

const schemas = {
  Transactions: [
    "txn_id",
    "date",
    "vendor",
    "description",
    "amount",
    "account",
  ],
  Payroll: [
    "employee_id",
    "name",
    "title",
    "period",
    "gross_pay",
    "benefits",
    "planned_allocation",
    "job_description",
  ],
  Timesheet: ["employee_id", "period", "activity", "fund_code", "hours"],
};
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const headerKey = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
export function moneyCents(value: string) {
  const text = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text))
    throw new Error(
      `Invalid dollar amount '${text}'. Use numbers with at most two decimals.`,
    );
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents))
    throw new Error("Dollar amount exceeds the supported range.");
  return negative ? -cents : cents;
}
function objects(records: NonNullable<DocumentInspection["records"]>) {
  return records.rows.map((row) =>
    Object.fromEntries(
      records.headers.map((key, index) => [
        headerKey(key),
        normalize(row[index]),
      ]),
    ),
  );
}
export function validateFinancialRecords(inspection: DocumentInspection) {
  if (!inspection.records || !(inspection.kind in schemas)) return;
  const kind = inspection.kind as keyof typeof schemas;
  const required = schemas[kind];
  const headers = inspection.records.headers.map(headerKey);
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length)
    throw new Error(`${kind} CSV is missing columns: ${missing.join(", ")}.`);
  const ids = new Set<string>();
  objects(inspection.records).forEach((record, index) => {
    const fail = (reason: string): never => {
      throw new Error(`${kind} data record ${index + 1}: ${reason}`);
    };
    if (required.some((key) => !record[key]))
      fail("required fields must not be empty.");
    if (kind === "Transactions") {
      moneyCents(record.amount);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
        Number.isNaN(Date.parse(record.date)) ||
        new Date(record.date).toISOString().slice(0, 10) !== record.date
      )
        fail("date must be a real YYYY-MM-DD date.");
    } else {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.period))
        fail("period must be YYYY-MM.");
      if (
        kind === "Payroll" &&
        (moneyCents(record.gross_pay) < 0 || moneyCents(record.benefits) < 0)
      )
        fail("payroll amounts cannot be negative.");
      if (
        kind === "Timesheet" &&
        (!/^\d+(\.\d+)?$/.test(record.hours) ||
          !Number.isFinite(Number(record.hours)))
      )
        fail("hours must be a finite nonnegative number.");
    }
    if (kind !== "Timesheet") {
      const id =
        kind === "Transactions"
          ? record.txn_id
          : `${record.employee_id}/${record.period}`;
      if (ids.has(id)) fail(`duplicate record ID ${id}.`);
      ids.add(id);
    }
  });
}

function csvSignature(records: NonNullable<DocumentInspection["records"]>) {
  const headers = records.headers.map(headerKey).sort();
  const rows = objects(records)
    .map((row) =>
      JSON.stringify(
        headers.map((key) => {
          if (["amount", "gross_pay", "benefits"].includes(key))
            return moneyCents(row[key]);
          if (key === "hours") return Number(row[key]);
          return row[key];
        }),
      ),
    )
    .sort();
  return JSON.stringify([headers, rows]);
}
export function matchesCorrection(text: string, expectedText: string) {
  const actual = parseCsvRecords(text);
  const inspection: DocumentInspection = {
    format: "CSV",
    kind: "Timesheet",
    records: actual,
  };
  validateFinancialRecords(inspection);
  return csvSignature(actual) === csvSignature(parseCsvRecords(expectedText));
}
function jsonSignature(text: string): string {
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, sort(child)]),
          )
        : value;
  return JSON.stringify(sort(JSON.parse(text)));
}

function recordKey(row: Record<string, string>, kind: DocumentKind) {
  if (kind === "Transactions") return row.txn_id;
  if (kind === "Payroll") return `${row.employee_id}/${row.period}`;
  return `${row.employee_id}/${row.period}/${row.fund_code}/${row.activity}`;
}
function comparableValue(key: string, value: string) {
  if (["amount", "gross_pay", "benefits"].includes(key))
    return moneyCents(value);
  if (key === "hours") return Number(value);
  return normalize(value);
}
function csvDifferences(
  actual: NonNullable<DocumentInspection["records"]>,
  source: DemoSource,
) {
  const expected = parseCsvRecords(source.text!);
  const actualHeaders = actual.headers.map(headerKey),
    expectedHeaders = expected.headers.map(headerKey);
  const differences: string[] = [];
  const missingColumns = expectedHeaders.filter(
    (key) => !actualHeaders.includes(key),
  );
  const extraColumns = actualHeaders.filter(
    (key) => !expectedHeaders.includes(key),
  );
  if (missingColumns.length)
    differences.push(`missing columns: ${missingColumns.join(", ")}`);
  if (extraColumns.length)
    differences.push(`unexpected columns: ${extraColumns.join(", ")}`);
  if (missingColumns.length) return differences;
  const actualRows = new Map(
    objects(actual).map((row) => [recordKey(row, source.kind), row]),
  );
  const expectedRows = new Map(
    objects(expected).map((row) => [recordKey(row, source.kind), row]),
  );
  for (const [id, expectedRow] of expectedRows) {
    const actualRow = actualRows.get(id);
    if (!actualRow) {
      differences.push(`missing record ${id}`);
      continue;
    }
    for (const key of expectedHeaders)
      if (
        comparableValue(key, actualRow[key]) !==
        comparableValue(key, expectedRow[key])
      )
        differences.push(
          `${id}: ${key} differs (uploaded ${JSON.stringify(actualRow[key])}; repository ${JSON.stringify(expectedRow[key])})`,
        );
  }
  for (const id of actualRows.keys())
    if (!expectedRows.has(id)) differences.push(`unexpected record ${id}`);
  if (actual.rows.length !== expected.rows.length)
    differences.push(
      `record count differs (uploaded ${actual.rows.length}; repository ${expected.rows.length})`,
    );
  return differences;
}
export function analyzeUploads(
  uploads: ParsedUpload[],
  reference: DemoReference,
): ImportReport {
  const report: ImportReport = {
    scenario: null,
    filenames: uploads.map((file) => file.filename),
    documentCount: uploads.length,
    pdfPages: 0,
    csvRecords: 0,
    transactionCount: 0,
    payrollCount: 0,
    timesheetRows: 0,
    transactionCents: 0,
    payrollCents: 0,
    reasons: [],
    notices: [],
  };
  const found = new Set<string>();
  const seenContents = new Map<string, string>();
  let initialTime = false;
  const transactionIds = new Set<string>(),
    employeeIds = new Set<string>();
  for (const upload of uploads) {
    const doc = upload.inspection;
    // Re-selecting a source already loaded in the workspace must not double-count
    // its costs or cause an otherwise valid original dataset to be rejected.
    let fingerprint: string;
    try {
      fingerprint = doc.records
        ? `csv:${csvSignature(doc.records)}`
        : doc.pages
          ? `pdf:${JSON.stringify(doc.pages.map(normalize))}`
          : doc.format === "JSON"
            ? `json:${jsonSignature(doc.text ?? "")}`
            : `${doc.format}:${normalize(doc.text ?? "")}`;
    } catch (error) {
      report.reasons.push(`${upload.filename}: ${(error as Error).message}`);
      continue;
    }
    const firstCopy = seenContents.get(fingerprint);
    if (firstCopy !== undefined) {
      report.notices.push(
        `${upload.filename}: identical parsed content to ${firstCopy}; counted once.`,
      );
      continue;
    }
    seenContents.set(fingerprint, upload.filename);
    report.pdfPages += doc.pages?.length ?? 0;
    report.csvRecords += doc.records?.rows.length ?? 0;
    try {
      validateFinancialRecords(doc);
    } catch (error) {
      report.reasons.push(`${upload.filename}: ${(error as Error).message}`);
      continue;
    }
    if (doc.records) {
      for (const row of objects(doc.records)) {
        if (doc.kind === "Transactions") {
          report.transactionCount++;
          report.transactionCents += moneyCents(row.amount);
          if (transactionIds.has(row.txn_id))
            report.reasons.push(
              `Duplicate transaction ID ${row.txn_id} across documents.`,
            );
          transactionIds.add(row.txn_id);
        } else if (doc.kind === "Payroll") {
          report.payrollCount++;
          report.payrollCents +=
            moneyCents(row.gross_pay) + moneyCents(row.benefits);
          const key = `${row.employee_id}/${row.period}`;
          if (employeeIds.has(key))
            report.reasons.push(
              `Duplicate payroll ID ${key} across documents.`,
            );
          employeeIds.add(key);
        }
      }
    }
    let matched = false;
    for (const source of reference.documents) {
      let same = false;
      if (doc.pages && source.pages)
        same =
          JSON.stringify(doc.pages.map(normalize)) ===
          JSON.stringify(source.pages.map(normalize));
      else if (doc.records && source.filename.endsWith(".csv") && source.text) {
        const expected = parseCsvRecords(source.text);
        const headers = (values: string[]) =>
          JSON.stringify(values.map(headerKey).sort());
        if (headers(doc.records.headers) === headers(expected.headers))
          same = csvSignature(doc.records) === csvSignature(expected);
      } else if (
        doc.format === "JSON" &&
        source.filename.endsWith(".json") &&
        doc.text
      )
        same = jsonSignature(doc.text) === jsonSignature(source.text!);
      if (!same) continue;
      matched = true;
      found.add(source.filename);
      if (source.filename === "timesheets.csv") initialTime = true;
      break;
    }
    if (!matched) {
      const csvReference = doc.records
        ? reference.documents.find(
            (source) =>
              source.kind === doc.kind && source.filename.endsWith(".csv"),
          )
        : undefined;
      if (csvReference) {
        const differences = csvDifferences(doc.records!, csvReference);
        report.reasons.push(
          ...differences
            .slice(0, 30)
            .map(
              (difference) =>
                `${upload.filename} → ${csvReference.filename}: ${difference}.`,
            ),
        );
        if (differences.length > 30)
          report.reasons.push(
            `${upload.filename}: ${differences.length - 30} additional differences.`,
          );
      } else if (doc.pages) {
        const namedReference = reference.documents.find(
          (source) => source.filename === upload.filename && source.pages,
        );
        if (namedReference) {
          const page = doc.pages.findIndex(
            (text, index) =>
              normalize(text) !== normalize(namedReference.pages![index] ?? ""),
          );
          report.reasons.push(
            `${upload.filename}: grant PDF text differs on page ${page < 0 ? doc.pages.length + 1 : page + 1}; uploaded ${doc.pages.length} pages, repository ${namedReference.pages!.length} pages.`,
          );
        } else
          report.reasons.push(
            `${upload.filename}: extracted PDF text does not match either repository grant agreement; this document has no saved scenario.`,
          );
      } else if (doc.format === "JSON")
        report.reasons.push(
          `${upload.filename}: JSON values differ from optional funds.json, or this is unrelated JSON.`,
        );
      else
        report.reasons.push(
          `${upload.filename}: ${doc.format} is previewable but is not part of the original six-file pre-evaluated dataset.`,
        );
    }
  }
  report.timesheetRows = initialTime
    ? parseCsvRecords(
        reference.documents.find(
          (source) => source.filename === "timesheets.csv",
        )!.text!,
      ).rows.length
    : uploads
        .filter((file) => file.inspection.kind === "Timesheet")
        .reduce(
          (count, file) => count + (file.inspection.records?.rows.length ?? 0),
          0,
        );
  const required = reference.documents.filter(
    (source) =>
      !source.filename.endsWith(".json") &&
      source.filename !== "timesheets.csv",
  );
  const missing = required.filter((source) => !found.has(source.filename));
  if (missing.length)
    report.reasons.push(
      `Missing matching sources: ${missing.map((source) => source.filename).join(", ")}.`,
    );
  if (!initialTime)
    report.reasons.push("The original matching Eastbay timesheet is required.");
  if (!report.reasons.length) report.scenario = "initial";
  return report;
}

export function sourceFile(source: DemoSource) {
  const bytes = Uint8Array.from(atob(source.base64), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes], source.filename, { type: source.mimeType });
}
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
