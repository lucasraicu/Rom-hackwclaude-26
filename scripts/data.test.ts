// Run without API calls: npx tsx --test scripts/data.test.ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { splitByPercent, percentsFromTimesheets } from "../lib/data/computeSplits";
import { verifyCitation } from "../lib/data/verifyCitations";
import { evaluateAnalysis, type ExpectedItems } from "../lib/data/evaluateAnalysis";
import { loadDataset } from "../lib/data/loadDataset";
import { summarize } from "../lib/data/summarize";
import { buildResult } from "../lib/pipeline";
import type { Proposal } from "../lib/ai/proposeAllocations";
import type { AnalysisResult, Citation, GrantDoc, TimesheetRow } from "../lib/types";

const docs: GrantDoc[] = [{ fund: "GRANT-FED", file: "grant.pdf", pages: ["Only actual work is allowed.", "Records must show “actual work”."] }];
const citation: Citation = { sourceDoc: "grant.pdf", page: 1, quote: "Only actual work is allowed.", verified: null };

test("citation verification rejects empty quotes, invented text, unknown documents and invalid pages", () => {
  for (const quote of ["", "   \n", "invented permission", "only actual work is allowed."]) {
    assert.equal(verifyCitation({ ...citation, quote }, docs).verified, false);
  }
  for (const page of [0, -1, 1.5, NaN]) assert.equal(verifyCitation({ ...citation, page }, docs).verified, false);
  assert.equal(verifyCitation({ ...citation, sourceDoc: "absent.pdf" }, docs).verified, false);
});

test("citation verification tolerates layout whitespace and typography, and corrects a mistaken page", () => {
  assert.deepEqual(verifyCitation({ ...citation, page: 2 }, docs), { ...citation, verified: true });
  assert.equal(verifyCitation({ ...citation, page: 2, quote: 'Records must\n show "actual work".' }, docs).verified, true);
});

test("Maria's corrected payroll is allocated to exact cent amounts", () => {
  assert.deepEqual(splitByPercent(7440, [
    { fund: "GRANT-FED", percent: 60 }, { fund: "GRANT-FDN", percent: 20 }, { fund: "UNRESTRICTED", percent: 20 },
  ]).map((split) => split.amount), [4464, 1488, 1488]);
});

test("rounding never creates negative cents or funds with money at zero percent", () => {
  const parts = [{ fund: "GRANT-FED" as const, percent: 50 }, { fund: "GRANT-FDN" as const, percent: 50 }, { fund: "UNRESTRICTED" as const, percent: 0 }];
  assert.deepEqual(splitByPercent(0.01, parts).map((split) => split.amount), [0, 0.01, 0]);
  for (let total = 0; total < 100; total++) {
    const result = splitByPercent(total / 100, parts);
    assert.equal(result.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), total);
    assert.ok(result.every((split) => split.amount >= 0));
  }
});

test("invalid percentages, repeated funds and invalid totals are rejected", () => {
  for (const percent of [40, -1, 101, NaN, Infinity]) assert.throws(() => splitByPercent(10, [{ fund: "GRANT-FED", percent }]));
  for (const total of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => splitByPercent(total, [{ fund: "GRANT-FED", percent: 100 }]));
  assert.throws(() => splitByPercent(10, [{ fund: "GRANT-FED", percent: 50 }, { fund: "GRANT-FED", percent: 50 }]));
});

test("time percentages total exactly 100 and reject mixed periods and invalid hours", () => {
  const rows: TimesheetRow[] = ["GRANT-FED", "GRANT-FDN", "UNRESTRICTED"].map((fund) => ({
    employeeId: "E-01", period: "2026-10", activity: "Actual work", fund: fund as TimesheetRow["fund"], hours: 1,
  }));
  assert.deepEqual(percentsFromTimesheets("E-01", rows).map((part) => part.percent), [33.33, 33.33, 33.34]);
  assert.deepEqual(percentsFromTimesheets("absent", rows), []);
  assert.throws(() => percentsFromTimesheets("E-01", [...rows, { ...rows[0], period: "2026-09" }]));
  for (const hours of [-1, NaN, Infinity]) assert.throws(() => percentsFromTimesheets("E-01", [{ ...rows[0], hours }]));
});

async function scenario(name: "initial" | "after-fix") {
  const result: AnalysisResult = JSON.parse(await fs.readFile(`lib/fixtures/analysis.${name}.json`, "utf8"));
  const expected: Record<string, ExpectedItems> = JSON.parse(await fs.readFile("data/expected.json", "utf8"));
  const opts = name === "after-fix" ? { timesheetsCsv: await fs.readFile("data/inputs/timesheets-corrected.csv", "utf8") } : {};
  return { result, expected: expected[name === "initial" ? "initial" : "afterFix"], dataset: await loadDataset(opts) };
}

function fixtureProposals(result: AnalysisResult): Proposal[] {
  return result.allocations.map((allocation) => ({
    itemId: allocation.itemId,
    status: allocation.status,
    funds: allocation.splits.map(({ fund, percent }) => ({ fund, percent })),
    reason: allocation.reason,
    missingEvidence: allocation.missingEvidence ?? null,
    regulations: allocation.regulations ?? [],
    ruleIds: allocation.citations.map((citation) => {
      const rule = result.rules.find((item) => item.citation.sourceDoc === citation.sourceDoc &&
        item.citation.page === citation.page && item.citation.quote === citation.quote);
      assert.ok(rule, "Fixture citation must resolve to a rule.");
      return rule.id;
    }),
  }));
}

for (const name of ["initial", "after-fix"] as const) {
  test(`${name}: 13 canonical items, real PDF citations, expected totals, and valid summary`, async () => {
    const { result, expected, dataset } = await scenario(name);
    assert.equal(dataset.transactions.length + dataset.payroll.length, 13);
    assert.equal(dataset.grantDocs.length, 2);
    assert.ok(dataset.grantDocs.every((doc) => doc.pages.length > 0 && doc.pages.every((page) => page.trim())));
    const score = evaluateAnalysis(result, expected, dataset);
    assert.deepEqual(score.issues, []);
    assert.equal(score.matched, 13);
    assert.equal(score.citationsVerified, 25);
    assert.deepEqual(summarize(result.allocations), result.summary);
    const maria = result.allocations.find((item) => item.itemId === "PAY-E-01")!;
    const percentages = percentsFromTimesheets("E-01", dataset.timesheets);
    assert.deepEqual(splitByPercent(maria.amount, percentages), maria.splits);
  });

  test(`${name}: landed buildResult integrates with DATA helpers without API calls`, async () => {
    const { result, expected, dataset } = await scenario(name);
    const proposals = fixtureProposals(result);
    // Deliberately wrong model payroll percentages must be replaced by actual time records.
    for (const proposal of proposals) if (proposal.itemId.startsWith("PAY-")) proposal.funds = [{ fund: "UNRESTRICTED", percent: 100 }];
    const built = buildResult(dataset, result.rules, proposals);
    const score = evaluateAnalysis(built, expected, dataset);
    assert.deepEqual(score.issues, []);
    assert.equal(score.matched, 13);
    console.log(`buildResult ${name}: ${score.matched}/${score.total}; citations ${score.citationsVerified}/${score.citationsTotal}; offline PASS`);
  });
}

test("buildResult fails closed per item for invalid splits, absent proposals and mixed-period time records", async () => {
  const { result, dataset } = await scenario("initial");
  const proposals = fixtureProposals(result);
  proposals[0].funds = [{ fund: "GRANT-FDN", percent: 99.99 }];
  // A prohibited cost must stay unrestricted regardless of the proposed fund.
  proposals.find((item) => item.itemId === "T-004")!.funds = [{ fund: "GRANT-FED", percent: 100 }];
  const withoutOne = proposals.filter((proposal) => proposal.itemId !== "T-002");
  dataset.timesheets.push({ ...dataset.timesheets[0], period: "2026-09" });
  const built = buildResult(dataset, result.rules, withoutOne);
  assert.equal(built.allocations.length, 13);
  for (const id of ["T-001", "T-002", "PAY-E-01"]) {
    const allocation = built.allocations.find((item) => item.itemId === id)!;
    assert.equal(allocation.status, "needs_evidence");
    assert.deepEqual(allocation.splits, []);
    assert.ok(allocation.missingEvidence);
  }
  assert.equal(built.allocations.find((item) => item.itemId === "PAY-E-02")!.status, "supported");
  assert.deepEqual(built.allocations.find((item) => item.itemId === "T-004")!.splits, [{ fund: "UNRESTRICTED", percent: 100, amount: 412.5 }]);
});

test("evaluator rejects duplicate, missing and extra costs even when expected values match", async () => {
  const { result, expected, dataset } = await scenario("initial");
  result.allocations.push(structuredClone(result.allocations[0]));
  assert.ok(evaluateAnalysis(result, expected, dataset).issues.some((issue) => issue.includes("Duplicate allocation")));
  result.allocations.pop();
  result.allocations[0].itemId = "unknown";
  const score = evaluateAnalysis(result, expected, dataset);
  assert.ok(score.issues.some((issue) => issue.includes("Unknown allocation")));
  assert.ok(score.issues.some((issue) => issue.includes("Missing allocation T-001")));
});

test("evaluator checks source text and page rather than trusting verified flags", async () => {
  const { result, expected, dataset } = await scenario("initial");
  result.allocations[0].citations[0].quote = "";
  assert.ok(evaluateAnalysis(result, expected, dataset).issues.some((issue) => issue.includes("verified flag")));
  const rule = result.rules[0];
  rule.citation.page = 999;
  assert.ok(evaluateAnalysis(result, expected, dataset).issues.some((issue) => issue.startsWith(rule.id + ": quote")));
});

test("evaluator rejects wrong totals, summary, percentages and duplicate splits", async () => {
  const { result, expected, dataset } = await scenario("initial");
  result.allocations[0].amount += 1;
  result.allocations[1].splits[0].percent = 90;
  result.allocations[2].splits.push({ fund: "UNRESTRICTED", amount: 1, percent: 50 }, { fund: "UNRESTRICTED", amount: 1, percent: 50 });
  result.summary.byFund.UNRESTRICTED += 1;
  const score = evaluateAnalysis(result, expected, dataset);
  assert.equal(score.passed, false);
  for (const fragment of ["canonical cost", "total 100%", "repeated split fund", "Summary UNRESTRICTED"]) assert.ok(score.issues.some((issue) => issue.includes(fragment)), fragment);
});

test("evaluator rejects unsupported federal applicability and out-of-period supported charges", async () => {
  const { result, expected, dataset } = await scenario("initial");
  result.allocations[0].regulations = ["2 CFR 200.405"];
  dataset.transactions[0].date = "2025-01-01";
  const score = evaluateAnalysis(result, expected, dataset);
  assert.ok(score.issues.some((issue) => issue.includes("private-only")));
  assert.ok(score.issues.some((issue) => issue.includes("funding period")));
});

test("offline CLI succeeds without API calls and refuses to save fixtures as live caches", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/eval.ts", ...args], { encoding: "utf8" });
  const fixtures = run("--fixtures");
  assert.equal(fixtures.status, 0, fixtures.stdout + fixtures.stderr);
  assert.match(fixtures.stdout, /initial: 13\/13.*PASS/);
  assert.match(fixtures.stdout, /afterFix: 13\/13.*PASS/);
  const invalid = run("--fixtures", "--save-cache");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Only live evaluation/);
  const defaultMock = spawnSync(process.execPath, ["--import", "tsx", "scripts/eval.ts"], {
    encoding: "utf8", env: { ...process.env, FUNDPROOF_MOCK: "1", ANTHROPIC_API_KEY: "" },
  });
  assert.equal(defaultMock.status, 0, defaultMock.stdout + defaultMock.stderr);
  assert.match(defaultMock.stdout, /Evaluation source: fixtures \(no API calls\)/);
});
