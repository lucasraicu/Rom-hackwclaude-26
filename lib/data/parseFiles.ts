import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import PostalMime from "postal-mime";
import { extractText, getDocumentProxy } from "unpdf";
import { UPLOAD_LIMITS, UploadError, type UploadedDocument, type UploadTable } from "./uploadTypes";

function textFrom(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  if (text.includes("\0")) throw new Error("Binary content is not a readable text document.");
  if (text.length > UPLOAD_LIMITS.textCharacters) throw new Error("Extracted text exceeds the document limit.");
  return text;
}

function table(rows: unknown[][], sheet?: string): UploadTable {
  if (!rows.length) throw new Error("The spreadsheet is empty.");
  if (rows.length - 1 > UPLOAD_LIMITS.rows || rows.some((row) => row.length > UPLOAD_LIMITS.columns)) {
    throw new Error(`Tables are limited to ${UPLOAD_LIMITS.rows} rows and ${UPLOAD_LIMITS.columns} columns.`);
  }
  const stringify = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? "" : String(value);
  const columns = rows[0].map((value) => stringify(value).trim());
  if (!columns.some(Boolean)) throw new Error("The table needs a header row.");
  const nonempty = columns.filter(Boolean).map((column) => column.toLowerCase());
  if (new Set(nonempty).size !== nonempty.length) throw new Error("Table column names must be unique.");
  const data = rows.slice(1).filter((row) => row.some((value) => value !== null && value !== undefined && String(value).trim()));
  return { sheet, columns, rows: data.map((row) => columns.map((_, index) => stringify(row[index]))) };
}

/** Inspect ZIP directory sizes before an XLSX parser expands XML into memory. */
function validateXlsx(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Not a valid XLSX ZIP archive.");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  let expanded = 0;
  if (count > 500 || count === 65535) throw new Error("The workbook has too many archive entries.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid workbook ZIP directory.");
    if (bytes.readUInt16LE(offset + 8) & 1) throw new Error("Encrypted workbooks are unsupported.");
    expanded += bytes.readUInt32LE(offset + 24);
    if (expanded > UPLOAD_LIMITS.expandedXlsxBytes) throw new Error("The expanded workbook exceeds the size limit.");
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
}

export async function parseUploadedFile(file: File): Promise<UploadedDocument> {
  if (!file.name || /[\\/\0]/.test(file.name) || file.name.length > 200) throw new UploadError("Use a filename without directory paths (maximum 200 characters).");
  if (!file.size) throw new UploadError(`${file.name} is empty.`);
  if (file.size > UPLOAD_LIMITS.fileBytes) throw new UploadError(`${file.name} exceeds the 10 MB file limit.`, 413);
  const document: UploadedDocument = {
    id: randomUUID(), filename: file.name, mimeType: file.type || "application/octet-stream",
    kind: "unknown", parseStatus: "parsed", warnings: [],
  };
  const extension = file.name.toLowerCase().split(".").pop();
  if (!["pdf", "csv", "xlsx", "eml", "txt"].includes(extension ?? "")) {
    return { ...document, parseStatus: "unsupported", warnings: ["Supported formats are readable PDF, CSV, XLSX, EML and TXT; this file was not analyzed."] };
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (extension === "pdf") {
      if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("The file does not contain a PDF header.");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      try {
        if (pdf.numPages > UPLOAD_LIMITS.pages) throw new Error(`PDFs are limited to ${UPLOAD_LIMITS.pages} pages.`);
        const { text } = await extractText(pdf, { mergePages: false });
        if (!text.some((page) => page.trim())) throw new Error("No readable text was found. Scanned/image-only PDFs need a readable source; OCR is unavailable.");
        if (text.join("").length > UPLOAD_LIMITS.textCharacters) throw new Error("The PDF text exceeds the document limit.");
        document.pages = text;
        if (text.some((page) => !page.trim())) document.warnings.push("Some pages contain no readable text and cannot have verified quotes.");
      } finally {
        const disposable = pdf as typeof pdf & { destroy?: () => Promise<void> };
        await disposable.destroy?.();
      }
    } else if (extension === "csv") {
      const parsed = Papa.parse<string[]>(textFrom(bytes), { skipEmptyLines: "greedy" });
      if (parsed.errors.length) throw new Error(`CSV: ${parsed.errors[0].message}`);
      const width = parsed.data[0]?.length ?? 0;
      if (parsed.data.some((row) => row.length !== width)) throw new Error("CSV rows have inconsistent column counts.");
      document.tables = [table(parsed.data)];
    } else if (extension === "xlsx") {
      validateXlsx(bytes);
      const sheets = await readXlsxFile(bytes);
      if (sheets.length > 20) throw new Error("Workbooks are limited to 20 sheets.");
      document.tables = [];
      for (const sheet of sheets) {
        if (sheet.data.length) document.tables.push(table(sheet.data, sheet.sheet));
      }
      if (!document.tables.length) throw new Error("The workbook has no populated sheets.");
      if (document.tables.reduce((sum, item) => sum + item.rows.length, 0) > UPLOAD_LIMITS.rows) throw new Error("The workbook exceeds the total row limit.");
    } else if (extension === "eml") {
      const email = await PostalMime.parse(bytes, { maxNestingDepth: 20, maxHeadersSize: 100000 });
      document.kind = "email";
      document.text = [email.subject && `Subject: ${email.subject}`, email.date && `Date: ${email.date}`,
        email.from?.address && `From: ${email.from.address}`, email.text].filter(Boolean).join("\n");
      if (!email.text?.trim()) throw new Error("Email needs a readable plain-text body; HTML-only email is unsupported.");
      if (document.text.length > UPLOAD_LIMITS.textCharacters) throw new Error("Email text exceeds the document limit.");
      if (email.attachments?.length) document.warnings.push("Email attachments were not parsed; upload relevant attachments separately.");
    } else document.text = textFrom(bytes);
    return document;
  } catch (error) {
    return { ...document, parseStatus: "error", warnings: [error instanceof Error ? error.message : "Could not parse this document."] };
  }
}
