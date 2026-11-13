// Turns the recorded Claude replies in data/claude-runs into demo results in data/cache.
// Claude's JSON goes through the same code as a live run (lib/pipeline.ts buildResult):
// code checks every quote against the PDFs and computes every dollar. Nothing here is hand-written.
// Run: npx tsx scripts/replay-claude-runs.ts
import fs from "node:fs/promises";
import path from "node:path";
import { ProposalSchema } from "../lib/ai/proposeAllocations";
import { buildResult } from "../lib/pipeline";
import { evaluateAnalysis, type ExpectedItems } from "../lib/data/evaluateAnalysis";
import { loadDataset } from "../lib/data/loadDataset";
import { RUNS_DIR, SCENARIOS, loadRecordedRules, readReply, scenarioOpts } from "./claude-runs";

const EXPECTED_KEY: Record<string, string> = { initial: "initial", "after-fix": "afterFix", "scope-of-work": "scopeOfWork" };

async function main() {
  const expected: Record<string, ExpectedItems> = JSON.parse(await fs.readFile("data/expected.json", "utf8"));
  const rules = await loadRecordedRules(await loadDataset());
  console.log(`rules: ${rules.length}, quotes verified against the PDFs: ${rules.filter((r) => r.citation.verified).length}`);
  await fs.mkdir(path.join("data", "cache"), { recursive: true });

  for (const s of SCENARIOS) {
    const replyFile = `proposals.${s.name}.json`;
    let recordedAt: string;
    try {
      recordedAt = (await fs.stat(path.join(RUNS_DIR, replyFile))).mtime.toISOString();
    } catch {
      console.log(`${s.name}: skipped, data/claude-runs/${replyFile} not saved yet`);
      continue;
    }
    const opts = await scenarioOpts(s);
    const ds = await loadDataset({ timesheetsCsv: opts.timesheetsCsv });
    const proposals = ProposalSchema.parse(await readReply(replyFile)).items;
    const result = { ...buildResult(ds, rules, proposals), mode: "cache" as const, generatedAt: recordedAt };
    await fs.writeFile(path.join("data", "cache", s.cacheFile), JSON.stringify(result, null, 2) + "\n");

    const { byStatus, citationsVerified, citationsTotal } = result.summary;
    console.log(
      `${s.name}: wrote data/cache/${s.cacheFile}  supported ${byStatus.supported.count}, needs evidence ${byStatus.needs_evidence.count} ($${byStatus.needs_evidence.amount}), not allowable ${byStatus.not_allowable.count}; citations verified ${citationsVerified}/${citationsTotal}`,
    );
    const key = expected[EXPECTED_KEY[s.name]];
    if (key) {
      const score = evaluateAnalysis(result, key, ds);
      console.log(`  vs data/expected.json: ${score.matched}/${score.total} items match, ${score.passed ? "PASS" : "FAIL"}`);
      for (const issue of score.issues) console.log(`  - ${issue}`);
      if (!score.passed) process.exitCode = 1;
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
