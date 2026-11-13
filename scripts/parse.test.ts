// Run without API calls: npx tsx --test scripts/parse.test.ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { loadDataset, parsePayroll, parseTimesheets, parseTransactions } from "../lib/data/loadDataset";

const timesheetHeader = "employee_id,period,activity,fund_code,hours";

test("canonical inputs keep the 13 costs, October period, and cent amounts", async () => {
  const dataset = await loadDataset();
  assert.equal(dataset.org, "Eastbay Youth Literacy");
  assert.equal(dataset.period, "2026-10");
  assert.equal(dataset.funds.length, 3);
  assert.equal(dataset.transactions.length, 10);
  assert.equal(dataset.payroll.length, 3);
  assert.equal(dataset.transactions.length + dataset.payroll.length, 13);
  assert.equal(dataset.grantDocs.length, 2);
  const byId = new Map(dataset.transactions.map((row) => [row.id, row.amount]));
  assert.equal(Math.round(byId.get("T-004")! * 100), 41250);
  assert.equal(Math.round(byId.get("T-005")! * 100), 28630);
  assert.equal(Math.round(byId.get("T-007")! * 100), 34218);
  assert.equal(Math.round(byId.get("T-010")! * 100), 14990);
  assert.equal(dataset.payroll.find((row) => row.employeeId === "E-01")?.jobDescription.includes("federal literacy"), true);
  const maria = dataset.timesheets.filter((row) => row.employeeId === "E-01");
  assert.deepEqual(maria.map((row) => [row.fund, row.hours]), [
    ["GRANT-FED", 120],
    ["UNRESTRICTED", 40],
  ]);
});

test("uploaded corrected timesheet replaces October rows and keeps Maria's 96/32/32 hours", async () => {
  const corrected = await fs.readFile("data/inputs/timesheets-corrected.csv", "utf8");
  const dataset = await loadDataset({ timesheetsCsv: corrected });
  const maria = dataset.timesheets.filter((row) => row.employeeId === "E-01");
  assert.deepEqual(maria.map((row) => [row.fund, row.hours]), [
    ["GRANT-FED", 96],
    ["GRANT-FDN", 32],
    ["UNRESTRICTED", 32],
  ]);
  assert.equal(dataset.transactions.length, 10);
});

test("parsers accept a BOM and quoted commas, and reject malformed rows", () => {
  const payroll = parsePayroll(
    "\uFEFFemployee_id,name,title,period,gross_pay,benefits,planned_allocation,job_description\n" +
      'E-09,Ada Lovelace,Director,2026-10,1000.50,10.5,UNRESTRICTED 100%,"Finance, HR"\n',
  );
  assert.equal(payroll[0].jobDescription, "Finance, HR");
  assert.equal(payroll[0].grossPay, 1000.5);
  assert.equal(payroll[0].benefits, 10.5);

  assert.throws(() => parseTransactions("txn_id,date,vendor,description,account\n"), /missing columns: amount/);
  assert.throws(() => parseTransactions(
    "txn_id,date,vendor,description,amount,account\nT-001,2026-10-03,Books,Readers,12.345,Supplies\n",
  ), /at most 2 decimal places/);
  assert.throws(() => parseTransactions(
    "txn_id,date,vendor,description,amount,account\nT-001,2026-02-31,Books,Readers,10,Supplies\n",
  ), /not a real calendar date/);
  assert.throws(() => parseTransactions(
    "txn_id,date,vendor,description,amount,account\nT-001,2026-10-03,Books,Readers,10,Supplies\nT-001,2026-10-04,Other,More,5,Supplies\n",
  ), /repeats transaction T-001/);
  assert.throws(() => parseTimesheets(`${timesheetHeader}\nE-01,2026-10,Tutoring,grant-fed,10\n`), /GRANT-FED, GRANT-FDN, UNRESTRICTED/);
  assert.throws(() => parseTimesheets(`${timesheetHeader}\nE-01,2026-10,Tutoring,GRANT-FED,-4\n`), /nonnegative number of hours/);
  assert.throws(() => parseTimesheets(`${timesheetHeader}\nE-01,2026-13,Tutoring,GRANT-FED,4\n`), /YYYY-MM/);
});

test("an uploaded timesheet for another month is rejected before any split math", async () => {
  const wrongMonth = `${timesheetHeader}\nE-01,2026-09,Tutoring,GRANT-FED,10\n`;
  await assert.rejects(() => loadDataset({ timesheetsCsv: wrongMonth }), /uploaded timesheet: E-01 is for 2026-09, not 2026-10/);
});
