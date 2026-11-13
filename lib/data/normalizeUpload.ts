import { createHash } from "node:crypto";
import type { Dataset, Fund, FundCode, PayrollLine, TimesheetRow, Transaction } from "../types";
import type { UploadedDocument, UploadSource, UploadTable } from "./uploadTypes";

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  txn_id: ["txn_id", "transaction_id", "transaction number", "reference", "id"],
  date: ["date", "transaction date", "posting date", "expense date"],
  vendor: ["vendor", "payee", "merchant", "supplier"],
  description: ["description", "memo", "details", "expense description"],
  amount: ["amount", "total", "expense amount", "total amount", "debit"],
  account: ["account", "category", "expense account"],
  employee_id: ["employee_id", "employee number", "staff id", "worker id"],
  name: ["name", "employee name", "employee", "staff name"],
  title: ["title", "job title", "role"],
  period: ["period", "pay period", "month", "accounting period"],
  gross_pay: ["gross_pay", "gross salary", "gross wages", "salary", "gross pay"],
  benefits: ["benefits", "fringe", "fringe benefits", "employer benefits"],
  planned_allocation: ["planned_allocation", "budget split", "planned split"],
  job_description: ["job_description", "job duties", "duties"],
  activity: ["activity", "work description", "work activity", "program"],
  fund_code: ["fund_code", "fund", "funding source", "grant", "grant code"],
  hours: ["hours", "hours worked", "actual hours", "logged hours"],
};
const lookup = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map((name) => [key(name), field] as const)));
const derivedId = (prefix: string, value: string) => `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;

function money(raw: string, label: string, optional = false): number {
  if (!raw.trim() && optional) return 0;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`${label} needs a nonnegative amount with at most two decimals.`);
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} exceeds the safe amount range.`);
  return cents / 100;
}

function date(raw: string, label: string): string {
  let normalized = raw.trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (us) normalized = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const parsed = new Date(normalized + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} needs a real YYYY-MM-DD date (MM/DD/YYYY also accepted).`);
  }
  return normalized;
}

function period(raw: string, label: string): string {
  const value = raw.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error(`${label} needs YYYY-MM.`);
  return value;
}

function headerMap(table: UploadTable) {
  const map = new Map<string, number>();
  table.columns.forEach((column, index) => {
    const field = lookup.get(key(column));
    if (field && map.has(field)) throw new Error(`Two columns map to ${field}; rename one to resolve the ambiguity.`);
    if (field) map.set(field, index);
  });
  return map;
}

function tableKind(fields: Map<string, number>): UploadedDocument["kind"] {
  if (fields.has("hours") && (fields.has("employee_id") || fields.has("name"))) return "timesheet";
  if (fields.has("gross_pay") && (fields.has("employee_id") || fields.has("name"))) return "payroll";
  if (fields.has("amount") && fields.has("date") && (fields.has("vendor") || fields.has("description"))) return "transactions";
  return "unknown";
}

function grantFund(document: UploadedDocument): Fund | undefined {
  const text = (document.pages ?? [document.text ?? ""]).join("\n");
  if (!/(?:grant|subaward)\s+(?:agreement|period)|period of performance/i.test(text)) return undefined;
  document.kind = "grant";
  const federal = /(?:federal\s+(?:award|grant|program|literacy|subaward)|2\s*CFR|federal\s+funds)/i.test(text) && !/not\s+(?:a\s+)?federal|non[- ]federal/i.test(text);
  const foundation = /(?:grantor[^\n]*foundation|private\s+(?:foundation|grant)|foundation\s*·)/i.test(text);
  if (federal === foundation) {
    document.warnings.push("Grant funding type is ambiguous; no federal or foundation classification was assumed.");
    return undefined;
  }
  const code: FundCode = federal ? "GRANT-FED" : "GRANT-FDN";
  document.fundCode = code;
  const fund: Fund = { code, type: federal ? "federal" : "foundation", name: text.split("\n").find((line) => line.trim())?.trim() ?? document.filename, sourceDoc: document.filename };
  const award = /(?:Subaward|Grant)\s+No\.?\s*([^·\n]+)/i.exec(text)?.[1]?.trim();
  if (award) fund.awardNumber = award;
  const iso = /(?:period(?: of performance)?|grant period)\s*:\s*(\d{4}-\d{2}-\d{2})\s*(?:to|through|–|—)\s*(\d{4}-\d{2}-\d{2})/i.exec(text);
  const written = /(?:period(?: of performance)?|grant period)\s*:\s*([A-Za-z]+ \d{1,2}, \d{4})\s*(?:to|through|–|—)\s*([A-Za-z]+ \d{1,2}, \d{4})/i.exec(text);
  if (iso) { fund.periodStart = date(iso[1], "Grant period"); fund.periodEnd = date(iso[2], "Grant period"); }
  else if (written) {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const parse = (value: string) => {
      const match = /^(\w+) (\d+), (\d+)$/.exec(value)!;
      const month = months.indexOf(match[1].toLowerCase()) + 1;
      return date(`${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`, "Grant period");
    };
    fund.periodStart = parse(written[1]); fund.periodEnd = parse(written[2]);
  }
  if (!fund.periodStart || !fund.periodEnd) document.warnings.push("Grant dates were not recognized; funding-period eligibility remains unverified.");
  document.warnings.push("Remaining grant balance is unknown; the award amount is not treated as available funding.");
  return fund;
}

export function normalizeUpload(documents: UploadedDocument[], options: { org?: string; period?: string } = {}) {
  const warnings: string[] = [];
  const missingRequirements: string[] = [];
  const funds: Fund[] = [{ code: "UNRESTRICTED", type: "unrestricted", name: "Unrestricted (review required)" }];
  const grantDocs: Dataset["grantDocs"] = [];
  const transactions: Transaction[] = [];
  const payroll: PayrollLine[] = [];
  const timesheets: TimesheetRow[] = [];
  const recordSources: Record<string, UploadSource[]> = Object.create(null);
  const tables: { document: UploadedDocument; table: UploadTable; fields: Map<string, number>; kind: UploadedDocument["kind"] }[] = [];
  let inferredOrg: string | undefined;
  for (const document of documents) {
    if (document.parseStatus !== "parsed") continue;
    try {
      const fund = grantFund(document);
      if (fund) {
        if (funds.some((item) => item.code === fund.code)) missingRequirements.push(`Multiple ${fund.type} grants exceed this demo's one-grant-per-type limit; select one agreement of each type.`);
        else {
          funds.push(fund);
          // Existing Citation shape supports page-based PDF grants only.
          if (document.pages) grantDocs.push({ fund: fund.code, file: document.filename, pages: document.pages });
          else document.warnings.push("Text grant terms are visible, but grant citation verification currently requires a PDF.");
        }
        inferredOrg ??= /(?:Subrecipient|Grantee):\s*([^·\n]+)/i.exec((document.pages ?? []).join("\n"))?.[1]?.trim();
      }
      for (const item of document.tables ?? []) {
        const fields = headerMap(item);
        const kind = tableKind(fields);
        tables.push({ document, table: item, fields, kind });
        document.kind = document.kind === "unknown" ? kind : document.kind === kind ? kind : "supporting";
        if (kind === "unknown") document.warnings.push(`${item.sheet ? `Sheet ${item.sheet}: ` : ""}Headers were not recognized as transactions, payroll or timesheets; these rows were not turned into costs.`);
      }
      if (document.kind === "unknown" && !document.tables) {
        const text = (document.pages ?? [document.text ?? ""]).join("\n");
        document.kind = /invoice|receipt|bill to|amount due/i.test(text) ? "receipt" : "supporting";
      }
      if (["receipt", "email", "supporting"].includes(document.kind)) document.warnings.push("Preserved as supporting text only. Mock mode does not extract new costs, verify approvals, or establish that this document supports an allocation.");
    } catch (error) { document.parseStatus = "error"; document.warnings.push(error instanceof Error ? error.message : "Could not classify document."); }
  }
  const byId = new Map<string, Transaction | PayrollLine>();
  const fingerprints = new Map<string, string>();
  function add(item: Transaction | PayrollLine, id: string, source: UploadSource, document: UploadedDocument) {
    const existing = byId.get(id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(item)) missingRequirements.push(`Conflicting records use ${id}; resolve the different amounts or details before analysis.`);
      else warnings.push(`Duplicate record ${id} was counted once; both sources are retained.`);
    } else {
      const values = { ...item };
      if ("id" in values) delete (values as Partial<Transaction>).id;
      const fingerprint = JSON.stringify(values);
      const other = fingerprints.get(fingerprint);
      if (other) missingRequirements.push(`Possible duplicate costs ${other} and ${id} have the same details but different IDs; confirm the correct record.`);
      fingerprints.set(fingerprint, id);
      byId.set(id, item);
      if ("id" in item) transactions.push(item); else payroll.push(item);
    }
    (recordSources[id] ??= []).push(source);
    document.linkedItemIds = [...new Set([...(document.linkedItemIds ?? []), id])];
  }
  // Payroll goes first so named time records can resolve to an existing employee ID.
  const ordered = [...tables].sort((a, b) => Number(b.kind === "payroll") - Number(a.kind === "payroll"));
  for (const { document, table, fields, kind } of ordered) {
    if (kind === "unknown") continue;
    const staged: { item: Transaction | PayrollLine | TimesheetRow; id: string; source: UploadSource }[] = [];
    try {
      for (const [index, row] of table.rows.entries()) {
        const source = { documentId: document.id, filename: document.filename, sheet: table.sheet, row: index + 2 };
        const where = `${document.filename}${table.sheet ? ` / ${table.sheet}` : ""} row ${index + 2}`;
        const get = (field: string) => (row[fields.get(field) ?? -1] ?? "").trim();
        const required = (field: string) => { const value = get(field); if (!value) throw new Error(`${where}: missing ${field}.`); return value; };
        if (kind === "transactions") {
          const item: Transaction = {
            id: get("txn_id") || derivedId("TX", JSON.stringify(row)), date: date(required("date"), where),
            vendor: get("vendor"), description: get("description"), amount: money(required("amount"), where), account: get("account"),
          };
          if (!item.vendor && !item.description) throw new Error(`${where}: missing payee and description.`);
          staged.push({ item, id: item.id, source });
        } else {
          const name = get("name");
          let employeeId = get("employee_id");
          if (!employeeId && name) {
            const matches = payroll.filter((item) => key(item.name) === key(name));
            if (matches.length > 1) throw new Error(`${where}: employee name is ambiguous; supply an employee ID.`);
            employeeId = matches[0]?.employeeId ?? derivedId("EMP", key(name));
          }
          if (!employeeId) throw new Error(`${where}: missing employee ID or name.`);
          const itemPeriod = period(get("period") || options.period || "", where);
          if (kind === "payroll") {
            if (!name) throw new Error(`${where}: missing employee name.`);
            if (!get("benefits")) document.warnings.push(`${where}: no benefits amount supplied; this payroll amount includes gross pay only.`);
            const item: PayrollLine = { employeeId, name, title: get("title"), period: itemPeriod,
              grossPay: money(required("gross_pay"), where), benefits: money(get("benefits"), where, true),
              plannedAllocation: get("planned_allocation"), jobDescription: get("job_description") };
            staged.push({ item, id: `PAY-${employeeId}`, source });
          } else {
            const rawFund = required("fund_code");
            const fund = funds.find((item) => key(item.code) === key(rawFund) || key(item.name) === key(rawFund));
            if (!fund) throw new Error(`${where}: unknown fund ${rawFund}; upload its agreement or use an existing fund code.`);
            const hours = Number(required("hours"));
            if (!Number.isFinite(hours) || hours < 0) throw new Error(`${where}: hours must be a nonnegative number.`);
            staged.push({ item: { employeeId, period: itemPeriod, activity: required("activity"), fund: fund.code, hours }, id: `PAY-${employeeId}`, source });
          }
        }
      }
      for (const { item, id, source } of staged) {
        if ("hours" in item) {
          const conflicting = timesheets.find((existing) => existing.employeeId === item.employeeId && existing.period === item.period &&
            existing.fund === item.fund && key(existing.activity) === key(item.activity) && existing.hours !== item.hours);
          if (conflicting) missingRequirements.push(`Conflicting time records for ${item.employeeId}; replace the original sheet instead of combining it with a correction.`);
          if (timesheets.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) warnings.push(`Repeated time record for ${item.employeeId} was counted once.`);
          else timesheets.push(item);
          (recordSources[id] ??= []).push(source);
          document.linkedItemIds = [...new Set([...(document.linkedItemIds ?? []), id])];
        } else add(item, id, source, document);
      }
    } catch (error) {
      document.parseStatus = "error";
      const message = error instanceof Error ? error.message : "Could not normalize table.";
      document.warnings.push(message);
      missingRequirements.push(message);
    }
  }
  for (const row of timesheets) if (!payroll.some((item) => item.employeeId === row.employeeId)) missingRequirements.push(`Time record ${row.employeeId} has no matching payroll employee.`);
  for (const item of transactions) {
    if (/payroll|salary|wages/i.test(`${item.vendor} ${item.description}`) && payroll.length) missingRequirements.push(`Transaction ${item.id} may duplicate the uploaded payroll; remove or reconcile the bank payroll debit before analysis.`);
  }
  const periods = new Set([...transactions.map((item) => item.date.slice(0, 7)), ...payroll.map((item) => item.period), ...timesheets.map((item) => item.period)]);
  let accountingPeriod = options.period?.trim() ?? "";
  if (accountingPeriod) accountingPeriod = period(accountingPeriod, "Accounting period");
  if (!accountingPeriod && periods.size === 1) accountingPeriod = [...periods][0];
  if (periods.size > 1) missingRequirements.push("Uploaded records cover multiple accounting months; select a single month's records.");
  if (accountingPeriod && [...periods].some((value) => value !== accountingPeriod)) missingRequirements.push("Some records differ from the selected accounting period.");
  if (!transactions.length && !payroll.length) missingRequirements.push("Upload a transaction or payroll CSV/XLSX with recognizable columns; supporting documents alone do not establish cost records.");
  if (!accountingPeriod) missingRequirements.push("Accounting month could not be determined; supply period as YYYY-MM or include dated cost records.");
  if (!grantDocs.length) warnings.push("No recognized PDF grant agreement was uploaded; grant rules and eligibility remain unverified.");
  if (payroll.length && !timesheets.length) warnings.push("No normalized time records were uploaded; payroll allocations need actual-work evidence.");
  for (const document of documents) warnings.push(...document.warnings.map((warning) => `${document.filename}: ${warning}`));
  warnings.push("Mock Claude response only: no API call, eligibility determination, or approval is performed.");
  const dataset: Dataset = { org: options.org?.trim() || inferredOrg || "Uploaded organization (name not supplied)", period: accountingPeriod,
    funds, transactions, payroll, timesheets, grantDocs, documents, warnings: [...new Set(warnings)], recordSources };
  return { dataset, documents, warnings: dataset.warnings!, missingRequirements: [...new Set(missingRequirements)], readyForAnalysis: missingRequirements.length === 0 };
}
