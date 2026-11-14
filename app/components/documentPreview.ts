import Papa from "papaparse";

// Local preview limits, not a server-upload contract.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 20;
export const documentKinds = [
  "Unclassified",
  "Grant agreement",
  "Transactions",
  "Payroll",
  "Timesheet",
  "Receipt / invoice",
  "Supporting document",
] as const;
export type DocumentKind = (typeof documentKinds)[number];
export interface CsvPreviewData {
  headers: string[];
  rows: string[][];
  rowCount: number;
}
export interface DocumentInspection {
  format: "PDF" | "CSV" | "TXT" | "EML" | "JSON";
  kind: DocumentKind;
  csv?: CsvPreviewData;
  records?: { headers: string[]; rows: string[][] };
  pages?: string[];
  text?: string;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferCsvKind(headers: string[]): DocumentKind {
  const names = new Set(headers.map((header) => header.trim().toLowerCase()));
  if (names.has("hours") && (names.has("employee_id") || names.has("employee")))
    return "Timesheet";
  if (names.has("gross_pay") || names.has("gross_salary")) return "Payroll";
  if (names.has("amount") && (names.has("vendor") || names.has("txn_id")))
    return "Transactions";
  return "Unclassified";
}

export async function inspectDocument(file: File): Promise<DocumentInspection> {
  if (
    /^(expected(?:[._-].*)?|.*answer[ _-]?key.*)$/i.test(
      file.name.replaceAll("\\", "/").split("/").pop() ?? "",
    )
  )
    throw new Error(
      "Test-only expected results and answer keys cannot be imported.",
    );
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "csv", "txt", "eml", "json"].includes(extension ?? ""))
    throw new Error(
      "Unsupported format. Select PDF, CSV, TXT, EML or JSON documents.",
    );
  if (!file.size)
    throw new Error(
      "This file is empty. Replace it with a file containing data.",
    );
  if (file.size > MAX_FILE_BYTES)
    throw new Error(
      "This file exceeds the 10 MB local preview limit. Choose a smaller file.",
    );
  if (extension === "pdf") {
    const header = new TextDecoder().decode(
      await file.slice(0, 1024).arrayBuffer(),
    );
    if (!/%PDF-\d\.\d/.test(header))
      throw new Error(
        "This file does not have a PDF header. Export it as a PDF and try again.",
      );
    try {
      const { extractText } = await import("unpdf");
      const { text: pages, totalPages } = await extractText(
        new Uint8Array(await file.arrayBuffer()),
        { mergePages: false },
      );
      if (totalPages > 100) throw new Error("PDF exceeds the 100-page limit.");
      if (!pages.some((page) => page.trim()))
        throw new Error(
          "No readable text found. Scanned PDFs need a text-readable export.",
        );
      return { format: "PDF", kind: "Unclassified", pages };
    } catch (cause) {
      throw new Error(
        `PDF could not be parsed: ${cause instanceof Error ? cause.message : "unreadable or password-protected document"}`,
      );
    }
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error(
      "CSV could not be read as UTF-8 text. Export a UTF-8 CSV and try again.",
    );
  }
  if (!text.trim())
    throw new Error(
      "This CSV contains no data. Add a header row and at least one record.",
    );
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    throw new Error(
      "CSV contains binary or unsupported control characters. Export a UTF-8 CSV.",
    );
  if (extension !== "csv") {
    if (extension === "json") {
      try {
        JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON document.");
      }
    }
    return {
      format: extension!.toUpperCase() as "TXT" | "EML" | "JSON",
      kind: "Supporting document",
      text,
    };
  }
  const records = parseCsvRecords(text);
  return {
    format: "CSV",
    kind: inferCsvKind(records.headers),
    records,
    csv: {
      ...records,
      rows: records.rows.slice(0, 10),
      rowCount: records.rows.length,
    },
  };
}

export function parseCsvRecords(text: string): {
  headers: string[];
  rows: string[][];
} {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    preview: 20002,
  });
  const parseError = parsed.errors.find(
    (error) => error.code !== "UndetectableDelimiter",
  );
  if (parseError)
    throw new Error(
      `CSV parsing failed${parseError.row === undefined ? "" : ` near record ${parseError.row + 1}`}: ${parseError.message}`,
    );
  const [rawHeaders, ...rows] = parsed.data;
  if (!rawHeaders?.length || !rows.length)
    throw new Error("CSV needs a header row and at least one data record.");
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new Error("CSV has an empty column heading. Name every column.");
  if (
    new Set(headers.map((header) => header.toLowerCase())).size !==
    headers.length
  )
    throw new Error(
      "CSV has duplicate column headings. Give each column a unique name.",
    );
  if (parsed.meta.truncated || rows.length > 20000)
    throw new Error(
      "CSV exceeds the 20,000-record preview limit. Split it into smaller files.",
    );
  const invalidIndex = rows.findIndex((row) => row.length !== headers.length);
  if (invalidIndex !== -1)
    throw new Error(
      `CSV data record ${invalidIndex + 1} has ${rows[invalidIndex].length} columns; the header has ${headers.length}. Check delimiters and quoted fields.`,
    );
  return { headers, rows };
}
