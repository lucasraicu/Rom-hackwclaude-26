// No API calls: npx tsx --test scripts/upload.test.ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseUploadedFile } from "../lib/data/parseFiles";
import { normalizeUpload } from "../lib/data/normalizeUpload";
import { buildMockAnalysis } from "../lib/data/mockAnalysis";
import { getUploadedDataset, loadUploadedDataset, saveUploadedDataset, UPLOAD_STORE_DIR } from "../lib/data/uploadStore";
import { UPLOAD_LIMITS, UploadError } from "../lib/data/uploadTypes";
import { GET, POST } from "../app/api/dataset/route";

const csv = "Transaction ID,Transaction Date,Merchant,Memo,Total,Category\nCUSTOM-19,2026-10-08,Community Books,Readers,$125.50,Supplies\n";
const csvFile = (text = csv, name = "my-expenses.csv") => new File([text], name, { type: "text/csv" });
const diskFile = async (name: string) => new File([new Uint8Array(await fs.readFile(name))], path.basename(name));
const bundle = async (fixed = false) => {
  const files = ["grant-fed-agreement.pdf", "grant-fdn-agreement.pdf", "transactions.csv", "payroll.csv", fixed ? "timesheets-corrected.csv" : "timesheets.csv"];
  const documents = [];
  for (const file of files) documents.push(await parseUploadedFile(await diskFile(`data/inputs/${file}`)));
  return normalizeUpload(documents);
};

test("CSV alias headers normalize actual uploaded costs and retain row provenance", async () => {
  const document = await parseUploadedFile(csvFile());
  const normalized = normalizeUpload([document]);
  assert.equal(normalized.readyForAnalysis, true, normalized.missingRequirements.join(" "));
  assert.equal(normalized.dataset.transactions.length, 1);
  assert.deepEqual(normalized.dataset.transactions[0], { id: "CUSTOM-19", date: "2026-10-08", vendor: "Community Books", description: "Readers", amount: 125.5, account: "Supplies" });
  assert.equal(normalized.dataset.recordSources?.["CUSTOM-19"][0].row, 2);
  const mock = buildMockAnalysis(normalized.dataset);
  assert.equal(mock.mode, "mock");
  assert.equal(mock.allocations.length, 1);
  assert.equal(mock.allocations[0].itemId, "CUSTOM-19");
  assert.equal(mock.allocations[0].status, "needs_evidence");
  assert.match(mock.allocations[0].reason, /Simulated Claude/);
  assert.equal(mock.rules.length, 0);
  assert.equal(mock.summary.citationsVerified, 0);
});

for (const fixed of [false, true]) {
  test(`uploaded ${fixed ? "fixed" : "initial"} 13-cost bundle has actual grant pages, hours and mock results`, async () => {
    const normalized = await bundle(fixed);
    assert.deepEqual(normalized.missingRequirements, []);
    assert.equal(normalized.readyForAnalysis, true);
    assert.equal(normalized.dataset.org, "Eastbay Youth Literacy");
    assert.equal(normalized.dataset.grantDocs.length, 2);
    assert.equal(normalized.dataset.funds.find((fund) => fund.code === "GRANT-FED")?.periodStart, "2026-07-01");
    assert.equal(normalized.dataset.funds.find((fund) => fund.code === "GRANT-FDN")?.periodEnd, "2027-08-31");
    assert.ok(normalized.dataset.funds.every((fund) => fund.budgetRemaining === undefined));
    const mock = buildMockAnalysis(normalized.dataset);
    assert.equal(mock.allocations.length, 13);
    assert.equal(mock.summary.totalAmount, 27752.28);
    assert.equal(mock.summary.byStatus.needs_evidence.count, 13);
    assert.deepEqual(mock.allocations.find((item) => item.itemId === "PAY-E-01")!.splits.map((split) => split.amount), fixed ? [4464, 1488, 1488] : [5580, 1860]);
    assert.ok(mock.allocations.every((item) => item.sourceRefs?.length));
  });
}

test("XLSX sheet/row provenance and EML supporting evidence are parsed without inventing extra costs", async () => {
  const workbook = await parseUploadedFile(await diskFile("data/examples/transactions.xlsx"));
  assert.equal(workbook.parseStatus, "parsed", workbook.warnings.join(" "));
  assert.equal(workbook.tables?.[0].sheet, "Expenses");
  const email = await parseUploadedFile(await diskFile("data/examples/approval.eml"));
  assert.equal(email.kind, "email");
  assert.match(email.text!, /Fictional program supplies/);
  const normalized = normalizeUpload([workbook, email]);
  assert.equal(normalized.readyForAnalysis, true);
  assert.equal(normalized.dataset.transactions.length, 1);
  assert.equal(normalized.dataset.transactions[0].amount, 125.5);
  assert.equal(normalized.dataset.recordSources?.["U-001"][0].sheet, "Expenses");
  assert.ok(normalized.warnings.some((warning) => warning.includes("supporting text only")));
});

test("bad and unsupported files stay visible while valid records remain usable", async () => {
  const unknown = await parseUploadedFile(new File(["binary"], "picture.png"));
  assert.equal(unknown.parseStatus, "unsupported");
  const malformed = await parseUploadedFile(csvFile("a,b\n1,2,3", "broken.csv"));
  assert.equal(malformed.parseStatus, "error");
  const result = normalizeUpload([await parseUploadedFile(csvFile()), unknown, malformed]);
  assert.equal(result.documents.length, 3);
  assert.equal(result.dataset.transactions.length, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("not analyzed")));
  await assert.rejects(() => parseUploadedFile(new File(["test"], "../secret.csv")), UploadError);
  await assert.rejects(() => parseUploadedFile(new File([""], "empty.csv")), /empty/);
});

test("duplicate costs are reconciled, conflicting IDs and ambiguous duplicate costs block analysis", async () => {
  const copies = await Promise.all([parseUploadedFile(csvFile()), parseUploadedFile(csvFile(csv, "copy.csv"))]);
  const exact = normalizeUpload(copies);
  assert.equal(exact.dataset.transactions.length, 1);
  assert.equal(exact.dataset.recordSources?.["CUSTOM-19"].length, 2);
  assert.equal(exact.readyForAnalysis, true);
  const conflict = normalizeUpload([await parseUploadedFile(csvFile()), await parseUploadedFile(csvFile(csv.replace("$125.50", "$200.00"), "other.csv"))]);
  assert.equal(conflict.readyForAnalysis, false);
  assert.match(conflict.missingRequirements.join(" "), /Conflicting records/);
  const ambiguous = normalizeUpload([await parseUploadedFile(csvFile()), await parseUploadedFile(csvFile(csv.replace("CUSTOM-19", "OTHER-20"), "other.csv"))]);
  assert.equal(ambiguous.readyForAnalysis, false);
  assert.match(ambiguous.missingRequirements.join(" "), /Possible duplicate/);
});

test("unknown headers, invalid money and mixed periods never produce fabricated demo records", async () => {
  const unknown = normalizeUpload([await parseUploadedFile(csvFile("hello,world\na,b"))]);
  assert.equal(unknown.readyForAnalysis, false);
  assert.equal(unknown.dataset.transactions.length, 0);
  const invalid = normalizeUpload([await parseUploadedFile(csvFile(csv.replace("$125.50", "12.345")))]);
  assert.equal(invalid.readyForAnalysis, false);
  assert.equal(invalid.dataset.transactions.length, 0);
  const mixed = normalizeUpload([await parseUploadedFile(csvFile(csv + "CUSTOM-20,2026-11-08,Other Books,Readers,$100.00,Supplies\n"))]);
  assert.equal(mixed.readyForAnalysis, false);
  assert.match(mixed.missingRequirements.join(" "), /multiple accounting months/);
});

test("a correction must replace original time rows rather than silently summing conflicting sheets", async () => {
  const normalized = await bundle();
  const correction = await parseUploadedFile(await diskFile("data/inputs/timesheets-corrected.csv"));
  const combined = normalizeUpload([...normalized.documents, correction]);
  assert.equal(combined.readyForAnalysis, false);
  assert.match(combined.missingRequirements.join(" "), /Conflicting time records/);
});

test("persisted uploads survive reload, block unknown IDs and enforce expiration/readiness", async () => {
  const saved = await saveUploadedDataset(normalizeUpload([await parseUploadedFile(csvFile())]));
  const file = path.join(UPLOAD_STORE_DIR, saved.datasetId + ".json");
  try {
    assert.equal((await loadUploadedDataset(saved.datasetId)).transactions[0].id, "CUSTOM-19");
    assert.equal((await getUploadedDataset(saved.datasetId)).datasetId, saved.datasetId);
    await assert.rejects(() => getUploadedDataset("../../secret"), /Invalid/);
    saved.expiresAt = "2000-01-01T00:00:00Z";
    await fs.writeFile(file, JSON.stringify(saved));
    await assert.rejects(() => loadUploadedDataset(saved.datasetId), /expired/);
  } finally { await fs.unlink(file); }
  const notReady = await saveUploadedDataset(normalizeUpload([]));
  try { await assert.rejects(() => loadUploadedDataset(notReady.datasetId), /recognizable columns/); }
  finally { await fs.unlink(path.join(UPLOAD_STORE_DIR, notReady.datasetId + ".json")); }
});

test("multipart dataset endpoint returns uploaded inventory, and reports type/size/duplicate-name errors", async () => {
  const previousMode = process.env.FUNDPROOF_MOCK;
  process.env.FUNDPROOF_MOCK = "1";
  const form = new FormData(); form.append("files", csvFile()); form.append("org", "Test Nonprofit");
  const response = await POST(new Request("http://localhost/api/dataset", { method: "POST", body: form }));
  assert.equal(response.status, 201);
  const record = await response.json();
  try {
    assert.equal(record.dataset.org, "Test Nonprofit");
    assert.equal(record.readyForAnalysis, true);
    assert.equal(record.dataset.transactions[0].id, "CUSTOM-19");
    assert.equal(record.mockAnalysis.mode, "mock");
    assert.equal(record.mockAnalysis.allocations[0].itemId, "CUSTOM-19");
    assert.equal(record.mockAnalysis.allocations[0].status, "needs_evidence");
    const read = await GET(new Request(`http://localhost/api/dataset?datasetId=${record.datasetId}`));
    assert.equal(read.status, 200);
    assert.equal((await read.json()).datasetId, record.datasetId);
  } finally {
    await fs.unlink(path.join(UPLOAD_STORE_DIR, record.datasetId + ".json"));
    if (previousMode === undefined) delete process.env.FUNDPROOF_MOCK; else process.env.FUNDPROOF_MOCK = previousMode;
  }
  const json = await POST(new Request("http://localhost/api/dataset", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  assert.equal(json.status, 415);
  assert.equal((await GET(new Request("http://localhost/api/dataset?datasetId="))).status, 400);
  const tooBig = await POST(new Request("http://localhost/api/dataset", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(UPLOAD_LIMITS.totalBytes * 2) } }));
  assert.equal(tooBig.status, 413);
  const duplicated = new FormData(); duplicated.append("files", csvFile()); duplicated.append("files", csvFile());
  assert.equal((await POST(new Request("http://localhost/api/dataset", { method: "POST", body: duplicated }))).status, 400);
});

test("analyze uses uploaded records in both mock modes, rejects live uploads and preserves demo responses", async () => {
  const { POST: analyze } = await import("../app/api/analyze/route");
  const previousMode = process.env.FUNDPROOF_MOCK;
  const saved = await saveUploadedDataset(normalizeUpload([await parseUploadedFile(csvFile())]));
  const notReady = await saveUploadedDataset(normalizeUpload([]));
  const request = (body: unknown) => analyze(new Request("http://localhost/api/analyze", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  try {
    for (const mode of ["1", "cache"]) {
      process.env.FUNDPROOF_MOCK = mode;
      const response = await request({ datasetId: saved.datasetId });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.mode, "mock");
      assert.equal(result.allocations.length, 1);
      assert.equal(result.allocations[0].itemId, "CUSTOM-19");
      assert.equal(result.allocations[0].amount, 125.5);
      assert.equal(result.allocations[0].status, "needs_evidence");
      assert.deepEqual(result.rules, []);
      assert.equal((await request({ datasetId: "00000000-0000-4000-8000-000000000000" })).status, 404);
    }
    for (const datasetId of ["", "  ", null, 42, []]) {
      assert.equal((await request({ datasetId })).status, 400);
    }
    assert.equal((await request({ datasetId: "../../secret" })).status, 400);
    assert.equal((await request({ datasetId: notReady.datasetId })).status, 422);
    process.env.FUNDPROOF_MOCK = "0";
    const live = await request({ datasetId: saved.datasetId });
    assert.equal(live.status, 501);
    assert.match((await live.json()).error, /only be analyzed in mock mode/);
    process.env.FUNDPROOF_MOCK = "1";
    for (const [body, file] of [[{}, "analysis.initial.json"], [{ timesheetsCsv: "corrected CSV" }, "analysis.after-fix.json"]] as const) {
      const fixture = JSON.parse(await fs.readFile(path.join("lib/fixtures", file), "utf8"));
      const response = await request(body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), fixture);
    }
    saved.expiresAt = "2000-01-01T00:00:00Z";
    await fs.writeFile(path.join(UPLOAD_STORE_DIR, saved.datasetId + ".json"), JSON.stringify(saved));
    assert.equal((await request({ datasetId: saved.datasetId })).status, 410);
  } finally {
    await Promise.all([saved, notReady].map((record) => fs.unlink(path.join(UPLOAD_STORE_DIR, record.datasetId + ".json"))));
    if (previousMode === undefined) delete process.env.FUNDPROOF_MOCK; else process.env.FUNDPROOF_MOCK = previousMode;
  }
});
