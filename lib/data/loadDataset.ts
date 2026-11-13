// DATA lane. Reads data/inputs into the shared Dataset shape.
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { extractText, getDocumentProxy } from "unpdf";
import type { Dataset, Fund, FundCode, GrantDoc, PayrollLine, TimesheetRow, Transaction } from "../types";

export const INPUTS_DIR = path.join(process.cwd(), "data", "inputs");

function parseCsv(text: string): Record<string, string>[] {
  const out = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  if (out.errors.length) throw new Error(`CSV parse error: ${out.errors[0].message}`);
  return out.data;
}

export function parseTransactions(text: string): Transaction[] {
  return parseCsv(text).map((r) => ({
    id: r.txn_id,
    date: r.date,
    vendor: r.vendor,
    description: r.description,
    amount: Number(r.amount),
    account: r.account,
  }));
}

export function parsePayroll(text: string): PayrollLine[] {
  return parseCsv(text).map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    title: r.title,
    period: r.period,
    grossPay: Number(r.gross_pay),
    benefits: Number(r.benefits),
    plannedAllocation: r.planned_allocation,
    jobDescription: r.job_description,
  }));
}

/** Also used for the uploaded corrected timesheet in the fix loop. */
export function parseTimesheets(text: string): TimesheetRow[] {
  return parseCsv(text).map((r) => ({
    employeeId: r.employee_id,
    period: r.period,
    activity: r.activity,
    fund: r.fund_code as FundCode,
    hours: Number(r.hours),
  }));
}

export async function readPdfPages(file: string): Promise<string[]> {
  const bytes = new Uint8Array(await fs.readFile(path.join(INPUTS_DIR, file)));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

export async function loadDataset(opts: { timesheetsCsv?: string } = {}): Promise<Dataset> {
  const read = (f: string) => fs.readFile(path.join(INPUTS_DIR, f), "utf8");
  const funds: Fund[] = JSON.parse(await read("funds.json"));
  const grantDocs: GrantDoc[] = await Promise.all(
    funds
      .filter((f) => f.sourceDoc)
      .map(async (f) => ({ fund: f.code, file: f.sourceDoc!, pages: await readPdfPages(f.sourceDoc!) })),
  );
  return {
    org: "Eastbay Youth Literacy",
    period: "2026-10",
    funds,
    transactions: parseTransactions(await read("transactions.csv")),
    payroll: parsePayroll(await read("payroll.csv")),
    timesheets: parseTimesheets(opts.timesheetsCsv ?? (await read("timesheets.csv"))),
    grantDocs,
  };
}
