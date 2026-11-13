// Turns recorded replies into validated demo results without making API calls.
// No active cache is published until every available scenario passes evaluation.
// Run: npx tsx scripts/replay-claude-runs.ts
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProposalSchema } from "../lib/ai/proposeAllocations";
import { buildResult } from "../lib/pipeline";
import { evaluateAnalysis, type ExpectedItems } from "../lib/data/evaluateAnalysis";
import { loadDataset } from "../lib/data/loadDataset";
import type { AnalysisResult } from "../lib/types";
import { RUNS_DIR, SCENARIOS, loadRecordedRules, readReply, scenarioOpts } from "./claude-runs";

const EXPECTED_KEY: Record<string, string> = { initial: "initial", "after-fix": "afterFix", "scope-of-work": "scopeOfWork" };

async function main() {
  const expected: Record<string, ExpectedItems> = JSON.parse(await fs.readFile("data/expected.json", "utf8"));
  const rules = await loadRecordedRules(await loadDataset());
  console.log(`rules: ${rules.length}, quotes verified against the PDFs: ${rules.filter((r) => r.citation.verified).length}`);
  const pending: { filename: string; result: AnalysisResult }[] = [];
  let allPassed = true;

  for (const s of SCENARIOS) {
    const replyFile = `proposals.${s.name}.json`;
    let recordedAt: string;
    try {
      recordedAt = (await fs.stat(path.join(RUNS_DIR, replyFile))).mtime.toISOString();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      console.log(`${s.name}: skipped, data/claude-runs/${replyFile} not saved yet`);
      continue;
    }
    const opts = await scenarioOpts(s);
    const ds = await loadDataset({ timesheetsCsv: opts.timesheetsCsv });
    const proposals = ProposalSchema.parse(await readReply(replyFile)).items;
    const result = { ...buildResult(ds, rules, proposals), mode: "cache" as const, generatedAt: recordedAt };
    const key = expected[EXPECTED_KEY[s.name]];
    if (!key || !Object.keys(key).length) {
      console.error(`${s.name}: missing expected results; existing caches preserved.`);
      allPassed = false;
      continue;
    }
    const score = evaluateAnalysis(result, key, ds);
    console.log(`${s.name}: ${score.matched}/${score.total} items match; citations verified ${score.citationsVerified}/${score.citationsTotal}; ${score.passed ? "PASS" : "FAIL"}`);
    for (const issue of score.issues) console.error(`  - ${issue}`);
    allPassed &&= score.passed;
    pending.push({ filename: s.cacheFile, result });
  }

  if (!allPassed) {
    console.error("Replay validation failed; existing caches preserved.");
    process.exitCode = 1;
    return;
  }
  if (!pending.length) return;
  const cacheDir = path.join("data", "cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const staged = pending.map(({ filename, result }) => ({
    target: path.join(cacheDir, filename),
    temporary: path.join(cacheDir, `.${filename}.${randomUUID()}.tmp`),
    result,
  }));
  try {
    // Stage all complete files first; failed writes must not truncate active caches.
    for (const entry of staged) {
      await fs.writeFile(entry.temporary, JSON.stringify(entry.result, null, 2) + "\n", { flag: "wx" });
    }
    for (const entry of staged) {
      await fs.rename(entry.temporary, entry.target);
      console.log(`Published validated cache ${entry.target}`);
    }
  } finally {
    await Promise.all(staged.map(({ temporary }) => fs.rm(temporary, { force: true })));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
