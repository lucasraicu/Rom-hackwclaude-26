import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import Papa from "papaparse";
import type { AnalysisResult } from "@/lib/types";
import initial from "@/lib/fixtures/analysis.initial.json";
import { inspectDocument } from "./documentPreview";
import {
  analyzeUploads,
  validateFinancialRecords,
  type DemoReference,
  type DemoSource,
  type ParsedUpload,
} from "./uploadAnalysis";
import { allocationsToCsv } from "./exportCsv";

async function setup() {
  const names = [
    "grant-fed-agreement.pdf",
    "grant-fdn-agreement.pdf",
    "transactions.csv",
    "payroll.csv",
    "timesheets.csv",
    "funds.json",
  ];
  const sources: DemoSource[] = [];
  const uploads: ParsedUpload[] = [];
  for (const filename of names) {
    const bytes = await fs.readFile(`data/inputs/${filename}`);
    const inspection = await inspectDocument(new File([bytes], filename));
    sources.push({
      filename,
      kind: inspection.kind,
      size: bytes.length,
      mimeType: "",
      base64: bytes.toString("base64"),
      text: filename.endsWith(".pdf") ? undefined : bytes.toString("utf8"),
      pages: inspection.pages,
    });
    uploads.push({ filename, inspection });
  }
  return {
    reference: {
      documents: sources,
    } satisfies DemoReference,
    uploads,
  };
}
const fixtures = setup();

test("complete uploaded initial bundle matches all 13 costs and exact financial totals", async () => {
  const { reference, uploads } = await fixtures;
  const report = analyzeUploads(uploads, reference);
  assert.equal(report.scenario, "initial");
  assert.equal(report.transactionCount, 10);
  assert.equal(report.payrollCount, 3);
  assert.equal(
    report.transactionCents + report.payrollCents,
    Math.round(initial.summary.totalAmount * 100),
  );
  assert.equal(
    initial.allocations.length,
    report.transactionCount + report.payrollCount,
  );
  assert.equal(report.pdfPages, 4);
});

test("renamed files match by complete content, not names", async () => {
  const { reference, uploads } = await fixtures;
  assert.equal(
    analyzeUploads(
      uploads
        .slice(0, -1)
        .map((file, index) => ({ ...file, filename: `renamed-${index}` })),
      reference,
    ).scenario,
    "initial",
  );
});

test("original bundle accepts CSV column order, row order, line endings and whitespace differences", async () => {
  const { reference, uploads } = await fixtures;
  const normalized = await Promise.all(
    uploads.map(async (file) => {
      if (!file.inspection.records) return file;
      const data = file.inspection.records;
      const text = Papa.unparse(
        [
          data.headers
            .slice()
            .reverse()
            .map((key) => ` ${key} `),
          ...data.rows
            .slice()
            .reverse()
            .map((row) =>
              row
                .slice()
                .reverse()
                .map((value) => ` ${value} `),
            ),
        ],
        { newline: "\r\n" },
      );
      return {
        filename: "renamed.csv",
        inspection: await inspectDocument(
          new File(["\uFEFF" + text], "renamed.csv"),
        ),
      };
    }),
  );
  assert.equal(analyzeUploads(normalized, reference).scenario, "initial");
});

test("funds.json is optional and repeated originals are counted once", async () => {
  const { reference, uploads } = await fixtures;
  assert.equal(
    analyzeUploads(
      uploads.filter((file) => file.inspection.format !== "JSON"),
      reference,
    ).scenario,
    "initial",
  );
  const report = analyzeUploads([...uploads, ...uploads], reference);
  assert.equal(report.scenario, "initial");
  assert.equal(report.transactionCount + report.payrollCount, 13);
  assert.equal(report.notices.length, 6);
});

test("mismatch diagnostics identify IDs and exact differing source values", async () => {
  const { reference, uploads } = await fixtures;
  const changed = structuredClone(uploads);
  changed[2].inspection.records!.rows[0][4] = "1241.00";
  const report = analyzeUploads(changed, reference);
  assert.equal(report.scenario, null);
  assert(
    report.reasons.some(
      (reason) =>
        reason.includes("T-001") &&
        reason.includes("amount") &&
        reason.includes("1241.00") &&
        reason.includes("1240.00"),
    ),
  );
});

test("modified amount preserves real parsed totals but cannot receive saved results", async () => {
  const { reference, uploads } = await fixtures;
  const changed = structuredClone(uploads);
  changed[2].inspection.records!.rows[0][4] = "1241.00";
  const report = analyzeUploads(changed, reference);
  assert.equal(report.scenario, null);
  assert.equal(
    report.transactionCents,
    analyzeUploads(uploads, reference).transactionCents + 100,
  );
});

test("changed descriptions and PDF text fail despite unchanged totals and filenames", async () => {
  const { reference, uploads } = await fixtures;
  const changed = structuredClone(uploads);
  changed[2].inspection.records!.rows[0][3] = "Unrelated purchase";
  assert.equal(analyzeUploads(changed, reference).scenario, null);
  const changedPdf = structuredClone(uploads);
  changedPdf[0].inspection.pages![0] += " Changed grant restriction.";
  assert.equal(analyzeUploads(changedPdf, reference).scenario, null);
});

test("missing sources and additional unrelated evidence do not match; repeated originals count once", async () => {
  const { reference, uploads } = await fixtures;
  assert.equal(analyzeUploads(uploads.slice(1), reference).scenario, null);
  assert.equal(
    analyzeUploads([...uploads, uploads[2]], reference).scenario,
    "initial",
  );
  const extra = {
    filename: "receipt.txt",
    inspection: await inspectDocument(
      new File(["Unrelated receipt"], "receipt.txt"),
    ),
  };
  assert.equal(analyzeUploads([...uploads, extra], reference).scenario, null);
});

test("only original timesheet content unlocks the initial scenario", async () => {
  const { reference, uploads } = await fixtures;
  const changed = structuredClone(uploads);
  changed[4].inspection.records!.rows[0][4] = "96";
  assert.equal(analyzeUploads(changed, reference).scenario, null);
});

test("transaction and payroll schemas validate cents, dates, required fields and duplicate IDs", async () => {
  for (const text of [
    "txn_id,date,vendor,description,amount,account\nA,2026-02-30,V,D,10,A",
    "txn_id,date,vendor,description,amount,account\nA,2026-10-01,V,D,NaN,A",
    "employee_id,gross_pay\nE-1,100",
  ]) {
    const inspection = await inspectDocument(new File([text], "records.csv"));
    assert.throws(() => validateFinancialRecords(inspection));
  }
});

test("unrelated financial records show only their own parsed counts and dollars", async () => {
  const { reference } = await fixtures;
  const inspection = await inspectDocument(
    new File(
      [
        "txn_id,date,vendor,description,amount,account\nNEW-1,2026-10-01,New vendor,Own expense,7.50,Office",
      ],
      "own.csv",
    ),
  );
  const report = analyzeUploads(
    [{ filename: "own.csv", inspection }],
    reference,
  );
  assert.equal(report.scenario, null);
  assert.equal(report.transactionCount, 1);
  assert.equal(report.transactionCents, 750);
});

test("answer-key filenames are blocked before bytes are read", async () => {
  for (const name of [
    "expected.json",
    "EXPECTED_TEST_CASES_DO_NOT_UPLOAD.txt",
    "answer-key.csv",
  ]) {
    const file = new File(["never read"], name);
    file.arrayBuffer = async () => {
      throw new Error("Answer key was read");
    };
    await assert.rejects(inspectDocument(file), /Test-only/);
  }
});

test("all saved citation quotes resolve to the bundled source page", async () => {
  const { reference } = await fixtures;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  for (const result of [initial])
    for (const item of result.allocations)
      for (const citation of item.citations) {
        const source = reference.documents.find(
          (file) => file.filename === citation.sourceDoc,
        );
        assert(source?.pages?.[citation.page - 1]);
        assert(
          normalize(source.pages[citation.page - 1]).includes(
            normalize(citation.quote),
          ),
        );
      }
});

test("CSV export retains 13 IDs, split cents, original quotes and local reviews", () => {
  const text = allocationsToCsv(initial as AnalysisResult, {
    "PAY-E-01": "accepted",
  });
  const parsed = Papa.parse<Record<string, string>>(text, { header: true });
  assert.equal(new Set(parsed.data.map((row) => row.item_id)).size, 13);
  assert(
    parsed.data.some(
      (row) =>
        row.item_id === "PAY-E-01" && row.reviewer_decision === "accepted",
    ),
  );
  assert(
    parsed.data.every((row) =>
      row.provenance.includes("No live Claude API call"),
    ),
  );
  assert(
    parsed.data.some((row) =>
      row.citations.includes(initial.allocations[0].citations[0].quote),
    ),
  );
});
