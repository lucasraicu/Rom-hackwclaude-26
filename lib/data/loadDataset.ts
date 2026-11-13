// DATA lane. Reads data/inputs into the shared Dataset shape.
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { extractText, getDocumentProxy } from "unpdf";
import { FUND_CODES, type Dataset, type Fund, type FundCode, type GrantDoc, type PayrollLine, type TimesheetRow, type Transaction } from "../types";

export const INPUTS_DIR = path.join(process.cwd(), "data", "inputs");

const PERIOD = "2026-10";

const FUND_TYPE: Record<FundCode, Fund["type"]> = {
  "GRANT-FED": "federal",
  "GRANT-FDN": "foundation",
  UNRESTRICTED: "unrestricted",
};

function isFundCode(value: string): value is FundCode {
  return (FUND_CODES as readonly string[]).includes(value);
}

function parseCsv(text: string, file: string, required: readonly string[]): Record<string, string>[] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error(`${file} is empty.`);
  const out = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (out.errors.length) throw new Error(`${file}: ${out.errors[0].message}`);
  const fields = out.meta.fields ?? [];
  const missing = required.filter((column) => !fields.includes(column));
  if (missing.length) throw new Error(`${file} is missing columns: ${missing.join(", ")}.`);
  return out.data;
}

function field(row: Record<string, string>, key: string, where: string): string {
  const value = (row[key] ?? "").trim();
  if (!value) throw new Error(`${where} is missing ${key}.`);
  return value;
}

/** Keeps money at whole cents. Values with more than two decimal places are rejected. */
function dollars(raw: string, where: string): number {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`${where} must be a dollar amount with at most 2 decimal places.`);
  }
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`${where} is too large.`);
  return cents / 100;
}

function hours(raw: string, where: string): number {
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`${where} must be a nonnegative number of hours.`);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${where} must be a finite number of hours.`);
  return value;
}

function isoDate(raw: string, where: string): string {
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${where} must be YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${where} is not a real calendar date.`);
  }
  return text;
}

function yearMonth(raw: string, where: string): string {
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`${where} must be YYYY-MM.`);
  }
  return text;
}

function fundCode(raw: string, where: string): FundCode {
  const text = raw.trim();
  if (!isFundCode(text)) throw new Error(`${where} must be one of ${FUND_CODES.join(", ")}.`);
  return text;
}

function unique(ids: string[], file: string, label: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`${file} repeats ${label} ${id}.`);
    seen.add(id);
  }
}

export function parseTransactions(text: string): Transaction[] {
  const file = "transactions.csv";
  const rows = parseCsv(text, file, ["txn_id", "date", "vendor", "description", "amount", "account"]);
  if (!rows.length) throw new Error(`${file} has no transactions.`);
  const transactions = rows.map((row, index) => {
    const where = `${file} row ${index + 2}`;
    return {
      id: field(row, "txn_id", where),
      date: isoDate(field(row, "date", where), `${where} date`),
      vendor: field(row, "vendor", where),
      description: field(row, "description", where),
      amount: dollars(field(row, "amount", where), `${where} amount`),
      account: field(row, "account", where),
    };
  });
  unique(transactions.map((row) => row.id), file, "transaction");
  return transactions;
}

export function parsePayroll(text: string): PayrollLine[] {
  const file = "payroll.csv";
  const rows = parseCsv(text, file, [
    "employee_id", "name", "title", "period", "gross_pay", "benefits", "planned_allocation", "job_description",
  ]);
  if (!rows.length) throw new Error(`${file} has no employees.`);
  const payroll = rows.map((row, index) => {
    const where = `${file} row ${index + 2}`;
    return {
      employeeId: field(row, "employee_id", where),
      name: field(row, "name", where),
      title: field(row, "title", where),
      period: yearMonth(field(row, "period", where), `${where} period`),
      grossPay: dollars(field(row, "gross_pay", where), `${where} gross_pay`),
      benefits: dollars(field(row, "benefits", where), `${where} benefits`),
      plannedAllocation: field(row, "planned_allocation", where),
      jobDescription: field(row, "job_description", where),
    };
  });
  unique(payroll.map((row) => row.employeeId), file, "employee");
  return payroll;
}

/** Also used for the uploaded corrected timesheet in the fix loop. */
export function parseTimesheets(text: string): TimesheetRow[] {
  const file = "timesheets.csv";
  const rows = parseCsv(text, file, ["employee_id", "period", "activity", "fund_code", "hours"]);
  return rows.map((row, index) => {
    const where = `${file} row ${index + 2}`;
    return {
      employeeId: field(row, "employee_id", where),
      period: yearMonth(field(row, "period", where), `${where} period`),
      activity: field(row, "activity", where),
      fund: fundCode(field(row, "fund_code", where), `${where} fund_code`),
      hours: hours(field(row, "hours", where), `${where} hours`),
    };
  });
}

function parseFunds(text: string): Fund[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`funds.json is not valid JSON: ${err instanceof Error ? err.message : err}`);
  }
  if (!Array.isArray(parsed)) throw new Error("funds.json must be a list of funds.");
  const funds = parsed as Fund[];
  const seen = new Set<string>();
  for (const fund of funds) {
    if (!fund || typeof fund !== "object" || !isFundCode(fund.code)) {
      throw new Error(`funds.json has an unknown fund code.`);
    }
    if (seen.has(fund.code)) throw new Error(`funds.json repeats ${fund.code}.`);
    seen.add(fund.code);
    if (typeof fund.name !== "string" || !fund.name.trim()) throw new Error(`${fund.code} is missing a name.`);
    if (fund.type !== FUND_TYPE[fund.code]) {
      throw new Error(`${fund.code} must have type ${FUND_TYPE[fund.code]}.`);
    }
    if (fund.type !== "unrestricted" && (typeof fund.sourceDoc !== "string" || !fund.sourceDoc.trim())) {
      throw new Error(`${fund.code} needs a sourceDoc PDF.`);
    }
    if (fund.periodStart) isoDate(fund.periodStart, `${fund.code} periodStart`);
    if (fund.periodEnd) isoDate(fund.periodEnd, `${fund.code} periodEnd`);
    if (fund.periodStart && fund.periodEnd && fund.periodStart > fund.periodEnd) {
      throw new Error(`${fund.code} periodStart is after periodEnd.`);
    }
    if (fund.budgetRemaining !== undefined && (!Number.isFinite(fund.budgetRemaining) || fund.budgetRemaining < 0)) {
      throw new Error(`${fund.code} budgetRemaining must be a nonnegative number.`);
    }
  }
  const missing = FUND_CODES.filter((code) => !seen.has(code));
  if (missing.length) throw new Error(`funds.json is missing ${missing.join(", ")}.`);
  return funds;
}

function samePeriod(rows: { employeeId: string; period: string }[], file: string) {
  for (const row of rows) {
    if (row.period !== PERIOD) {
      throw new Error(`${file}: ${row.employeeId} is for ${row.period}, not ${PERIOD}.`);
    }
  }
}

export async function readPdfPages(file: string): Promise<string[]> {
  const full = path.join(INPUTS_DIR, file);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(full);
  } catch {
    throw new Error(`grant PDF ${file} is missing from data/inputs.`);
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  if (!Array.isArray(text) || text.length === 0) throw new Error(`grant PDF ${file} has no extractable pages.`);
  return text;
}

async function readInput(file: string): Promise<string> {
  try {
    return await fs.readFile(path.join(INPUTS_DIR, file), "utf8");
  } catch {
    throw new Error(`${file} is missing from data/inputs.`);
  }
}

export async function loadDataset(opts: { timesheetsCsv?: string } = {}): Promise<Dataset> {
  const funds = parseFunds(await readInput("funds.json"));
  const payroll = parsePayroll(await readInput("payroll.csv"));
  const timesheets = parseTimesheets(opts.timesheetsCsv ?? (await readInput("timesheets.csv")));
  samePeriod(payroll, "payroll.csv");
  samePeriod(timesheets, opts.timesheetsCsv ? "uploaded timesheet" : "timesheets.csv");
  const grantDocs: GrantDoc[] = await Promise.all(
    funds
      .filter((fund) => fund.sourceDoc)
      .map(async (fund) => ({ fund: fund.code, file: fund.sourceDoc!, pages: await readPdfPages(fund.sourceDoc!) })),
  );
  return {
    org: "Eastbay Youth Literacy",
    period: PERIOD,
    funds,
    transactions: parseTransactions(await readInput("transactions.csv")),
    payroll,
    timesheets,
    grantDocs,
  };
}
